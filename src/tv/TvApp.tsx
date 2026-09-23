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
import { TvLoading } from './TvStates';

function RequireAuthTv({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <TvLoading label="Verificando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * TvApp — aplicação MovieFlix TV (rotas /tv/*).
 *
 * É a MESMA aplicação MovieFlix (mesma marca, mesma conta, mesmo backend,
 * mesmo catálogo, mesmos planos, mesmos favoritos, mesmo histórico), com a
 * interface adaptada para televisão:
 *  - cabeçalho horizontal com a logo OFICIAL do MovieFlix;
 *  - Home com destaque, Continuar assistindo, Em alta, Lançamentos, Filmes,
 *    Séries e linhas de categoria;
 *  - grades com cards menores (mais títulos por tela) e foco pela marca;
 *  - busca com teclado virtual, detalhes com temporadas/episódios e player;
 *  - navegação 100% por controle remoto (useTvNavigation global do App);
 *  - bloqueio silencioso de popups/redirects (antiAds).
 *
 * Rotas de título: /tv/titulo/:id (detalhes) e /tv/assistir/:id (player).
 */
export function TvApp() {
  const location = useLocation();

  useEffect(() => {
    const limpar = instalarBloqueioAnuncios();
    return () => limpar();
  }, []);

  return (
    <TvLayout>
      <Suspense fallback={<TvLoading label="Carregando..." />}>
        <Routes location={location}>
          <Route path="/tv" element={<TvHomePage />} />
          <Route path="/tv/filmes" element={<TvCatalogPage mode="movie" />} />
          <Route path="/tv/series" element={<TvCatalogPage mode="series" />} />
          <Route path="/tv/pesquisa" element={<TvSearchPage />} />
          <Route path="/tv/titulo/:id" element={<TvDetailPage />} />
          <Route path="/tv/assistir/:id" element={<TvPlayerPage />} />
          <Route
            path="/tv/assinatura"
            element={
              <RequireAuthTv>
                <TvSubscriptionPage />
              </RequireAuthTv>
            }
          />
          <Route
            path="/tv/minha-lista"
            element={
              <RequireAuthTv>
                <TvMyListPage />
              </RequireAuthTv>
            }
          />
          <Route
            path="/tv/continuar"
            element={
              <RequireAuthTv>
                <TvContinueWatchingPage />
              </RequireAuthTv>
            }
          />
          {/* Compatibilidade com links antigos de detalhe. */}
          <Route path="/tv/detalhe/:type/:id" element={<TvDetailPage />} />
          <Route path="*" element={<Navigate to="/tv" replace />} />
        </Routes>
      </Suspense>
    </TvLayout>
  );
}
