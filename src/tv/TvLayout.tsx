import { useEffect, useState, type ReactNode } from 'react';
import { TvSidebar } from './TvSidebar';
import { TvMark } from './TvBrand';
import { cn } from '@/lib/cn';

/**
 * TvLayout — moldura da experiência MovieFlix TV.
 *
 * AUDITORIA / CAUSA RAIZ: a versão anterior usava um CABEÇALHO HORIZONTAL no
 * topo (`.tv-header`), com logo + navegação em linha. O resultado era lido como
 * "barra de navegação de celular/site" e, principalmente, consumia a largura
 * útil: a grade ficava com poucas colunas e os cards grandes.
 *
 * Agora a navegação é uma RAIL LATERAL ESQUERDA fixa (padrão de streaming para
 * TV, mas com a identidade MovieFlix: item ativo no gradiente vermelho→roxo,
 * foco com o anel da marca, símbolo "M" oficial no topo). A área de conteúdo
 * ganha a tela inteira e passa a acomodar mais cards por linha.
 *
 * FOCO / D-PAD:
 *  - Ao entrar numa tela, o foco vai para o CONTEÚDO (o destaque/cards), não
 *    para o menu — é o que o usuário espera ao abrir um app de TV.
 *  - Setas ESQUERDA a partir do primeiro elemento de uma linha devolvem o foco
 *    ao item ativo da sidebar, que é sempre alcançável (nada de foco perdido).
 *  - O BACK é tratado por `useTvNavigation` (botão Voltar do controle).
 *
 * MODO IMERSIVO (`imersivo`): no PLAYER a rail desaparece e o vídeo ocupa a
 * tela inteira — é a experiência de cinema esperada numa TV.
 */
const TENTATIVAS_FOCO = [250, 700, 1300, 2100, 3200];

/**
 * O foco está em algo que o USUÁRIO escolheu (campo de texto ou formulário de
 * TV)? Nesse caso a recuperação automática de foco NÃO pode agir — ela movia o
 * foco para o elemento inicial enquanto o usuário digitava no login.
 */
function focoDoUsuario(): boolean {
  const ativo = document.activeElement as HTMLElement | null;
  if (!ativo || ativo === document.body) return false;
  if (ativo.closest?.('[data-tv-form]')) return true;
  const tag = ativo.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || ativo.isContentEditable === true;
}

export function TvLayout({ children, imersivo = false }: { children: ReactNode; imersivo?: boolean }) {
  const [splash, setSplash] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setSplash(false), 900);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (splash) return;
    const timers = TENTATIVAS_FOCO.map((ms) =>
      window.setTimeout(() => {
        // Nunca mexe no foco quando o usuário está num campo de texto/formulário.
        if (focoDoUsuario()) return;
        const ativo = document.activeElement as HTMLElement | null;
        // Só assume o foco se ele se perdeu (ou nunca aconteceu).
        if (ativo && ativo !== document.body && ativo.getBoundingClientRect().width > 0) return;
        const preferido = document.querySelector<HTMLElement>('[data-tv-initial-focus]');
        const alvo =
          preferido ??
          document.querySelector<HTMLElement>('.tv-content [data-tv-focusable]') ??
          document.querySelector<HTMLElement>('.tv-nav-rail [data-tv-focusable]');
        alvo?.focus({ preventScroll: true });
      }, ms),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [splash]);

  if (splash) {
    return (
      <div className="tv-splash">
        <div className="tv-splash-logo">
          {/* Símbolo "M" oficial — o mesmo asset do ícone do app/site. */}
          <TvMark className="tv-splash-img" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('tv-shell', imersivo && 'tv-shell-imersivo')}>
      {imersivo ? null : <TvSidebar />}
      <main className="tv-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
