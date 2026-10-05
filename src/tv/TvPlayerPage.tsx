import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, Play, Pause, RotateCcw, RotateCw } from 'lucide-react';
import { useMovies } from '@/hooks/useMovies';
import { useAuth } from '@/context/AuthContext';
import { hasActiveSubscription } from '@/context/AuthContext';
import {
  primeiroEpisodioDisponivel,
  streambetterMovieEmbedUrl,
  streambetterSeriesEmbedUrl,
} from '@/lib/strembetter';
import { StreamBetterEmbed } from '@/components/player/StreamBetterEmbed';
import { alternarPlayPausePlayer } from '@/tv/controlePlayer';
import { classificarTecla } from '@/tv/teclasPlayer';
import { assinarProgressoProvedor, pedirSeekProvedor } from '@/tv/progressoReal';
import { TvProgresso } from './TvProgresso';
import { duracaoDoCatalogo, type EstadoProgresso } from './playerProgresso';
import { cn } from '@/lib/cn';

/**
 * TvPlayerPage — player do MovieFlix TV (controle remoto físico). REESCRITA.
 * ══════════════════════════════════════════════════════════════════════════════
 * REQUISITOS DO DONO (o comportamento que esta versão garante):
 *   a. FOCO INICIAL no botão PLAY/PAUSE ao abrir o player (sem mouse);
 *   b. OK/ENTER → play/pause REAL do vídeo (estado real → play()/pause());
 *   c. SETA DIREITA (→) → +30s REAIS; SETA ESQUERDA (←) → −30s REAIS;
 *   d. SETAS ↑/↓ → navegação de foco entre os controles (Play/Pause, barra de
 *      progresso, −30s, +30s); o foco NUNCA desaparece;
 *   e. PLAY/PAUSE físico → play/pause REAL;
 *   f. BACK → tela anterior (tratado pelo shell/WebView);
 *   g. TEMPO REAL: corrige o "0:00 / 0:00" lendo o progresso que o provedor
 *      PUBLICA por postMessage (`streambetter:progress`).
 *
 * ── COMO O VÍDEO É CONTROLADO DE VERDADE ──────────────────────────────────────
 * O player do provedor vive num IFRAME DE OUTRA ORIGEM. Duas pontes reais:
 *   1. PLAY/PAUSE — `alternarPlayPausePlayer` (controlePlayer.ts): alterna pelo
 *      estado REAL quando o `<video>` é legível; senão entrega a TECLA REAL
 *      (ESPAÇO) pela ponte nativa do shell Android (o único caminho que muda o
 *      vídeo no aparelho). NUNCA é só o ícone.
 *   2. SEEK ±30s — `pedirSeekProvedor` (progressoReal.ts): manda
 *      `streambetter:seek` com a posição REAL (currentTime ± 30), respeitando os
 *      limites [0, duração]. É o comando documentado do provedor.
 *   3. TEMPO — `assinarProgressoProvedor`: escuta `streambetter:progress`
 *      (currentTime/duration/state reais) e alimenta a barra. Sem leitura, cai
 *      na duração do catálogo — nunca um número inventado.
 *
 * ── CONTROLE REMOTO (implantação ÚNICA) ───────────────────────────────────────
 *   • UM listener de `keydown` (captura), registrado UMA vez (deps `[]`);
 *   • o marker `data-tv-player-ativo` no `<html>` faz a navegação espacial
 *     global ignorar TODAS as teclas enquanto o player está montado;
 *   • as teclas de MÍDIA do controle chegam pelo evento `mf-media-key` (o shell
 *     Android as encaminha) e são tratadas aqui.
 */

/** Passo do seek pelo controle remoto, em segundos (requisito: exatamente 30s). */
const PASSO_SEEK = 30;

/** Anexa `autoplay=1` à URL do embed (o provedor inicia a reprodução sozinho). */
function comAutoplay(url: string): string {
  if (!url) return url;
  if (/[?&]autoplay=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}autoplay=1`;
}

/** Prende um número dentro de uma faixa. */
function limitar(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  if (max > 0 && v > max) return max;
  return v < min ? min : v;
}

/** Formata segundos como `mm:ss` / `hh:mm:ss`. */
function formatar(segundos: number): string {
  if (!Number.isFinite(segundos)) return '--:--';
  const total = Math.max(0, Math.floor(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const dois = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${dois(h)}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

export function TvPlayerPage({ id: idProp }: { id?: string } = {}) {
  const { id: idParam } = useParams();
  const id = idProp ?? idParam;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const movies = useMovies();
  const { user, subscription, loading: authLoading } = useAuth();
  const assinante = hasActiveSubscription(subscription);
  const iframeWrapRef = useRef<HTMLDivElement>(null);

  /** Recria o embed sem duplicar iframes (mantido para a leitura de estado). */
  const [recarga] = useState(0);

  /** ── PROGRESSO / TEMPO (real quando o provedor publica) ─────────────────── */
  const [progresso, setProgresso] = useState<EstadoProgresso>({
    posicao: 0,
    duracao: 0,
    posicaoReal: false,
    duracaoReal: false,
  });
  /** Estado real de reprodução publicado pelo provedor (otimista sem leitura). */
  const [pausado, setPausado] = useState(false);
  /** Movimento acumulado do seek, para o indicador (⏩ +30s / ⏪ −30s). */
  const [movimento, setMovimento] = useState<{ sentido: 'frente' | 'volta'; segundos: number } | null>(null);

  const movie = useMemo(
    () => (movies.data ?? []).find((m) => String(m.id) === String(id)) ?? null,
    [movies.data, id],
  );

  const ehSerie = Boolean(
    movie && (movie.type === 'series' || movie.type === 'serie' || movie.type === 'tv' || movie.media_type === 'tv'),
  );

  /** Fonte da reprodução — as MESMAS do site/Mobile (nenhum vídeo fictício). */
  const src = useMemo(() => {
    if (!movie) return '';

    if (ehSerie && movie.tmdb_id) {
      const eps = movie.episodes_available ?? [];
      const pedida = Number(params.get('temporada'));
      const pedido = Number(params.get('episodio'));
      const temPedido = Number.isFinite(pedida) && pedida > 0 && Number.isFinite(pedido) && pedido > 0;

      const ordenados = eps
        .map((e) => {
          const [s, ep] = String(e).split('/');
          const season = Number(s);
          const episode = Number(ep);
          return Number.isFinite(season) && Number.isFinite(episode) ? { season, episode } : null;
        })
        .filter((x): x is { season: number; episode: number } => x !== null)
        .sort((a, b) => a.season - b.season || a.episode - b.episode);

      const atual = temPedido ? { season: pedida, episode: pedido } : primeiroEpisodioDisponivel(movie);
      if (!atual) return '';

      return comAutoplay(streambetterSeriesEmbedUrl(movie.tmdb_id, atual.season, atual.episode));
    }

    if (movie.tmdb_id) return comAutoplay(streambetterMovieEmbedUrl(movie.tmdb_id));
    if (movie.video_url) return movie.video_url;
    return '';
  }, [movie, ehSerie, params]);

  const voltar = useCallback(() => {
    if (movie) navigate(`/tv/titulo/${movie.id}`);
    else navigate('/tv');
  }, [movie, navigate]);

  /** O iframe do player (o alvo real dos comandos). */
  const iframeDoPlayer = useCallback(
    (): HTMLIFrameElement | null =>
      (iframeWrapRef.current?.querySelector('iframe') as HTMLIFrameElement | null) ?? null,
    [],
  );

  /** Posição/duração atuais, sempre acessíveis ao listener estável. */
  const progressoRef = useRef(progresso);
  progressoRef.current = progresso;

  /**
   * PLAY/PAUSE pelo OK/ENTER e pelo botão físico.
   * FONTE ÚNICA do toggle: `alternarPlayPausePlayer` decide pelo estado REAL do
   * `<video>` quando legível e, quando não é (embed cross-origin), entrega a
   * TECLA REAL de play/pause pela ponte nativa.
   */
  const alternarPlay = useCallback(() => {
    const resultado = alternarPlayPausePlayer(iframeDoPlayer());
    if (resultado !== null) setPausado(resultado);
    else setPausado((p) => !p); // sem leitura: toggle otimista do HUD
  }, [iframeDoPlayer]);

  /**
   * SEEK REAL de ±30s. Usa a posição REAL (postMessage) quando disponível;
   * respeita os limites [0, duração]. Mostra o indicador ⏩/⏪.
   */
  const buscar = useCallback(
    (delta: number) => {
      const iframe = iframeDoPlayer();
      const atual = progressoRef.current;
      const duracao = atual.duracao > 0 ? atual.duracao : 0;
      const alvo = limitar(atual.posicao + delta, 0, duracao > 0 ? duracao : Number.MAX_SAFE_INTEGER);
      const ok = pedirSeekProvedor(iframe, alvo);
      if (ok) {
        // Atualização otimista da posição (o provedor confirma no próximo progress).
        setProgresso((antes) => ({ ...antes, posicao: alvo }));
        setMovimento((antes) => {
          const sentido = delta > 0 ? 'frente' : 'volta';
          if (antes && antes.sentido === sentido) return { sentido, segundos: antes.segundos + Math.abs(delta) };
          return { sentido, segundos: Math.abs(delta) };
        });
      }
    },
    [iframeDoPlayer],
  );

  /** Só faz sentido quando há assinante e fonte real de vídeo. */
  const pronto = Boolean(user) && assinante && Boolean(src);
  const prontoRef = useRef(pronto);
  prontoRef.current = pronto;

  /** Refs estáveis para o listener (registrado UMA vez). */
  const alternarPlayRef = useRef(alternarPlay);
  alternarPlayRef.current = alternarPlay;
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;
  const voltarRef = useRef(voltar);
  voltarRef.current = voltar;

  /** ── CONTROLES FOCÁVEIS (↑/↓ navega entre eles) ─────────────────────────── */
  const playPauseRef = useRef<HTMLButtonElement>(null);
  const rewindRef = useRef<HTMLButtonElement>(null);
  const forwardRef = useRef<HTMLButtonElement>(null);
  const barraRef = useRef<HTMLDivElement>(null);
  /** Ordem de navegação por ↑/↓. */
  const ordemRefs = useMemo(() => [playPauseRef, barraRef, rewindRef, forwardRef], []);
  const [indiceFoco, setIndiceFoco] = useState(0);
  const indiceFocoRef = useRef(0);
  indiceFocoRef.current = indiceFoco;

  /** Pinta o anel de foco (a MESMA classe que o D-pad usa). */
  const pintarFoco = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    document.querySelectorAll<HTMLElement>('.tv-focus').forEach((o) => {
      if (o !== el) o.classList.remove('tv-focus');
    });
    el.classList.add('tv-focus');
  }, []);

  /** Foca o controle de índice `i` (com wrap). */
  const focarControle = useCallback(
    (i: number) => {
      const lista = ordemRefs;
      const n = lista.length;
      const idx = ((i % n) + n) % n;
      const el = lista[idx].current;
      if (!el) return;
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* ignora */
      }
      pintarFoco(el);
      setIndiceFoco(idx);
    },
    [ordemRefs, pintarFoco],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * CONTROLE REMOTO — UM ÚNICO LISTENER, REGISTRADO UMA VEZ
   * ══════════════════════════════════════════════════════════════════════════
   * Captura, `keydown`. Trata OK/ENTER, setas ←/→ (seek ±30s), setas ↑/↓ (foco),
   * PLAY/PAUSE físico e BACK. Ignora `e.repeat` para o OK (segurar não dispara
   * uma sequência de toggles). Consome a tecla (preventDefault/stopPropagation)
   * para a navegação espacial global se abster. Deps `[]`: registrado UMA vez.
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!prontoRef.current) return;

      // Não roubar teclas de um campo de texto (login/busca da TV).
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;

      const acao = classificarTecla(e);
      if (!acao) return;

      e.preventDefault();
      e.stopPropagation();

      if (acao === 'ok') {
        if (e.repeat) return;
        // OK aciona o controle focado (Play/Pause, −30s, +30s, barra).
        const el = ordemRefs[indiceFocoRef.current]?.current;
        if (el) el.click();
        else alternarPlayRef.current();
        return;
      }

      if (acao === 'playpause') {
        if (e.repeat) return;
        alternarPlayRef.current();
        return;
      }

      if (acao === 'left') {
        buscarRef.current(-PASSO_SEEK);
        return;
      }
      if (acao === 'right') {
        buscarRef.current(PASSO_SEEK);
        return;
      }
      if (acao === 'up') {
        focarControle(indiceFocoRef.current - 1);
        return;
      }
      if (acao === 'down') {
        focarControle(indiceFocoRef.current + 1);
        return;
      }
      if (acao === 'back') {
        voltarRef.current();
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [ordemRefs, focarControle]);

  /**
   * TECLAS DE MÍDIA do controle físico (PLAY/PAUSE, ⏩, ⏪). O shell Android as
   * encaminha como o evento `mf-media-key` (o WebView não as entrega como
   * keydown). Aqui elas viram as MESMAS ações reais do OK e das setas.
   */
  useEffect(() => {
    function onMediaKey(e: Event) {
      if (!prontoRef.current) return;
      const tipo = (e as CustomEvent<string>).detail;
      if (tipo === 'togglePlay') alternarPlayRef.current();
      else if (tipo === 'seekFwd') buscarRef.current(PASSO_SEEK);
      else if (tipo === 'seekBack') buscarRef.current(-PASSO_SEEK);
    }
    window.addEventListener('mf-media-key', onMediaKey as EventListener);
    return () => window.removeEventListener('mf-media-key', onMediaKey as EventListener);
  }, []);

  /**
   * MARCADOR DE POSSE DO PLAYER: enquanto esta tela está montada,
   * `data-tv-player-ativo` no `<html>` diz à navegação espacial global para
   * ignorar TODAS as teclas — o player é o dono do controle.
   */
  useEffect(() => {
    if (!pronto) return;
    document.documentElement.setAttribute('data-tv-player-ativo', '1');
    return () => document.documentElement.removeAttribute('data-tv-player-ativo');
  }, [pronto]);

  /** Troca de título/episódio: o progresso mostrado é o DESTA reprodução. */
  const chaveTitulo = `${movie?.id ?? ''}/${params.get('temporada') ?? ''}/${params.get('episodio') ?? ''}`;
  const chaveTituloRef = useRef('');
  useEffect(() => {
    if (chaveTituloRef.current === chaveTitulo) return;
    chaveTituloRef.current = chaveTitulo;
    setProgresso({ posicao: 0, duracao: 0, posicaoReal: false, duracaoReal: false });
    setMovimento(null);
  }, [chaveTitulo]);

  /**
   * DURAÇÃO conhecida do catálogo (`duration`, em minutos) — o MESMO dado que o
   * card e a tela de detalhes já exibem. É o fallback HONESTO enquanto o
   * provedor não publica a duração real.
   */
  useEffect(() => {
    const seg = duracaoDoCatalogo(movie?.duration);
    if (seg <= 0) return;
    setProgresso((antes) => ({
      ...antes,
      duracao: antes.duracaoReal ? antes.duracao : seg,
      posicao: antes.posicaoReal ? antes.posicao : Math.min(antes.posicao, seg),
    }));
  }, [movie?.duration]);

  /**
   * PROGRESSO REAL do provedor (postMessage `streambetter:progress`).
   * É o que corrige o "0:00 / 0:00": o tempo e a duração passam a ser os REAIS
   * do vídeo, publicados pelo próprio player.
   */
  useEffect(() => {
    if (!pronto) return;
    const limpar = assinarProgressoProvedor((p) => {
      setProgresso({
        posicao: p.posicao,
        duracao: p.duracao > 0 ? p.duracao : progressoRef.current.duracao,
        posicaoReal: true,
        duracaoReal: p.duracao > 0,
      });
      if (p.estado === 'playing') setPausado(false);
      else if (p.estado === 'paused') setPausado(true);
    });
    return limpar;
  }, [pronto, recarga]);

  /** O indicador de seek some sozinho depois de um instante. */
  useEffect(() => {
    if (!movimento) return;
    const t = window.setTimeout(() => setMovimento(null), 1200);
    return () => window.clearTimeout(t);
  }, [movimento]);

  /**
   * FOCO INICIAL: no botão PLAY/PAUSE, assim que o player está pronto.
   * Determinístico (sem depender de tecla) — o requisito do dono.
   */
  useEffect(() => {
    if (!pronto) return;
    const t = window.setTimeout(() => focarControle(0), 300);
    return () => window.clearTimeout(t);
  }, [pronto, recarga, focarControle]);

  /**
   * GUARDA DE FOCO: o foco NUNCA pode desaparecer do player. Se ele sair dos
   * controles (para o body, para o iframe ou para fora), é devolvido ao controle
   * atual. Sem timer perpétuo: reage ao evento de foco.
   */
  useEffect(() => {
    if (!pronto) return;
    function onFocusIn(e: FocusEvent) {
      const alvo = e.target as HTMLElement | null;
      if (!alvo) return;
      const dentro = ordemRefs.some((r) => r.current === alvo);
      if (dentro) {
        pintarFoco(alvo);
        return;
      }
      // Foco saiu dos controles: devolve ao controle atual.
      const atual = ordemRefs[indiceFocoRef.current]?.current;
      if (atual) {
        try {
          atual.focus({ preventScroll: true });
        } catch {
          /* ignora */
        }
        pintarFoco(atual);
      }
    }
    document.addEventListener('focusin', onFocusIn, true);
    return () => document.removeEventListener('focusin', onFocusIn, true);
  }, [pronto, ordemRefs, pintarFoco]);

  if (authLoading) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-loading">
          <Loader2 className="tv-icon tv-spin" />
          <p>Verificando seu acesso...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-error">
          <AlertCircle className="tv-icon-lg" style={{ color: '#df0a15' }} />
          <h2>Faça login para assistir</h2>
          <p>Use a mesma conta MovieFlix do site e do aplicativo.</p>
          <div className="tv-error-actions">
            <button
              data-tv-focusable
              data-tv-initial-focus
              tabIndex={0}
              className="tv-btn tv-btn-primary"
              onClick={() => navigate('/tv/login')}
            >
              Entrar na minha conta
            </button>
            <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-ghost" onClick={voltar}>
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!assinante) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-error">
          <AlertCircle className="tv-icon-lg" style={{ color: '#df0a15' }} />
          <h2>Assinatura necessária</h2>
          <p>Sua assinatura não está ativa. Escolha um plano para liberar a reprodução.</p>
          <div className="tv-error-actions">
            <button
              data-tv-focusable
              data-tv-initial-focus
              tabIndex={0}
              className="tv-btn tv-btn-primary"
              onClick={() => navigate('/tv/assinatura')}
            >
              Ver planos
            </button>
            <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-ghost" onClick={voltar}>
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!movie || !src) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-error tv-error-muted">
          <h2>Não foi possível carregar o conteúdo</h2>
          <p>Este título não tem fonte de vídeo disponível no catálogo.</p>
          <div className="tv-error-actions">
            <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-ghost" onClick={voltar}>
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pct = progresso.duracao > 0 ? limitar((progresso.posicao / progresso.duracao) * 100, 0, 100) : 0;

  return (
    <div className="tv-page tv-page-player">
      {/* O vídeo ocupa a tela. */}
      <div className="tv-player-box" data-tv-player-box>
        <div ref={iframeWrapRef} className="tv-player-embed">
          <StreamBetterEmbed
            key={`${src}-${recarga}`}
            embedUrl={src}
            onBack={voltar}
            mostrarTelaCheia={false}
          />
        </div>

        {/* CAMADA DE BLOQUEIO: cobre o embed do provedor para a barra nativa dele
            não surgir nem responder. O controle remoto opera o player pelas
            pontes reais (tecla de play/pause + streambetter:seek). */}
        <div className="tv-player-bloqueio" aria-hidden="true" tabIndex={-1} />
      </div>

      {/* HUD de progresso/tempo (camada própria, no alto) — só leitura. */}
      <div className="tv-player-progresso-camada tv-player-progresso-camada-ativo">
        <TvProgresso
          posicao={progresso.posicao}
          duracao={progresso.duracao}
          posicaoReal={progresso.posicaoReal}
          duracaoReal={progresso.duracaoReal}
          movimento={movimento}
          pausado={pausado}
        />
      </div>

      {/* ── CONTROLES DO PLAYER (focáveis pelo controle remoto) ────────────────
          ↑/↓ navega entre eles; OK aciona o controle focado; ←/→ faz seek ±30s
          real; PLAY/PAUSE físico alterna. O foco inicial é o Play/Pause. */}
      <div className="tv-player-controles" data-tv-player-controles>
        <button
          ref={playPauseRef}
          type="button"
          data-tv-focusable
          tabIndex={0}
          className="tv-player-ctrl tv-player-ctrl-main"
          aria-label={pausado ? 'Reproduzir' : 'Pausar'}
          onClick={alternarPlay}
        >
          {pausado ? <Play className="tv-player-ctrl-icon" /> : <Pause className="tv-player-ctrl-icon" />}
        </button>

        <button
          ref={rewindRef}
          type="button"
          data-tv-focusable
          tabIndex={0}
          className="tv-player-ctrl"
          aria-label="Voltar 30 segundos"
          onClick={() => buscar(-PASSO_SEEK)}
        >
          <RotateCcw className="tv-player-ctrl-icon" />
        </button>

        <button
          ref={forwardRef}
          type="button"
          data-tv-focusable
          tabIndex={0}
          className="tv-player-ctrl"
          aria-label="Avançar 30 segundos"
          onClick={() => buscar(PASSO_SEEK)}
        >
          <RotateCw className="tv-player-ctrl-icon" />
        </button>

        {/* Barra de progresso focável: mostra o tempo REAL e a posição. */}
        <div
          ref={barraRef}
          data-tv-focusable
          tabIndex={0}
          role="slider"
          aria-label="Progresso do vídeo"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className={cn('tv-player-barra', 'tv-player-barra-focavel')}
          onClick={alternarPlay}
        >
          <span className="tv-player-barra-trilha">
            <span className="tv-player-barra-preenchida" style={{ width: `${pct}%` }} />
          </span>
          <span className="tv-player-barra-tempo">
            {formatar(progresso.posicao)} / {progresso.duracao > 0 ? formatar(progresso.duracao) : '--:--'}
          </span>
        </div>
      </div>

      <p className="tv-player-hint">
        OK pausa/continua · ← −30s · → +30s · ↑↓ navega · Voltar sai
      </p>
    </div>
  );
}
