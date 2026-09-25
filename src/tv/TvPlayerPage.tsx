import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  SkipForward,
  X,
  Loader2,
  AlertCircle,
  Pause,
  Play,
  Settings,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useMovies } from '@/hooks/useMovies';
import { useAuth } from '@/context/AuthContext';
import { hasActiveSubscription } from '@/context/AuthContext';
import {
  primeiroEpisodioDisponivel,
  streambetterMovieEmbedUrl,
  streambetterSeriesEmbedUrl,
} from '@/lib/strembetter';
import { StreamBetterEmbed } from '@/components/player/StreamBetterEmbed';
import { acionarControlePlayer, type AcaoControle } from '@/tv/controlePlayer';
import { TvProgresso } from './TvProgresso';
import {
  PASSO_SEEK,
  acumularMovimento,
  avancar,
  duracaoDoCatalogo,
  lerEstadoDoPlayer,
  retroceder,
  type EstadoProgresso,
  type Movimento,
} from './playerProgresso';
import { TvMark } from './TvBrand';
import {
  ajustarVolume,
  definirMudo,
  lerMudo,
  lerVolume,
  volumeNativoDisponivel,
} from '@/lib/volumeTv';
import { cn } from '@/lib/cn';

/**
 * TvPlayerPage — player do MovieFlix TV.
 *
 * REPRODUÇÃO: o embed OFICIAL do StreamBetter, montado em iframe — a MESMA
 * lógica do site e do app Mobile (`StreamBetterEmbed` + `src/lib/strembetter`).
 * É isso que evita o erro "Este link só funciona dentro de um iframe": o
 * provedor exige ser carregado DENTRO de um iframe, e é exatamente assim que
 * carregamos. A proteção contra popups/redirects/anúncios é o antiAds global
 * (`src/lib/antiAds.ts`), com Cloudflare/Turnstile preservados.
 *
 * ── O QUE FOI CORRIGIDO NESTA VERSÃO (relato do usuário) ─────────────────────
 *  a) NÃO HÁ MAIS BOTÕES SOLTOS NO TOPO. A versão anterior desenhava uma barra
 *     de topo sobre o vídeo (marca + título) e a barra de controles embaixo —
 *     duas superfícies concorrentes na tela. Agora existe UMA barra única, no
 *     rodapé, com o título discreto à esquerda e os controles à direita. Nada
 *     fica solto sobre o vídeo.
 *  b) SEEK PELO CONTROLE: ← retrocede 10s e → avança 10s, com o passo à vista.
 *     Funciona com o foco no player (controles fechados), que é o estado normal
 *     durante a reprodução. Também há os botões ⟲ / ⟳ na barra.
 *  c) CONFIGURAÇÕES DO PLAYER pelo controle: ↑ (controles fechados) ou o botão
 *     de engrenagem abrem o painel, navegável só com o D-pad.
 *  d) VOLUME pelo controle: as teclas +/− do controle aumentam/diminuem e 🔇
 *     muta/desmuta. O ajuste vai pelo AudioManager do aparelho (ponte nativa),
 *     porque o vídeo vive num iframe de OUTRA origem — mexer em `video.volume`
 *     ali dentro é impossível e um botão assim seria decorativo. Com um player
 *     HLS NATIVO do MovieFlix, o volume cai no `<video>` direto.
 *  e) SEM BORDA VERMELHA ao redor do vídeo (a regra de CSS do foco foi
 *     removida). O indicador de foco agora é discreto e vive na barra.
 *  f) TUDO ACIONADO PELO CONTROLE DENTRO DO APP: o shell Android repassa as
 *     teclas de mídia como `mf-media-key` e as de D-pad como keydown normal;
 *     ambos os caminhos estão tratados aqui.
 *
 * ── HIERARQUIA DO BACK (nunca fecha o app de surpresa) ───────────────────────
 *  1º painel de configurações aberto  → fecha o painel;
 *  2º controles abertos               → fecha os controles;
 *  3º volta para os DETALHES do título.
 */

/** Tempo de inatividade antes de esconder os controles (ms). */
const AUTO_HIDE_MS = 4000;

/**
 * Cadência do movimento CONTÍNUO ao segurar ←/→ (ms).
 *
 * Um clique = um passo de 10s. Segurar = um passo a cada 450 ms, de forma
 * controlada — nunca na velocidade da auto-repetição do sistema (que dispara
 * ~30 passos por segundo e tornaria o avanço inutilizável).
 */
const INTERVALO_SEGURAR_MS = 450;

/** Quanto tempo o indicador de movimento (⏩ +30s) fica na tela depois do último passo. */
const MOVIMENTO_VISIVEL_MS = 1200;

/** Quanto tempo a barra de progresso/tempo fica na tela depois de um comando. */
const PROGRESSO_VISIVEL_MS = 3500;

export function TvPlayerPage({ id: idProp }: { id?: string } = {}) {
  const { id: idParam } = useParams();
  const id = idProp ?? idParam;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const movies = useMovies();
  const { user, subscription, loading: authLoading } = useAuth();
  const assinante = hasActiveSubscription(subscription);
  const frameRef = useRef<HTMLDivElement>(null);
  // Quando um BOTÃO da barra/overlay detém o foco, o foco NÃO é "do jogador":
  // ele é do humano navegando os menus do MovieFlix TV. Serve para desambiguar
  // o fim do modo CONTROLE DO PLAYER sem quebrar a navegação normal.
  const ultimoFocoRef = useRef<'jogador' | 'humano'>('jogador');
  const iframeWrapRef = useRef<HTMLDivElement>(null);
  const autoHideRef = useRef<number | null>(null);

  /** Controles visíveis (nunca ficam abertos durante a reprodução, salvo pin). */
  const [controles, setControles] = useState(false);
  /** Controles PINADOS (segurar OK): não somem sozinhos. */
  const [fixo, setFixo] = useState(false);
  /** Painel de configurações do player aberto? */
  const [config, setConfig] = useState(false);
  /** Controle principal (play/pause) — recebe o foco quando a barra abre. */
  const ctrlMainRef = useRef<HTMLButtonElement>(null);
  /** Estado otimista de play/pause para o ícone do controle. */
  const [emReproducao, setEmReproducao] = useState(true);
  /** Recria o embed ("Recarregar player") sem duplicar iframes. */
  const [recarga, setRecarga] = useState(0);

  /**
   * ── PROGRESSO / TEMPO (barra, +10s/−10s, tempo restante) ───────────────────
   * `posicao`/`duracao` em segundos. `posicaoReal`/`duracaoReal` dizem se o
   * número foi LIDO do player ou vem do acúmulo dos comandos + catálogo — a
   * interface mostra a diferença em vez de inventar um tempo (ver
   * `playerProgresso.ts`).
   */
  const [progresso, setProgresso] = useState<EstadoProgresso>({
    posicao: 0,
    duracao: 0,
    posicaoReal: false,
    duracaoReal: false,
  });
  /** Movimento acumulado do seek (⏩ +30s) — some sozinho depois do último passo. */
  const [movimento, setMovimento] = useState<Movimento | null>(null);
  /** A barra de progresso está na tela? (camada própria, independente dos controles) */
  const [progressoVisivel, setProgressoVisivel] = useState(false);
  const progressoTimerRef = useRef<number | null>(null);
  const movimentoTimerRef = useRef<number | null>(null);
  /** Cadência do avanço/retrocesso contínuo (segurar ←/→ ou ⏪/⏩). */
  const seekTimerRef = useRef<number | null>(null);
  /** Sentido do movimento contínuo em andamento. */
  const direcaoSeguradaRef = useRef(false);
  /**
   * Instante do último evento de seek vindo do controle. Enquanto o botão está
   * pressionado o aparelho repete o evento e este carimbo se renova; quando o
   * usuário solta, a repetição para — e a cadência contínua se encerra sozinha
   * (rede de segurança para controles que não mandam keyup).
   */
  const ultimoEventoSeekRef = useRef(0);

  /** Volume da mídia do aparelho (0–100) e mudo — lidos da ponte nativa. */
  const [volume, setVolume] = useState<number>(() => lerVolume() ?? 50);
  const [mudo, setMudo] = useState<boolean>(() => lerMudo() ?? false);
  /** O aparelho expõe o volume da mídia ao site? (independe do navegador) */
  const temVolume = volumeNativoDisponivel() || typeof lerVolume() === 'number';
  /** Aviso curto sobreposto (feedback de volume/seek/sem volume). */
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoRef = useRef<number | null>(null);

  const movie = useMemo(
    () => (movies.data ?? []).find((m) => String(m.id) === String(id)) ?? null,
    [movies.data, id],
  );

  const ehSerie = Boolean(
    movie && (movie.type === 'series' || movie.type === 'serie' || movie.type === 'tv' || movie.media_type === 'tv'),
  );

  /**
   * Fonte da reprodução. Para SÉRIE usa a temporada/episódio pedidos na URL
   * (ou o primeiro episódio real com fonte); para FILME, o tmdb_id.
   * Fontes: as MESMAS do site/Mobile — nenhum vídeo fictício.
   */
  const { src, proximo } = useMemo(() => {
    if (!movie) return { src: '', proximo: null as { season: number; episode: number } | null };

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
      if (!atual) return { src: '', proximo: null };

      const idx = ordenados.findIndex((e) => e.season === atual.season && e.episode === atual.episode);
      const prox = idx >= 0 && idx + 1 < ordenados.length ? ordenados[idx + 1] : null;

      return {
        src: streambetterSeriesEmbedUrl(movie.tmdb_id, atual.season, atual.episode),
        proximo: prox,
      };
    }

    if (movie.tmdb_id) return { src: streambetterMovieEmbedUrl(movie.tmdb_id), proximo: null };
    if (movie.video_url) return { src: movie.video_url, proximo: null };
    return { src: '', proximo: null };
  }, [movie, ehSerie, params]);

  const voltar = useCallback(() => {
    if (movie) navigate(`/tv/titulo/${movie.id}`);
    else navigate('/tv');
  }, [movie, navigate]);

  const proximoEpisodio = useCallback(() => {
    if (!proximo || !movie) return;
    navigate(`/tv/assistir/${movie.id}?temporada=${proximo.season}&episodio=${proximo.episode}`);
  }, [proximo, movie, navigate]);

  /** Mostra um aviso curto sobreposto (feedback das ações do controle). */
  const mostrarAviso = useCallback((texto: string) => {
    setAviso(texto);
    if (avisoRef.current !== null) window.clearTimeout(avisoRef.current);
    avisoRef.current = window.setTimeout(() => setAviso(null), 1400);
  }, []);

  /**
   * ── PROGRESSO: visibilidade, indicador de movimento e agendamentos ─────────
   * A barra/tempo aparece a cada comando e se esconde sozinha; o indicador do
   * seek (⏩ +30s) some um pouco depois do último passo.
   */
  const agendarEsconderProgresso = useCallback(() => {
    if (progressoTimerRef.current !== null) window.clearTimeout(progressoTimerRef.current);
    progressoTimerRef.current = window.setTimeout(() => setProgressoVisivel(false), PROGRESSO_VISIVEL_MS);
  }, []);

  const agendarLimparMovimento = useCallback(() => {
    if (movimentoTimerRef.current !== null) window.clearTimeout(movimentoTimerRef.current);
    movimentoTimerRef.current = window.setTimeout(() => setMovimento(null), MOVIMENTO_VISIVEL_MS);
  }, []);

  /**
   * Envia um comando para o player embutido.
   *
   * A lógica (quais nomes de comando o player reconhece, e o reforço no vídeo
   * nativo) vive em `@/lib/playerCommands`, junto com a explicação da CAUSA
   * RAIZ do bug de seek — mantida num módulo puro para poder ser verificada.
   *
   * HONESTIDADE: um embed de outra origem pode recusar comandos externos por
   * segurança. Nesse caso o embed mantém os controles próprios, e o volume
   * segue resolvido pelo áudio do APARELHO (funciona em qualquer provedor).
   */
  /**
   * Devolve o foco ao JOGADOR (iframe do provedor em primeiro lugar).
   *
   * O iframe é preferido: enquanto ele é o `document.activeElement`, o navegador
   * roteia a tecla do controle ao documento do player (mesmo de outra origem).
   * Sem isso o comando virava só um aviso na tela — CAUSA RAIZ do Problema 2.
   */
  const focarJogador = useCallback(() => {
    ultimoFocoRef.current = 'jogador';
    const wrap = iframeWrapRef.current;
    const alvo = wrap?.querySelector('iframe') ?? frameRef.current;
    try {
      alvo?.focus({ preventScroll: true });
    } catch {
      /* ignora */
    }
  }, []);

  const comandarPlayer = useCallback((acao: AcaoControle, passo: number = PASSO_SEEK) => {
    const iframe = iframeWrapRef.current?.querySelector('iframe');
    // A camada de integração entrega a TECLA REAL ao player quando o APK está
    // presente (é o que faz o controle do provedor reagir de verdade) e, quando
    // não está, mantém o caminho anterior (postMessage + vídeo nativo).
    acionarControlePlayer(iframe, acao, passo);
  }, []);

  /**
   * PLAY/PAUSE pelo controle.
   *
   * Dentro do player o OK vira `KEYCODE_MEDIA_PLAY_PAUSE` (ação `ok`), e os
   * botões de mídia passam `play`/`pause` explícitos. É o mesmo caminho da
   * camada de integração — por isso o ESTADO REAL do vídeo muda.
   */
  const alternarPlay = useCallback(() => {
    setEmReproducao((v) => {
      comandarPlayer(v ? 'pause' : 'play');
      return !v;
    });
  }, [comandarPlayer]);

  /**
   * Alterna a reprodução pelo BOTÃO OK do controle (dentro do player).
   * Usa a ação `ok` (KEYCODE_MEDIA_PLAY_PAUSE) em vez de nomear play/pause:
   * o botão OK da TV é um toggle — nomear o estado poderia dessincronizar do
   * player real se o embed já tivesse trocado de estado sozinho.
   */
  const alternarPlayPeloOk = useCallback(() => {
    comandarPlayer('ok');
    setEmReproducao((v) => !v);
  }, [comandarPlayer]);

  /**
   * APLICA UM PASSO de ±10s: manda o comando ao player, move o tempo mostrado
   * (respeitando 00:00 e a duração total) e acumula o INDICADOR de movimento.
   *
   * O clique único chama isto uma vez (⏩ +10s); o movimento contínuo chama em
   * cadência controlada (⏩ +20s, +30s…).
   */
  const aplicarPasso = useCallback(
    (frente: boolean) => {
      comandarPlayer(frente ? 'seekFwd' : 'seekBack', PASSO_SEEK);
      setProgresso((antes) => ({
        ...antes,
        posicao: frente
          ? avancar(antes.posicao, PASSO_SEEK, antes.duracao)
          : retroceder(antes.posicao, PASSO_SEEK),
      }));
      setMovimento((m) => acumularMovimento(m, frente ? 'frente' : 'volta', PASSO_SEEK));
      setProgressoVisivel(true);
      agendarEsconderProgresso();
      agendarLimparMovimento();
    },
    [comandarPlayer, agendarEsconderProgresso, agendarLimparMovimento],
  );

  /** Seek de UM passo (botões da barra e clique único das setas). */
  const seek = useCallback((frente: boolean) => aplicarPasso(frente), [aplicarPasso]);

  /**
   * SEEK CONTÍNUO (segurar ←/→ ou o botão de avançar/retroceder).
   *
   * O primeiro passo é IMEDIATO (clique único = +10s). Enquanto o controle
   * continuar mandando o evento, um passo roda a cada 450 ms — cadência
   * controlada, não a auto-repetição bruta do sistema. Quando os eventos param
   * (o usuário soltou), a rede de segurança encerra o movimento.
   */
  const seekContinuo = useCallback(
    (frente: boolean) => {
      ultimoEventoSeekRef.current = Date.now();
      if (seekTimerRef.current !== null) {
        // Já em movimento: só reorienta (segurar o outro sentido inverte).
        direcaoSeguradaRef.current = frente;
        return;
      }
      direcaoSeguradaRef.current = frente;
      aplicarPasso(frente);
      seekTimerRef.current = window.setInterval(() => {
        if (Date.now() - ultimoEventoSeekRef.current > 1600) {
          if (seekTimerRef.current !== null) window.clearInterval(seekTimerRef.current);
          seekTimerRef.current = null;
          return;
        }
        aplicarPasso(direcaoSeguradaRef.current);
      }, INTERVALO_SEGURAR_MS);
    },
    [aplicarPasso],
  );

  /** Encerra o movimento contínuo (soltar o botão). */
  const pararSeekContinuo = useCallback(() => {
    if (seekTimerRef.current !== null) window.clearInterval(seekTimerRef.current);
    seekTimerRef.current = null;
  }, []);

  /**
   * TROCA DE TÍTULO/EPISÓDIO: o progresso mostrado é o DESTA reprodução.
   *
   * A instância do componente é reaproveitada quando se troca de título pelo
   * próprio player; sem este reset a barra do novo título começaria com a
   * posição do anterior — um número que não corresponde a nada.
   */
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
   * card e a tela de detalhes já exibem. É o que permite mostrar
   * "00:35:20 / 01:52:40" e o tempo restante mesmo com o player em outra origem
   * (ilegível pela política de mesma origem). Sem `duration`, a interface diz
   * "duração não informada" em vez de inventar um número.
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

  /** Volume pelo controle (áudio do aparelho pela ponte nativa). */
  const mudarVolume = useCallback(
    (delta: number) => {
      const ok = ajustarVolume(delta);
      if (!ok) {
        mostrarAviso('Volume indisponível — use o volume da TV');
        return;
      }
      const novo = lerVolume();
      if (typeof novo === 'number') setVolume(novo);
      else setVolume((v) => Math.min(100, Math.max(0, v + delta)));
      const m = lerMudo();
      if (typeof m === 'boolean') setMudo(m);
      mostrarAviso(delta > 0 ? `🔊 ${typeof novo === 'number' ? novo : 'Volume'}%` : `🔉 Volume`);
    },
    [mostrarAviso],
  );

  const alternarMudo = useCallback(() => {
    const alvo = !mudo;
    if (!definirMudo(alvo)) {
      mostrarAviso('Mudo indisponível — use o volume da TV');
      return;
    }
    setMudo(alvo);
    mostrarAviso(alvo ? '🔇 Mudo' : '🔊 Som');
  }, [mudo, mostrarAviso]);

  /**
   * Mostra os controles e (re)agenda o auto-hide.
   *
   * O foco vai para o controle principal (play/pause): sem isso o D-pad podia
   * cair em qualquer botão da barra — inclusive no de sair — e um OK "de
   * interação" acabava fechando o player.
   */
  const mostrarControles = useCallback((ocultarEmMs: number = AUTO_HIDE_MS) => {
    setControles(true);
    if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
    // Na sessão de controles do player a barra fica FIXA (não auto-oculta) para
    // o controle remoto seguir operando o player sem perder o contexto.
    if (ocultarEmMs > 0) {
      autoHideRef.current = window.setTimeout(() => setControles(false), ocultarEmMs);
    } else {
      autoHideRef.current = null;
    }
    window.setTimeout(() => {
      try {
        ctrlMainRef.current?.focus({ preventScroll: true });
      } catch {
        /* o foco é opcional: a barra funciona mesmo sem ele */
      }
    }, 0);
  }, []);

  const esconderControles = useCallback(() => {
    if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
    autoHideRef.current = null;
    setControles(false);
    setFixo(false);
    document.documentElement.classList.remove('tv-in-player');
    // Devolve o foco à superfície do player (o D-pad continua aqui).
    try {
      focarJogador();
    } catch {
      /* ignora */
    }
  }, [focarJogador]);

  const abrirConfig = useCallback(() => {
    setConfig(true);
    if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
    setControles(true);
    window.setTimeout(() => {
      document.querySelector<HTMLElement>('[data-tv-config-panel] [data-tv-focusable]')?.focus({
        preventScroll: true,
      });
    }, 30);
  }, []);

  const fecharConfig = useCallback(() => {
    setConfig(false);
    try {
      focarJogador();
    } catch {
      /* ignora */
    }
  }, [focarJogador]);

  /**
   * BACK hierárquico do player. Fonte única da decisão:
   *   1º painel de configurações → fecha o painel;
   *   2º controles abertos       → fecha os controles;
   *   3º volta para os DETALHES.
   * Em nenhum caso fecha o app de surpresa.
   */
  const tratarVoltar = useCallback((): boolean => {
    if (config) {
      fecharConfig();
      return true;
    }
    if (controles) {
      esconderControles();
      return true;
    }
    voltar();
    return true;
  }, [config, fecharConfig, controles, esconderControles, voltar]);

  // O estado precisa ser legível dentro de listeners sem recriá-los a cada mudança.
  const estadosRef = useRef({ controles, fixo, config });
  estadosRef.current = { controles, fixo, config };

  // Informa a camada nativa (Android TV) se o BACK deve fechar algo antes de
  // navegar — lido de forma SÍNCRONA pelo onBackPressed do shell.
  useEffect(() => {
    const ponte = (window as unknown as {
      MovieFlixAndroid?: { setControlesAbertos?: (v: boolean) => void };
    }).MovieFlixAndroid;
    try {
      ponte?.setControlesAbertos?.(controles || config);
    } catch {
      /* fora do app nativo: nada a fazer */
    }
  }, [controles, config]);

  // O shell nativo pede o fechamento dos controles (1ª pulsação de BACK).
  useEffect(() => {
    function fechar() {
      esconderControles();
    }
    window.addEventListener('mf-fechar-controles', fechar);
    return () => window.removeEventListener('mf-fechar-controles', fechar);
  }, [esconderControles]);

  useEffect(() => () => {
    if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
    if (avisoRef.current !== null) window.clearTimeout(avisoRef.current);
    if (progressoTimerRef.current !== null) window.clearTimeout(progressoTimerRef.current);
    if (movimentoTimerRef.current !== null) window.clearTimeout(movimentoTimerRef.current);
    if (seekTimerRef.current !== null) window.clearInterval(seekTimerRef.current);
  }, []);

  /** Só faz sentido quando há assinante e fonte real de vídeo. */
  const pronto = Boolean(user) && assinante && Boolean(src);

  /**
   * LEITURA DO TEMPO REAL do player quando o navegador permite (player da mesma
   * origem ou embed que exponha `mfEstadoDoPlayer`). No MovieFlix TV o embed do
   * provedor é de OUTRA ORIGEM: a leitura devolve `null` e a barra segue com a
   * posição conhecida + os comandos do controle — sem inventar tempo. Se o
   * player um dia virar nativo/legível, a barra passa a acompanhar o vídeo sem
   * nenhuma outra mudança.
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
   * CONTROLES PELO CONTROLE REMOTO.
   *
   * Dois contextos, sem ambiguidade:
   *  • CONTROLES FECHADOS (o estado normal durante a reprodução) — o foco está
   *    no player e as setas operam o VÍDEO: ← → fazem seek, ↑ abre as
   *    configurações e ↓ abre a barra. É o que o usuário pediu ("avançar e
   *    retroceder o filme pelo controle").
   *  • CONTROLES ABERTOS — as setas movem o foco entre os botões da barra (a
   *    navegação espacial global faz isso) e OK aciona o botão focado. Aqui não
   *    interceptamos nada além do BACK, para não atropelar a navegação.
   *
   * As teclas de VOLUME (24/25/164) são sempre nossas: nenhum outro componente
   * da TV usa volume, e elas precisam chegar ao áudio do aparelho.
   */

  useEffect(() => {
    if (!pronto) return;

    function focoNoPlayer(): boolean {
      const ativo = document.activeElement as HTMLElement | null;
      if (!ativo) return false;
      return (
        ativo.tagName === 'IFRAME' ||
        ativo.tagName === 'VIDEO' ||
        !!ativo.closest?.('[data-tv-player-box]')
      );
    }

    /** Teclas de mídia do controle (emitidas pelo shell como `mf-media-key`). */
    function onMediaKey(e: Event) {
      const tipo = (e as CustomEvent<string>).detail;
      // PLAY/PAUSE e AVANÇAR/VOLTAR: entram no modo CONTROLE DO PLAYER (barra
      // fixa) e vão direto ao player — o controle dele passa a obedecer.
      // OK/▶ = play/pause: NUNCA abre a barra — o comando tem de chegar ao vídeo.
      if (tipo === 'togglePlay') {
        alternarPlayPeloOk();
        return;
      }
      // AVANÇAR/VOLTAR: entram no modo CONTROLE DO PLAYER (barra fixa) e vão
      // direto ao player — o controle dele passa a obedecer.
      if (tipo === 'seekFwd' || tipo === 'seekBack') {
        mostrarControles(0);
        seekContinuo(tipo === 'seekFwd');
        return;
      }
      if (!estadosRef.current.controles) mostrarControles();
      if (tipo === 'next') {
        if (proximo) proximoEpisodio();
      } else if (tipo === 'stop') voltar();
      else if (tipo === 'volUp' || tipo === 'volDown') {
        // A camada nativa JÁ ajustou o volume da mídia (é ela o dono). Aqui só
        // lemos o novo valor e mostramos o feedback na tela — sem ajustar duas
        // vezes, que faria o volume andar em passos dobrados.
        const v = lerVolume();
        if (typeof v === 'number') setVolume(v);
        const m = lerMudo();
        if (typeof m === 'boolean') setMudo(m);
        mostrarAviso(tipo === 'volUp' ? '🔊 Volume +' : '🔉 Volume −');
      } else if (tipo === 'mute') {
        const m = lerMudo();
        if (typeof m === 'boolean') setMudo(m);
        mostrarAviso(m ? '🔇 Mudo' : '🔊 Som');
      }
    }

    // ---- Long-press do OK (~1s): PINAR/SOLTAR a barra de controles --------
    let timerLongo: number | null = null;
    let disparouLongo = false;

    function cancelarLongo() {
      if (timerLongo !== null) {
        window.clearTimeout(timerLongo);
        timerLongo = null;
      }
      disparouLongo = false;
    }

    function ehOk(e: KeyboardEvent): boolean {
      const k = e.key;
      const c = e.keyCode || e.which;
      return k === 'Enter' || k === 'OK' || k === 'Select' || c === 13 || c === 23 || c === 32;
    }

    function onKeyDown(e: KeyboardEvent) {
      const k = e.key;
      const c = e.keyCode || e.which;

      const ehBack =
        k === 'GoBack' || k === 'BrowserBack' || k === 'XF86Back' || k === 'Escape' ||
        k === 'Backspace' || c === 4 || c === 8 || c === 27 || c === 461 || c === 10009;

      // ── VOLUME: sempre nosso (24/25 = volume, 164 = mudo; 179/85 = play) ──
      if (c === 24 || k === 'AudioVolumeUp') {
        e.preventDefault();
        e.stopPropagation();
        mudarVolume(+5);
        return;
      }
      if (c === 25 || k === 'AudioVolumeDown') {
        e.preventDefault();
        e.stopPropagation();
        mudarVolume(-5);
        return;
      }
      if (c === 164 || k === 'AudioVolumeMute') {
        e.preventDefault();
        e.stopPropagation();
        alternarMudo();
        return;
      }

      // ── BACK hierárquico ─────────────────────────────────────────────────
      if (ehBack) {
        e.preventDefault();
        e.stopPropagation();
        cancelarLongo();
        tratarVoltar();
        return;
      }

      // ── Painel de configurações aberto: a navegação dele cuida das teclas ─
      if (estadosRef.current.config) return;

      // ── OK: pulso rápido mostra a barra; long-press pina/solta ────────────
      if (ehOk(e)) {
        const st = estadosRef.current;
        if (!st.controles) {
          // Só tratamos o OK quando o foco está no player; se o foco está num
          // botão da página, o fluxo normal (clique) deve valer.
          if (!focoNoPlayer()) return;
          if (!timerLongo && !disparouLongo) {
            timerLongo = window.setTimeout(() => {
              timerLongo = null;
              disparouLongo = true;
              // Segurar OK = modo CONTROLE DO PLAYER (pinça a barra fixa). A
              // pinça NÃO consome o toque: o play/pause sai no keyup (onKeyUp),
              // mantendo os dois recursos (segurar para fixar E OK = pausar).
              document.documentElement.classList.add('tv-in-player');
              setControles(true);
              setFixo(true);
              if (autoHideRef.current !== null) window.clearTimeout(autoHideRef.current);
              autoHideRef.current = null;
            }, 1000);
          }
          return;
        }
        return;
      }

      // ── Setas: com a barra ABERTA elas navegam os botões (fluxo normal) ───
      if (estadosRef.current.controles) {
        // Mas se o foco voltou ao JOGADOR (o usuário saiu dos botões), a barra
        // fecha e as setas voltam a operar o vídeo: a sessão de controles termina
        // sem prender o usuário dentro dela.
        if (focoNoPlayer()) esconderControles();
        return;
      }

      // Com o foco FORA do player, as setas pertencem à navegação da página.
      if (!focoNoPlayer()) return;

      const esquerda = k === 'ArrowLeft' || k === 'Left' || c === 37 || c === 21;
      const direita = k === 'ArrowRight' || k === 'Right' || c === 39 || c === 22;
      const cima = k === 'ArrowUp' || k === 'Up' || c === 38 || c === 19;
      const baixo = k === 'ArrowDown' || k === 'Down' || c === 40 || c === 20;

      if (esquerda) {
        e.preventDefault();
        e.stopPropagation();
        seekContinuo(false);
        return;
      }
      if (direita) {
        e.preventDefault();
        e.stopPropagation();
        seekContinuo(true);
        return;
      }
      if (cima) {
        e.preventDefault();
        e.stopPropagation();
        abrirConfig();
        return;
      }
      if (baixo) {
        e.preventDefault();
        e.stopPropagation();
        mostrarControles();
        return;
      }
    }

    // ── SOLTAR AS TECLAS ─────────────────────────────────────────────────────
    // 1) TECLAS DE SEEK: soltar (ou o fim da repetição) encerra o movimento
    //    contínuo — o botão deixa de avançar/retroceder na hora.
    // 2) OK: o toque CURTO (sem a pinça de 1s) é PLAY/PAUSE. É esta a correção
    //    do Problema 4: o OK do controle passa a mudar o estado REAL do vídeo
    //    dentro do player, e não apenas quando o foco está num botão da barra.
    //    Com o foco na INTERFACE (menus, botões) nada é consumido aqui — o
    //    clique normal da interface continua valendo.
    function onKeyUp(e: KeyboardEvent) {
      const k = e.key;
      const c = e.keyCode || e.which;
      const eraOk = ehOk(e);
      const eraPinca = disparouLongo;
      if (eraOk) cancelarLongo();

      if (
        c === 37 || c === 39 || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Left' || k === 'Right'
      ) {
        pararSeekContinuo();
        return;
      }

      if (!eraOk || eraPinca) return;
      if (estadosRef.current.config) return;
      if (estadosRef.current.controles || !focoNoPlayer()) return;
      e.preventDefault();
      e.stopPropagation();
      alternarPlayPeloOk();
    }

    // Quem detém o foco? Um BOTÃO/controle da página = HUMANO navegando menus;
    // o iframe/vídeo = JOGADOR (as teclas de mídia devem operar o vídeo).
    // É o que evita que um OK "de interação" caia no botão de sair.
    function onFocusIn(ev: FocusEvent) {
      const alvo = ev.target as HTMLElement | null;
      if (!alvo) return;
      if (alvo.tagName === 'IFRAME' || alvo.tagName === 'VIDEO') ultimoFocoRef.current = 'jogador';
      else if (alvo.tagName === 'BUTTON') ultimoFocoRef.current = 'humano';
    }

    window.addEventListener('mf-media-key', onMediaKey as EventListener);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('focusin', onFocusIn, true);
    return () => {
      window.removeEventListener('mf-media-key', onMediaKey as EventListener);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('focusin', onFocusIn, true);
      cancelarLongo();
    };
  }, [
    pronto,
    proximo,
    proximoEpisodio,
    voltar,
    alternarPlay,
    alternarPlayPeloOk,
    seekContinuo,
    pararSeekContinuo,
    mostrarControles,
    esconderControles,
    abrirConfig,
    tratarVoltar,
    seek,
    mudarVolume,
    alternarMudo,
    mostrarAviso,
    focarJogador,
  ]);

  // Foco inicial: o player, para o D-pad já operar o vídeo ao entrar.
  useEffect(() => {
    if (!pronto) return;
    const t = window.setTimeout(() => {
      try {
        focarJogador();
      } catch {
        /* ignora */
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [pronto, recarga, focarJogador]);

  // Aviso do episódio atual (só em série).
  const epLabel = ehSerie
    ? `T${Number(params.get('temporada')) || primeiroEpisodioDisponivel(movie)?.season || 1} · E${
        Number(params.get('episodio')) || primeiroEpisodioDisponivel(movie)?.episode || 1
      }`
    : null;

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
      {/* O vídeo ocupa a tela. NENHUM botão solto no topo. */}
      <div className="tv-player-box" data-tv-player-box ref={frameRef} tabIndex={0}>
        <div ref={iframeWrapRef} className="tv-player-embed">
          {/* `mostrarTelaCheia={false}`: na TV o ÚNICO botão de tela cheia é o da
              barra de controles abaixo (alcançável pelo D-pad). O do embed
              aparecia como um SEGUNDO botão — o "botão duplicado" relatado. */}
          <StreamBetterEmbed
            key={`${src}-${recarga}`}
            embedUrl={src}
            onBack={voltar}
            mostrarTelaCheia={false}
          />
        </div>

        {/* Superfície clicável: um OK mostra os controles (o iframe continua
            recebendo o foco do D-pad para o desafio de verificação). */}
        <button
          type="button"
          className={cn('tv-player-tap', controles && 'tv-player-tap-oculto')}
          aria-label="Mostrar controles"
          tabIndex={-1}
          onClick={() => mostrarControles()}
        />
      </div>

      {/* Aviso curto (volume) — feedback sem poluir o vídeo. */}
      {aviso ? (
        <div className="tv-player-toast" role="status">
          {aviso}
        </div>
      ) : null}

      {/* ── BARRA DE PROGRESSO E TEMPO (camada própria, no alto) ────────────
          Aparece a cada comando do controle (⏩ +10s, OK, ←/→) e se esconde
          sozinha — é a "interface mais profissional para mostrar o progresso":
          tempo atual, duração total, quanto falta e a posição na barra. */}
      <div
        className={cn('tv-player-progresso-camada', progressoVisivel && 'tv-player-progresso-camada-ativo')}
        aria-hidden={!progressoVisivel}
      >
        <TvProgresso
          posicao={progresso.posicao}
          duracao={progresso.duracao}
          posicaoReal={progresso.posicaoReal}
          duracaoReal={progresso.duracaoReal}
          movimento={progressoVisivel ? movimento : null}
          pausado={!emReproducao}
        />
      </div>

      {/* ── UMA barra única, no rodapé. Nada solto no topo. ────────────────── */}
      <div
        className={cn('tv-player-overlay', controles && 'tv-player-overlay-ativo', fixo && 'tv-player-overlay-fixo')}
        aria-hidden={!controles}
        data-tv-hidden={!controles || undefined}
      >
        <div className="tv-player-barra">
          {/* Título discreto à esquerda (não é botão, não é uma barra de topo). */}
          <div className="tv-player-identidade">
            <TvMark className="tv-player-logo" />
            <div className="tv-player-identidade-txt">
              <div className="tv-player-title">{movie.title}</div>
              {epLabel ? <div className="tv-player-sub">Episódio {epLabel}</div> : null}
            </div>
          </div>

          <div className="tv-player-controls">
            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label="Voltar aos detalhes"
              onClick={voltar}
            >
              <ArrowLeft className="tv-player-ctrl-icon" />
            </button>

            {/* SEEK pelo controle: ←/→ quando o foco está no player. */}
            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label={`Retroceder ${PASSO_SEEK} segundos`}
              onClick={() => seek(false)}
            >
              <RotateCcw className="tv-player-ctrl-icon" />
              <span className="tv-player-ctrl-passo">{PASSO_SEEK}</span>
            </button>

            <button
              ref={ctrlMainRef}
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl tv-player-ctrl-main"
              aria-label={emReproducao ? 'Pausar' : 'Reproduzir'}
              onClick={alternarPlay}
            >
              {emReproducao ? (
                <Pause className="tv-player-ctrl-icon" fill="currentColor" />
              ) : (
                <Play className="tv-player-ctrl-icon" fill="currentColor" />
              )}
            </button>

            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label={`Avançar ${PASSO_SEEK} segundos`}
              onClick={() => seek(true)}
            >
              <RotateCw className="tv-player-ctrl-icon" />
              <span className="tv-player-ctrl-passo">{PASSO_SEEK}</span>
            </button>

            {/* Próximo episódio: SÓ para série e SÓ quando existe próximo real. */}
            {ehSerie && proximo ? (
              <button
                data-tv-focusable
                tabIndex={controles ? 0 : -1}
                className="tv-player-ctrl"
                aria-label="Próximo episódio"
                onClick={proximoEpisodio}
              >
                <SkipForward className="tv-player-ctrl-icon" fill="currentColor" />
              </button>
            ) : null}

            {/* Volume: as teclas +/− do controle são o caminho principal; estes
                botões repetem a ação para quem prefere navegar pela barra. */}
            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label="Diminuir volume"
              onClick={() => mudarVolume(-5)}
            >
              <Volume1 className="tv-player-ctrl-icon" />
            </button>
            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className={cn('tv-player-ctrl', mudo && 'tv-player-ctrl-ativo')}
              aria-label={mudo ? 'Ativar som' : 'Silenciar'}
              aria-pressed={mudo}
              onClick={alternarMudo}
            >
              <VolumeX className="tv-player-ctrl-icon" />
            </button>
            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label="Aumentar volume"
              onClick={() => mudarVolume(+5)}
            >
              <Volume2 className="tv-player-ctrl-icon" />
            </button>

            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label="Configurações do player"
              onClick={abrirConfig}
            >
              <Settings className="tv-player-ctrl-icon" />
            </button>

            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label="Tela cheia"
              onClick={() => {
                const el = frameRef.current;
                if (!el) return;
                if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
                else el.requestFullscreen?.().catch(() => undefined);
              }}
            >
              {typeof document !== 'undefined' && document.fullscreenElement ? (
                <Minimize className="tv-player-ctrl-icon" />
              ) : (
                <Maximize className="tv-player-ctrl-icon" />
              )}
            </button>

            <button
              data-tv-focusable
              tabIndex={controles ? 0 : -1}
              className="tv-player-ctrl"
              aria-label="Sair da reprodução"
              onClick={voltar}
            >
              <X className="tv-player-ctrl-icon" />
            </button>
          </div>

          <p className="tv-player-dica">
            {temVolume
              ? '← −10s · → +10s (segure para contínuo) · OK pausa/continua · ↑ configurações · ↓ controles · +/− volume'
              : '← −10s · → +10s (segure para contínuo) · OK pausa/continua · ↑ configurações · ↓ controles · volume pela TV'}
          </p>
        </div>
      </div>

      {/* ── CONFIGURAÇÕES DO PLAYER (D-pad) ─────────────────────────────────── */}
      {config ? (
        <div className="tv-config" data-tv-config-panel role="dialog" aria-label="Configurações do player">
          <div className="tv-config-caixa">
            <div className="tv-config-topo">
              <h2 className="tv-config-titulo">Configurações do player</h2>
              <button
                data-tv-focusable
                data-tv-initial-focus
                tabIndex={0}
                className="tv-player-ctrl"
                aria-label="Fechar configurações"
                onClick={fecharConfig}
              >
                <X className="tv-player-ctrl-icon" />
              </button>
            </div>

            <div className="tv-config-linha">
              <span className="tv-config-rotulo">Volume</span>
              <div className="tv-config-acoes">
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn"
                  aria-label="Diminuir volume"
                  onClick={() => mudarVolume(-5)}
                >
                  −
                </button>
                <span className="tv-config-valor">
                  {mudo ? 'Mudo' : `${volume}%`}
                </span>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn"
                  aria-label="Aumentar volume"
                  onClick={() => mudarVolume(+5)}
                >
                  +
                </button>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className={cn('tv-config-btn', mudo && 'tv-config-btn-ativo')}
                  aria-label={mudo ? 'Ativar som' : 'Silenciar'}
                  aria-pressed={mudo}
                  onClick={alternarMudo}
                >
                  <VolumeX className="tv-icon-sm" />
                </button>
              </div>
            </div>

            <div className="tv-config-linha">
              <span className="tv-config-rotulo">Reprodução</span>
              <div className="tv-config-acoes">
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn tv-config-btn-larga"
                  onClick={() => {
                    setRecarga((r) => r + 1);
                    fecharConfig();
                    mostrarAviso('Player recarregado');
                  }}
                >
                  Recarregar player
                </button>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn tv-config-btn-larga"
                  onClick={() => {
                    alternarPlay();
                    mostrarAviso(emReproducao ? 'Pausado' : 'Reproduzindo');
                  }}
                >
                  {emReproducao ? 'Pausar' : 'Reproduzir'}
                </button>
                {ehSerie && proximo ? (
                  <button
                    data-tv-focusable
                    tabIndex={0}
                    className="tv-config-btn tv-config-btn-larga"
                    onClick={proximoEpisodio}
                  >
                    Próximo episódio
                  </button>
                ) : null}
              </div>
            </div>

            <div className="tv-config-linha">
              <span className="tv-config-rotulo">Tela</span>
              <div className="tv-config-acoes">
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn tv-config-btn-larga"
                  onClick={() => {
                    const el = frameRef.current;
                    if (!el) return;
                    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
                    else el.requestFullscreen?.().catch(() => undefined);
                  }}
                >
                  {typeof document !== 'undefined' && document.fullscreenElement
                    ? 'Sair da tela cheia'
                    : 'Tela cheia'}
                </button>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-config-btn tv-config-btn-larga"
                  onClick={voltar}
                >
                  Sair da reprodução
                </button>
              </div>
            </div>

            <p className="tv-config-dica">
              Controle remoto: ← −10s · → +10s · ↑ configurações · ↓ controles · BACK fecha esta
              janela. As fontes, a qualidade e as legendas são controladas pelo próprio player do
              provedor.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
