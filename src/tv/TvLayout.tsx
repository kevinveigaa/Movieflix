import { useEffect, useState, type ReactNode } from 'react';
import { TvSidebar } from './TvSidebar';
import { TvMark } from './TvBrand';
import { cn } from '@/lib/cn';

/**
 * TvLayout — moldura da experiência MovieFlix TV.
 *
 * AUDITORIA / CAUSA RAIZ (versão anterior): a versão anterior usava um CABEÇALHO
 * HORIZONTAL no topo, que consumia a largura útil e deixava poucas colunas de
 * cards. Agora a navegação é uma RAIL LATERAL ESQUERDA fixa (padrão de
 * streaming para TV, com a identidade MovieFlix: item ativo no gradiente
 * vermelho→roxo e o símbolo "M" oficial no topo).
 *
 * FOCO / D-PAD — O QUE MUDOU NESTA VERSÃO (e por que)
 * ════════════════════════════════════════════════════════════════════════════
 * Esta moldura mantinha uma RECUPERAÇÃO AUTOMÁTICA DE FOCO por timer, disparada
 * em CINCO instantes após o splash: 250, 700, 1300, 2100 e 3200 ms.
 *
 * Esse mecanismo era a causa raiz de boa parte do bug "o foco sai do campo
 * antes de eu digitar":
 *   • qualquer um desses timers que disparasse enquanto o usuário digitava
 *     movia o foco para outro elemento (as versões anteriores tentaram conter
 *     isso com condições — `focoDoUsuario`, `data-tv-sem-autofoco` — que eram
 *     remendos em cima de um mecanismo que não deveria existir);
 *   • e, pior, ele competia com o foco inicial das telas: quem chegasse
 *     primeiro vencia, o que tornava o comportamento imprevisível justamente
 *     na descida card → detalhes.
 *
 * Ele foi REMOVIDO. O foco inicial passou a ser responsabilidade DETERMINÍSTICA
 * de cada tela, que o coloca no elemento marcado com `data-tv-initial-focus`
 * via `useTvScreenFocus` (ver `src/tv/useTvScreenFocus.ts`):
 *   • na tela de detalhes, no botão "Assistir" — o requisito explícito do dono;
 *   • nas grades, no primeiro card.
 *
 * Consequência prática para o requisito "card → detalhes → assistir só com o
 * controle": o foco chega nos detalhes JÁ no botão de assistir, sem esperar
 * timer nenhum e sem ninguém disputando. E, como não há mais nenhum timer
 * global de foco, nada pode roubar o foco de um campo de texto em nenhuma tela
 * (o login, inclusive).
 */

export function TvLayout({ children, imersivo = false }: { children: ReactNode; imersivo?: boolean }) {
  const [splash, setSplash] = useState(true);

  useEffect(() => {
    // Splash curto: é só identidade visual — NÃO agenda foco.
    const t = window.setTimeout(() => setSplash(false), 900);
    return () => window.clearTimeout(t);
  }, []);

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
