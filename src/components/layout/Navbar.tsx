import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Search, Menu, X, User, LogOut, Settings, CreditCard, Shield, Film, Smartphone, ChevronDown, Baby, Users, Heart, PlayCircle, Tv } from 'lucide-react';
import { useMovies } from '@/hooks/useMovies';
import { useSeriesHidden } from '@/hooks/useSeriesHidden';
import { categoriasDoFilme, ehInfantil, ordenarCategorias } from '@/lib/categorias';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { rodandoNoApp } from '@/lib/appShell';
import { cn } from '@/lib/cn';

const navLinks = [
  { to: '/', label: 'Início' },
  { to: '/filmes', label: 'Filmes' },
  { to: '/series', label: 'Séries' },
];

/** Categorias realmente usadas no catálogo, para o menu "Categorias". No modo
 * infantil, só mostra categorias de conteúdo infantil (não leva a páginas vazias). */
function useCategorias(isKid: boolean) {
  const movies = useMovies();
  return useMemo(() => {
    const nomes = new Set<string>();
    for (const movie of movies.data ?? []) {
      if (isKid && !ehInfantil(movie)) continue;
      for (const cat of categoriasDoFilme(movie)) {
        if (cat !== 'Outros') nomes.add(cat);
      }
    }
    return ordenarCategorias(Array.from(nomes));
  }, [movies.data, isKid]);
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [isApp, setIsApp] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  const { user, profile, subscription, signOut, activeViewerProfile } = useAuth();
  const isKid = activeViewerProfile?.is_kid ?? false;
  const categorias = useCategorias(isKid);
  const { seriesHidden } = useSeriesHidden();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  // Detecta se o site roda DENTRO do app nativo (APK) — esconde o botão
  // "Baixar app" (não faz sentido baixar o app dentro do próprio app).
  useEffect(() => {
    let ativo = true;
    rodandoNoApp().then((v) => {
      if (ativo) setIsApp(v);
    });
    return () => {
      ativo = false;
    };
  }, []);

  // Quando "Esconder séries" está ativo, a aba "Séries" some do menu.
  const linksVisiveis = useMemo(
    () => (seriesHidden ? navLinks.filter((l) => l.to !== '/series') : navLinks),
    [seriesHidden],
  );
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
    setCatOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

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
      {isKid && (
        <div className="bg-amber-400 px-4 py-1 text-center text-xs font-bold text-black">
          <Baby className="mr-1 inline h-3 w-3" />
          Modo Infantil — apenas conteudo para criancas
        </div>
      )}
      <div className="container-app flex h-14 sm:h-16 lg:h-20 items-center gap-2 sm:gap-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 sm:h-8 sm:w-8 lg:h-10 lg:w-10 items-center justify-center rounded-md bg-brand-600 text-white">
            <Film className="h-5 w-5" />
          </span>
          <span className="font-display text-lg sm:text-xl lg:text-2xl tracking-wide text-white">MOVIEFLIX</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {linksVisiveis.map((l) => (
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

          <div className="relative" ref={catRef}>
            <button
              type="button"
              onClick={() => setCatOpen((v) => !v)}
              aria-expanded={catOpen}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                catOpen ? 'text-white' : 'text-ink-300 hover:text-white',
              )}
            >
              Categorias
              <ChevronDown className={cn('h-4 w-4 transition-transform', catOpen && 'rotate-180')} />
            </button>

            {catOpen && categorias.length > 0 && (
              <div className="absolute left-0 mt-2 grid max-h-[70vh] w-[34rem] grid-cols-3 gap-1 overflow-y-auto rounded-xl border border-white/10 bg-ink-900 p-3 shadow-2xl animate-fade-in-fast">
                {categorias.map((c) => (
                  <Link
                    key={c}
                    to={`/filmes?categoria=${encodeURIComponent(c)}`}
                    className="truncate rounded-lg px-3 py-2 text-sm text-ink-200 transition hover:bg-white/10 hover:text-white"
                  >
                    {c}
                  </Link>
                ))}
              </div>
            )}
          </div>
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
                {activeViewerProfile?.avatar_url ? (
                  <span className="relative flex h-8 w-8 overflow-hidden rounded-full bg-ink-700">
                    <img src={activeViewerProfile.avatar_url} alt="" className="h-full w-full object-cover" />
                    {activeViewerProfile.is_kid && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400">
                        <Baby className="h-2 w-2 text-black" />
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                    {profile?.email?.[0]?.toUpperCase() ?? 'U'}
                  </span>
                )}
                <span className={cn('hidden max-w-[8rem] truncate text-xs sm:block', active ? 'text-emerald-400' : 'text-ink-400')}>
                  {activeViewerProfile?.name ?? (active ? 'Assinante' : 'Grátis')}
                </span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-2xl animate-fade-in-fast">
                  <div className="border-b border-white/10 p-3">
                    <p className="truncate text-sm font-semibold text-white">
                      {activeViewerProfile?.name ?? profile?.email}
                    </p>
                    <p className="truncate text-xs text-ink-400">
                      {activeViewerProfile
                        ? activeViewerProfile.is_kid
                          ? 'Perfil infantil'
                          : 'Perfil normal'
                        : profile?.email}
                    </p>
                  </div>
                  <MenuLink to="/selecionar-perfil" icon={<Users className="h-4 w-4" />}>Trocar de perfil</MenuLink>
                  <MenuLink to="/perfil" icon={<User className="h-4 w-4" />}>Meu perfil</MenuLink>
                  <MenuLink to="/favoritos" icon={<Heart className="h-4 w-4" />}>Favoritos</MenuLink>
                  <MenuLink to="/continuar" icon={<PlayCircle className="h-4 w-4" />}>Continuar assistindo</MenuLink>
                  <MenuLink to="/minha-assinatura" icon={<CreditCard className="h-4 w-4" />}>Minha assinatura</MenuLink>
                  <MenuLink to="/configuracoes" icon={<Settings className="h-4 w-4" />}>Configurações</MenuLink>
                  {profile?.is_admin && (
                    <MenuLink to="/admin" icon={<Shield className="h-4 w-4" />}>Painel Admin</MenuLink>
                  )}
                  {!isApp && (
                    <MenuLink to="/baixar-app" icon={<Smartphone className="h-4 w-4" />}>Baixar app</MenuLink>
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
            {linksVisiveis.map((l) => (
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
            {categorias.length > 0 && (
              <div className="mt-2 border-t border-white/10 pt-3">
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">Categorias</p>
                <div className="flex flex-wrap gap-2">
                  {categorias.map((c) => (
                    <Link
                      key={c}
                      to={`/filmes?categoria=${encodeURIComponent(c)}`}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-ink-200 transition hover:bg-white/10 hover:text-white"
                    >
                      {c}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {!isApp && (
              <NavLink
                to="/baixar-app"
                className={({ isActive }) =>
                  cn(
                    'mt-1 flex items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2.5 text-sm font-semibold text-brand-300 transition-colors',
                    isActive ? 'bg-white/10 text-white' : 'hover:bg-brand-500/20 hover:text-brand-200',
                  )
                }
              >
                <Smartphone className="h-4 w-4" /> Baixar app
              </NavLink>
            )}
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












