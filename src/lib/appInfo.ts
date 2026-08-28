/**
 * MovieFlix — Configuração oficial do aplicativo Android.
 *
 * Centraliza TODOS os dados de versão e download do APK em UM único lugar,
 * para que futuras atualizações só precisem alterar este arquivo
 * (e colocar o novo arquivo em public/apk/).
 *
 * ══ SISTEMA DE VERSÃO (pedido do dono) ══════════════════════════════════
 * - A versão atual é 2.1.0 (versão principal do site + app unificados).
 * - Regra de incremento:
 *     · Correção pequena (bugfix)  → 2.0.1
 *     · Nova funcionalidade        → 2.1.0
 *     · Mudança grande/visual      → 3.0.0
 * - O app (WebView) sempre carrega o site ONLINE, então qualquer mudança no
 *   site já vale no app na hora. O sistema de "Nova versão disponível"
 *   (UpdateChecker) compara a versão deste arquivo com a última conhecida
 *   pelo navegador (localStorage) e avisa o usuário para recarregar/atualizar.
 */
export const APP_INFO = {
  /** Nome exibido do aplicativo */
  name: 'MovieFlix',
  /** Versão semântica atual (bate com android/app/build.gradle → versionName) */
  version: '2.1.0',
  /** Código de versão Android (bate com versionCode) */
  versionCode: 4,
  /** Data de lançamento desta versão (AAAA-MM-DD) */
  releaseDate: '2026-08-25',
  /** Resumo das mudanças desta versão (exibido na página de download) */
  changelog: [
    'Páginas exclusivas de Filmes e Séries com catálogo completo, busca e ordenação',
    'Catálogo prioriza qualidade (1080p/720p/4K/WEB-DL/BluRay), nunca CAM como principal',
    'Filmes ordenados por lançamento (mais recentes primeiro) com filtros (recentes, antigos, populares, avaliados, A-Z, Z-A)',
    'Busca inteligente (fuzzy search): aceita erros de digitação, palavras invertidas, título original, gênero e ano',
    'Player com controles de velocidade e suporte a qualidade/áudio/legenda quando disponível',
    'Navegação por controle remoto aprimorada em Smart TV / TV Box',
    'Bloqueio total e silencioso de anúncios e redirecionamentos',
  ],
  /** Plataformas suportadas */
  platforms: ['Android', 'Android TV', 'Google TV', 'TV Box'],
  /** Nome do arquivo do APK oficial (manter sincronizado com public/apk/) */
  apkFileName: 'MovieFlix-v2.1.0.apk',
} as const;

/** Caminho público do APK oficial dentro do app (servido pelo backend/static). */
export const APK_URL = `/apk/${APP_INFO.apkFileName}`;

/**
 * URL ABSOLUTA do APK (usada pelo QR code e por links externos).
 * O domínio oficial do site/app é a fonte única — se um dia mudar de host,
 * basta atualizar aqui (e em capacitor.config.ts / MainActivity).
 */
export const APK_ABSOLUTE_URL = `https://movieflix-bszf.onrender.com${APK_URL}`;

/** URL absoluta da página de download (usada como fallback do QR em iOS). */
export const DOWNLOAD_PAGE_URL = 'https://movieflix-bszf.onrender.com/#/baixar-app';

/** Tamanho do APK em MB (exibido na página de download). Mantido em sincronia com public/apk/MovieFlix-v2.1.0.apk (5.085.564 bytes ≈ 4.9 MB). */
export const APK_SIZE_MB = '4.9 MB';

/* ══════════════════════════════════════════════════════════════════════
   MOVIEFLIX TV — segundo app oficial (Android TV / Google TV / TV Box).
   App separado, com interface TV dedicada (rota #/tv) e APK próprio.
   ══════════════════════════════════════════════════════════════════════ */
export const TV_APP_INFO = {
  /** Nome exibido do aplicativo de TV */
  name: 'MovieFlix TV',
  /** Versão semântica atual (bate com movieflix-tv/android/app/build.gradle → versionName) */
  version: '1.5.0',
  /** Código de versão Android (bate com versionCode) */
  versionCode: 8,
  /** Data de lançamento desta versão (AAAA-MM-DD) */
  releaseDate: '2026-08-27',
  /** Resumo das mudanças desta versão (exibido na página de download) */
  changelog: [
    'NOVO VISUAL: identidade visual do site MovieFlix (preto/roxo/vermelho/branco/cinza) em todas as telas',
    'Logo oficial do MovieFlix (M) no Splash e na tela de Login',
    'Banner hero de destaque no topo da Home com backdrop, título e sinopse',
    'Cards maiores com cantos arredondados, badge "Dublado pt-BR" e foco com borda vermelha + escala',
    'Home reorganizada: Destaque, Filmes em alta, Lançamentos, Séries em alta e Categorias',
    'Aplicativo 100% NATIVO Android TV (Kotlin + Leanback + ExoPlayer) — sem WebView, sem site dentro do app',
    'Página completa de FILMES e SÉRIES com catálogo, categorias e ordenação por nota (navegação D-pad nativa)',
    'Seletor de TEMPORADA e EPISÓDIO nos detalhes das séries, com reprodução do episódio escolhido',
    'MINHA LISTA: adicionar/remover/abrir seus títulos salvos (mesma tabela favorites do site — Supabase)',
    'Player nativo com barra de progresso, play/pause, avançar/voltar 15s, volume, carregamento, erros com "Tentar de novo" e retomada local',
    'Login/cadastro com a MESMA conta do site (Supabase) — assinatura reconhecida automaticamente',
    'CORREÇÃO CRÍTICA: Home carregava vazia após o login — catálogo agora carrega filmes, séries e categorias corretamente',
  ],
  /** Plataformas suportadas */
  platforms: ['Android TV', 'Google TV', 'TV Box'],
  /** Nome do arquivo do APK oficial (manter sincronizado com public/apk/) */
  apkFileName: 'MovieFlixTV-v1.5.0.apk',
} as const;

/** Caminho público do APK do MovieFlix TV dentro do app (servido pelo backend/static). */
export const TV_APK_URL = `/apk/${TV_APP_INFO.apkFileName}`;

/** URL ABSOLUTA do APK do MovieFlix TV (usada pelo QR code e por links externos). */
export const TV_APK_ABSOLUTE_URL = `https://movieflix-bszf.onrender.com${TV_APK_URL}`;

/** Tamanho do APK do MovieFlix TV em MB (exibido na página de download). Mantido em sincronia com public/apk/MovieFlixTV-v1.5.0.apk (12.013.383 bytes ≈ 11,5 MB). */
export const TV_APK_SIZE_MB = '11,5 MB';

/** Chave usada no localStorage para lembrar a última versão vista pelo usuário. */
const VERSION_KEY = 'mf_last_seen_version';

/**
 * Lê a última versão que o usuário viu (ou null se nunca viu).
 * Usada pelo UpdateChecker para decidir se deve avisar "Nova versão disponível".
 */
export function ultimaVersaoVista(): string | null {
  try {
    return localStorage.getItem(VERSION_KEY);
  } catch {
    return null;
  }
}

/** Marca a versão atual como vista (chamado ao dispensar o aviso de atualização). */
export function marcarVersaoVista(versao: string = APP_INFO.version): void {
  try {
    localStorage.setItem(VERSION_KEY, versao);
  } catch {
    /* storage indisponível — ignora */
  }
}

/**
 * Compara versões semânticas (ex.: "2.0.0" > "1.1.0").
 * Retorna true se `atual` é mais nova que `base`.
 */
export function versaoMaisNova(atual: string, base: string): boolean {
  const parse = (v: string) => String(v).split('.').map((n) => {
    const x = parseInt(n, 10);
    return Number.isFinite(x) ? x : 0;
  });
  const a = parse(atual);
  const b = parse(base);
  for (let i = 0; i < 3; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv;
  }
  return false;
}

/** A versão atual é mais nova que a última vista pelo usuário? */
export function haVersaoNova(): boolean {
  const vista = ultimaVersaoVista();
  if (!vista) return false; // primeira visita: não incomoda com aviso
  return versaoMaisNova(APP_INFO.version, vista);
}
