import { Suspense, useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { instalarBloqueioAnuncios } from '@/lib/antiAds';
import { TvLayout } from './TvLayout';
import { TvHomePage } from './TvHomePage';
import { TvCatalogPage } from './TvCatalogPage';
import { TvSearchPage } from './TvSearchPage';
import { TvDetailPage } from './TvDetailPage';
import { TvPlayerPage } from './TvPlayerPage';
import { TvSubscriptionPage } from './TvSubscriptionPage';
import { TvMyListPage } from './TvMyListPage';
import { TvContinueWatchingPage } from './TvContinueWatchingPage';

function RequireAuthTv({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-loading">
          <div className="tv-loading-spinner" />
          <p>Verificando sessão…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/tv" replace />;
  return <>{children}</>;
}

/**
 * TvApp — aplicação MovieFlix TV (rotas #/tv/*).
 *
 * É a experiência dedicada para Android TV / Google TV / TV Box:
 *  - Splash, menu lateral grande, catálogo em grade, busca com teclado
 *    virtual, detalhes com Assistir, player com MODO CONTROLE DO PLAYER
 *    (long-press OK), assinatura, Minha Lista e Continuar assistindo.
 *  - Navegação 100% por controle remoto (useTvNavigation global do App).
 *  - Bloqueio silencioso de popups/redirects (antiAds) — sem mensagens.
 */
export function TvApp() {
  const location = useLocation();

  // Bloqueio de anúncios também dentro da UI TV (idempotente).
  useEffect(() => {
    const limpar = instalarBloqueioAnuncios();
    return () => limpar();
  }, []);

  return (
    <TvLayout>
      <Suspense
        fallback={
          <div className="tv-page tv-page-center">
            <div className="tv-loading">
              <div className="tv-loading-spinner" />
              <p>Carregando…</p>
            </div>
          </div>
        }
      >
        <Routes location={location}>
          <Route path="/tv" element={<TvHomePage />} />
          <Route path="/tv/filmes" element={<TvCatalogPage mode="movie" />} />
          <Route path="/tv/series" element={<TvCatalogPage mode="series" />} />
          <Route path="/tv/pesquisa" element={<TvSearchPage />} />
          <Route path="/tv/detalhe/:type/:id" element={<TvDetailPage />} />
          <Route path="/tv/assistir/:id" element={<TvPlayerPage />} />
          <Route path="/tv/assinatura" element={<RequireAuthTv><TvSubscriptionPage /></RequireAuthTv>} />
          <Route path="/tv/minha-lista" element={<RequireAuthTv><TvMyListPage /></RequireAuthTv>} />
          <Route path="/tv/continuar" element={<RequireAuthTv><TvContinueWatchingPage /></RequireAuthTv>} />
          <Route path="*" element={<Navigate to="/tv" replace />} />
        </Routes>
      </Suspense>
    </TvLayout>
  );
}
