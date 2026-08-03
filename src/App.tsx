import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { HomePage } from '@/pages/HomePage';
import { CatalogPage } from '@/pages/CatalogPage';
import { SearchPage } from '@/pages/SearchPage';
import { TitleDetailPage } from '@/pages/TitleDetailPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { ContinueWatchingPage } from '@/pages/ContinueWatchingPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SubscriptionPage } from '@/pages/SubscriptionPage';
import { AdminPage } from '@/pages/AdminPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { PlayerPage } from '@/pages/PlayerPage';
import { ProfileSelectPage } from '@/pages/auth/ProfileSelectPage';
import { FullScreenLoader } from '@/components/ui/Feedback';
import type { JSX } from 'react';

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
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/filmes" element={<CatalogPage kind="filmes" />} />
        <Route path="/series" element={<CatalogPage kind="series" />} />
        <Route path="/animes" element={<CatalogPage kind="animes" />} />
        <Route path="/documentarios" element={<CatalogPage kind="documentarios" />} />
        <Route path="/infantil" element={<CatalogPage kind="infantil" />} />
        <Route path="/pesquisa" element={<SearchPage />} />
        <Route path="/titulo/:type/:id" element={<TitleDetailPage />} /> <Route path="/assistir/:id" element={<PlayerPage />} />
        <Route path="/favoritos" element={<RequireAuth><FavoritesPage /></RequireAuth>} />
        <Route path="/continuar" element={<RequireAuth><ContinueWatchingPage /></RequireAuth>} />
        <Route path="/historico" element={<RequireAuth><HistoryPage /></RequireAuth>} />
        <Route path="/perfil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/configuracoes" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/minha-assinatura" element={<RequireAuth><SubscriptionPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
      </Route>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cadastro" element={<SignupPage />} />
      <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
      <Route path="/selecionar-perfil" element={<RequireAuth><ProfileSelectPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}









