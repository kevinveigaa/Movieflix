/**
 * MovieFlix — ÁREA DE PROJETOS (rota /projetos).
 * ══════════════════════════════════════════════════════════════════════════
 * Página PESSOAL de projetos do proprietário. Ela NÃO aparece em nenhum menu,
 * header, footer, home, sitemap.xml ou robots.txt — a única forma de chegar
 * até ela é digitando a URL direto (`/projetos`).
 *
 * ── O QUE NÃO FAZER (regras desta área) ───────────────────────────────────
 *   1. NUNCA crie um <Link>/<a> para `/projetos` em qualquer página pública.
 *   2. NUNCA coloque `/projetos` em public/ (sitemap.xml, robots.txt, manifest).
 *   3. A página se marca com `noindex, nofollow` para não entrar no Google.
 *
 * ── APK DO MEU GANHO ──────────────────────────────────────────────────────
 * O APK fica em `public/apk/` e é servido pelo próprio domínio do site
 * (`/apk/MeuGanho-<versao>.apk`). Para publicar uma versão nova, basta:
 *   1. copiar o novo APK para `public/apk/MeuGanho-<nova-versao>.apk`;
 *   2. adicionar uma entrada no topo de `MEU_GANHO_VERSOES` abaixo.
 * O botão de download sempre aponta para a versão mais recente da lista.
 */

/** Domínio público do site (fonte única para montar as URLs absolutas). */
export const SITE_ORIGIN = 'https://movieflix-bszf.onrender.com';

/** Caminho da rota no react-router (HashRouter). */
export const PROJETOS_PATH = '/projetos';

/** URL canônica (com `#`) — é esta que deve ser guardada e compartilhada. */
export const PROJETOS_URL = `${SITE_ORIGIN}/#${PROJETOS_PATH}`;

/** URL "limpa" (sem `#`) — funciona porque o index.html redireciona para a canônica. */
export const PROJETOS_CLEAN_URL = `${SITE_ORIGIN}${PROJETOS_PATH}`;

export interface ApkVersion {
  /** Versão exibida (ex.: "1.0.0"). */
  versao: string;
  /** Nome do arquivo dentro de public/apk/. */
  arquivo: string;
  /** Tamanho em bytes (conferido no arquivo real). */
  tamanhoBytes: number;
  /** Tamanho legível (ex.: "2,3 MB"). */
  tamanhoLabel: string;
  /** SHA-256 do arquivo (integridade). */
  sha256: string;
  /** Data de lançamento (ISO). */
  releaseDate: string;
  /** Nome do pacote Android. */
  pacote: string;
  /** Notas da versão (opcional). */
  notas?: string;
}

/**
 * Histórico de versões do MEU GANHO — a MAIS RECENTE primeiro.
 * O botão de download usa sempre `MEU_GANHO_VERSOES[0]`.
 */
export const MEU_GANHO_VERSOES: ApkVersion[] = [
  {
    versao: '1.0.0',
    arquivo: 'MeuGanho-1.0.0.apk',
    tamanhoBytes: 2359806,
    tamanhoLabel: '2,3 MB',
    sha256: '119d3f77d5e0c1a58ef27d56a5afbd08b490573a3efb057b922519b8e87e1324',
    releaseDate: '2026-10-02',
    pacote: 'com.meuganho.app',
    notas: 'Primeira versão: entradas, gastos, categorias, metas, distribuição, calendário, relatórios e backup.',
  },
];

/** Versão atual (a mais recente). */
export const MEU_GANHO_ATUAL: ApkVersion = MEU_GANHO_VERSOES[0];

/** Pasta pública dos APKs do MEU GANHO dentro do site. */
export const MEU_GANHO_APK_DIR = '/apk/meu-ganho';

/** Caminho público do APK dentro do site (servido pelo backend/estático em /apk/). */
export const MEU_GANHO_APK_URL = `${MEU_GANHO_APK_DIR}/${MEU_GANHO_ATUAL.arquivo}`;

/** URL absoluta do APK no domínio do site — usada pelo botão e pelo QR code. */
export const MEU_GANHO_APK_ABSOLUTE_URL = `${SITE_ORIGIN}${MEU_GANHO_APK_URL}`;

/** Espelho (CDN) do mesmo APK — link secundário, caso o site esteja fora do ar. */
export const MEU_GANHO_APK_MIRROR_URL =
  'https://static.teamily.ai/sites/e2606ed0-028d-4e1c-b0b3-5d16284e8e57/documents/meu-ganho/meu-ganho-v1.0.0.apk';
