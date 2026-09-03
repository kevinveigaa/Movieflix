import { Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Seo } from '@/components/Seo';
import { FullScreenLoader } from '@/components/ui/Feedback';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { UpdateChecker } from '@/components/ui/UpdateChecker';
import { useTvNavigation } from '@/hooks/useTvNavigation';
import { useSeriesHidden } from '@/hooks/useSeriesHidden';
import { useDoubleBackExit } from '@/hooks/useDoubleBackExit';
import { ScrollToTop } from '@/components/ScrollToTop';
import { aplicarClasseApp } from '@/lib/appShell';
import { instalarBloqueioAnuncios } from '@/lib/antiAds';
import type { JSX } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

// Code splitting por rota: cada página é carregada sob demanda (React.lazy).
const HomePage = lazyWithRetry(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })));
const MoviesPage = lazyWithRetry(() => import('@/pages/MoviesPage').then((m) => ({ default: m.MoviesPage })));
const SeriesPage = lazyWithRetry(() => import('@/pages/SeriesPage').then((m) => ({ default: m.SeriesPage })));
const SearchPage = lazyWithRetry(() => import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const TitleDetailPage = lazyWithRetry(() => import('@/pages/TitleDetailPage').then((m) => ({ default: m.TitleDetailPage })));
const FavoritesPage = lazyWithRetry(() => import('@/pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })));
const HistoryPage = lazyWithRetry(() => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const ProfilePage = lazyWithRetry(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazyWithRetry(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SubscriptionPage = lazyWithRetry(() => import('@/pages/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })));
const AdminPage = lazyWithRetry(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const AdminSeriesPage = lazyWithRetry(() => import('@/pages/AdminSeriesPage').then((m) => ({ default: m.AdminSeriesPage })));
const PlayerPage = lazyWithRetry(() => import('@/pages/PlayerPage').then((m) => ({ default: m.PlayerPage })));
const LoginPage = lazyWithRetry(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazyWithRetry(() => import('@/pages/auth/SignupPage').then((m) => ({ default: m.SignupPage })));
const ForgotPasswordPage = lazyWithRetry(() => import('@/pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazyWithRetry(() => import('@/pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const ProfileSelectPage = lazyWithRetry(() => import('@/pages/auth/ProfileSelectPage').then((m) => ({ default: m.ProfileSelectPage })));
const DownloadAppPage = lazyWithRetry(() => import('@/pages/DownloadAppPage').then((m) => ({ default: m.DownloadAppPage })));
const TvApp = lazyWithRetry(() => import('@/tv/TvApp').then((m) => ({ default: m.TvApp })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/** Bloqueia a rota de séries quando "Esconder séries" está ativo. */
function RequireSeries({ children }: { children: JSX.Element }) {
  const { seriesHidden, isLoading } = useSeriesHidden();
  if (isLoading) return <FullScreenLoader />;
  if (seriesHidden) return <Navigate to="/filmes" replace />;
  return children;
}

function AppRoutes() {
  // Navegação por controle remoto (setas + OK + Voltar) para TV, TV Box e PC.
  useTvNavigation();

  // Duplo-back para sair (PC + TV + APK): o usuário só sai do app/site com
  // DUAS pulsações de "voltar" em ≤2s. Dentro do site, voltar continua com um
  // clique (navegação interna normal); na raiz, a 1ª pulsação mostra o aviso
  // discreto "Pulsa de novo para sair" e a 2ª sai de verdade.
  useDoubleBackExit();

  // Detecta o shell nativo (APK) e aplica a classe `is-native-app` no <html>:
  // esconde "Baixar app", ativa `tv-nav` e adapta a dica de controle remoto.
  useEffect(() => {
    aplicarClasseApp();
  }, []);

  // Bloqueio SILENCIOSO de popups/redirects de anúncio (camada JS): instala
  // UMA vez para todo o app. O usuário NUNCA vê aviso/toast/alerta — o bloqueio
  // acontece em background (window.open cancelado, overlays fechados, links de
  // anúncio cancelados). A camada nativa (MainActivity) é a última linha de
  // defesa para navegação externa do WebView.
  useEffect(() => {
    const limpar = instalarBloqueioAnuncios();
    return () => {
      limpar();
    };
  }, []);

  return (
    <>
      <Seo />
      {/* Toda navegação de rota começa no topo (corrige detalhes abrindo no meio) */}
      <ScrollToTop />
      {/* Aviso "Nova versão disponível" (compara versão atual com a última vista) */}
      <UpdateChecker />
      <ErrorBoundary key={location.pathname} titulo="Algo deu errado ao carregar esta página.">
        <Suspense fallback={<FullScreenLoader />}>
          <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/filmes" element={<MoviesPage />} />
            <Route path="/series" element={<RequireSeries><SeriesPage /></RequireSeries>} />
            <Route path="/pesquisa" element={<SearchPage />} />
            <Route path="/baixar-app" element={<DownloadAppPage />} />
            <Route path="/titulo/:type/:id" element={<TitleDetailPage />} />
            <Route path="/assistir/:id" element={<PlayerPage />} />
            <Route path="/favoritos" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
            <Route path="/historico" element={<RequireAuth><HistoryPage /></RequireAuth>} />
            <Route path="/perfil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/configuracoes" element={<RequireAuth><SettingsPage /></RequireAuth>} />
            <Route path="/minha-assinatura" element={<RequireAuth><SubscriptionPage /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
            <Route path="/admin/series/:seriesId" element={<RequireAuth><AdminSeriesPage /></RequireAuth>} />
            {/* MovieFlix TV — interface dedicada para Android TV / Google TV / TV Box */}
            <Route path="/tv/*" element={<TvApp />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<SignupPage />} />
          <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
          <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
          <Route path="/selecionar-perfil" element={<RequireAuth><ProfileSelectPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}