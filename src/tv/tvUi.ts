/**
 * MovieFlix TV — helpers compartilhados da interface de TV.
 *
 * Funções puras de formatação/agrupamento usadas pelas páginas TV.
 * A UI TV vive em src/tv/ e é servida na rota #/tv (e como página
 * inicial do app MovieFlix TV — ver capacitor.config.ts do projeto
 * movieflix-tv/).
 */

export interface TvSection {
  id: string;
  label: string;
  items: TvItem[];
}

export interface TvItem {
  id: string;
  title: string;
  poster?: string | null;
  backdrop?: string | null;
  year?: string | null;
  quality?: string | null;
  vote?: number | null;
  category?: string | null;
  duration?: number | null;
  type: 'movie' | 'series';
}

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

/** Agrupa itens por categoria principal (primeira categoria da lista). */
export function groupByCategory<T extends TvItem>(items: T[]): TvSection[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const cat = (it.category || 'Outros').split(',')[0].trim() || 'Outros';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(it);
  }
  const order = ['Ação', 'Aventura', 'Comédia', 'Drama', 'Terror', 'Ficção Científica', 'Romance', 'Suspense', 'Animação', 'Infantil'];
  const entries = Array.from(map.entries());
  entries.sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return entries.map(([label, items]) => ({ id: label, label, items }));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
