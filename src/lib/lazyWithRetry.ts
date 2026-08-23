import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'mf:chunk-reloaded';

/**
 * React.lazy com recuperação automática de chunk quebrado.
 *
 * Depois de um novo deploy, os arquivos JS antigos deixam de existir no
 * servidor. Uma aba que ficou aberta tenta baixar o chunk antigo, recebe 404
 * e o React derruba a árvore inteira -> tela preta.
 * Aqui, nesse caso específico, recarregamos a página uma única vez para
 * pegar a versão nova. Qualquer outro erro sobe para o ErrorBoundary.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_KEY);
      return mod;
    } catch (erro) {
      const msg = String((erro as Error)?.message ?? erro);
      const chunkQuebrado =
        /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError/i.test(msg);

      if (chunkQuebrado && sessionStorage.getItem(RELOAD_KEY) !== '1') {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
        // Espera o reload acontecer sem renderizar nada quebrado.
        return new Promise<{ default: T }>(() => {});
      }
      throw erro;
    }
  });
}
