import { startFileDownload } from '@/lib/downloads';

/**
 * Download de vídeo no navegador com suporte a HLS (BunnyCDN):
 * baixa a playlist mestre, escolhe a maior qualidade que respeita o
 * `maxHeight` do plano, baixa a playlist variante e os segmentos TS,
 * e concatena tudo em um arquivo .ts.
 *
 * Usa a File System Access API (showSaveFilePicker + WritableStream)
 * quando disponível para gravar sem carregar tudo em memória; caso
 * contrário, concatena os segmentos em um Blob.
 */

/** Quantos segmentos são baixados simultaneamente. */
const CONCURRENCY = 5;

/** Tipo de vídeo dos segmentos concatenados. */
const TS_MIME = 'video/mp2t';

interface DownloadVideoParams {
  url: string;
  title: string;
  /** Altura máxima de vídeo permitida pelo plano do usuário (px). */
  maxHeight: number;
  /** Progresso em porcentagem (0 a 100). */
  onProgress?: (percent: number) => void;
  /** Chamado quando o download realmente começa (após escolher onde salvar). */
  onStarted?: () => void;
}

/** Interface mínima da File System Access API, para não depender do lib.dom. */
interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<{
    createWritable(): Promise<{
      write(data: BlobPart): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
}

interface Variant {
  uri: string;
  bandwidth?: number;
  resolution?: { width: number; height: number };
}

/** Baixa o vídeo, direto (mp4/mkv) ou via HLS (m3u8). */
export async function downloadVideo(params: DownloadVideoParams): Promise<void> {
  const { url, title, maxHeight } = params;

  // URL de vídeo direto: mantém o download simples atual.
  if (!isHlsUrl(url)) {
    startFileDownload(url, `${safeFileName(title)}.mp4`);
    params.onStarted?.();
    return;
  }

  // 1. Playlist mestre — escolhe a melhor qualidade permitida pelo plano.
  const masterText = await fetchText(url);
  const variants = parseMasterPlaylist(masterText);
  const variant = pickVariant(variants, maxHeight);
  if (!variant) {
    throw new Error('Nenhuma qualidade de vídeo disponível para o seu plano.');
  }
  const variantUrl = resolveUrl(url, variant.uri);

  // 2. Playlist da qualidade escolhida — lista de segmentos.
  const mediaText = await fetchText(variantUrl);
  const segments = parseMediaPlaylist(mediaText);
  if (segments.length === 0) {
    throw new Error('Este título não possui segmentos de vídeo para download.');
  }
  const segmentUrls = segments.map((seg) => resolveUrl(variantUrl, seg));
  const fileName = `${safeFileName(title)}.ts`;

  // 3. Grava o arquivo, pedindo primeiro onde salvar quando suportado.
  if (hasFileSystemAccess()) {
    const handle = await pickSaveFile(fileName);
    const writable = await handle.createWritable();
    try {
      params.onStarted?.();
      await downloadSegmentsOrdered(segmentUrls, CONCURRENCY, params.onProgress, (data) =>
        writable.write(data),
      );
    } finally {
      await writable.close().catch(() => {});
    }
  } else {
    params.onStarted?.();
    const parts: BlobPart[] = [];
    await downloadSegmentsOrdered(segmentUrls, CONCURRENCY, params.onProgress, (data) => {
      parts.push(data);
    });
    saveBlob(new Blob(parts, { type: TS_MIME }), fileName);
  }
}

/** true quando a URL aponta para uma playlist HLS (.m3u8). */
function isHlsUrl(url: string): boolean {
  return /\.m3u8($|[?#])/i.test(url);
}

/** Nome de arquivo sem caracteres inválidos para o sistema operacional. */
function safeFileName(name: string): string {
  return (name || 'download').replace(/[\\/:*?"<>|]/g, '_').trim();
}

/** Busca e devolve o texto de uma URL, lançando erro claro em português. */
async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) throw err;
    throw new Error('Não foi possível baixar a playlist do vídeo. Verifique sua conexão e tente novamente.');
  }
  if (!res.ok) {
    throw new Error(`Não foi possível acessar a mídia do vídeo (HTTP ${res.status}).`);
  }
  return res.text();
}

/** Resolve uma URL de referência (relativa ou absoluta) contra a base. */
function resolveUrl(base: string, ref: string): string {
  return new URL(ref, base).toString();
}

/** Extrai as variantes (qualidades) de uma playlist mestre. */
function parseMasterPlaylist(text: string): Variant[] {
  const variants: Variant[] = [];
  let attrs: Record<string, string> | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        attrs = parseAttributes(line.slice('#EXT-X-STREAM-INF:'.length));
      }
      continue;
    }

    // Linha de URI que segue um #EXT-X-STREAM-INF.
    if (attrs) {
      const resolutionRaw = attrs['RESOLUTION'];
      let resolution: Variant['resolution'];
      if (resolutionRaw) {
        const [w, h] = resolutionRaw.split('x').map((n) => parseInt(n, 10));
        if (Number.isFinite(w) && Number.isFinite(h)) {
          resolution = { width: w, height: h };
        }
      }
      variants.push({
        uri: line,
        bandwidth: attrs['BANDWIDTH'] ? parseInt(attrs['BANDWIDTH'], 10) : undefined,
        resolution,
      });
      attrs = null;
    }
  }

  return variants;
}

/** Extrai as URIs dos segmentos de uma playlist de mídia. */
function parseMediaPlaylist(text: string): string[] {
  const segments: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    segments.push(line);
  }
  return segments;
}

/** Escolhe a maior qualidade que respeita o maxHeight do plano. */
function pickVariant(variants: Variant[], maxHeight: number): Variant | null {
  const withResolution = variants.filter((v) => v.resolution !== undefined);
  const eligible = withResolution
    .filter((v) => v.resolution!.height <= maxHeight)
    .sort(
      (a, b) =>
        (b.resolution!.height - a.resolution!.height) || (b.bandwidth ?? 0) - (a.bandwidth ?? 0),
    );
  if (eligible.length > 0) return eligible[0];

  // Sem RESOLUTION: usa a maior banda como último recurso.
  const noResolution = variants
    .filter((v) => v.resolution === undefined)
    .sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
  return noResolution[0] ?? null;
}

/** Concatena os segmentos em ordem, com pool de concorrência limitado. */
async function downloadSegmentsOrdered(
  urls: string[],
  concurrency: number,
  onProgress: ((percent: number) => void) | undefined,
  onSegment: (data: ArrayBuffer) => void | Promise<void>,
): Promise<void> {
  const total = urls.length;
  if (total === 0) return;

  const controller = new AbortController();
  const buffer = new Map<number, ArrayBuffer>();
  let nextToFetch = 0;
  let nextToWrite = 0;
  let done = 0;
  let firstError: Error | null = null;

  async function fetchSegment(index: number): Promise<void> {
    let res: Response;
    try {
      res = await fetch(urls[index], { signal: controller.signal });
    } catch (err) {
      // AbortError (outro worker falhou) é tratado no worker; erro de rede vira mensagem clara.
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        throw err;
      }
      throw new Error('Erro de rede ao baixar o vídeo. Verifique sua conexão e tente novamente.');
    }
    if (!res.ok) {
      throw new Error(`Falha ao baixar o segmento ${index + 1} (HTTP ${res.status}).`);
    }
    const data = await res.arrayBuffer();
    done++;
    onProgress?.(Math.round((done / total) * 100));
    buffer.set(index, data);

    // Escreve os segmentos já prontos, na ordem correta.
    while (buffer.has(nextToWrite)) {
      const chunk = buffer.get(nextToWrite)!;
      buffer.delete(nextToWrite);
      await onSegment(chunk);
      nextToWrite++;
    }
  }

  async function worker(): Promise<void> {
    while (!controller.signal.aborted) {
      const index = nextToFetch++;
      if (index >= total) return;
      try {
        await fetchSegment(index);
      } catch (err) {
        if (controller.signal.aborted) return;
        controller.abort();
        firstError = firstError ?? (err as Error);
        return;
      }
    }
  }

  const poolSize = Math.max(1, Math.min(concurrency, total));
  const workers = Array.from({ length: poolSize }, () => worker());
  await Promise.all(workers);

  if (firstError) throw firstError;
}

/** true quando o navegador suporta salvar arquivos via showSaveFilePicker. */
function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

/** Pede ao usuário onde salvar o arquivo e devolve o handle. */
async function pickSaveFile(fileName: string) {
  const w = window as unknown as SaveFilePickerWindow;
  if (!w.showSaveFilePicker) {
    throw new Error('Seu navegador não suporta salvar arquivos deste formato.');
  }
  return w.showSaveFilePicker({
    suggestedName: fileName,
    types: [{ description: 'Vídeo MPEG-TS', accept: { [TS_MIME]: ['.ts'] } }],
  });
}

/** Fallback: salva o Blob concatenado como download do navegador. */
function saveBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Libera a URL de memória depois que o download já começou.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** Extrai os atributos de uma linha #EXT-X-STREAM-INF. */
function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z0-9-]+)=("([^"]*)"|([^,]*))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    attrs[m[1].toUpperCase()] = m[3] ?? m[4];
  }
  return attrs;
}
