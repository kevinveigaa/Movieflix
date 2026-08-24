-- 20260824120000_watch_history_season_episode.sql
-- Adiciona temporada/episódio ao histórico de reprodução (séries).
-- Permite que o modal de retomada mostre "T1 · E3" e que o progresso de cada
-- episódio seja salvo/retomado separadamente.

ALTER TABLE public.watch_history
  ADD COLUMN IF NOT EXISTS season_number INTEGER,
  ADD COLUMN IF NOT EXISTS episode_number INTEGER;

-- Índice para lookup rápido por título (já existe por user; complementa).
CREATE INDEX IF NOT EXISTS watch_history_season_episode_idx
  ON public.watch_history (tmdb_id, season_number, episode_number);
