import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Clapperboard, Tv, Search, Heart, Crown, PlaySquare, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/cn';

/**
 * TvLayout — moldura da interface MovieFlix TV.
 *
 * - Menu lateral esquerdo grande (fonte 28px) com as seções principais,
 *   navegável por ↑/↓ + OK.
 * - Splash inicial (logo MovieFlix TV) com fade-out rápido (~1s) para
 *   dar a sensação de app nativo.
 * - Conteúdo central ocupa o resto da tela.
 */

const MENU_ITEMS = [
  { to: '/tv', label: 'Início', icon: Home },
  { to: '/tv/filmes', label: 'Filmes', icon: Clapperboard },
  { to: '/tv/series', label: 'Séries', icon: Tv },
  { to: '/tv/pesquisa', label: 'Pesquisar', icon: Search },
  { to: '/tv/minha-lista', label: 'Minha Lista', icon: Heart },
  { to: '/tv/assinatura', label: 'Assinatura', icon: Crown },
  { to: '/tv/continuar', label: 'Continuar assistindo', icon: Clock },
];

export function TvLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [splash, setSplash] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSplash(false), 1200);
    return () => window.clearTimeout(t);
  }, []);

  // Foco inicial no 1º item do menu quando a página muda (o hook global
  // useTvNavigation também cuida, mas garantir aqui evita foco "perdido").
  useEffect(() => {
    if (splash) return;
    const t = window.setTimeout(() => {
      const ativo = document.activeElement as HTMLElement | null;
      if (!ativo || ativo === document.body || !ativo.getBoundingClientRect().width) {
        const primeiro = menuRef.current?.querySelector<HTMLElement>('[data-tv-focusable]');
        primeiro?.focus({ preventScroll: true });
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [location.pathname, splash]);

  const sair = () => {
    navigate('/tv');
  };

  if (splash) {
    return (
      <div className="tv-splash">
        <div className="tv-splash-logo">
          <span className="tv-splash-mark">MF</span>
          <span className="tv-splash-text">MovieFlix <em>TV</em></span>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-shell">
      <aside className="tv-menu" ref={menuRef}>
        <div className="tv-menu-logo" onClick={() => navigate('/tv')} data-tv-focusable tabIndex={0}>
          <span className="tv-menu-mark">MF</span>
          <span className="tv-menu-title">MovieFlix <em>TV</em></span>
        </div>
        <nav className="tv-menu-nav">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const ativo = location.pathname === item.to;
            return (
              <button
                key={item.to}
                data-tv-focusable
                tabIndex={0}
                className={cn('tv-menu-item', ativo && 'tv-menu-item-ativo')}
                onClick={() => navigate(item.to)}
              >
                <Icon className="tv-menu-icon" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="tv-menu-footer">
          <button data-tv-focusable tabIndex={0} className="tv-menu-item" onClick={() => navigate('/')}>
            <PlaySquare className="tv-menu-icon" />
            <span>Site completo</span>
          </button>
          <div className="tv-menu-user" data-tv-focusable tabIndex={0} onClick={sair}>
            {user ? user.email?.split('@')[0] ?? 'Conta' : 'Entrar'}
          </div>
        </div>
      </aside>
      <main className="tv-content">{children}</main>
    </div>
  );
}
