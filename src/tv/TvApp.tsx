import { Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
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

/**
 * TvApp — aplicação MovieFlix TV.
 *
 * É a MESMA aplicação MovieFlix (mesma marca, mesma conta, mesmo backend,
 * mesmo catálogo, mesmos planos, mesmos favoritos, mesmo histórico), com a
 * interface adaptada para televisão.
 *
 * ROTEAMENTO: o App usa HashRouter, então a TV vive em `#/tv` (não `/tv`).
 * Aqui resolvemos a sub-rota por `useLocation()` em vez de aninhar um <Routes>
 * — o roteamento aninhado dependia do prefixo do segmento pai e não casava de
 * forma confiável. A tabela abaixo é explícita e determinística.
 */

const SUB_ROTAS = ['filmes', 'series', 'pesquisa', 'minha-lista', 'continuar', 'assinatura', 'titulo', 'assistir'];

function RequireAuthTv({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <TvLoading label="Verificando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function TvApp() {
  const { pathname } = useLocation();

  // Bloqueio silencioso de popups/redirects de anúncio (camada JS).
  useEffect(() => {
    const limpar = instalarBloqueioAnuncios();
    return () => limpar();
  }, []);

  // "" (raiz da TV) ou os segmentos depois de /tv
  const resto = pathname.replace(/^\/tv\/?/, '');
  const seg = resto.split('/').filter(Boolean);
  const raiz = seg[0];
  const id = seg[1];

  let pagina: ReactNode;
  if (!raiz) {
    pagina = <TvHomePage />;
  } else if (raiz === 'filmes') {
    pagina = <TvCatalogPage mode="movie" />;
  } else if (raiz === 'series') {
    pagina = <TvCatalogPage mode="series" />;
  } else if (raiz === 'pesquisa') {
    pagina = <TvSearchPage />;
  } else if (raiz === 'titulo' && id) {
    pagina = <TvDetailPage id={id} />;
  } else if (raiz === 'assistir' && id) {
    pagina = <TvPlayerPage id={id} />;
  } else if (raiz === 'minha-lista') {
    pagina = (
      <RequireAuthTv>
        <TvMyListPage />
      </RequireAuthTv>
    );
  } else if (raiz === 'continuar') {
    pagina = (
      <RequireAuthTv>
        <TvContinueWatchingPage />
      </RequireAuthTv>
    );
  } else if (raiz === 'assinatura') {
    pagina = (
      <RequireAuthTv>
        <TvSubscriptionPage />
      </RequireAuthTv>
    );
  } else if (SUB_ROTAS.includes(raiz)) {
    // Sub-rota conhecida sem id (ex.: /tv/titulo) → volta para a Home.
    pagina = <TvHomePage />;
  } else {
    pagina = <TvHomePage />;
  }

  return (
    <TvLayout>
      <Suspense fallback={<TvLoading label="Carregando..." />}>{pagina}</Suspense>
    </TvLayout>
  );
}
