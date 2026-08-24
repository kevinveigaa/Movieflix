import { Link } from 'react-router-dom';
import { Film, Instagram, MessageCircle } from 'lucide-react';
import { useSeriesHidden } from '@/hooks/useSeriesHidden';

const WHATSAPP_URL = 'https://wa.me/11943750307';
const INSTAGRAM_URL = 'https://instagram.com/movieflixplaybr';

const cols = [
  {
    title: 'Navegação',
    links: [
      { label: 'Início', to: '/' },
      { label: 'Filmes', to: '/filmes' },
      { label: 'Séries', to: '/series' },
      { label: 'Baixar app', to: '/baixar-app' },
    ],
  },
  {
    title: 'Categorias',
    links: [
      { label: 'Documentários', to: '/filmes?categoria=Document%C3%A1rio' },
      { label: 'Infantil', to: '/filmes?categoria=Infantil' },
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
  const { seriesHidden } = useSeriesHidden();

  // Quando "Esconder séries" está ativo, remove o link "Séries" do rodapé.
  const colsVisiveis = seriesHidden
    ? cols.map((c) =>
        c.title === 'Navegação'
          ? { ...c, links: c.links.filter((l) => l.to !== '/series') }
          : c,
      )
    : cols;

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
              {seriesHidden
                ? "Filmes, documentários e conteúdo infantil em um só lugar. Assista onde e quando quiser."
                : "Filmes, séries, documentários e conteúdo infantil em um só lugar. Assista onde e quando quiser."}
            </p>
            <div className="mt-4 flex gap-3">
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="rounded-full border border-white/10 bg-white/5 p-2 text-ink-300 transition hover:bg-emerald-500/20 hover:text-emerald-300">
                <MessageCircle className="h-4 w-4" />
              </a>
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="rounded-full border border-white/10 bg-white/5 p-2 text-ink-300 transition hover:bg-white/10 hover:text-white">
                <Instagram className="h-4 w-4" />
              </a>
            </div>
          </div>
          {colsVisiveis.map((c) => (
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

