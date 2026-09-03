import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { ScrollToTop } from './ScrollToTop';
import { cn } from '@/lib/cn';

export function AppLayout() {
  const location = useLocation();
  const isPlayer = location.pathname.startsWith('/assistir');

  return (
    <div className="flex min-h-screen flex-col bg-ink-950">
      {!isPlayer && <Navbar />}
      <main className={cn("flex-1", !isPlayer && "pt-14 sm:pt-16 lg:pt-20")}>
        <Outlet />
      </main>
      {!isPlayer && <Footer />}
      <ScrollToTop />
    </div>
  );
}
