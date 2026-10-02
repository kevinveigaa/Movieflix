/**
 * MovieFlix — ÁREA PRIVADA (acesso por LINK SECRETO).
 * ════════════════════════════════════════════════════════════════════════════
 * Esta é a área PESSOAL do dono do site. Ela NÃO aparece em nenhum menu,
 * header, footer, home, sitemap.xml ou robots.txt — a única forma de chegar
 * até ela é conhecendo a URL secreta abaixo.
 *
 * ── POR QUE O CAMINHO TEM DOIS FORMATOS ────────────────────────────────────
 * O site usa HashRouter (react-router-dom). O caminho da rota é `/p/:slug`,
 * então o formato canônico é `/#/p/<slug>`. Para o dono não precisar decorar
 * o `#`, o index.html contém um redirecionamento que leva `/p/<slug>` (formato
 * limpo) para `/#/p/<slug>`. As duas URLs abrem a MESMA página.
 *
 * ── O QUE NÃO FAZER (regras de segurança desta área) ───────────────────────
 *   1. NUNCA crie um <Link>/<a> para ela em qualquer página, menu ou rodapé.
 *   2. NUNCA coloque o slug em public/ (sitemap.xml, robots.txt, manifest,
 *      version.json, catálogos .json, etc.) — só em arquivos do bundle.
 *   3. A página se marca com `noindex, nofollow` para não entrar no Google.
 *
 * ⚠️ O slug é o único segredo. Para "revogar" o acesso, troque o valor de
 *    AREA_PRIVADA_SLUG por um novo slug aleatório e publique de novo.
 */

/** Slug secreto e difícil de adivinhar da área privada. */
export const AREA_PRIVADA_SLUG = 'mg-e26b91233c639343';

/** Domínio público do site (fonte única para montar as URLs absolutas). */
export const SITE_ORIGIN = 'https://movieflix-bszf.onrender.com';

/** Caminho da rota no react-router (HashRouter). */
export const AREA_PRIVADA_PATH = `/p/${AREA_PRIVADA_SLUG}`;

/** URL canônica (com `#`) — é esta que deve ser guardada e compartilhada. */
export const AREA_PRIVADA_URL = `${SITE_ORIGIN}/#${AREA_PRIVADA_PATH}`;

/** URL "limpa" (sem `#`) — funciona porque o index.html redireciona para a canônica. */
export const AREA_PRIVADA_CLEAN_URL = `${SITE_ORIGIN}${AREA_PRIVADA_PATH}`;

/**
 * APK "MEU GANHO" v1.0.0 — metadados conferidos no arquivo real publicado
 * (sha256, md5 e tamanho em bytes conferem com public/apk/meu-ganho-v1.0.0.apk).
 */
export const MEU_GANHO_APK = {
  nome: 'MEU GANHO',
  versao: '1.0.0',
  arquivo: 'meu-ganho-v1.0.0.apk',
  tamanhoBytes: 2368670,
  tamanhoLabel: '2,3 MB',
  sha256: '1039fdd295d5fcea16e28594f1f8bda4014b038080666fec775b82f0517839a7',
  md5: '4df0cdd979659ecfe4efaffeddfee3af',
  releaseDate: '2026-10-01',
  pacote: 'com.meuganho.app',
} as const;

/** Caminho público do APK dentro do site (servido pelo backend em /apk/). */
export const MEU_GANHO_APK_URL = `/apk/${MEU_GANHO_APK.arquivo}`;

/** URL absoluta do APK no domínio do site — usada pelo botão e pelo QR code. */
export const MEU_GANHO_APK_ABSOLUTE_URL = `${SITE_ORIGIN}${MEU_GANHO_APK_URL}`;

/** Espelho (CDN) do mesmo APK — link secundário, caso o site esteja fora do ar. */
export const MEU_GANHO_APK_MIRROR_URL =
  'https://static.teamily.ai/sites/e2606ed0-028d-4e1c-b0b3-5d16284e8e57/documents/meu-ganho/meu-ganho-v1.0.0.apk';
