import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Film, Search, X, Menu, ChevronDown, User, LogOut, Settings,
  CreditCard, History, Heart, PlayCircle, Shield, Download,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/cn';

const navLinks = [
  { label: 'Início', to: '/' },
  { label: 'Filmes', to: '/filmes' },
  { label: 'Séries', to: '/series' },
  { label: 'Animes', to: '/animes' },
];

const categorias = [
  'Ação','Aventura','Comédia','Drama','Terror',
  'Ficção Científica','Romance','Suspense','Fantasia',
  'Animação','Infantil','Documentário','Crime',
];

export function Navbar() {
  const { user, profile, activeViewerProfile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (searchOpen && searchRef.current) searchRef.current.focus(); }, [searchOpen]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      navigate(`/pesquisa?q=${encodeURIComponent(searchValue.trim())}`);
      setSearchOpen(false); setSearchValue(''); setMenuOpen(false);
    }
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Avatar color based on name
  const avatarLetter = activeViewerProfile?.name?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || '';
  const avatarColor = avatarLetter ? `hsl(${(avatarLetter.charCodeAt(0) * 137) % 360}, 70%, 45%)` : '#e60000';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="container-app">
        <nav className="flex h-16 items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="MovieFlix Home">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-lg shadow-brand-900/30">
              <Film className="h-5 w-5" />
            </span>
            <span className="font-display text-2xl tracking-wider text-white hidden sm:block">MOVIEFLIX</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((l) => (
              <Link key={l.to} to={l.to}
                className={cn('rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200',
                  isActive(l.to) ? 'text-white bg-white/15 shadow-sm' : 'text-ink-300 hover:text-white hover:bg-white/10')}>
                {l.label}
              </Link>
            ))}
            <div className="relative" ref={catRef}>
              <button onClick={() => setCatOpen(!catOpen)}
                className={cn('flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200',
                  catOpen ? 'text-white bg-white/15 shadow-sm' : 'text-ink-300 hover:text-white hover:bg-white/10')}
                aria-expanded={catOpen} aria-haspopup="true">
                Categorias <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', catOpen && 'rotate-180')} />
              </button>
              {catOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 rounded-xl border border-white/10 bg-ink-900/95 backdrop-blur-xl p-2 shadow-2xl animate-scale-in">
                  <div className="grid grid-cols-1 gap-0.5">
                    {categorias.map((c) => (
                      <Link key={c} to={`/filmes?categoria=${encodeURIComponent(c)}`}
                        onClick={() => setCatOpen(false)}
                        className="rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-white/10 hover:text-white">{c}</Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              {searchOpen ? (
                <form onSubmit={handleSearch} className="flex items-center gap-2">
                  <input ref={searchRef} type="text" value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    placeholder="Buscar filmes, séries..."
                    className="w-44 sm:w-64 rounded-full border border-white/20 bg-ink-800/90 px-4 py-2 text-sm text-white placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-all" />
                  <button type="button" onClick={() => { setSearchOpen(false); setSearchValue(''); }}
                    className="rounded-full p-2 text-ink-400 hover:text-white transition" aria-label="Fechar busca">
                    <X className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <button onClick={() => setSearchOpen(true)}
                  className="rounded-full p-2.5 text-ink-300 transition hover:bg-white/10 hover:text-white" aria-label="Buscar">
                  <Search className="h-5 w-5" />
                </button>
              )}
            </div>

            {user ? (
              <div className="relative" ref={profileRef}>
                <button onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2.5 rounded-full p-1 pr-3 transition hover:bg-white/10" aria-expanded={profileOpen}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full text-white text-sm font-bold shadow-md"
                    style={{ backgroundColor: avatarColor }}>
                    {avatarLetter || <User className="h-4 w-4" />}
                  </div>
                  <span className="hidden sm:block text-sm text-ink-200 max-w-[100px] truncate font-medium">
                    {activeViewerProfile?.name || profile?.email?.split('@')[0]}
                  </span>
                  <ChevronDown className={cn('h-3.5 w-3.5 text-ink-400 transition-transform hidden sm:block', profileOpen && 'rotate-180')} />
                </button>
                {profileOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-white/10 bg-ink-900/95 backdrop-blur-xl p-2 shadow-2xl animate-scale-in">
                    <div className="border-b border-white/10 px-3 py-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full text-white text-sm font-bold shrink-0"
                        style={{ backgroundColor: avatarColor }}>
                        {avatarLetter || <User className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{activeViewerProfile?.name || profile?.email}</p>
                        <p className="text-xs text-ink-400">{activeViewerProfile ? (activeViewerProfile.is_kid ? 'Perfil infantil' : 'Perfil normal') : 'Conta principal'}</p>
                      </div>
                    </div>
                    <div className="py-1">
                      <Link to="/perfil" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-white/10 hover:text-white"><User className="h-4 w-4" /> Meu perfil</Link>
                      <Link to="/favoritos" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-white/10 hover:text-white"><Heart className="h-4 w-4" /> Favoritos</Link>
                      <Link to="/continuar" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-white/10 hover:text-white"><PlayCircle className="h-4 w-4" /> Continuar assistindo</Link>
                      <Link to="/historico" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-white/10 hover:text-white"><History className="h-4 w-4" /> Histórico</Link>
                      <Link to="/minha-assinatura" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-white/10 hover:text-white"><CreditCard className="h-4 w-4" /> Minha assinatura</Link>
                      <Link to="/configuracoes" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-white/10 hover:text-white"><Settings className="h-4 w-4" /> Configurações</Link>
                      <Link to="/baixar-app" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-white/10 hover:text-white"><Download className="h-4 w-4" /> Baixar app</Link>
                      {profile?.is_admin && (
                        <Link to="/admin" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-amber-400 transition hover:bg-amber-500/10"><Shield className="h-4 w-4" /> Painel Admin</Link>
                      )}
                    </div>
                    <div className="border-t border-white/10 pt-1">
                      <button onClick={() => { signOut(); setProfileOpen(false); }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/10">
                        <LogOut className="h-4 w-4" /> Sair
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="hidden sm:inline-flex rounded-full px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10">Entrar</Link>
                <Link to="/cadastro" className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 shadow-lg shadow-brand-900/20">Assinar</Link>
              </div>
            )}

            <button onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-full p-2.5 text-ink-300 transition hover:bg-white/10 hover:text-white md:hidden" aria-label="Menu">
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>
      </div>

      {menuOpen && (
        <div className="border-t border-white/10 bg-ink-900/95 backdrop-blur-xl md:hidden animate-fade-in-up">
          <div className="container-app py-4 space-y-1">
            <form onSubmit={handleSearch} className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input type="text" value={searchValue} onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full rounded-xl border border-white/10 bg-ink-800/60 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-ink-400" />
              </div>
            </form>
            {navLinks.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)}
                className={cn('block rounded-xl px-4 py-3 text-sm font-medium transition',
                  isActive(l.to) ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white')}>
                {l.label}
              </Link>
            ))}
            <div className="pt-2">
              <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Categorias</p>
              <div className="grid grid-cols-2 gap-1 px-2">
                {categorias.map((c) => (
                  <Link key={c} to={`/filmes?categoria=${encodeURIComponent(c)}`} onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2 text-sm text-ink-300 transition hover:bg-white/10 hover:text-white">{c}</Link>
                ))}
              </div>
            </div>
            {!user && (
              <div className="mt-4 flex gap-3 px-2">
                <Link to="/login" onClick={() => setMenuOpen(false)} className="flex-1 rounded-xl border border-white/20 py-3 text-center text-sm font-medium text-white">Entrar</Link>
                <Link to="/cadastro" onClick={() => setMenuOpen(false)} className="flex-1 rounded-xl bg-brand-600 py-3 text-center text-sm font-semibold text-white">Assinar</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
