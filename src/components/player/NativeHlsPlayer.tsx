import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2, AlertTriangle, RefreshCw, Maximize, Minimize } from 'lucide-react';
import { resolverStreamBetterDireto } from '@/lib/streambetterDirect';

/**
 * Player do MovieFlix — DUAS CAMADAS (nativo primeiro, embed como fallback).
 *
 * Estratégia (a mesma que o app nativo usa para tocar direto, sem Cloudflare):
 *
 *   CAMADA 1 — PLAYER NATIVO (HLS): o backend do MovieFlix resolve o HLS REAL
 *   do título via /api/streambetter-resolve (que consulta a API oficial de
 *   link direto /api/v1/stream do StreamBetter) e devolve a URL do m3u8
 *   através do proxy /api/streambetter-hls (CORS aberto). O vídeo é tocado num
 *   <video> nativo + hls.js — SEM iframe, SEM embed, SEM verificação Cloudflare,
 *   SEM anúncios, SEM popup, SEM redirecionamento. É exatamente o caminho que
 *   o app nativo (ExoPlayer) usa.
 *
 *   CAMADA 2 — EMBED OFICIAL (fallback ÚNICO): quando o backend NÃO consegue
 *   resolver o HLS direto (ex.: chave secreta sb_sk_* do plano API não
 *   configurada → retorna secret_key_required), o player abre o embed oficial
 *   do StreamBetter com a chave pública (plano Creator) UMA única vez por
 *   sessão. O embed exibe a verificação anti-bot Cloudflare Turnstile — isso é
 *   comportamento LEGÍTIMO do provedor e NÃO deve ser contornado. Para o
 *   Turnstile completar naturalmente e o vídeo tocar e PERMANECER tocando, o
 *   iframe é montado UMA única vez com src estável:
 *     - SEM atributo `sandbox` (a documentação do StreamBetter bloqueia o
 *       conteúdo se detectar sandbox, deixando preso na verificação);
 *     - SEM force-close (fechar o embed durante a verificação legítima cria o
 *       loop percebido embed → verificação → erro → retry → embed);
 *     - SEM re-trigger / re-mount (o iframe NÃO é recriado nem recarregado
 *       pelo nosso código — o `src` é estável e montado uma vez);
 *     - O `key` do iframe é estável, então o React não re-monta.
 *
 * O embed roda DENTRO do MovieFlix (iframe), sem pop-up e sem redirecionamento
 * externo. O botão de download (benefício do plano Creator) aparece no player
 * do provedor quando disponível.
 *
 * - SEM overlay próprio do MovieFlix sobre o vídeo: o vídeo ocupa toda a área
 *   do player. Nenhum badge/etiqueta "Reproduzindo via StreamBetter" é criado.
 * - FULLSCREEN: no player nativo, um botão do MovieFlix chama a Fullscreen API
 *   real (com fallback CSS). No embed, o iframe mantém `allowFullScreen` +
 *   `allow="...fullscreen..."` para o botão de tela cheia NATIVO do player do
 *   StreamBetter funcionar onde o navegador/WebView suporta.
 * - Tema vermelho/roxo apenas nos estados de carregamento/erro do MovieFlix.
 * - Sem bypass de proteção, sem pop-ups, sem redirecionamento externo.
 */

// Chave PÚBLICA do StreamBetter (plano Creator) — não é segredo, pode ir no
// bundle. Usada no embed oficial (fallback). Vem do render.yaml.
const STREAMBETTER_PUBLIC_KEY =
  (import.meta.env.VITE_STREAMBETTER_PUBLIC_KEY as string) ||
  'sb_pk_19fe7c75a49585cd84ced96806703a2176768fa4f77a7ea4';

/**
 * Anexa a chave pública e o idioma pt-BR a uma URL de embed do StreamBetter.
 * NÃO adiciona personalização (accent/surface/brand) — o embed é o padrão do
 * provedor, como o usuário pediu.
 */
function embedComChave(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('key', STREAMBETTER_PUBLIC_KEY);
    u.searchParams.set('lang', 'pt-BR');
    return u.toString();
  } catch {
    return url;
  }
}

export function NativeHlsPlayer({
  embedUrl,
  startSeconds,
  onReady,
  onError,
}: {
  embedUrl: string;
  startSeconds?: number;
  onReady?: (video: HTMLVideoElement) => void;
  onError?: (msg: string) => void;
}) {
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  // Guarda o embed: só monta UMA vez por sessão de reprodução. Resetada quando
  // embedUrl/startSeconds mudam (novo título/episódio).
  const embedMontadoRef = useRef(false);
  const [status, setStatus] = useState<'carregando' | 'nativo' | 'embed' | 'erro'>('carregando');
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mostrarDicaCookies, setMostrarDicaCookies] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onReady, onError]);

  // Resolve a fonte: tenta o HLS direto (nativo) e, se falhar, cai no embed.
  useEffect(() => {
    if (!embedUrl) {
      setStatus('erro');
      setErroMsg('Nenhuma fonte de vídeo encontrada para este título.');
      return;
    }

    let cancelado = false;

    async function carregar() {
      setStatus('carregando');
      setHlsUrl(null);
      setEmbedSrc(null);

      // CAMADA 1 — tenta o HLS direto via backend (sem iframe, sem Cloudflare).
      const resultado = await resolverStreamBetterDireto(embedUrl, startSeconds);
      if (cancelado) return;

      if (resultado.success && resultado.url) {
        setHlsUrl(resultado.url);
        setStatus('nativo');
        return;
      }

      // CAMADA 2 — fallback: embed oficial do StreamBetter (UMA única vez).
      if (!embedMontadoRef.current) {
        embedMontadoRef.current = true;
        setEmbedSrc(embedComChave(embedUrl));
        setStatus('embed');
      } else {
        setStatus('erro');
        setErroMsg(
          resultado.detalhe ||
            resultado.motivo ||
            'Não foi possível carregar o vídeo. Tente novamente.',
        );
      }
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [embedUrl, startSeconds]);

  // Inicializa o hls.js no <video> nativo quando a URL HLS chega.
  useEffect(() => {
    if (status !== 'nativo' || !hlsUrl) return;
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let destroyed = false;

    const tentarPlay = () => {
      const p = video.play();
      if (p) {
        p.catch(() => {
          // Autoplay bloqueado → muted fallback (sempre permitido).
          video.muted = true;
          video.play().catch(() => undefined);
        });
      }
    };

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (destroyed) return;
        if (startSeconds && startSeconds > 0) {
          try {
            video.currentTime = startSeconds;
          } catch {
            /* ignora */
          }
        }
        tentarPlay();
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (destroyed) return;
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              onErrorRef.current?.('Falha na reprodução do vídeo. Tente novamente.');
              setStatus('erro');
              setErroMsg('Falha na reprodução do vídeo. Tente novamente.');
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS: HLS nativo.
      video.src = hlsUrl;
      video.addEventListener('loadedmetadata', () => {
        if (destroyed) return;
        if (startSeconds && startSeconds > 0) {
          try {
            video.currentTime = startSeconds;
          } catch {
            /* ignora */
          }
        }
        tentarPlay();
      });
    } else {
      onErrorRef.current?.('Seu navegador não suporta reprodução de vídeo HLS.');
      setStatus('erro');
      setErroMsg('Seu navegador não suporta reprodução de vídeo HLS.');
      return;
    }

    onReadyRef.current?.(video);

    return () => {
      destroyed = true;
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
    };
  }, [status, hlsUrl, startSeconds]);

  // Acompanha o estado de tela cheia (Fullscreen API) para trocar o ícone.
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Aviso NÃO-destrutivo: se o embed ficar preso na verificação do provedor por
  // um tempo, mostra uma dica discreta (não fecha o iframe, não é bypass) sobre
  // cookies de terceiros — a causa mais comum de o Turnstile não completar no
  // navegador. O usuário pode dispensar. O embed continua tentando naturalmente.
  useEffect(() => {
    if (status !== 'embed') {
      setMostrarDicaCookies(false);
      return;
    }
    const t = setTimeout(() => setMostrarDicaCookies(true), 9000);
    return () => clearTimeout(t);
  }, [status, embedSrc]);

  // Alterna a tela cheia do CONTÊINER do player (funciona no browser e no
  // WebView do app via WebChromeClient.onShowCustomView). Fallback CSS quando
  // a Fullscreen API nativa não existe no ambiente.
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const elAny = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

    const emFullscreen = Boolean(document.fullscreenElement || doc.webkitFullscreenElement);

    try {
      if (emFullscreen) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      } else {
        if (el.requestFullscreen) {
          el.requestFullscreen();
        } else if (elAny.webkitRequestFullscreen) {
          elAny.webkitRequestFullscreen();
        } else {
          // Fallback CSS: sem Fullscreen API nativa, cobre a tela.
          el.classList.toggle('mf-fs-fallback');
          setIsFullscreen(el.classList.contains('mf-fs-fallback'));
        }
      }
    } catch {
      // Se a API falhar (ex.: permissão), tenta o fallback CSS.
      el.classList.toggle('mf-fs-fallback');
      setIsFullscreen(el.classList.contains('mf-fs-fallback'));
    }
  }, []);

  // Estado NATIVO: <video> + hls.js (sem iframe, sem Cloudflare, sem anúncios).
  if (status === 'nativo' && hlsUrl) {
    return (
      <div
        ref={containerRef}
        className="relative h-full w-full bg-black mf-player-container"
      >
        <video
          ref={videoRef}
          data-mf-player
          className="h-full w-full"
          controls
          playsInline
          autoPlay
          muted
          preload="auto"
        />
        {/* Botão de tela cheia do MovieFlix — Fullscreen API real com fallback. */}
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white opacity-80 transition hover:bg-black/70 hover:opacity-100"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  // Estado EMBED: o iframe oficial do StreamBetter (fallback único).
  if (status === 'embed' && embedSrc) {
    return (
      <div
        ref={containerRef}
        className="relative h-full w-full bg-black mf-player-container"
      >
        <iframe
          key={embedSrc}
          src={embedSrc}
          title="StreamBetter"
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="origin"
          loading="eager"
        />
        {/* Aviso discreto e dispensável (não cobre o vídeo, não fecha o embed,
            não é bypass). Ajuda quando o Turnstile não completa por bloqueio de
            cookies de terceiros no navegador. */}
        {mostrarDicaCookies && (
          <div className="absolute bottom-3 left-1/2 z-10 w-[92%] max-w-md -translate-x-1/2 rounded-lg border border-roxo-500/30 bg-ink-950/90 px-4 py-3 text-center shadow-lg backdrop-blur">
            <p className="text-xs leading-relaxed text-zinc-200">
              A verificação do provedor não completou. No navegador, libere{' '}
              <span className="font-semibold text-amber-300">cookies de terceiros</span>{' '}
              para <span className="font-mono text-amber-300">streambetter.shop</span>{' '}
              e recarregue. No app (WebView) isso já é permitido, por isso toca direto.
            </p>
            <button
              type="button"
              onClick={() => setMostrarDicaCookies(false)}
              className="mt-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-white/20"
            >
              Dispensar
            </button>
          </div>
        )}
        {/* Botão de tela cheia do MovieFlix — reforço para o fullscreen
            funcionar no WebView do app e em navegadores que não propagam o
            fullscreen do iframe cross-origin. Discreto, não cobre o vídeo. */}
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white opacity-80 transition hover:bg-black/70 hover:opacity-100"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      {status === 'carregando' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-ink-950/80 via-roxo-950/60 to-ink-950/80 text-white">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
          <p className="text-sm text-zinc-300">Preparando o vídeo…</p>
        </div>
      )}

      {status === 'erro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-ink-950/90 via-roxo-950/70 to-ink-950/90 px-6 text-center text-white">
          <AlertTriangle className="h-10 w-10 text-roxo-400" />
          <p className="text-sm text-zinc-300">{erroMsg}</p>
          <button
            type="button"
            onClick={() => {
              embedMontadoRef.current = false;
              setStatus('carregando');
              setHlsUrl(null);
              setEmbedSrc(null);
              requestAnimationFrame(() => {
                // Re-tenta a resolução completa (nativo → embed).
                resolverStreamBetterDireto(embedUrl, startSeconds).then((r) => {
                  if (r.success && r.url) {
                    setHlsUrl(r.url);
                    setStatus('nativo');
                  } else {
                    embedMontadoRef.current = true;
                    setEmbedSrc(embedComChave(embedUrl));
                    setStatus('embed');
                  }
                });
              });
            }}
            className="btn-primary text-xs"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}