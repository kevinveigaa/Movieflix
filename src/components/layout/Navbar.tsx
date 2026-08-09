import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Search, Menu, X, Bell, User, LogOut, Settings, CreditCard, Shield, Film } from 'lucide-react';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { cn } from '@/lib/cn';

const navLinks = [
  { to: '/', label: 'Início' },
  { to: '/filmes', label: 'Filmes' },
  { to: '/animes', label: 'Animes' },
  { to: '/documentarios', label: 'Documentários' },
  { to: '/infantil', label: 'Infantil' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, subscription, signOut } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) navigate(`/pesquisa?q=${encodeURIComponent(query.trim())}`);
  };

  const active = hasActiveSubscription(subscription);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled ? 'bg-ink-950/95 backdrop-blur shadow-lg shadow-black/40' : 'bg-gradient-to-b from-black/80 to-transparent',
      )}
    >
      <div className="container-app flex h-14 sm:h-16 lg:h-20 items-center gap-2 sm:gap-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 sm:h-8 sm:w-8 lg:h-10 lg:w-10 items-center justify-center rounded-md bg-brand-600 text-white">
            <Film className="h-5 w-5" />
          </span>
          <span className="font-display text-lg sm:text-xl lg:text-2xl tracking-wide text-white">MOVIEFLIX</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'text-white' : 'text-ink-300 hover:text-white',
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <form onSubmit={submitSearch} className="hidden sm:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar títulos"
                className="w-40 rounded-full border border-white/10 bg-ink-800/70 py-2 pl-9 pr-3 text-sm text-white placeholder:text-ink-400 transition-all focus:w-56 focus:border-brand-500 focus:outline-none sm:w-48"
              />
            </div>
          </form>

          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1 pr-2 transition hover:bg-white/10"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                  {profile?.email?.[0]?.toUpperCase() ?? 'U'}
                </span>
                <span className={cn('hidden text-xs sm:block', active ? 'text-emerald-400' : 'text-ink-400')}>
                  {active ? 'Assinante' : 'Grátis'}
                </span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-2xl animate-fade-in-fast">
                  <div className="border-b border-white/10 p-3">
                    <p className="truncate text-sm font-semibold text-white">{profile?.email}</p>
                    <p className="text-xs text-ink-400">{active ? 'Plano ativo' : 'Sem assinatura'}</p>
                  </div>
                  <MenuLink to="/perfil" icon={<User className="h-4 w-4" />}>Meu perfil</MenuLink>
                  <MenuLink to="/minha-assinatura" icon={<CreditCard className="h-4 w-4" />}>Minha assinatura</MenuLink>
                  <MenuLink to="/configuracoes" icon={<Settings className="h-4 w-4" />}>Configurações</MenuLink>
                  <MenuLink to="/historico" icon={<Bell className="h-4 w-4" />}>Histórico</MenuLink>
                  {profile?.is_admin && (
                    <MenuLink to="/admin" icon={<Shield className="h-4 w-4" />}>Painel Admin</MenuLink>
                  )}
                  <button
                    onClick={() => signOut()}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-ink-200 transition hover:bg-white/5 hover:text-white"
                  >
                    <LogOut className="h-4 w-4" /> Sair
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn-ghost text-sm">Entrar</Link>
              <Link to="/cadastro" className="btn-primary text-sm hidden sm:inline-flex">Assinar</Link>
            </div>
          )}

          <button
            className="rounded-full p-3 text-ink-200 hover:bg-white/10 lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-ink-950/95 lg:hidden">
          <div className="container-app flex flex-col gap-1 py-3">
            <form onSubmit={submitSearch} className="mb-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar títulos"
                  className="w-full rounded-full border border-white/10 bg-ink-800/70 py-2 pl-9 pr-3 text-sm text-white placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </form>
            {navLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white',
                  )
                }
              >
                {l.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

function MenuLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-2.5 text-sm text-ink-200 transition hover:bg-white/5 hover:text-white">
      {icon}
      {children}
    </Link>
  );
}












