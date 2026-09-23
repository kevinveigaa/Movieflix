/**
 * MovieFlix TV — VOLUME controlado pelo aplicativo (Android TV / Google TV).
 *
 * POR QUE NÃO MEXEMOS NO `<video>`: na TV a reprodução vive no embed OFICIAL do
 * provedor, dentro de um IFRAME de OUTRA ORIGEM. A política de mesma origem
 * impede o MovieFlix de ler/escrever `video.volume` ali dentro — então um botão
 * de volume que "mexesse no vídeo" seria DECORATIVO (exatamente o tipo de botão
 * que fez o usuário reclamar dos botões que não funcionam).
 *
 * O caminho que FUNCIONA de verdade — e que qualquer app de TV usa — é o volume
 * da STREAM DE MÍDIA do aparelho (AudioManager), ajustado pela camada nativa.
 * O MovieFlix TV expõe a ponte `MovieFlixApp` ao site; aqui acrescentamos as
 * chamadas de volume do lado JS.
 *
 * Fora do app (navegador de TV), a ponte não existe: aí usamos o volume do
 * próprio `<video>` QUANDO o MovieFlix é quem o desenha (player HLS nativo).
 * Com o embed do provedor em iframe não há o que ajustar pelo site — nesse caso
 * devolvemos `false` para a interface dizer a verdade ao usuário em vez de
 * fingir que funcionou.
 */

type PonteVolume = {
  ajustarVolume?: (delta: number) => void;
  definirVolume?: (percentual: number) => void;
  definirMudo?: (mudo: boolean) => void;
  lerVolume?: () => number;
  lerMudo?: () => boolean;
};

function ponte(): PonteVolume | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    MovieFlixApp?: PonteVolume;
    MovieFlixAndroid?: PonteVolume;
  };
  return w.MovieFlixApp ?? w.MovieFlixAndroid ?? null;
}

/** O app nativo consegue controlar o volume da mídia? */
export function volumeNativoDisponivel(): boolean {
  const p = ponte();
  return typeof p?.ajustarVolume === 'function' || typeof p?.definirVolume === 'function';
}

/**
 * Volume atual da mídia do aparelho (0–100), ou `null` quando não há como ler
 * (navegador, ou ponte antiga sem `lerVolume`).
 */
export function lerVolume(): number | null {
  const p = ponte();
  if (typeof p?.lerVolume === 'function') {
    try {
      const v = Number(p.lerVolume());
      if (Number.isFinite(v)) return Math.min(100, Math.max(0, v));
    } catch {
      /* cai no fallback abaixo */
    }
  }
  const video = document.querySelector<HTMLVideoElement>('video[data-mf-player]');
  if (video) {
    try {
      return Math.round(video.volume * 100);
    } catch {
      return null;
    }
  }
  return null;
}

/** O aparelho está no mudo? `null` quando não há como saber. */
export function lerMudo(): boolean | null {
  const p = ponte();
  if (typeof p?.lerMudo === 'function') {
    try {
      return Boolean(p.lerMudo());
    } catch {
      /* cai no fallback abaixo */
    }
  }
  const video = document.querySelector<HTMLVideoElement>('video[data-mf-player]');
  if (video) {
    try {
      return video.muted;
    } catch {
      return null;
    }
  }
  return null;
}

/** Ajusta o volume em `delta` pontos percentuais (ex.: +5 / -5). */
export function ajustarVolume(delta: number): boolean {
  const p = ponte();
  if (typeof p?.ajustarVolume === 'function') {
    try {
      p.ajustarVolume(delta);
      return true;
    } catch {
      /* cai no fallback abaixo */
    }
  }
  // Fallback: player HLS nativo do MovieFlix (não o embed cross-origin).
  const video = document.querySelector<HTMLVideoElement>('video[data-mf-player]');
  if (video) {
    try {
      const alvo = Math.min(1, Math.max(0, video.volume + delta / 100));
      video.volume = alvo;
      video.muted = alvo === 0;
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Define o volume em percentual absoluto (0–100). */
export function definirVolume(percentual: number): boolean {
  const p = ponte();
  if (typeof p?.definirVolume === 'function') {
    try {
      p.definirVolume(Math.round(percentual));
      return true;
    } catch {
      /* cai no fallback abaixo */
    }
  }
  const video = document.querySelector<HTMLVideoElement>('video[data-mf-player]');
  if (video) {
    try {
      video.volume = Math.min(1, Math.max(0, percentual / 100));
      video.muted = percentual === 0;
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Liga/desliga o mudo. */
export function definirMudo(mudo: boolean): boolean {
  const p = ponte();
  if (typeof p?.definirMudo === 'function') {
    try {
      p.definirMudo(mudo);
      return true;
    } catch {
      /* cai no fallback abaixo */
    }
  }
  const video = document.querySelector<HTMLVideoElement>('video[data-mf-player]');
  if (video) {
    try {
      video.muted = mudo;
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
