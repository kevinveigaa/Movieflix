import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Seo } from '@/components/Seo';
import { FullScreenLoader } from '@/components/ui/Feedback';
import { useTvNavigation } from '@/hooks/useTvNavigation';
import type { JSX } from 'react';

// Code splitting por rota: cada página é carregada sob demanda (React.lazy).
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })));
const CatalogPage = lazy(() => import('@/pages/CatalogPage').then((m) => ({ default: m.CatalogPage })));
const SearchPage = lazy(() => import('@/pages/SearchPage').then((m) => ({ default: m.SearchPage })));
const TitleDetailPage = lazy(() => import('@/pages/TitleDetailPage').then((m) => ({ default: m.TitleDetailPage })));
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })));
const ContinueWatchingPage = lazy(() => import('@/pages/ContinueWatchingPage').then((m) => ({ default: m.ContinueWatchingPage })));
const HistoryPage = lazy(() => import('@/pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SubscriptionPage = lazy(() => import('@/pages/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })));
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const AdminSeriesPage = lazy(() => import('@/pages/AdminSeriesPage').then((m) => ({ default: m.AdminSeriesPage })));
import { PlayerPage } from '@/pages/PlayerPage';
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('@/pages/auth/SignupPage').then((m) => ({ default: m.SignupPage })));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ProfileSelectPage = lazy(() => import('@/pages/auth/ProfileSelectPage').then((m) => ({ default: m.ProfileSelectPage })));
const DownloadAppPage = lazy(() => import('@/pages/DownloadAppPage').then((m) => ({ default: m.DownloadAppPage })));

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

function AppRoutes() {
  // Navegação por controle remoto (setas + OK + Voltar) para TV, TV Box e PC.
  useTvNavigation();

  return (
    <>
      <Seo />
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/filmes" element={<CatalogPage kind="filmes" />} />
            <Route path="/series" element={<CatalogPage kind="series" />} />
            <Route path="/animes" element={<CatalogPage kind="animes" />} />
            <Route path="/pesquisa" element={<SearchPage />} />
            <Route path="/baixar-app" element={<DownloadAppPage />} />
            <Route path="/titulo/:type/:id" element={<TitleDetailPage />} />
            <Route path="/assistir/:id" element={<PlayerPage />} />
            <Route path="/favoritos" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
            <Route path="/continuar" element={<RequireAuth><ContinueWatchingPage /></RequireAuth>} />
            <Route path="/historico" element={<RequireAuth><HistoryPage /></RequireAuth>} />
            <Route path="/perfil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/configuracoes" element={<RequireAuth><SettingsPage /></RequireAuth>} />
            <Route path="/minha-assinatura" element={<RequireAuth><SubscriptionPage /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
            <Route path="/admin/series/:seriesId" element={<RequireAuth><AdminSeriesPage /></RequireAuth>} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<SignupPage />} />
          <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
          <Route path="/selecionar-perfil" element={<RequireAuth><ProfileSelectPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
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
