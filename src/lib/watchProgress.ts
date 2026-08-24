/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PROGRESSO REAL DE REPRODUÇÃO ("Continuar assistindo")
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Centraliza as regras do que conta como progresso REAL de um título:
 *
 *  - Um título só é considerado "em andamento" (e merece o prompt de retomada)
 *    se o usuário REALMENTE assistiu uma quantidade significativa:
 *      * posição >= 10 minutos (600 s), OU
 *      * posição >= 30% da duração (filmes curtos — ex.: 20 min assistidos de
 *        um curta de 50 min → 40%).
 *    (O usuário pediu o limiar de 10 minutos; o piso de 30% cobre títulos
 *    mais curtos sem afrouxar a regra para filmes longos.)
 *
 *  - NUNCA é considerado progresso: posição 0, posição sem duração conhecida
 *    e qualquer valor que pareça "lixo" (gravação antiga de quando o player
 *    salvava no load, antes desta correção).
 *
 *  - Títulos com posição >= 95% da duração são considerados CONCLUÍDOS
 *    (assistiu até o fim) — não faz sentido oferecer "continuar".
 *
 *  - Séries: o progresso é por episódio; o prompt mostra "T1 · E3" em vez do
 *    tempo quando o registro tem temporada/episódio (o tempo é por episódio).
 */

/** Limiar principal: 10 minutos assistidos. */
export const MIN_PROGRESS_SECONDS = 600;

/** Piso alternativo em % da duração (para títulos curtos). */
export const MIN_PROGRESS_PCT = 30;

/** Acima disso o título é considerado concluído (não oferece retomada). */
export const MAX_RESUME_PCT = 95;

export interface ProgressInfo {
  position: number;
  duration: number;
  /** Série: temporada/episódio salvos (opcional). */
  season?: number | null;
  episode?: number | null;
}

/**
 * O registro representa progresso REAL (merece prompt/lista)?
 * - position >= 10 min OU position >= 30% da duração (quando há duração);
 * - position > 0;
 * - nunca marca como "em andamento" algo já concluído (>= 95%).
 */
export function temProgressoReal(
  positionSeconds: number,
  durationSeconds: number,
): boolean {
  const pos = Number(positionSeconds) || 0;
  const dur = Number(durationSeconds) || 0;
  if (pos <= 0) return false;
  if (dur > 0 && pos / dur >= MAX_RESUME_PCT / 100) return false;
  if (pos >= MIN_PROGRESS_SECONDS) return true;
  if (dur > 0 && pos / dur >= MIN_PROGRESS_PCT / 100) return true;
  return false;
}

/**
 * % concluído (0–100) para a barra de progresso nos cards.
 * Sem duração conhecida: 0.
 */
export function progressoPercentual(positionSeconds: number, durationSeconds: number): number {
  const dur = Number(durationSeconds) || 0;
  const pos = Number(positionSeconds) || 0;
  if (dur <= 0) return 0;
  return Math.min(100, Math.max(0, (pos / dur) * 100));
}

/** Formata segundos como h:mm:ss (ex.: 1:23:45) ou m:ss (ex.: 45:30). */
export function formatarTempoRelogio(secs: number): string {
  const s = Math.max(0, Math.floor(Number(secs) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * Rótulo curto do ponto de parada para o modal de retomada:
 * - Série com episódio → "T1 · E3" (o tempo é por episódio);
 * - Filme → "1:23:45".
 */
export function rotuloPontoParada(info: ProgressInfo): string {
  if (info.season != null && info.episode != null) {
    return `T${info.season} · E${info.episode}`;
  }
  return formatarTempoRelogio(info.position);
}

/**
 * Um registro antigo (gravado antes desta correção) pode ter sido criado com
 * posição 0/duração 0 ao simplesmente abrir o player. Esse "lixo" não deve
 * aparecer em lugar nenhum — helper para detectar.
 */
export function ehProgressoLixo(positionSeconds: number, durationSeconds: number): boolean {
  const pos = Number(positionSeconds) || 0;
  const dur = Number(durationSeconds) || 0;
  return pos <= 0 || dur <= 0;
}
