/**
 * MovieFlix TV — MODELO DE PROGRESSO DO PLAYER (módulo puro, sem React).
 * ══════════════════════════════════════════════════════════════════════════════
 * REQUISITO DO DONO (tela do player):
 *   "mostrar TEMPO ATUAL / DURAÇÃO TOTAL (ex.: 00:35:20 / 01:52:40)… o usuário
 *    precisa saber onde está, quanto já passou, quanto falta, a duração total e a
 *    posição na barra de progresso";
 *   "CLIQUE ÚNICO → +10s; SEGURAR → continuar avançando… não permitir abaixo de
 *    00:00 nem ultrapassar a duração total".
 *
 * ── O QUE ESTE MÓDULO É (e o que ele NÃO é) ───────────────────────────────────
 * A parte que o dono pediu — MOSTRAR e NAVEGAR — é o que este arquivo modela:
 * formatação de tempo, limites (00:00 ↔ duração), acúmulo do movimento para o
 * indicador ("⏩ +30s") e a conta do tempo restante.
 *
 * A LEITURA DO TEMPO REAL depende do player do provedor: o vídeo roda num IFRAME
 * DE OUTRA ORIGEM (streambetter.shop) atrás de uma verificação Cloudflare, e a
 * política de mesma origem impede o MovieFlix de ler `video.currentTime` ali
 * dentro. Medido: esse embed NÃO publica estado (não manda `postMessage` de
 * tempo/duração; só o iframe do desafio Cloudflare aparece na árvore).
 *
 * Em vez de INVENTAR um tempo "real", há três fontes, nesta ordem de confiança —
 * e a interface diz de onde veio o número (ver `duracaoReal` / `posicaoReal`):
 *   1. LEITURA DIRETA do player (`lerEstadoDoPlayer`): vale quando o player é da
 *      mesma origem ou quando o embed expõe `mfEstadoDoPlayer()` — aí o tempo é
 *      real, quadro a quadro;
 *   2. DURAÇÃO CONHECIDA pelo catálogo (`duration` em minutos, campo real dos
 *      dados — o mesmo que o card e a tela de detalhes já exibem);
 *   3. POSIÇÃO ACUMULADA pelos comandos do controle: parte da posição conhecida
 *      (retomada/leitura real, quando houver) e soma o que o usuário pediu
 *      (+10s / −10s), respeitando os limites.
 *
 * É a diferença entre "a barra reflete o vídeo" (quando dá para ler) e "a barra
 * reflete os comandos do usuário, com a duração real do título" (quando não dá) —
 * nunca um número inventado apresentado como se fosse o do vídeo.
 */

/** Passo do seek pelo controle remoto, em segundos (um clique = +10s / −10s). */
export const PASSO_SEEK = 10;

/** Sentido do movimento em andamento. */
export type Sentido = 'frente' | 'volta';

/** Movimento acumulado mostrado na tela (⏩ +30s / ⏪ −20s). */
export interface Movimento {
  sentido: Sentido;
  segundos: number;
}

/** Estado de progresso já resolvido para a interface. */
export interface EstadoProgresso {
  /** Posição atual, em segundos. */
  posicao: number;
  /** Duração total, em segundos (0 = desconhecida). */
  duracao: number;
  /** A posição veio de leitura direta do player (não de acúmulo de comandos)? */
  posicaoReal: boolean;
  /** A duração veio de leitura direta do player (e não do catálogo)? */
  duracaoReal: boolean;
}

/** Prende um número dentro de uma faixa. */
export function limitar(valor: number, minimo: number, maximo: number): number {
  if (!Number.isFinite(valor)) return minimo;
  if (maximo > 0 && valor > maximo) return maximo;
  return valor < minimo ? minimo : valor;
}

/**
 * Formata segundos como tempo de player.
 *
 *  - `>= 1h`  → `01:52:40` (o formato do exemplo do dono, com hora zerada);
 *  - `< 1h`   → `45:00`;
 *  - desconhecido (`null`/`undefined`/`NaN`) → `--:--` (nunca um zero falso).
 */
export function formatarTempo(segundos: number | null | undefined, comHoras?: boolean): string {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos)) return '--:--';
  const total = Math.max(0, Math.floor(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  const usarHoras = comHoras ?? h > 0;
  if (usarHoras) return `${dois(h)}:${dois(m)}:${dois(s)}`;
  return `${dois(m)}:${dois(s)}`;
}

/**
 * Duração total do catálogo (campo `duration`, em MINUTOS) → segundos.
 * Devolve 0 quando o título não traz duração — nesse caso a interface diz
 * "duração não informada" em vez de mostrar um número inventado.
 */
export function duracaoDoCatalogo(minutos: number | null | undefined): number {
  const m = Number(minutos);
  return Number.isFinite(m) && m > 0 ? Math.round(m * 60) : 0;
}

/**
 * Avança a posição em `passo` segundos.
 *
 * LIMITE SUPERIOR (requisito): quando a duração é conhecida, o avanço PARA na
 * duração — nunca ultrapassa o fim do vídeo. Sem duração conhecida não há teto.
 */
export function avancar(posicao: number, passo: number, duracao: number): number {
  const alvo = (Number.isFinite(posicao) ? posicao : 0) + Math.abs(passo);
  if (duracao > 0) return Math.min(alvo, duracao);
  return alvo;
}

/**
 * Retrocede a posição em `passo` segundos.
 *
 * LIMITE INFERIOR (requisito): nunca abaixo de 00:00.
 */
export function retroceder(posicao: number, passo: number): number {
  return Math.max(0, (Number.isFinite(posicao) ? posicao : 0) - Math.abs(passo));
}

/** Percentual (0–100) da posição na duração; 0 quando a duração é desconhecida. */
export function percentual(posicao: number, duracao: number): number {
  if (!(duracao > 0)) return 0;
  return limitar((posicao / duracao) * 100, 0, 100);
}

/** Quanto falta para terminar, em segundos — `null` quando a duração é desconhecida. */
export function restante(posicao: number, duracao: number): number | null {
  if (!(duracao > 0)) return null;
  return Math.max(0, duracao - (Number.isFinite(posicao) ? posicao : 0));
}

/**
 * Acumula um novo passo no movimento em andamento (segurar o botão).
 *
 * Enquanto o sentido não muda, os passos SOMAM (⏩ +10s → +20s → +30s), que é a
 * apresentação pedida para o avanço contínuo. Ao trocar de sentido, reinicia.
 */
export function acumularMovimento(atual: Movimento | null, sentido: Sentido, passo: number): Movimento {
  if (atual && atual.sentido === sentido) {
    return { sentido, segundos: atual.segundos + Math.abs(passo) };
  }
  return { sentido, segundos: Math.abs(passo) };
}

/** Rótulo do movimento para a tela: `⏩ +30s` / `⏪ −20s`. */
export function rotuloMovimento(movimento: Movimento): string {
  const sinal = movimento.sentido === 'frente' ? '+' : '−';
  return `${movimento.sentido === 'frente' ? '⏩' : '⏪'} ${sinal}${movimento.segundos}s`;
}

/** Rótulo do tempo restante: `−17:20` (ou `--:--` quando não há duração). */
export function rotuloRestante(segundos: number | null, comHoras?: boolean): string {
  if (segundos === null) return '--:--';
  return `−${formatarTempo(segundos, comHoras)}`;
}

/**
 * LÊ O ESTADO REAL DO PLAYER quando isso é possível.
 *
 * Devolve `null` no caso normal do MovieFlix TV (o embed do provedor vive em
 * outra origem → `contentDocument` é `null` por política do navegador). Devolve
 * o estado quando:
 *   • o embed expõe `mfEstadoDoPlayer()` (API opcional do provedor), ou
 *   • o player é da mesma origem e tem um `<video>` (player HLS nativo).
 *
 * Este é o único caminho que produz tempo REAL — e é por isso que ele existe: se
 * um dia o provedor passar a publicar o estado (ou o player virar nativo), a
 * barra passa a acompanhar o vídeo sem nenhuma outra mudança.
 */
export function lerEstadoDoPlayer(
  iframe: HTMLIFrameElement | null | undefined,
): EstadoProgresso | null {
  if (!iframe) return null;
  try {
    const doc = iframe.contentDocument;
    const janela = iframe.contentWindow as
      | (Window & {
          mfEstadoDoPlayer?: () => { posicao?: number; duracao?: number } | null;
        })
      | null;
    if (!doc && !janela) return null;

    // (1) API opcional do embed — estado explícito, mesma origem ou não.
    try {
      const externo = janela?.mfEstadoDoPlayer?.();
      if (externo && Number.isFinite(externo.posicao)) {
        const duracao = Number.isFinite(externo.duracao) ? Number(externo.duracao) : 0;
        return {
          posicao: Math.max(0, Number(externo.posicao)),
          duracao: duracao > 0 ? duracao : 0,
          posicaoReal: true,
          duracaoReal: duracao > 0,
        };
      }
    } catch {
      /* cross-origin: a API não é alcançável — segue para o vídeo nativo */
    }

    // (2) Vídeo da mesma origem (player HLS nativo do MovieFlix).
    if (doc) {
      const video = doc.querySelector('video');
      if (video) {
        const duracao = Number.isFinite(video.duration) ? video.duration : 0;
        return {
          posicao: Number.isFinite(video.currentTime) ? video.currentTime : 0,
          duracao: duracao > 0 ? duracao : 0,
          posicaoReal: true,
          duracaoReal: duracao > 0,
        };
      }
    }
    return null;
  } catch {
    // Cross-origin: `contentDocument` acessado lança em alguns motores.
    return null;
  }
}
