import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Gamepad2, Loader2, AlertCircle } from 'lucide-react';
import { useMovies } from '@/hooks/useMovies';
import { useAuth } from '@/context/AuthContext';
import { hasActiveSubscription } from '@/context/AuthContext';
import { protegerIframeContraRedirect } from '@/lib/antiAds';
import { streamBetterSeriesUrl, primeiroEpisodioDisponivel, ehEmbedVidCore } from '@/lib/strembetter';
import { useTvPlayerControls } from '@/hooks/useTvPlayerControls';
import { cn } from '@/lib/cn';

/**
 * TvPlayerPage — player do MovieFlix TV.
 *
 * - Mesma lógica do PlayerPage do site: o player principal é o VidCore
 *   (https://www.vidcore.org), um serviço de embed de filmes e séries baseado
 *   em TMDB ID. O embed é gerado AUTOMATICAMENTE a partir do tmdb_id (filme)
 *   ou tmdb_id + temporada + episódio (série) e renderizado DENTRO do app via
 *   <iframe> (allowFullScreen, responsivo). O VidCore é self-contained
 *   (ArtPlayer + hls.js) — sem overlay "Abrir link", sem redirecionamento
 *   externo e sem anúncios próprios do Movieflix.
 * - PROTEÇÃO: só monta o player depois de verificar auth + assinatura ativa
 *   (mesma regra do PlayerPage do site). Sem assinatura → redirect para
 *   /tv/assinatura.
 * - MODO CONTROLE DO PLAYER: segurar OK (~1s) com o foco no player alterna
 *   entre MODO APP (setas navegam a página) e MODO PLAYER (setas controlam o
 *   player). Segurar OK de novo sai.
 * - Back: sai do player (volta para a página de detalhes).
 * - Bloqueio silencioso de popups/redirects (antiAds global + guarda do
 *   iframe via protegerIframeContraRedirect).
 */

export function TvPlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const movies = useMovies();
  const { user, subscription, loading: authLoading } = useAuth();
  const assinante = hasActiveSubscription(subscription);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [playerMode, setPlayerMode] = useState(false);

  const movie = (movies.data ?? []).find((m) => String(m.id) === String(id)) ?? null;

  // Sincroniza o badge do modo player com o evento global (useTvPlayerControls).
  useEffect(() => {
    function onChange() {
      setPlayerMode(document.documentElement.classList.contains('tv-in-player'));
    }
    window.addEventListener('mf-player-mode-change', onChange);
    return () => window.removeEventListener('mf-player-mode-change', onChange);
  }, []);

  // Fonte do catálogo: filme usa video_url (embed VidCore); série usa o embed
  // do VidCore montado a partir do tmdb_id + primeiro episódio disponível
  // (mesma regra do site — o catálogo de séries não traz video_url).
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

  // Guarda de redirect do iframe (antiAds) — restaura a URL do player se um
  // anúncio redirecionar o documento do iframe para fora.
  useEffect(() => {
    const iframe = frameRef.current;
    if (!iframe || !src || !ehEmbedVidCore(src)) return;
    iframe.setAttribute('data-player-src', src);
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
        <iframe
          key={src}
          ref={frameRef}
          id="tv-player-frame"
          src={src}
          data-player-src={src}
          title={`Player — ${movie.title}`}
          className="tv-player-frame"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="origin"
          data-tv-focusable
          data-tv-player-box
        />
      </div>

      <div className={cn('tv-player-mode-badge', playerMode && 'tv-player-mode-ativo')} data-tv-player-mode>
        <Gamepad2 className="tv-icon tv-icon-sm" />
        {playerMode ? 'CONTROLE DO PLAYER — setas controlam o vídeo. Segure OK para sair.' : 'Segure OK no player para controlar o vídeo (play/pause, volume).'}
      </div>
    </div>
  );
}