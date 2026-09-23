import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Clapperboard, Tv as TvIcon, Search, Heart, Crown, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TvLogo } from './TvBrand';
import { cn } from '@/lib/cn';

/**
 * TvLayout — moldura da experiência MovieFlix TV.
 *
 * Cabeçalho horizontal (mesma linguagem do header do Mobile/Web): logo OFICIAL
 * do MovieFlix à esquerda, navegação no centro e conta/assinatura à direita.
 * Nada de menu lateral escuro genérico — em 16:9 o cabeçalho devolve a largura
 * inteira para a grade, que passa a mostrar ~6-7 cards por linha.
 *
 * O item ativo usa o VERMELHO da marca (não roxo genérico) e o foco do controle
 * usa o gradiente vermelho→roxo, exatamente como os botões primários do site.
 */

const MENU_ITENS = [
  { to: '/tv', label: 'Início', icon: Home },
  { to: '/tv/filmes', label: 'Filmes', icon: Clapperboard },
  { to: '/tv/series', label: 'Séries', icon: TvIcon },
  { to: '/tv/minha-lista', label: 'Minha Lista', icon: Heart },
  { to: '/tv/pesquisa', label: 'Buscar', icon: Search },
];

/** Quantas vezes tentar focar o elemento de entrada da tela (o conteúdo pode
 *  ainda não estar renderizado — o catálogo é carregado de forma assíncrona). */
const TENTATIVAS_FOCO = [250, 700, 1300, 2100, 3200];

export function TvLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, subscription } = useAuth();
  const [splash, setSplash] = useState(true);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSplash(false), 1000);
    return () => window.clearTimeout(t);
  }, []);

  /**
   * Entrada de foco por tela. Prioriza `[data-tv-initial-focus]` (o botão
   * "Assistir" do destaque, o botão principal dos Detalhes) e, na ausência
   * dele, o primeiro item focável do conteúdo principal.
   */
  useEffect(() => {
    if (splash) return;
    const timers = TENTATIVAS_FOCO.map((ms) =>
      window.setTimeout(() => {
        const ativo = document.activeElement as HTMLElement | null;
        // Só assume o foco se ele se perdeu (ou nunca aconteceu).
        if (ativo && ativo !== document.body && ativo.getBoundingClientRect().width > 0) return;
        const preferido = document.querySelector<HTMLElement>('[data-tv-initial-focus]');
        const alvo = preferido ?? document.querySelector<HTMLElement>('.tv-content [data-tv-focusable]');
        alvo?.focus({ preventScroll: true });
      }, ms),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [location.pathname, splash]);

  if (splash) {
    return (
      <div className="tv-splash">
        <div className="tv-splash-logo">
          {/* Logo OFICIAL do MovieFlix (mesmo asset do site/Mobile). */}
          <TvLogo className="tv-splash-img" />
        </div>
      </div>
    );
  }

  const assinante = Boolean(subscription);

  return (
    <div className="tv-shell">
      <main className="tv-content">
        <header className="tv-header" ref={headerRef}>
          <div
            className="tv-header-logo"
            data-tv-focusable
            tabIndex={0}
            role="button"
            aria-label="MovieFlix — Início"
            onClick={() => navigate('/tv')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 23) navigate('/tv');
            }}
          >
            <TvLogo className="tv-header-logo-img" />
          </div>

          <nav className="tv-header-nav">
            {MENU_ITENS.map((item) => {
              const Icon = item.icon;
              const ativo =
                item.to === '/tv' ? location.pathname === '/tv' : location.pathname.startsWith(item.to);
              return (
                <button
                  key={item.to}
                  data-tv-focusable
                  tabIndex={0}
                  className={cn('tv-header-item', ativo && 'tv-header-item-ativo')}
                  onClick={() => navigate(item.to)}
                >
                  <Icon className="tv-header-icon" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="tv-header-right">
            <button
              data-tv-focusable
              tabIndex={0}
              className="tv-header-item"
              onClick={() => navigate('/tv/continuar')}
              title="Continuar assistindo"
            >
              <Clock className="tv-header-icon" />
              <span>Continuar</span>
            </button>
            <button
              data-tv-focusable
              tabIndex={0}
              className={cn('tv-header-item', assinante && 'tv-header-item-assinante')}
              onClick={() => navigate('/tv/assinatura')}
              title="Planos"
            >
              <Crown className="tv-header-icon" />
              <span>{assinante ? 'Assinante' : 'Planos'}</span>
            </button>
            <button
              data-tv-focusable
              tabIndex={0}
              className="tv-header-item"
              onClick={() => navigate(user ? '/perfil' : '/login')}
              title={user ? 'Sua conta' : 'Entrar'}
            >
              <span className="tv-header-user">
                {user ? (user.email?.split('@')[0] ?? 'Conta') : 'Entrar'}
              </span>
            </button>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
