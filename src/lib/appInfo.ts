/**
 * MovieFlix — Configuração oficial do aplicativo Android.
 *
 * Centraliza TODOS os dados de versão e download do APK em UM único lugar,
 * para que futuras atualizações só precisem alterar este arquivo
 * (e colocar o novo arquivo em public/apk/).
 *
 * ══ SISTEMA DE VERSÃO (pedido do dono) ═════════════════════════════════
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
  version: '3.4.1',
  /** Código de versão Android (bate com versionCode) */
  versionCode: 10,
  /** Data de lançamento desta versão (AAAA-MM-DD) */
  releaseDate: '2026-09-20',
  /** Resumo das mudanças desta versão (exibido na página de download) */
  changelog: [
    'Proteção nativa contra anúncios, popups e redirecionamentos do player (você não sai mais da tela)',
    'App WebView profissional que carrega o site MovieFlix exatamente como ele é (mesma UI, mesmos filmes, mesmas telas)',
    'WhatsApp abre nativamente com número e mensagem pré-preenchida em todos os botões (assinar, trocar, renovar, suporte)',
    'Player de vídeo, tela cheia, áudio e links externos funcionando dentro do app',
    'Login e sessão mantidos (cookies/localStorage) — não precisa logar de novo a cada abertura',
    'Botão voltar inteligente: sai da tela cheia → volta na página → sai do app',
    'Tela de carregamento com o logo e tela de erro com "Tentar novamente"',
  ],
  /** Plataformas suportadas */
  platforms: ['Android', 'Android TV', 'Google TV', 'TV Box'],
  /** Nome do arquivo do APK oficial (manter sincronizado com public/apk/) */
  apkFileName: 'MovieFlix-v3.4.1.apk',
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

/** Tamanho do APK em MB (exibido na página de download). Mantido em sincronia com public/apk/MovieFlix-v3.4.1.apk. */
export const APK_SIZE_MB = '10.4 MB';

/**
 * ── MovieFlix TV (Android TV / Google TV / TV Box) ──
 *
 * App Android para televisão (package com.movieflix.tv) que carrega a
 * EXPERIÊNCIA TV do MovieFlix — a MESMA aplicação do site e do app mobile
 * (mesma conta Supabase, mesmo catálogo, mesmos planos, mesmos favoritos,
 * mesmo histórico), com a interface adaptada para TV 16:9 e controle remoto
 * (D-pad). Não existe catálogo, backend ou JSON paralelo.
 *
 * O shell é um WebView do domínio oficial já usado pelo app mobile, então as
 * correções de catálogo e player chegam à TV sem exigir um novo APK. O app
 * mobile não foi alterado.
 */
export const TV_APP_INFO = {
  name: 'MovieFlix TV',
  version: '4.0.1',
  versionCode: 41,
  /** Arquivo do APK TV em public/apk/ (mesma pasta servida em /apk/) */
  apkFileName: 'MovieFlix-TV-v4.0.1.apk',
  /** Tamanho exibido (sincronizado com public/apk/MovieFlix-TV-v4.0.1.apk) */
  sizeMB: '7.8 MB',
  package: 'com.movieflix.tv',
  releaseDate: '2026-09-23',
  changelog: [
    'Interface TV reconstruída: cabeçalho horizontal com a logo oficial, fundo preto e o vermelho da marca (fim do visual roxo genérico)',
    'Cards redesenhados e menores — cerca de 6 a 8 títulos por linha em 16:9, no lugar de poucos cards gigantes',
    'Home preenchida com dados reais: destaque, Continuar assistindo, Em alta, Lançamentos, Filmes, Séries e categorias',
    'Filmes e séries passaram a carregar em blocos (o catálogo tem ~18 mil títulos) — a tela não trava mais e o catálogo aparece',
    'Correção do "Continuar assistindo": o mesmo título não é mais exibido repetido quando há vários episódios assistidos',
    'Player com a mesma fonte do app mobile (embed em iframe) — fim da tela "Este link só funciona dentro de um iframe"',
    'Player limpo para TV: controles ocultos durante a reprodução e "Próximo episódio" só quando realmente existe',
    'Navegação 100% por controle remoto em todas as telas, com foco sempre visível',
    'PLAYER: fim do redirecionamento de anúncio e da saída para fora do app — o embed do provedor e a verificação Cloudflare permanecem dentro da TV, como no mobile',
    'PLAYER: interagir (OK, setas ou toque) nunca mais fecha a reprodução — abre/fecha os controles e nada mais',
    'PLAYER: BACK hierárquico — 1ª pulsação fecha os controles, 2ª volta aos detalhes; o app nunca fecha sozinho',
    'PLAYER: botão de tela cheia duplicado removido — agora existe apenas UM botão, alcançável pelo controle remoto (o do embed, fora do D-pad, saiu)',
    'PLAYER: o passo "Abrir link" do provedor é acionado automaticamente assim que aparece — antes o usuário ficava preso na tela intermediária, porque na TV não existe o toque que o mobile usa',
    'LOGIN: digitação restaurada pela TV — o campo abre o teclado da própria TV (Android TV / Google TV) ao apertar OK, e a tecla deixa de ser capturada como navegação',
    'LOGIN: correção do foco que escapava — apertar OK no e-mail não pula mais para a senha; o foco permanece no campo para digitar, e o teclado da tela passa a abrir automaticamente quando a TV não tem o teclado do sistema',
    'PLAYER: avançar/retroceder pelo controle passou a funcionar de verdade — os comandos de seek agora usam os nomes que os players reconhecem (antes eram ignorados em silêncio)',
  ],
  platforms: ['Android TV', 'Google TV', 'TV Box'],
} as const;

/** Caminho público do APK TV dentro do app (servido pelo backend em /apk/). */
export const TV_APK_URL = `/apk/${TV_APP_INFO.apkFileName}`;

/** URL ABSOLUTA do APK TV (para links diretos / QR code). */
export const TV_APK_ABSOLUTE_URL = `https://movieflix-bszf.onrender.com${TV_APK_URL}`;

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