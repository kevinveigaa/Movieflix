import { cn } from '@/lib/cn';
import {
  formatarTempo,
  percentual,
  restante,
  rotuloMovimento,
  rotuloRestante,
  type Movimento,
} from './playerProgresso';

/**
 * TvProgresso — BARRA DE PROGRESSO E TEMPO do player do MovieFlix TV.
 * ══════════════════════════════════════════════════════════════════════════════
 * REQUISITO DO DONO: "uma interface mais profissional para mostrar visualmente o
 * progresso do vídeo… ao avançar, mostrar algo como '⏩ +10s' e a barra/tempo
 * deve atualizar"; "mostrar TEMPO ATUAL / DURAÇÃO TOTAL (ex.: 00:35:20 /
 * 01:52:40)"; "o usuário precisa ver onde está, quanto já passou, quanto falta,
 * a duração total e a posição na barra".
 *
 * O que aparece na tela:
 *   • o indicador do movimento em andamento (⏩ +30s / ⏪ −20s) enquanto o passo
 *     acumula — um clique mostra +10s, segurar mostra +20s, +30s…
 *   • `00:35:20` (posição) ▬▬▬▬▬▬░░░░ `01:52:40` (duração total);
 *   • tempo restante (`−17:20`) e o percentual.
 *
 * HONESTIDADE (o que o componente NÃO faz): ele não inventa tempo. Quando a
 * posição vem do acúmulo dos comandos (embed de outra origem, que o navegador
 * não deixa ler), a nota "posição pelos comandos" deixa isso explícito; quando a
 * duração não existe no catálogo, aparece "duração não informada" em vez de um
 * número falso. Ver `playerProgresso.ts`.
 */
export function TvProgresso({
  posicao,
  duracao,
  posicaoReal,
  duracaoReal,
  movimento,
  pausado,
  aviso,
}: {
  /** Posição atual, em segundos. */
  posicao: number;
  /** Duração total, em segundos (0 = desconhecida). */
  duracao: number;
  /** A posição é lida do player (real) ou acumulada pelos comandos? */
  posicaoReal: boolean;
  /** A duração é lida do player (real) ou conhecida pelo catálogo? */
  duracaoReal: boolean;
  /** Movimento acumulado do seek (⏩/⏪) — `null` quando não há. */
  movimento: Movimento | null;
  /** O player está pausado? (estado otimista do botão play/pause) */
  pausado?: boolean;
  /** Aviso curto opcional (ex.: volume) exibido junto do tempo. */
  aviso?: string | null;
}) {
  const pct = percentual(posicao, duracao);
  const falta = restante(posicao, duracao);
  const comHoras = duracao >= 3600 || posicao >= 3600;

  return (
    <div className="tv-progresso" data-tv-progresso role="status" aria-live="polite">
      {/* Linha de indicadores: movimento do seek + estado da reprodução. */}
      <div className="tv-progresso-indicadores">
        {movimento ? (
          <span
            className={cn(
              'tv-progresso-aviso',
              movimento.sentido === 'frente' ? 'tv-progresso-aviso-frente' : 'tv-progresso-aviso-volta',
            )}
            data-tv-progresso-movimento={movimento.sentido}
          >
            {rotuloMovimento(movimento)}
          </span>
        ) : null}

        {typeof pausado === 'boolean' ? (
          <span className="tv-progresso-estado">{pausado ? '⏸ Pausado' : '▶ Reproduzindo'}</span>
        ) : null}

        {aviso ? <span className="tv-progresso-estado">{aviso}</span> : null}
      </div>

      {/* Tempo atual ▬▬▬▬ trilha ▬▬▬▬ duração total. */}
      <div className="tv-progresso-linha">
        <span className="tv-progresso-tempo" data-tv-progresso-atual>
          {formatarTempo(posicao, comHoras)}
        </span>

        <div
          className="tv-progresso-trilha"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label="Progresso do vídeo"
          data-tv-progresso-trilha
        >
          <span className="tv-progresso-preenchida" style={{ width: `${pct}%` }} />
          {/* Marcador da posição — reforça visualmente onde o vídeo está. */}
          <span className="tv-progresso-marcador" style={{ left: `${pct}%` }} />
        </div>

        <span className="tv-progresso-total" data-tv-progresso-total>
          {duracao > 0 ? formatarTempo(duracao, comHoras) : '--:--'}
        </span>
      </div>

      {/* Quanto falta para terminar. */}
      <div className="tv-progresso-info">
        {falta !== null ? (
          <span data-tv-progresso-restante>
            {rotuloRestante(falta, comHoras)} restantes · {Math.round(pct)}%
          </span>
        ) : (
          <span>Duração total não informada para este título</span>
        )}
        {!posicaoReal && duracao > 0 ? (
          <span className="tv-progresso-nota">
            posição contada pelos comandos do controle · player do provedor em outra origem
          </span>
        ) : null}
        {duracaoReal ? <span className="tv-progresso-nota">tempo lido do player</span> : null}
      </div>
    </div>
  );
}
