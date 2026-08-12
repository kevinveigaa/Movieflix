import { Link } from 'react-router-dom';
import { Film, Github, Instagram, Twitter, Heart } from 'lucide-react';

const cols = [
  {
    title: 'Navegação',
    links: [
      { label: 'Início', to: '/' },
      { label: 'Filmes', to: '/filmes' },
      { label: 'Séries', to: '/series' },
      { label: 'Animes', to: '/animes' },
      { label: 'Baixar app', to: '/baixar-app' },
    ],
  },
  {
    title: 'Categorias',
    links: [
      { label: 'Ação', to: '/filmes?categoria=Ação' },
      { label: 'Comédia', to: '/filmes?categoria=Comédia' },
      { label: 'Terror', to: '/filmes?categoria=Terror' },
      { label: 'Infantil', to: '/filmes?categoria=Infantil' },
      { label: 'Documentários', to: '/filmes?categoria=Documentário' },
    ],
  },
  {
    title: 'Minha Conta',
    links: [
      { label: 'Favoritos', to: '/favoritos' },
      { label: 'Continuar assistindo', to: '/continuar' },
      { label: 'Histórico', to: '/historico' },
      { label: 'Minha assinatura', to: '/minha-assinatura' },
      { label: 'Configurações', to: '/configuracoes' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/10 bg-ink-950">
      <div className="container-app py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600 text-white">
                <Film className="h-5 w-5" />
              </span>
              <span className="font-display text-xl tracking-wide text-white">MOVIEFLIX</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-ink-400">
              Filmes, Séries, animes, documentários e conteúdo infantil em um só lugar. Assista onde e quando quiser.
            </p>
            <div className="mt-4 flex gap-3">
              <SocialIcon><Instagram className="h-4 w-4" /></SocialIcon>
              <SocialIcon><Twitter className="h-4 w-4" /></SocialIcon>
              <SocialIcon><Github className="h-4 w-4" /></SocialIcon>
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-sm font-semibold text-white">{c.title}</h4>
              <ul className="mt-3 space-y-2">
                {c.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to} className="text-sm text-ink-400 transition hover:text-white">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-ink-500 sm:flex-row">
          <p>© {new Date().getFullYear()} MovieFlix. Todos os direitos reservados.</p>
          <p className="flex items-center gap-1">Feito com <Heart className="h-3 w-3 text-brand-600" /> no Brasil</p>
        </div>
      </div>
    </footer>
  );
}

function SocialIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-300 transition hover:bg-white/10 hover:text-white">
      {children}
    </span>
  );
}
