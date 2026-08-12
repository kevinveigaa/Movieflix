import { useEffect } from 'react';
import { useLocation, matchPath } from 'react-router-dom';

interface SeoConfig { title: string; description: string; }

const SITE_NAME = 'MovieFlix';

const DEFAULT_SEO: SeoConfig = {
  title: `${SITE_NAME} — Filmes, Séries, Animes e mais`,
  description: 'MovieFlix: a sua plataforma de streaming. Filmes, séries, animes, documentários e infantil em um só lugar.',
};

const ROUTE_SEO: Array<{ path: string; title: string; description: string }> = [
  { path: '/', title: 'Início — MovieFlix', description: 'Assista filmes, séries, animes, documentários e conteúdo infantil no MovieFlix.' },
  { path: '/filmes', title: 'Filmes — MovieFlix', description: 'Catálogo de filmes para assistir online no MovieFlix.' },
  { path: '/series', title: 'Séries — MovieFlix', description: 'Catálogo de séries para maratonar no MovieFlix.' },
  { path: '/animes', title: 'Animes — MovieFlix', description: 'Os melhores animes para assistir online no MovieFlix.' },
  { path: '/pesquisa', title: 'Pesquisa — MovieFlix', description: 'Busque filmes, séries e animes no catálogo do MovieFlix.' },
  { path: '/titulo/:type/:id', title: 'Título — MovieFlix', description: 'Detalhes do título: sinopse, nota, gênero, trailer e onde assistir.' },
  { path: '/assistir/:id', title: 'Assistir — MovieFlix', description: 'Assista agora no MovieFlix.' },
  { path: '/favoritos', title: 'Meus Favoritos — MovieFlix', description: 'Seus títulos favoritos reunidos em um só lugar no MovieFlix.' },
  { path: '/continuar', title: 'Continuar Assistindo — MovieFlix', description: 'Retome de onde parou no MovieFlix.' },
  { path: '/historico', title: 'Histórico — MovieFlix', description: 'Seu histórico de reprodução no MovieFlix.' },
  { path: '/perfil', title: 'Meu Perfil — MovieFlix', description: 'Gerencie seu perfil no MovieFlix.' },
  { path: '/configuracoes', title: 'Configurações — MovieFlix', description: 'Preferências e configurações da sua conta MovieFlix.' },
  { path: '/minha-assinatura', title: 'Minha Assinatura — MovieFlix', description: 'Gerencie sua assinatura e planos no MovieFlix.' },
  { path: '/admin', title: 'Painel Admin — MovieFlix', description: 'Painel administrativo do MovieFlix.' },
  { path: '/baixar-app', title: 'Baixar App — MovieFlix', description: 'Baixe o aplicativo MovieFlix para Android e assista em qualquer lugar.' },
  { path: '/login', title: 'Entrar — MovieFlix', description: 'Acesse sua conta MovieFlix para continuar assistindo.' },
  { path: '/cadastro', title: 'Criar Conta — MovieFlix', description: 'Crie sua conta e assine o MovieFlix.' },
  { path: '/recuperar-senha', title: 'Recuperar Senha — MovieFlix', description: 'Recupere o acesso à sua conta MovieFlix.' },
  { path: '/selecionar-perfil', title: 'Selecionar Perfil — MovieFlix', description: 'Escolha um perfil para começar a assistir no MovieFlix.' },
];

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

function resolveConfig(pathname: string): SeoConfig {
  const exact = ROUTE_SEO.find((r) => r.path === pathname);
  if (exact) return exact;
  const pattern = ROUTE_SEO.find((r) => r.path.includes(':') && matchPath(r.path, pathname));
  if (pattern) return pattern;
  return DEFAULT_SEO;
}

export function Seo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const config = resolveConfig(pathname);
    document.title = config.title;
    setMeta('name', 'description', config.description);
    setMeta('property', 'og:title', config.title);
    setMeta('property', 'og:description', config.description);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:site_name', SITE_NAME);
    setMeta('property', 'og:locale', 'pt_BR');
    setMeta('property', 'og:url', `${window.location.origin}${pathname}`);
    setMeta('property', 'og:image', `${window.location.origin}/og-image.jpg`);
    setMeta('property', 'og:image:width', '1200');
    setMeta('property', 'og:image:height', '630');
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', config.title);
    setMeta('name', 'twitter:description', config.description);
    setMeta('name', 'twitter:image', `${window.location.origin}/og-image.jpg`);
  }, [pathname]);
  return null;
}
