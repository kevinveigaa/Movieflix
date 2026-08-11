import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { ScrollToTop } from './ScrollToTop';

export function AppLayout() {
  const location = useLocation();
  const isPlayer = location.pathname.startsWith('/assistir');

  return (
    <div className="flex min-h-screen flex-col bg-ink-950">
      {!isPlayer && <Navbar />}
      <main className="flex-1">
        <Outlet />
      </main>
      {!isPlayer && <Footer />}
      <ScrollToTop />
    </div>
  );
}
