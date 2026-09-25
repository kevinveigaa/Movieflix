/**
 * MovieFlix — MARCADOR DE BUILD do site.
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO EXISTE (causa raiz nº 1 do problema relatado)
 *
 * O dono relata há três rodadas que "a correção funciona no navegador e não no
 * aparelho". A auditoria confirmou que o motivo NÃO era o código: o site
 * publicado em produção estava servindo um build de 23/09 — todas as correções
 * de foco de 24/09 estavam no Git, mas NUNCA chegaram ao ar.
 *
 * O sintoma de um deploy parado é indistinguível, de fora, de um bug de código.
 * Este módulo elimina essa ambiguidade: o build carrega a sua IDENTIDADE
 * (commit + data + versão), que é
 *   • publicada como arquivo estático auditável em `/version.json`
 *     (gerado por `scripts/version.mjs` → não passa pelo servidor Node);
 *   • gravada no console do navegador/TV ao carregar;
 *   • anunciada ao shell nativo pela ponte (ver TvApp).
 *
 * Com isso, a pergunta "qual build a TV está executando?" passa a ter uma
 * resposta direta:
 *
 *     curl -s https://movieflix-bszf.onrender.com/version.json
 *
 * e o `npm run verificar:deploy` compara esse conteúdo com o commit local.
 */

const env = (import.meta.env ?? {}) as Record<string, string | undefined>;

/** Identidade do build que está rodando. Preenchida em tempo de build. */
export const BUILD_INFO = {
  /** Versão do produto de TV (acompanha TV_APP_INFO.version). */
  version: env.VITE_APP_VERSION ?? '4.0.3',
  /** Commit curto (7 caracteres) do build. */
  commit: env.VITE_BUILD_COMMIT ?? 'local',
  /** Branch de origem do build. */
  branch: env.VITE_BUILD_BRANCH ?? 'local',
  /** Instante do build (ISO 8601, UTC). */
  buildTime: env.VITE_BUILD_TIME ?? '',
} as const;

/** Texto de uma linha, útil para log/relatório. */
export function buildLabel(): string {
  return `MovieFlix build ${BUILD_INFO.commit} (v${BUILD_INFO.version})${BUILD_INFO.buildTime ? ` — ${BUILD_INFO.buildTime}` : ''}`;
}

/**
 * Escreve a identidade do build no console.
 *
 * É o que permite ao usuário (ou a quem estiver dando suporte pelo WhatsApp)
 * responder em 5 segundos "o app está rodando o build novo ou o antigo?" —
 * sem precisar abrir o DevTools remoto da TV.
 */
export function registrarBuildNoConsole(): void {
  try {
    // eslint-disable-next-line no-console
    console.info(
      `%c${buildLabel()}`,
      'background:#DF0A15;color:#fff;padding:2px 6px;border-radius:4px;font-weight:600',
    );
  } catch {
    /* console indisponível: nada a fazer */
  }
}
