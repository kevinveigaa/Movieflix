/**
 * MovieFlix TV — helpers compartilhados da interface de televisão.
 *
 * Toda a lógica de negócio (catálogo, favoritos, histórico, player, planos) é a
 * MESMA do site/Mobile — este módulo só converte os dados do catálogo para o
 * modelo que a UI de TV consome e expõe funções puras de formatação/agrupamento.
 *
 * Nada aqui cria dado novo: `paraTvItem` é um mapeamento 1:1 de CatalogMovie
 * (src/hooks/useMovies.ts), o mesmo objeto que o site renderiza.
 */

import type { CatalogMovie } from '@/hooks/useMovies';

export interface TvSection {
  id: string;
  label: string;
  items: TvItem[];
}

export interface TvItem {
  id: string;
  /** TMDB id — chave usada pelo histórico/favoritos (mesma do site). */
  tmdbId?: string | null;
  title: string;
  description?: string | null;
  poster?: string | null;
  backdrop?: string | null;
  year?: string | null;
  quality?: string | null;
  vote?: number | null;
  category?: string | null;
  duration?: number | null;
  language?: string | null;
  /** Áudio pt-BR disponível (campo `dublado_ptbr` do catálogo). */
  dublado?: boolean;
  /** Episódios disponíveis no formato "T/E". */
  episodes?: string[];
  type: 'movie' | 'series';
}

/** É um item de série? (mesma regra do site: campo `type`). */
export function ehSerie(m: { type?: string | null; media_type?: string | null } | null | undefined): boolean {
  if (!m) return false;
  const t = String(m.type ?? m.media_type ?? '').toLowerCase();
  return t === 'series' || t === 'serie' || t === 'tv';
}

/**
 * Converte um título do catálogo real (CatalogMovie) para o modelo da UI de TV.
 * Mapeamento direto — nenhum campo é inventado.
 */
export function paraTvItem(m: CatalogMovie): TvItem {
  return {
    id: String(m.id),
    tmdbId: m.tmdb_id != null && String(m.tmdb_id) !== '' ? String(m.tmdb_id) : null,
    title: m.title,
    description: m.description ?? null,
    poster: m.poster_url ?? null,
    backdrop: m.backdrop_url ?? null,
    year: m.year ?? null,
    quality: m.quality ?? null,
    vote: m.vote_average ?? null,
    category: m.category ?? null,
    duration: m.duration ?? null,
    language: m.language ?? null,
    dublado: m.dublado_ptbr === true || /dublado/i.test(String(m.language ?? '')),
    episodes: m.episodes_available ?? [],
    type: ehSerie(m) ? 'series' : 'movie',
  };
}

/** Formata duração em minutos → "1h45" / "45min". */
export function formatDuration(min: number | null | undefined): string {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

export function formatYear(year: string | null | undefined): string {
  return year || '';
}

export function ratingLabel(vote: number | null | undefined): string {
  if (vote === null || vote === undefined || vote <= 0) return '';
  return vote.toFixed(1);
}

/** Normaliza texto para busca (sem acentos, minúsculo). */
export function normalizar(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Fatia uma lista em blocos de tamanho fixo (grid paginado — performance). */
export function chunk<T>(itens: T[], tamanho: number): T[][] {
  if (tamanho <= 0) return [itens];
  const blocos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    blocos.push(itens.slice(i, i + tamanho));
  }
  return blocos;
}

/** Ordem preferida das categorias na Home (as demais entram em ordem alfabética). */
const ORDEM_CATEGORIAS = [
  'Ação',
  'Aventura',
  'Comédia',
  'Drama',
  'Terror',
  'Ficção Científica',
  'Suspense',
  'Romance',
  'Animação',
  'Infantil',
  'Documentário',
];

/** Agrupa itens por categoria principal (primeira categoria da lista). */
export function groupByCategory<T extends TvItem>(items: T[]): TvSection[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const cat = (it.category || 'Outros').split(',')[0].trim() || 'Outros';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(it);
  }
  const entries = Array.from(map.entries());
  entries.sort((a, b) => {
    const ia = ORDEM_CATEGORIAS.indexOf(a[0]);
    const ib = ORDEM_CATEGORIAS.indexOf(b[0]);
    if (ia === -1 && ib === -1) return a[0].localeCompare(b[0], 'pt-BR');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return entries.map(([label, items]) => ({ id: label, label, items }));
}

/** Todas as categorias presentes no catálogo, ordenadas. */
export function categoriasDe<T extends TvItem>(items: T[]): string[] {
  const set = new Set<string>();
  for (const m of items) {
    for (const c of (m.category || '').split(',')) {
      const t = c.trim();
      if (t) set.add(t);
    }
  }
  const lista = Array.from(set);
  lista.sort((a, b) => {
    const ia = ORDEM_CATEGORIAS.indexOf(a);
    const ib = ORDEM_CATEGORIAS.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'pt-BR');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return lista;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Formato mínimo de um registro de histórico casado com o catálogo. */
export interface ContinuarRegistro {
  history: {
    movie_id?: string | null;
    tmdb_id: number | null;
    season_number?: number | null;
    episode_number?: number | null;
    position_seconds: number;
    duration_seconds: number;
  };
  movie: { id: string };
}

/**
 * Deduplica "Continuar assistindo" POR CONTEÚDO — correção na origem, não na
 * renderização.
 *
 * CAUSA RAIZ do bug de repetição: `watch_history` grava UMA LINHA POR EPISÓDIO
 * (chave tmdb_id + temporada + episódio). Uma série com progresso em 3
 * episódios gerava 3 registros do MESMO título e a linha exibia o mesmo cartaz
 * várias vezes seguidas.
 *
 * Aqui cada título aparece UMA única vez, preservando temporada, episódio,
 * posição e duração do registro MAIS RECENTE (a query já ordena por
 * `updated_at` desc, e `useUpsertHistory` ATUALIZA a linha existente em vez de
 * inserir outra quando o progresso muda).
 */
export function dedupeContinuar<T extends ContinuarRegistro>(itens: T[]): T[] {
  const vistos = new Map<string, T>();
  for (const it of itens) {
    // Chave de conteúdo: id do catálogo > tmdb_id. Sem chave, ignora.
    const chave = String(it.movie?.id ?? it.history?.movie_id ?? it.history?.tmdb_id ?? '');
    if (!chave || chave === 'null' || chave === 'undefined') continue;
    if (!vistos.has(chave)) vistos.set(chave, it);
  }
  return Array.from(vistos.values());
}

/**
 * Converte o campo real `episodes_available` (["1/1", "1/2", "2/3"]...) numa
 * lista de temporadas → episódios. É o MESMO dado que o site e o app Mobile
 * exibem — a TV não inventa temporada nem episódio.
 */
export interface TvTemporada {
  numero: number;
  episodios: { numero: number; chave: string }[];
}

export function temporadasDe(episodes: string[] | null | undefined): TvTemporada[] {
  const map = new Map<number, Set<number>>();
  for (const e of episodes ?? []) {
    const [s, ep] = String(e).split('/');
    const season = Number(s);
    const episode = Number(ep);
    if (!Number.isFinite(season) || !Number.isFinite(episode)) continue;
    if (!map.has(season)) map.set(season, new Set());
    map.get(season)!.add(episode);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([numero, eps]) => ({
      numero,
      episodios: Array.from(eps)
        .sort((a, b) => a - b)
        .map((n) => ({ numero: n, chave: `${numero}/${n}` })),
    }));
}

/**
 * Próximo episódio depois de (temporada, episódio) — usado para mostrar o
 * controle "Próximo episódio" SOMENTE quando ele realmente existe.
 */
export function proximoEpisodio(
  episodes: string[] | null | undefined,
  temporada: number,
  episodio: number,
): { season: number; episode: number } | null {
  const lista = (episodes ?? [])
    .map((e) => {
      const [s, ep] = String(e).split('/');
      const season = Number(s);
      const episode = Number(ep);
      return Number.isFinite(season) && Number.isFinite(episode) ? { season, episode } : null;
    })
    .filter((x): x is { season: number; episode: number } => x !== null)
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
  const idx = lista.findIndex((e) => e.season === temporada && e.episode === episodio);
  if (idx === -1 || idx + 1 >= lista.length) return null;
  return lista[idx + 1];
}
