import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, Tv, Radio, Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { normalizar } from '@/lib/categorias';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TV AO VIVO — estrutura oficial do MovieFlix.
 *
 * Página, menu e navegação próprios, organizados por categorias:
 *   Todos · Notícias · Esportes · Entretenimento · Infantil · Variedades · Outros
 *
 * ⚠️ FONTE DE CANAIS (IMPORTANTE):
 * NENHUMA fonte de canais autorizada foi encontrada/verificada até o momento
 * (probe em streambetter.shop, superflixapi.life e playerflixapi.com —
 * endpoints de live/channels inexistentes ou fora do ar; HTTP 000/404).
 *
 * REGRA DO DONO: "usar somente canais/streams autorizados pela fonte/API".
 * Portanto NÃO fabricamos canais: a lista abaixo começa VAZIA e é alimentada
 * por uma fonte legítima quando o dono fornecer (ex.: arquivo M3U de um
 * provedor autorizado, ou endpoint /api/channels de uma API parceira).
 *
 * Para adicionar canais: preencha o array `CANAL_PLACEHOLDER` (estrutura
 * abaixo) ou aponte `FONTE_CANAIS` para o endpoint/M3U e ajuste o fetch em
 * `carregarCanais()`. Cada canal: { id, nome, categoria, logo, stream_url }.
 * ═══════════════════════════════════════════════════════════════════════
 */

/** Estrutura de um canal (preenchida por fonte autorizada). */
export interface CanalAoVivo {
  id: string;
  nome: string;
  categoria: string; // Notícias | Esportes | Entretenimento | Infantil | Variedades | Outros
  logo?: string | null;
  stream_url: string; // .m3u8 / .mpd / .mp4 — reproduzido no player nativo (hls.js)
}

/** URL de uma fonte autorizada de canais (M3U/JSON) — deixe vazio até definir. */
const FONTE_CANAIS = '';

/** Categorias padrão do pedido do dono. */
export const CATEGORIAS_TV = [
  'Todos',
  'Notícias',
  'Esportes',
  'Entretenimento',
  'Infantil',
  'Variedades',
  'Outros',
];

/** Lista de canais (vazia por padrão — sem fonte autorizada). */
export const CANAIS_DISPONIVEIS: CanalAoVivo[] = [];

/** Carrega canais de FONTE_CANAIS quando configurada (M3U básico ou JSON). */
async function carregarCanais(): Promise<CanalAoVivo[]> {
  if (!FONTE_CANAIS) return [];
  try {
    const resp = await fetch(FONTE_CANAIS, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const texto = await resp.text();
    if (texto.trim().startsWith('[') || texto.trim().startsWith('{')) {
      const data = JSON.parse(texto);
      return Array.isArray(data) ? data : data.channels ?? [];
    }
    // M3U simples: #EXTINF:-1 tvg-name="..." group-title="...",Nome
    const canais: CanalAoVivo[] = [];
    const linhas = texto.split('\n');
    let info: Partial<CanalAoVivo> | null = null;
    for (const linha of linhas) {
      const l = linha.trim();
      if (l.startsWith('#EXTINF')) {
        const nome = (l.split(',').slice(1).join(',') || '').trim();
        const grupo = (l.match(/group-title="([^"]*)"/) || [])[1] || 'Outros';
        const logo = (l.match(/tvg-logo="([^"]*)"/) || [])[1] || null;
        info = { nome, categoria: grupo, logo };
      } else if (l && !l.startsWith('#') && info?.nome) {
        canais.push({ id: String(canais.length + 1), nome: info.nome, categoria: info.categoria || 'Outros', logo: info.logo, stream_url: l });
        info = null;
      }
    }
    return canais;
  } catch {
    return [];
  }
}

export function TvAoVivoPage() {
  const [canais, setCanais] = useState<CanalAoVivo[]>(CANAIS_DISPONIVEIS);
  const [carregado, setCarregado] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const categoria = searchParams.get('categoria') ?? 'Todos';
  const [busca, setBusca] = useState('');

  // Carrega a fonte autorizada (uma vez) quando houver FONTE_CANAIS.
  useMemo(() => {
    if (carregado) return;
    setCarregado(true);
    carregarCanais().then((c) => {
      if (c.length > 0) setCanais(c);
    });
  }, [carregado]);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    return canais.filter((c) => {
      if (categoria !== 'Todos' && normalizar(c.categoria) !== normalizar(categoria)) return false;
      if (termo && !normalizar(c.nome).includes(termo)) return false;
      return true;
    });
  }, [canais, categoria, busca]);

  const selecionarCategoria = (nome: string) => {
    if (nome === 'Todos') setSearchParams({}, { replace: true });
    else setSearchParams({ categoria: nome }, { replace: true });
  };

  return (
    <div className="container-app pt-24 pb-16">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/20 text-brand-400">
          <Tv className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-white">TV AO VIVO</h1>
          <p className="text-sm text-ink-400">
            Canais ao vivo organizados por categoria · Somente fontes autorizadas
          </p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative mb-5 max-w-md">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar canal..."
          data-tv-focusable
          className="w-full rounded-full border border-white/10 bg-ink-800/70 py-2.5 pl-11 pr-4 text-sm text-white placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
        />
      </div>

      {/* Categorias */}
      <div className="mb-8 flex flex-wrap gap-2">
        {CATEGORIAS_TV.map((c) => (
          <button
            key={c}
            onClick={() => selecionarCategoria(c)}
            data-tv-focusable
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
              categoria === c
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-200'
                : 'border-white/10 bg-white/5 text-ink-300 hover:text-white',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {filtrados.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-ink-400">
          <Radio className="h-12 w-12 opacity-40" />
          <p className="text-base font-medium text-ink-300">
            {canais.length === 0
              ? 'Canais ao vivo em breve'
              : 'Nenhum canal encontrado nesta categoria.'}
          </p>
          {canais.length === 0 && (
            <>
              <p className="max-w-md text-sm">
                O MovieFlix está estruturando a área de TV ao vivo. Os canais
                serão adicionados assim que uma fonte autorizada for
                configurada — nenhum canal não-autorizado é exibido.
              </p>
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-ink-400">
                <Info className="h-4 w-4 shrink-0 text-brand-400" />
                <span>
                  Para ativar: forneça uma fonte autorizada (M3U/API) e defina{' '}
                  <code className="rounded bg-white/10 px-1.5 py-0.5 text-brand-300">FONTE_CANAIS</code>{' '}
                  em <code className="rounded bg-white/10 px-1.5 py-0.5 text-brand-300">src/pages/TvAoVivoPage.tsx</code>.
                </span>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtrados.map((canal) => (
            <a
              key={canal.id}
              href={`/assistir/${canal.id}?tipo=live`}
              data-tv-focusable
              className="group flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 text-center transition hover:border-brand-500/40 hover:bg-white/10"
            >
              {canal.logo ? (
                <img src={canal.logo} alt="" className="h-14 w-14 rounded-full object-contain" loading="lazy" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600/20 text-brand-400">
                  <Tv className="h-6 w-6" />
                </span>
              )}
              <span className="text-sm font-medium text-white">{canal.nome}</span>
              <span className="text-[11px] text-ink-400">{canal.categoria}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
