import { Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { instalarBloqueioAnuncios } from '@/lib/antiAds';
import { TvLayout } from './TvLayout';
import { TvHomePage } from './TvHomePage';
import { TvCatalogPage } from './TvCatalogPage';
import { TvSearchPage } from './TvSearchPage';
import { TvDetailPage } from './TvDetailPage';
import { TvPlayerPage } from './TvPlayerPage';
import { TvSubscriptionPage } from './TvSubscriptionPage';
import { TvMyListPage } from './TvMyListPage';
import { TvContinueWatchingPage } from './TvContinueWatchingPage';
import { TvLoginPage } from './TvLoginPage';
import { TvAccountPage } from './TvAccountPage';
import { TvLoading } from './TvStates';
import { informarVersaoAoApp } from '@/lib/tecladoTv';
import { BUILD_INFO, registrarBuildNoConsole } from '@/lib/version';

/**
 * TvApp — aplicação MovieFlix TV.
 *
 * É a MESMA aplicação MovieFlix (mesma marca, mesma conta, mesmo backend, mesmo
 * catálogo, mesmos planos, mesmos favoritos, mesmo histórico), com a interface
 * adaptada para televisão.
 *
 * ROTEAMENTO: o App usa HashRouter, então a TV vive em `#/tv` (não `/tv`).
 * Aqui resolvemos a sub-rota por `useLocation()` em vez de aninhar um <Routes>
 * — o roteamento aninhado dependia do prefixo do segmento pai e não casava de
 * forma confiável. A tabela abaixo é explícita e determinística.
 *
 * CAUSA RAIZ DO "LAYOUT WEB DEPOIS DO LOGIN" (corrigida): o login, a seleção de
 * perfil e a conta eram rotas do SITE (`/login`, `/selecionar-perfil`,
 * `/perfil`), que vivem sob o `AppLayout` (Navbar no topo + Footer) e usam o
 * formulário mobile/web. Assim que o usuário autenticava, a TV o entregava para
 * aquele layout e não havia caminho de volta. Agora existem `/tv/login` e
 * `/tv/perfil`, com formulário e perfis GRANDES, de TV, controláveis pelo D-pad —
 * e toda a navegação autenticada continua dentro do `TvLayout`.
 */

const SUB_ROTAS = [
  'filmes',
  'series',
  'pesquisa',
  'minha-lista',
  'continuar',
  'assinatura',
  'titulo',
  'assistir',
  'login',
  'perfil',
];

function RequireAuthTv({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <TvLoading label="Verificando sessão..." />;
  // Autenticação necessária → login DENTRO da TV (nunca `/login` do site).
  if (!user) return <Navigate to="/tv/login" replace />;
  return <>{children}</>;
}

export function TvApp() {
  const { pathname } = useLocation();

  // Bloqueio silencioso de popups/redirects de anúncio (camada JS) — o mesmo
  // antiAds do site; a camada nativa (MainActivity) é a última linha de defesa.
  useEffect(() => {
    const limpar = instalarBloqueioAnuncios();
    return () => limpar();
  }, []);

  /**
   * ANUNCIA A VERSÃO DO SITE ao shell nativo (APK MovieFlix TV).
   *
   * É esta chamada que resolve o "a correção funciona no navegador mas não na
   * TV": se o WebView estiver rodando um bundle ANTIGO de cache, o lado nativo
   * compara a versão anunciada com a do APK e recarrega sem cache, UMA vez
   * (ver `PonteNativa.verificarVersao` no MainActivity). Fora do app é no-op.
   */
  useEffect(() => {
    // Identidade do build no console: responde em 5 segundos "a TV está rodando
    // o build novo ou o antigo?". Ver src/lib/version.ts.
    registrarBuildNoConsole();
    // Anuncia o COMMIT (não a versão do produto) ao shell nativo: é o que
    // permite detectar um bundle antigo de cache e recarregar sem cache.
    informarVersaoAoApp(BUILD_INFO.commit);
  }, []);

  // "" (raiz da TV) ou os segmentos depois de /tv
  const resto = pathname.replace(/^\/tv\/?/, '');
  const seg = resto.split('/').filter(Boolean);
  const raiz = seg[0];
  const id = seg[1];

  let pagina: ReactNode;
  if (!raiz) {
    pagina = <TvHomePage />;
  } else if (raiz === 'filmes') {
    pagina = <TvCatalogPage mode="movie" />;
  } else if (raiz === 'series') {
    pagina = <TvCatalogPage mode="series" />;
  } else if (raiz === 'pesquisa') {
    pagina = <TvSearchPage />;
  } else if (raiz === 'titulo' && id) {
    pagina = <TvDetailPage id={id} />;
  } else if (raiz === 'assistir' && id) {
    pagina = <TvPlayerPage id={id} />;
  } else if (raiz === 'login') {
    pagina = <TvLoginPage />;
  } else if (raiz === 'perfil') {
    pagina = (
      <RequireAuthTv>
        <TvAccountPage />
      </RequireAuthTv>
    );
  } else if (raiz === 'minha-lista') {
    pagina = (
      <RequireAuthTv>
        <TvMyListPage />
      </RequireAuthTv>
    );
  } else if (raiz === 'continuar') {
    pagina = (
      <RequireAuthTv>
        <TvContinueWatchingPage />
      </RequireAuthTv>
    );
  } else if (raiz === 'assinatura') {
    pagina = (
      <RequireAuthTv>
        <TvSubscriptionPage />
      </RequireAuthTv>
    );
  } else if (SUB_ROTAS.includes(raiz)) {
    // Sub-rota conhecida sem id (ex.: /tv/titulo) → volta para a Home.
    pagina = <TvHomePage />;
  } else {
    pagina = <TvHomePage />;
  }

  return (
    /* TELAS IMERSIVAS (sem a coluna lateral):
     *  • `assistir` — o player ocupa a tela inteira;
     *  • `login`    — é uma tela DEDICADA e ANTERIOR ao login. Mostrar ali a
     *    navegação autenticada (Início/Filmes/Séries/Minha lista...) é ao mesmo
     *    tempo errado (o usuário ainda não entrou) e a ORIGEM do bug de foco
     *    relatado: a coluna lateral é o vizinho mais próximo à ESQUERDA do
     *    formulário, então era para lá que o foco "fugia". Sem a coluna, o foco
     *    não tem para onde escapar — a navegação do login fecha em si mesma
     *    (E-mail → Senha → Teclado → Entrar). */
    <TvLayout imersivo={raiz === 'assistir' || raiz === 'login'}>
      <Suspense fallback={<TvLoading label="Carregando..." />}>{pagina}</Suspense>
    </TvLayout>
  );
}
