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
  version: '2.1.1',
  /** Código de versão Android (bate com versionCode) */
  versionCode: 5,
  /** Data de lançamento desta versão (AAAA-MM-DD) */
  releaseDate: '2026-08-28',
  /** Resumo das mudanças desta versão (exibido na página de download) */
  changelog: [
    'Correção: botão de tela cheia (fullscreen) do player agora funciona no app',
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
  apkFileName: 'MovieFlix-v2.1.1.apk',
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

/** Tamanho do APK em MB (exibido na página de download). Mantido em sincronia com public/apk/MovieFlix-v2.1.1.apk. */
export const APK_SIZE_MB = '4.9 MB';

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