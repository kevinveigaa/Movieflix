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
    versao: '1.0.4',
    arquivo: 'MeuGanho-1.0.4.apk',
    tamanhoBytes: 2366842,
    tamanhoLabel: '2,3 MB',
    sha256: 'da793c0131919859979af344b740790f9a3dbbd2182d411f744750b99dbef269',
    releaseDate: '2026-10-02',
    pacote: 'com.meuganho.app',
    notas: 'Gastos agora descontam da categoria escolhida: ao registrar um gasto, o valor sai do saldo dispon\u00edvel daquela categoria (or\u00e7amento \u2212 gasto) e o Dashboard atualiza na hora. Nova aba CATEGORIAS com acompanhamento mensal por categoria: or\u00e7amento, gasto, restante, % usado e % restante, com barra de progresso. Editar, excluir ou trocar a categoria de um gasto recalcula tudo automaticamente, respeitando o m\u00eas/ano selecionado.',
  },
  {
    versao: '1.0.3',
    arquivo: 'MeuGanho-1.0.3.apk',
    tamanhoBytes: 2365978,
    tamanhoLabel: '2,3 MB',
    sha256: 'dfbaf09526a764d5b49ba7988974fabb63f9e027ee05cc221ffca24314582337',
    releaseDate: '2026-10-02',
    pacote: 'com.meuganho.app',
    notas: 'Um \u00fanico bot\u00e3o + ADICIONAR: o formul\u00e1rio do dia agora tem Faturamento total + Combust\u00edvel no MESMO lan\u00e7amento. O combust\u00edvel \u00e9 descontado ANTES de qualquer divis\u00e3o (base = faturamento \u2212 combust\u00edvel) e s\u00f3 depois o valor l\u00edquido \u00e9 distribu\u00eddo nas categorias. Editar/excluir o lan\u00e7amento recalcula tudo automaticamente.',
  },
  {
    versao: '1.0.2',
    arquivo: 'MeuGanho-1.0.2.apk',
    tamanhoBytes: 2364970,
    tamanhoLabel: '2,3 MB',
    sha256: '3c5aa42c2de730d5a796bb30f25936a2bcfc804726c4c1b1bf74070eb22d69ed',
    releaseDate: '2026-10-02',
    pacote: 'com.meuganho.app',
    notas: 'Regra do combust\u00edvel: o combust\u00edvel \u00e9 descontado PRIMEIRO da entrada bruta e a distribui\u00e7\u00e3o (dispon\u00edvel/reservado) passa a ser calculada sobre entradas \u2212 combust\u00edvel. Bot\u00e3o + ADICIONAR com escolha Entrada/Gasto, combust\u00edvel separado (hoje/semana/m\u00eas/ano) e relat\u00f3rio anual com total de combust\u00edvel.',
  },
  {
    versao: '1.0.1',
    arquivo: 'MeuGanho-1.0.1.apk',
    tamanhoBytes: 2363902,
    tamanhoLabel: '2,3 MB',
    sha256: 'ebbb50833fc5ecece4b138865467f24895e42850527d22d8e31ae4b9e400ccfb',
    releaseDate: '2026-10-02',
    pacote: 'com.meuganho.app',
    notas: 'Correção do sistema de lançamentos: registrar entradas e gastos em QUALQUER dia, editar e excluir depois, com data própria e persistência. Faixa de dias do mês, card do dia, edição/exclusão no calendário e recálculo automático de totais, metas e gráficos.',
  },
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
  'https://static.teamily.ai/sites/50bf53f0-23a0-4805-9dea-6346b8a066db/documents/meuganho-104/MeuGanho-1.0.4.apk';
