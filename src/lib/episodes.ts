/**
 * Utilitários para o catálogo de episódios de séries.
 *
 * O campo `episodes_available` (filmes/series.json) é uma lista de strings
 * no formato "T/E" (temporada/episódio), ex.: ["1/1","1/2","2/1"].
 * Estas funções agrupam e ordenam os episódios por temporada para alimentar
 * o seletor de episódios (interface de navegação por temporada/episódio).
 */

export interface EpisodioRef {
  season: number;
  episode: number;
}

/** Converte "3/5" em { season: 3, episode: 5 }. Retorna null se inválido. */
export function parseEpisodio(ep: string): EpisodioRef | null {
  const partes = String(ep).split('/');
  const season = Number(partes[0]);
  const episode = Number(partes[1]);
  if (!Number.isFinite(season) || !Number.isFinite(episode) || season < 1 || episode < 1) {
    return null;
  }
  return { season, episode };
}

/** Lista de episódios ordenada (por temporada e depois por número). */
export function episodiosOrdenados(eps: string[] | undefined | null): EpisodioRef[] {
  if (!eps) return [];
  return eps
    .map(parseEpisodio)
    .filter((e): e is EpisodioRef => e !== null)
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
}

/** Temporadas disponíveis, ordenadas (ex.: [1, 2, 3]). */
export function temporadasDisponiveis(eps: string[] | undefined | null): number[] {
  const set = new Set<number>();
  for (const e of episodiosOrdenados(eps)) set.add(e.season);
  return Array.from(set).sort((a, b) => a - b);
}

/** Números dos episódios de uma temporada específica, ordenados. */
export function episodiosDaTemporada(eps: string[] | undefined | null, season: number): number[] {
  return episodiosOrdenados(eps)
    .filter((e) => e.season === season)
    .map((e) => e.episode);
}

/** Primeiro episódio disponível (fallback do botão "Assistir agora"). */
export function primeiroEpisodio(eps: string[] | undefined | null): EpisodioRef | null {
  const ordenados = episodiosOrdenados(eps);
  return ordenados[0] ?? null;
}

/** Quantidade total de episódios disponíveis no catálogo. */
export function totalEpisodios(eps: string[] | undefined | null): number {
  return episodiosOrdenados(eps).length;
}
