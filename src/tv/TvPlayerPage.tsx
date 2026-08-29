import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Gamepad2, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { useMovies } from '@/hooks/useMovies';
import { useAuth } from '@/context/AuthContext';
import { hasActiveSubscription } from '@/context/AuthContext';
import { protegerIframeContraRedirect } from '@/lib/antiAds';
import { resolverStreamBetterDireto, ehEmbedStreamBetter } from '@/lib/streambetterDirect';
import { streamBetterSeriesUrl, primeiroEpisodioDisponivel } from '@/lib/strembetter';
import { useTvPlayerControls } from '@/hooks/useTvPlayerControls';
import { cn } from '@/lib/cn';

/**
 * TvPlayerPage — player do MovieFlix TV.
 *
 * - Mesma lógica do PlayerPage do site: quando a fonte é um embed do
 *   StreamBetter, o stream HLS real é resolvido pelo backend
 *   (/api/streambetter-resolve) e reproduzido num <video> nativo + hls.js.
 *   O iframe do provedor NUNCA é renderizado — é ele que injeta o overlay
 *   "Só mais um passo / Abrir link" (link externo do plano free) e pode
 *   redirecionar para fora do app. Sem iframe, não existe etapa "Abrir link"
 *   nem saída do app.
 * - PROTEÇÃO: só monta o player depois de verificar auth + assinatura ativa
 *   (mesma regra do PlayerPage do site). Sem assinatura → redirect para
 *   /tv/assinatura. Direto na URL → bloqueado.
 * - MODO CONTROLE DO PLAYER: segurar OK (~1s) com o foco no player
 *   alterna entre MODO APP (setas navegam a página) e MODO PLAYER
 *   (setas controlam o player). Segurar OK de novo sai.
 * - Back: sai do player (volta para a página de detalhes).
 * - Bloqueio silencioso de popups/redirects (antiAds global + guarda
 *   do iframe via protegerIframeContraRedirect).
 */

export function TvPlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const movies = useMovies();
  const { user, subscription, loading: authLoading } = useAuth();
  const assinante = hasActiveSubscription(subscription);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playerMode, setPlayerMode] = useState(false);
  const [erro, setErro] = useState(false);
  // Resolução do stream direto (StreamBetter) em andamento / falhou.
  // Enquanto não resolver, o embed do provedor NUNCA é renderizado.
  const [resolvendoDireto, setResolvendoDireto] = useState(false);
  const [diretoFalhou, setDiretoFalhou] = useState(false);
  // URL do stream direto resolvido (HLS/MP4) — reproduzido no <video> nativo.
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  // Contador de tentativa: incrementar re-dispara a resolução do stream.
  const [tentativa, setTentativa] = useState(0);

  const movie = (movies.data ?? []).find((m) => String(m.id) === String(id)) ?? null;

  // Sincroniza o badge do modo player com o evento global (useTvPlayerControls).
  useEffect(() => {
    function onChange() {
      setPlayerMode(document.documentElement.classList.contains('tv-in-player'));
    }
    window.addEventListener('mf-player-mode-change', onChange);
    return () => window.removeEventListener('mf-player-mode-change', onChange);
  }, []);

  // Fonte do catálogo: filme usa video_url (embed StreamBetter); série usa o
  // embed do StreamBetter montado a partir do tmdb_id + primeiro episódio
  // disponível (mesma regra do site — o catálogo de séries não traz video_url).
  const src = (() => {
    if (!movie) return '';
    if (movie.video_url) return movie.video_url;
    const ehSerie = movie.type === 'series' || movie.type === 'tv' || movie.media_type === 'tv';
    if (ehSerie && movie.tmdb_id) {
      const ep = primeiroEpisodioDisponivel(movie);
      if (ep) return streamBetterSeriesUrl(movie.tmdb_id, ep.season, ep.episode);
    }
    return '';
  })();

  // Resolve o stream direto (HLS/MP4) do embed do StreamBetter. Nunca
  // renderizamos o iframe do provedor (que mostra "Abrir link" e redireciona).
  useEffect(() => {
    if (!src || !ehEmbedStreamBetter(src)) return;
    let cancelado = false;
    setResolvendoDireto(true);
    setDiretoFalhou(false);
    setStreamUrl(null);

    (async () => {
      for (let tentativa = 0; tentativa < 3 && !cancelado; tentativa += 1) {
        try {
          const gate = await resolverStreamBetterDireto(src);
          if (cancelado) return;
          if (gate.success && gate.url) {
            setStreamUrl(gate.url);
            setResolvendoDireto(false);
            return;
          }
        } catch (e) {
          console.warn('[TvPlayerPage] falha no modo direto StreamBetter:', e);
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
      if (cancelado) return;
      setResolvendoDireto(false);
      setDiretoFalhou(true);
    })();

    return () => {
      cancelado = true;
    };
  }, [src, tentativa]);

  // Reprodução nativa do stream direto (HLS/MP4) no <video>.
  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;
    const video = videoRef.current;
    video.src = streamUrl;
    video.play().catch(() => undefined);
  }, [streamUrl]);

  // Guarda de redirect do iframe (antiAds) — restaura a URL do player se um
  // anúncio redirecionar o documento do iframe para fora. (Mantido por
  // compatibilidade; o iframe do provedor não é mais renderizado.)
  useEffect(() => {
    const iframe = frameRef.current;
    if (!iframe || !src) return;
    const limpar = protegerIframeContraRedirect(iframe, src);
    return limpar;
  }, [src]);

  useTvPlayerControls(
    Boolean(user) && assinante && Boolean(src),
    playerMode,
    frameRef,
    () => navigate(`/tv/detalhe/${movie?.type === 'series' ? 'serie' : 'filme'}/${id}`),
  );

  // Loading de verificação: nunca renderiza o player antes do fim.
  if (authLoading) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-loading">
          <Loader2 className="tv-icon tv-spin" />
          <p>Verificando seu acesso…</p>
        </div>
      </div>
    );
  }

  // Sem login: mensagem amigável com ação.
  if (!user) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-error">
          <AlertCircle className="tv-icon tv-icon-lg" />
          <h2>Faça login para assistir</h2>
          <p>Entre com sua conta para acessar o player.</p>
          <div className="tv-error-actions">
            <button data-tv-focusable tabIndex={0} className="tv-btn" onClick={() => navigate('/')}>
              Ir para o login
            </button>
            <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-ghost" onClick={() => navigate(-1)}>
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sem assinatura ativa: bloqueado (mesma regra do site — nunca libera).
  if (!assinante) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-error">
          <AlertCircle className="tv-icon tv-icon-lg" />
          <h2>Assinatura necessária</h2>
          <p>Seu acesso ao player está bloqueado. Assine um plano para assistir.</p>
          <div className="tv-error-actions">
            <button data-tv-focusable tabIndex={0} className="tv-btn" onClick={() => navigate('/tv/assinatura')}>
              Ver planos
            </button>
            <button data-tv-focusable tabIndex={0} className="tv-btn tv-btn-ghost" onClick={() => navigate(-1)}>
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
        <div className="tv-error">
          <h2>Não foi possível carregar o conteúdo</h2>
          <p>Tente novamente em instantes.</p>
          <button data-tv-focusable tabIndex={0} className="tv-btn" onClick={() => navigate(-1)}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-page tv-page-player">
      <div className="tv-player-top">
        <button
          data-tv-focusable
          tabIndex={0}
          className="tv-btn tv-btn-ghost tv-btn-back"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="tv-icon" /> Voltar
        </button>
        <div className="tv-player-title">{movie.title}</div>
      </div>

      <div className="tv-player-box" data-tv-player-box>
        {streamUrl ? (
          <video
            ref={videoRef}
            className="tv-player-frame"
            controls
            autoPlay
            playsInline
            data-tv-focusable
            data-tv-player-box
            style={{ backgroundColor: '#000' }}
          />
        ) : (
          <div className="tv-player-error">
            {resolvendoDireto && !diretoFalhou ? (
              <>
                <Loader2 className="tv-icon tv-spin" />
                <p>Preparando a reprodução...</p>
              </>
            ) : (
              <>
                <AlertCircle className="tv-icon tv-icon-lg" />
                <p>Não foi possível preparar o vídeo agora.</p>
                <button
                  data-tv-focusable
                  tabIndex={0}
                  className="tv-btn"
                  onClick={() => {
                    setErro(false);
                    setDiretoFalhou(false);
                    setStreamUrl(null);
                    setResolvendoDireto(true);
                    setTentativa((t) => t + 1);
                  }}
                >
                  <RefreshCw className="tv-icon" /> Tentar novamente
                </button>
              </>
            )}
          </div>
        )}
        {erro ? (
          <div className="tv-player-error">
            <p>Não foi possível carregar o vídeo.</p>
            <button
              data-tv-focusable
              tabIndex={0}
              className="tv-btn"
              onClick={() => {
                setErro(false);
                setStreamUrl(null);
                setDiretoFalhou(false);
                setResolvendoDireto(true);
                setTentativa((t) => t + 1);
              }}
            >
              <RefreshCw className="tv-icon" /> Tentar novamente
            </button>
          </div>
        ) : null}
      </div>

      <div className={cn('tv-player-mode-badge', playerMode && 'tv-player-mode-ativo')} data-tv-player-mode>
        <Gamepad2 className="tv-icon tv-icon-sm" />
        {playerMode ? 'CONTROLE DO PLAYER — setas controlam o vídeo. Segure OK para sair.' : 'Segure OK no player para controlar o vídeo (play/pause, volume).'}
      </div>
    </div>
  );
}