/**
 * MovieFlix — MINHAS FINANÇAS (aplicativo INDEPENDENTE dentro de /projetos).
 * ────────────────────────────────────────────────────────────────────────
 * Este módulo é COMPLETAMENTE SEPARADO de `projetos.ts` (que cuida do MEU GANHO).
 * Nenhum arquivo, constante ou APK do MEU GANHO é tocado por aqui. Os dois
 * aplicativos coexistem na mesma página /projetos, mas com dados e código próprios:
 *   • MEU GANHO       → com.meuganho.app         → public/apk/meu-ganho/
 *   • MINHAS FINANÇAS → com.minhasfinancas.app   → public/apk/minhas-financas/
 * No aparelho, cada app usa um banco SQLite exclusivo, então os dados NUNCA se
 * misturam.
 *
 * Publicar uma versão nova:
 *   1. copiar o APK para `public/apk/minhas-financas/MinhasFinancas-<versao>.apk`;
 *   2. atualizar `MF_ATUAL` abaixo (versão, tamanho real, sha256, data).
 */

import { SITE_ORIGIN } from './projetos';

/** Caminho da pasta pública dos APKs do Minhas Finanças. */
export const MF_APK_DIR = '/apk/minhas-financas';

/** Versão atual do aplicativo. */
export const MF_ATUAL = {
  versao: '1.0.0',
  arquivo: 'MinhasFinancas-1.0.0.apk',
  tamanhoBytes: 2381942,
  tamanhoLabel: '2,3 MB',
  sha256: 'a4d700bc675c1c2b4ef985af20b8194e8770c1f29a726d1b0d343f613b644d91',
  releaseDate: '2026-10-04',
  pacote: 'com.minhasfinancas.app',
  android: 'Android 7.0+',
  notas:
    'Primeira versão: salário (dia 5 e dia 20), comissões, distribuição automática com validação de 100%, categorias personalizáveis, saldo negativo compensado e carregado entre meses, reserva, múltiplas metas, VR, gastos, despesas recorrentes (pendente/pago), histórico, calendário, gráficos, relatórios, notificações e backup JSON/CSV.',
};

/** Caminho público do APK dentro do site. */
export const MF_APK_URL = `${MF_APK_DIR}/${MF_ATUAL.arquivo}`;

/** URL absoluta do APK — usada pelo botão de download e pelo QR code. */
export const MF_APK_ABSOLUTE_URL = `${SITE_ORIGIN}${MF_APK_URL}`;

/** Espelho (CDN) do mesmo APK — link secundário. */
export const MF_APK_MIRROR_URL =
  'https://static.teamily.ai/sites/e2606ed0-028d-4e1c-b0b3-5d16284e8e57/documents/minhas-financas/MinhasFinancas-1.0.0.apk';

/** Logo próprio (M roxo) — arquivo independente, não reaproveita o logo do Meu Ganho. */
export const MF_LOGO = '/minhas-financas-logo.svg';

export const MF_RECURSOS: { emoji: string; texto: string }[] = [
  { emoji: '💰', texto: 'Salário em dois períodos (dia 5 e dia 20) + comissões registradas manualmente' },
  { emoji: '⚖️', texto: 'Distribuição automática com validação de 100% e percentuais editáveis' },
  { emoji: '🔒', texto: 'Reserva que acumula mês a mês (sem botão de saque)' },
  { emoji: '🎯', texto: 'Várias metas ao mesmo tempo, com progresso e valor recomendado por mês' },
  { emoji: '🍽️', texto: 'VR separado do dinheiro normal: recebido, gasto, restante e progresso' },
  { emoji: '⚠️', texto: 'Saldo negativo nunca é apagado — é compensado e carregado para o mês seguinte' },
  { emoji: '🔔', texto: 'Notificações locais configuráveis (contas, dia 5/20, comissão, metas)' },
  { emoji: '💾', texto: 'Backup em JSON e CSV — local, offline, sem login e sem servidor' },
];
