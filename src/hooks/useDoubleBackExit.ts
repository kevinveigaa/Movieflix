import { useEffect } from 'react';
import {
  instalarGuardDeSalida,
  pedirSaidaPorTecla,
  sairDeVerdade,
} from '@/lib/doubleBackExit';

/**
 * MovieFlix — Hook "duplo-back para sair" (PC + TV + APK).
 *
 * Comportamento:
 * - PC (navegador): o guard de histórico intercepta o botão "voltar" do
 *   navegador quando o usuário está na raiz do app. 1ª pulsação = aviso sutil
 *   "Pulsa de novo para sair"; 2ª pulsação (≤2s) = sai do site.
 *   Dentro do site (rota ≠ raiz), voltar continua navegando com UM clique.
 * - TV (controle remoto): o hook fica ouvindo a tecla Voltar em fase de
 *   captura, ANTES do useTvNavigation (que é registrado depois, no App).
 *   Quando o foco está na página (não no player) e a rota é a raiz, a tecla
 *   é capturada aqui: 1ª pulsação = aviso; 2ª = sai. Navegação interna do
 *   site continua com um clique (o evento não é interrompido).
 * - APK: o mesmo código JS roda no WebView + o MainActivity tem o bridge
 *   `MovieFlixAndroid.exitApp()` chamado por `sairDeVerdade()` quando o
 *   duplo-back é confirmado.
 *
 * Nada aqui mostra "bloqueado": o único feedback é o aviso discreto de
 * "Pulsa de novo para sair" (padrão Android, some sozinho).
 */
export function useDoubleBackExit(): void {
  useEffect(() => {
    const limparGuard = instalarGuardDeSalida();

    // Tecla Voltar em fase de captura (roda ANTES do useTvNavigation, que é
    // registrado depois no App — a captura desce do ancestral ao descendente,
    // então este listener vê a tecla primeiro).
    let ultimoBack = 0;

    function onKeyDown(e: KeyboardEvent): void {
      const k = e.key;
      const c = e.keyCode || e.which;
      const ehVoltar =
        k === 'GoBack' ||
        k === 'BrowserBack' ||
        k === 'XF86Back' ||
        k === 'Escape' ||
        k === 'Backspace' ||
        c === 8 ||
        c === 27 ||
        c === 461 ||
        c === 10009 ||
        c === 166 ||
        c === 4;
      if (!ehVoltar) return;

      // Nunca intercepta enquanto o usuário digita num campo (Backspace).
      const ativo = document.activeElement as HTMLElement | null;
      const digitando =
        !!ativo &&
        (ativo.tagName === 'INPUT' ||
          ativo.tagName === 'TEXTAREA' ||
          ativo.isContentEditable);
      if (digitando && (k === 'Backspace' || c === 8)) return;

      // Só aplica o duplo-back quando estamos na RAIZ do app (já não há para
      // onde voltar dentro do site). Em qualquer outra rota, o back interno
      // (useTvNavigation / navegador) continua com um clique.
      const naRaiz =
        window.location.hash === '' ||
        window.location.hash === '#' ||
        window.location.hash === '#/';

      // Dentro do player (rota /assistir): nunca intercepta — o player tem o
      // próprio fluxo de voltar (sai do modo controle / volta para a página
      // anterior). O guard de histórico ainda protege contra SAIR do app.
      if (/\/assistir\//.test(window.location.hash)) return;

      if (!naRaiz) return;

      // Na raiz: exige duplo-back.
      const agora = Date.now();
      if (agora - ultimoBack < 2000) {
        ultimoBack = 0;
        e.preventDefault();
        e.stopPropagation();
        sairDeVerdade();
        return;
      }
      ultimoBack = agora;
      e.preventDefault();
      e.stopPropagation();
      // O hook só mostra o aviso; pedirSaidaPorTecla cuida do texto.
      // (Aqui usamos a função do lib para manter a janela consistente.)
      import('@/lib/doubleBackExit').then((m) => m.mostrarAvisoSair());
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      limparGuard();
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}
