import { useState } from 'react';
import { Check, ChevronDown, Play } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  episodiosDaTemporada,
  temporadasDisponiveis,
  type EpisodioRef,
} from '@/lib/episodes';

interface EpisodioSelectorProps {
  /** Lista "T/E" do catálogo (episodes_available). */
  episodes: string[] | undefined | null;
  /** Episódio atualmente selecionado (temporada e episódio). */
  current: EpisodioRef | null;
  /** Chamado quando o usuário escolhe um episódio. */
  onSelect: (ep: EpisodioRef) => void;
  /** Classe extra para o contêiner. */
  className?: string;
}

/**
 * Seletor de temporada e episódio para séries.
 *
 * Exibe: (1) um dropdown de temporadas e (2) a grade de episódios da
 * temporada ativa. Navegável por controle remoto (botões/links nativos,
 * funcionam com o useTvNavigation) e por toque/clique.
 */
export function EpisodioSelector({ episodes, current, onSelect, className }: EpisodioSelectorProps) {
  const temporadas = temporadasDisponiveis(episodes);
  const [seasonAtiva, setSeasonAtiva] = useState<number | null>(null);

  // Temporada ativa: prefere a do episódio atual; senão a primeira disponível.
  const season = seasonAtiva ?? current?.season ?? temporadas[0] ?? 1;
  const episodios = episodiosDaTemporada(episodes, season);

  if (temporadas.length === 0) return null;

  return (
    <div className={cn('w-full', className)}>
      {/* Dropdown de temporada */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Temporada
        </label>
        <div className="relative">
          <select
            value={season}
            onChange={(e) => {
              setSeasonAtiva(Number(e.target.value));
            }}
            className="appearance-none rounded-lg border border-white/10 bg-ink-800 py-2 pl-3 pr-9 text-sm font-medium text-white outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          >
            {temporadas.map((t) => (
              <option key={t} value={t}>
                Temporada {t}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        </div>
      </div>

      {/* Grade de episódios */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {episodios.map((ep) => {
          const ativo =
            current?.season === season && current?.episode === ep;
          return (
            <button
              key={ep}
              type="button"
              data-tv-focusable
              onClick={() => onSelect({ season, episode: ep })}
              className={cn(
                'group flex flex-col items-center justify-center gap-1 rounded-xl border p-3 transition',
                ativo
                  ? 'border-brand-500 bg-brand-600/20 text-white'
                  : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/25 hover:bg-white/10',
              )}
            >
              <Play
                className={cn(
                  'h-4 w-4 transition',
                  ativo ? 'text-brand-400' : 'text-zinc-500 group-hover:text-white',
                )}
                fill="currentColor"
              />
              <span className="text-sm font-bold leading-none">{ep}</span>
              <span className="text-[10px] text-zinc-500">Episódio</span>
              {ativo && <Check className="h-3.5 w-3.5 text-brand-400" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
