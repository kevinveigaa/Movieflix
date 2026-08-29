/**
 * DISPONIBILIDADE DE VÍDEO (catálogo público).
 *
 * Problema resolvido: alguns títulos tinham ficha completa (poster, ano,
 * gênero) mas nenhuma fonte reproduzível — o usuário só descobria no Player,
 * com "Não foi possível preparar o vídeo agora.".
 *
 * Como funciona:
 *  - `node scripts/verificar-videos.mjs` roda o MESMO resolvedor do Player
 *    (backend/streambetter-resolver.js) para cada título/episódio e grava
 *    `public/filmes/disponibilidade.json` com o que realmente reproduz.
 *    Fontes de baixa qualidade (CAM/TS/TC/screener) são descartadas lá.
 *  - Em runtime o front baixa esse ÚNICO arquivo (junto com o catálogo) e
 *    filtra a exibição. Zero requisição por título, zero verificação por
 *    render.
 *
 * Nada é apagado: o título continua nos JSONs do catálogo. Quando o vídeo
 * passar a existir, basta rodar o verificador novamente que ele reaparece.
 */

export interface DisponibilidadeJson {
  gerado_em?: string;
  /** tmdb_id (string) dos FILMES com vídeo bom e reproduzível. */
  filmes?: string[];
  /** tmdb_id da série → episódios "T/E" com vídeo bom e reproduzível. */
  series?: Record<string, string[]>;
  /** Séries que já passaram pelo verificador (cobertura). */
  series_verificadas?: string[];
}

export interface Disponibilidade {
  filmes: Set<string>;
  series: Map<string, Set<string>>;
  seriesVerificadas: Set<string>;
  /** Há dados suficientes para filtrar? (evita catálogo vazio se o arquivo faltar) */
  ativo: boolean;
}

export const DISPONIBILIDADE_VAZIA: Disponibilidade = {
  filmes: new Set(),
  series: new Map(),
  seriesVerificadas: new Set(),
  ativo: false,
};

/** Converte o JSON gerado pelo verificador em estruturas de consulta rápida. */
export function montarDisponibilidade(json: DisponibilidadeJson | null | undefined): Disponibilidade {
  const filmes = new Set((json?.filmes ?? []).map(String));
  const series = new Map<string, Set<string>>();
  for (const [id, eps] of Object.entries(json?.series ?? {})) {
    series.set(String(id), new Set(eps.map(String)));
  }
  const seriesVerificadas = new Set((json?.series_verificadas ?? []).map(String));
  return {
    filmes,
    series,
    seriesVerificadas,
    // Só filtra quando o arquivo tem conteúdo — se ele faltar (deploy antigo),
    // o catálogo continua aparecendo como hoje em vez de ficar vazio.
    ativo: filmes.size > 0 || series.size > 0,
  };
}

type ItemCatalogo = {
  id?: string | number;
  tmdb_id?: string | number;
  type?: string | null;
  media_type?: string | null;
  episodes_available?: string[];
};

function idTmdb(item: ItemCatalogo): string {
  return String(item.tmdb_id ?? item.id ?? '');
}

function ehSerieItem(item: ItemCatalogo): boolean {
  const tipo = String(item.type ?? item.media_type ?? '').toLowerCase();
  return tipo === 'series' || tipo === 'serie' || tipo === 'tv';
}

/** Episódios ("T/E") da série que realmente têm vídeo bom. */
export function episodiosComVideo(item: ItemCatalogo, disp: Disponibilidade): string[] {
  const eps = item.episodes_available ?? [];
  if (!disp.ativo) return eps;
  const id = idTmdb(item);
  // Série ainda não verificada: mantém o comportamento atual (não esconde à toa).
  if (!disp.seriesVerificadas.has(id)) return eps;
  const bons = disp.series.get(id);
  if (!bons) return [];
  return eps.filter((ep) => bons.has(String(ep)));
}

/** O título pode ser exibido ao usuário (tem vídeo bom e reproduzível)? */
export function temVideoDisponivel(item: ItemCatalogo, disp: Disponibilidade): boolean {
  if (!disp.ativo) return true;
  const id = idTmdb(item);
  if (!id) return false;
  if (ehSerieItem(item)) {
    if (!disp.seriesVerificadas.has(id)) return true;
    return episodiosComVideo(item, disp).length > 0;
  }
  return disp.filmes.has(id);
}
