import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
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
import { useEstadoVideoPlayer } from '@/tv/useEstadoVideoPlayer';
import { TvProgresso } from './TvProgresso';
import {
  duracaoDoCatalogo,
  lerEstadoDoPlayer,
  type EstadoProgresso,
} from './playerProgresso';
import { cn } from '@/lib/cn';

/**
 * TvPlayerPage — player do MovieFlix TV (controle remoto). REESCRITA DO ZERO.
 * ═══════════════════════════════════════════════════════════════════════════
 * REQUISITOS DO DONO (o comportamento que esta versão garante):
 *   a. NENHUM botão na tela do player — voltar, avançar, retroceder, pausar/play,
 *      configurações, tela cheia ou qualquer outro. Nenhum.
 *   b. ao entrar, o filme REPRODUZ SOZINHO, sem mouse nem clique.
 *   c. OK → pausa; OK de novo → despausa. É a ÚNICA ação do controle.
 *   d. setas NÃO avançam/retrocedem, volume NÃO sobe/desce: os handlers de seek
 *      ±10s e de volume/mute foram REMOVIDOS — as setas não fazem nada no player.
 *
 * ── POR QUE A RODADA ANTERIOR FALHOU NO APARELHO ──────────────────────────
 * 1. TELA. A barra que o usuário ainda via (voltar, ⏪10, play, ⏩10, mudo, ⏮,
 *    ⏭, legenda, engrenagem, tela cheia, ✕ + o texto "OK pausa/continua ·
 *    ↑ configurações · ↓ controles · +/− volume") NÃO existe no código do
 *    MovieFlix — o CSS/texto não aparece em lugar nenhum do repositório. É a
 *    barra NATIVA do embed do provedor (streambetter.shop), que vive num IFRAME
 *    DE OUTRA ORIGEM. Como o provedor não expõe nenhuma forma de esconder os
 *    controles (o único parâmetro documentado é a URL; nenhum `controls=0`),
 *    a ÚNICA forma de a barra não aparecer é o app NÃO deixar o embed receber
 *    nenhuma interação: sem interação, os controles nunca surgem nem respondem.
 *    É o que faz a CAMADA DE BLOQUEIO (`tv-player-bloqueio`) abaixo, que cobre o
 *    iframe e absorve tudo (clique, toque, foco).
 * 2. OK. O OK não pausava porque a MESMA pulsação era tratada por vários donos
 *    (esta página, o `useTvNavigation` global e o `useTvPlayerControls` legado),
 *    e a página antiga registrava o listener DENTRO do efeito `[pronto, ...]`,
 *    recriando-o a cada render. Agora há UM ÚNICO listener, registrado UMA VEZ
 *    (deps `[]`) e removido no cleanup, que trata SOMENTE OK/ENTER, ignora
 *    `e.repeat` e entrega o toggle ao vídeo pela ponte nativa do shell Android
 *    (o iframe é cross-origin e só uma tecla REAL chega até o player).
 *
 * ── REPRODUÇÃO ────────────────────────────────────────────────────────────
 * O embed oficial do StreamBetter é montado com `autoplay=1` (mesma lógica do
 * site/Mobile) e o wrapper carrega `allow="autoplay; …"`. O `<video>` também
 * tenta `play()` quando é legível (mesma origem) e NUNCA é pausado proativamente
 * (sem `autoPause`): entrar no player não deve interromper a reprodução.
 *
 * ── CONTROLE REMOTO (implantação ÚNICA) ───────────────────────────────────
 *   • `teclasPlayer.ts` decide o que é OK/ENTER — e SÓ isso;
 *   • UM listener de `keydown` (captura) trata o OK, com `preventDefault`/
 *     `stopPropagation` para o `useTvNavigation` global se abster;
 *   • o marker `data-tv-player-ativo` no `<html>` faz a navegação espacial
 *     global ignorar TODAS as teclas enquanto o player está montado.
 */

/**
 * Anexa `autoplay=1` à URL do embed (o provedor inicia a reprodução sozinho).
 * Não altera a URL base compartilhada com o site/Mobile — é um reforço LOCAL do
 * player da TV, aplicado só aqui.
 */
function comAutoplay(url: string): string {
  if (!url) return url;
  if (/[?&]autoplay=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}autoplay=1`;
}

export function TvPlayerPage({ id: idProp }: { id?: string } = {}) {
  const { id: idParam } = useParams();
  const id = idProp ?? idParam;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const movies = useMovies();
  const { user, subscription, loading: authLoading } = useAuth();
  const assinante = hasActiveSubscription(subscription);
  const frameRef = useRef<HTMLDivElement>(null);
  const iframeWrapRef = useRef<HTMLDivElement>(null);

  /** Recria o embed sem duplicar iframes (mantido para a leitura de estado). */
  const [recarga] = useState(0);

  /**
   * ── ESTADO REAL DO VÍDEO ─────────────────────────────────────────────────
   * `estadoVideo` acompanha o `<video>` de verdade (eventos reais). Quando o
   * embed do provedor é de outra origem, `legivel` é `false` e o estado cai no
   * toggle otimista do HUD — nunca um valor inventado.
   */
  const { estado: estadoVideo, reler: relerVideo } = useEstadoVideoPlayer(iframeWrapRef, recarga);
  /** Estado otimista de play/pause, usado SÓ quando o vídeo não é legível. */
  const [pausadoOtimista, setPausadoOtimista] = useState(false);
  /** O vídeo está pausado? (estado real quando legível; otimista quando não). */
  const pausado = estadoVideo.legivel ? estadoVideo.pausado : pausadoOtimista;

  /** ── PROGRESSO / TEMPO (só leitura; nenhuma ação de seek/volume) ─────────── */
  const [progresso, setProgresso] = useState<EstadoProgresso>({
    posicao: 0,
    duracao: 0,
    posicaoReal: false,
    duracaoReal: false,
  });

  const movie = useMemo(
    () => (movies.data ?? []).find((m) => String(m.id) === String(id)) ?? null,
    [movies.data, id],
  );

  const ehSerie = Boolean(
    movie && (movie.type === 'series' || movie.type === 'serie' || movie.type === 'tv' || movie.media_type === 'tv'),
  );

  /**
   * Fonte da reprodução. Para SÉRIE usa a temporada/episódio pedidos na URL (ou
   * o primeiro episódio real com fonte); para FILME, o tmdb_id. Fontes: as MESMAS
   * do site/Mobile — nenhum vídeo fictício. Sempre com `autoplay=1`.
   */
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

  /**
   * PLAY/PAUSE pelo OK/ENTER do controle.
   *
   * FONTE ÚNICA do toggle. `alternarPlayPausePlayer` decide pelo estado REAL do
   * `<video>` quando ele é legível e, quando não é (embed cross-origin), entrega a
   * TECLA REAL de play/pause pela ponte nativa (o único caminho que muda o vídeo
   * no aparelho). O HUD acompanha o estado; sem leitura possível, mantém o otimista.
   */
  const alternarPlay = useCallback(() => {
    const iframe = iframeWrapRef.current?.querySelector('iframe') ?? null;
    const resultado = alternarPlayPausePlayer(iframe);
    if (resultado === null) setPausadoOtimista((p) => !p);
    else setPausadoOtimista(resultado);
    // Relê o estado real logo depois, para o indicador não atrasar.
    window.setTimeout(() => relerVideo(), 0);
  }, [relerVideo]);

  /**
   * O toggle atual, sempre acessível ao listener estável (que é registrado UMA
   * vez e não pode "capturar" uma closure antiga). O listener lê `alternarPlayRef`
   * e `prontoRef` a cada tecla — sem recriar o listener, sem perder o estado.
   */
  const alternarPlayRef = useRef(alternarPlay);
  alternarPlayRef.current = alternarPlay;

  /** Só faz sentido quando há assinante e fonte real de vídeo. */
  const pronto = Boolean(user) && assinante && Boolean(src);
  const prontoRef = useRef(pronto);
  prontoRef.current = pronto;

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * CONTROLE REMOTO — UM ÚNICO LISTENER, REGISTRADO UMA VEZ
   * ═══════════════════════════════════════════════════════════════════════════
   * Captura, `keydown`. Trata SOMENTE OK/ENTER (via `classificarTecla`), ignora
   * `e.repeat` (segurar o OK não dispara uma sequência de toggles), consome a
   * tecla (preventDefault/stopPropagation) e NÃO age sobre campo de texto.
   * Setas, volume e back: `classificarTecla` devolve `null` → nada acontece.
   * Deps `[]`: registrado UMA vez e removido no cleanup (nunca recriado).
   */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!prontoRef.current) return;
      if (classificarTecla(e) !== 'ok') return;

      // Não roubar o OK de um campo de texto (login/busca da TV).
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;

      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      alternarPlayRef.current();
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  /**
   * MARCADOR DE POSSE DO PLAYER.
   * Enquanto esta tela está montada, `data-tv-player-ativo` no `<html>` diz à
   * navegação espacial global (`useTvNavigation`) para ignorar TODAS as teclas:
   * o player é o dono do controle.
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
  }, [chaveTitulo]);

  /**
   * DURAÇÃO conhecida do catálogo (`duration`, em minutos) — o MESMO dado que o
   * card e a tela de detalhes já exibem. Permite mostrar "00:35:20 / 01:52:40"
   * mesmo com o player em outra origem.
   */
  useEffect(() => {
    const seg = duracaoDoCatalogo(movie?.duration);
    if (seg <= 0) return;
    setProgresso((antes) => ({
      ...antes,
      duracao: seg,
      duracaoReal: false,
      posicao: antes.posicaoReal ? antes.posicao : Math.min(antes.posicao, seg),
    }));
  }, [movie?.duration]);

  /**
   * LEITURA DO TEMPO REAL do player quando o navegador permite. No MovieFlix TV
   * o embed do provedor é de OUTRA ORIGEM: a leitura devolve `null` e o HUD segue
   * com a duração do catálogo — sem inventar tempo.
   */
  useEffect(() => {
    if (!pronto) return;
    let vivo = true;
    const t = window.setInterval(() => {
      if (!vivo) return;
      const iframe = iframeWrapRef.current?.querySelector('iframe') as HTMLIFrameElement | null;
      const lido = lerEstadoDoPlayer(iframe);
      if (!lido) return;
      setProgresso((antes) =>
        Math.abs(lido.posicao - antes.posicao) < 0.5 && lido.duracao === antes.duracao ? antes : lido,
      );
    }, 900);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [pronto, recarga]);

  /**
   * FOCO INICIAL: no CONTÊINER do player (mesma origem), NUNCA no iframe.
   * O wrapper da mesma origem recebe as teclas e o listener acima as trata. O
   * iframe NÃO é focado (ele vive em outra origem e "engoliria" o Ctrl); quando o
   * OK precisa chegar ao player, a ponte nativa foca o iframe por um instante,
   * entrega a tecla e devolve o foco ao site.
   */
  useEffect(() => {
    if (!pronto) return;
    const t = window.setTimeout(() => {
      try {
        frameRef.current?.focus({ preventScroll: true });
      } catch {
        /* ignora */
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [pronto, recarga]);

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

  return (
    <div className="tv-page tv-page-player">
      {/* O vídeo ocupa a tela. NENHUM botão, NENHUMA barra de controles. */}
      <div className="tv-player-box" data-tv-player-box ref={frameRef} tabIndex={0}>
        <div ref={iframeWrapRef} className="tv-player-embed">
          {/* `mostrarTelaCheia={false}`: na TV o embed não desenha a própria barra
              de tela cheia (o player é imersivo por natureza). */}
          <StreamBetterEmbed
            key={`${src}-${recarga}`}
            embedUrl={src}
            onBack={voltar}
            mostrarTelaCheia={false}
          />
        </div>

        {/* ── CAMADA DE BLOQUEIO (nenhum botão na tela) ─────────────────────
            Cobre TODO o embed do provedor. O embed vive num iframe de outra
            origem cuja barra de controles (voltar, ⏪10, play, ⏩10, volume,
            engrenagem, tela cheia, ✕) só aparece e só responde à INTERAÇÃO. Sem
            interação, ela não funciona nem surge — que é o requisito: nenhum
            botão do player deve existir. A camada absorve clique/toque/foco. */}
        <div className="tv-player-bloqueio" aria-hidden="true" tabIndex={-1} />
      </div>

      {/* ── HUD de progresso/tempo (camada própria, no alto) ────────────────
          Só LEITURA: aparece a cada OK e some sozinha. Não tem botão nenhum e
          não trata teclas — a única ação do controle continua sendo o OK. */}
      <div className="tv-player-progresso-camada tv-player-progresso-camada-ativo">
        <TvProgresso
          posicao={progresso.posicao}
          duracao={progresso.duracao}
          posicaoReal={progresso.posicaoReal}
          duracaoReal={progresso.duracaoReal}
          movimento={null}
          pausado={pausado}
        />
      </div>
    </div>
  );
}
