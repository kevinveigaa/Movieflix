import { Link } from 'react-router-dom';
import { Film, Github, Instagram, Twitter } from 'lucide-react';

const cols = [
  {
    title: 'Navegação',
    links: [
      { label: 'Início', to: '/' },
      { label: 'Filmes', to: '/filmes' },
      { label: 'Séries', to: '/series' },
      { label: 'Animes', to: '/animes' },
    ],
  },
  {
    title: 'Categorias',
    links: [
      { label: 'documentários', to: '/documentarios' },
      { label: 'Infantil', to: '/infantil' },
      { label: 'Favoritos', to: '/favoritos' },
      { label: 'Continuar assistindo', to: '/continuar' },
    ],
  },
  {
    title: 'Conta',
    links: [
      { label: 'Minha assinatura', to: '/minha-assinatura' },
      { label: 'Configurações', to: '/configuracoes' },
      { label: 'Histórico', to: '/historico' },
      { label: 'Entrar', to: '/login' },
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
                    <Link to={l.to} className="text-sm text-ink-400 transition hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-ink-500 sm:flex-row">
          <p>© {new Date().getFullYear()} MovieFlix. Todos os direitos reservados.</p>
          <p>Dados de filmes fornecidos por TMDb. Este projeto não é afiliado à TMDb.</p>
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







