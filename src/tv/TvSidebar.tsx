import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Clapperboard,
  Tv as TvIcon,
  Search,
  Heart,
  Clock,
  Crown,
  User,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TvMark } from './TvBrand';
import { cn } from '@/lib/cn';

/**
 * TvSidebar — navegação LATERAL ESQUERDA do MovieFlix TV.
 *
 * POR QUE LATERAL (e não no topo): a auditoria mostrou que o cabeçalho horizontal
 * era lido como "barra de celular/site" e consumia a largura que a grade de
 * pôsteres precisa. Em 16:9, uma coluna estreita à esquerda é o padrão de
 * streaming para TV e devolve a área útil inteira para o conteúdo.
 *
 * IDENTIDADE: não é uma sidebar genérica de Android TV. O item ATIVO usa o
 * gradiente oficial vermelho→roxo do site (`--mf-grad`), o foco do controle usa
 * o anel da marca, e o topo traz o SÍMBOLO "M" real (public/icon-512.png) — não
 * a palavra "MOVIEFLIX" escrita.
 *
 * D-PAD: cada item é um alvo de foco (`data-tv-focusable`) em coluna. Esquerda a
 * partir do conteúdo devolve o foco ao item ativo da sidebar (ver `TvLayout`), e
 * a partir da sidebar a direita entra no conteúdo — nenhum beco sem saída.
 */

interface ItemMenu {
  to: string;
  label: string;
  icon: typeof Home;
  /** Casa também sub-rotas (ex.: /tv/filmes?categoria=...). */
  prefixo?: boolean;
}

const ITENS_PRINCIPAIS: ItemMenu[] = [
  { to: '/tv', label: 'Início', icon: Home },
  { to: '/tv/filmes', label: 'Filmes', icon: Clapperboard, prefixo: true },
  { to: '/tv/series', label: 'Séries', icon: TvIcon, prefixo: true },
  { to: '/tv/minha-lista', label: 'Minha Lista', icon: Heart, prefixo: true },
  { to: '/tv/pesquisa', label: 'Buscar', icon: Search, prefixo: true },
  { to: '/tv/continuar', label: 'Continuar', icon: Clock, prefixo: true },
];

export function TvSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, subscription } = useAuth();
  const navRef = useRef<HTMLElement>(null);

  const assinante = Boolean(subscription);

  /**
   * Ao entrar numa tela, o foco inicial vai para o CONTEÚDO (ver TvLayout). A
   * sidebar só assume o foco quando o usuário aperta ESQUERDA no primeiro
   * elemento de uma linha — por isso, ao voltar para a sidebar, mantemos o item
   * ativo visível e focado.
   */
  useEffect(() => {
    const ativo = navRef.current?.querySelector<HTMLElement>('[data-tv-ativo="true"]');
    if (ativo) ativo.setAttribute('data-tv-sidebar-ativo', 'true');
  }, [location.pathname]);

  const ativo = (item: ItemMenu) =>
    item.to === '/tv'
      ? location.pathname === '/tv'
      : item.prefixo
        ? location.pathname.startsWith(item.to)
        : location.pathname === item.to;

  return (
    <nav className="tv-nav-rail" ref={navRef} aria-label="Menu MovieFlix TV">
      {/* Marca: SÍMBOLO "M" oficial (mesmo asset do ícone do app/mobile). */}
      <button
        type="button"
        data-tv-focusable
        tabIndex={0}
        className="tv-rail-logo"
        aria-label="MovieFlix — Início"
        onClick={() => navigate('/tv')}
      >
        <TvMark className="tv-rail-logo-img" />
      </button>

      <div className="tv-rail-itens">
        {ITENS_PRINCIPAIS.map((item) => {
          const Icon = item.icon;
          const on = ativo(item);
          return (
            <button
              key={item.to}
              type="button"
              data-tv-focusable
              tabIndex={0}
              data-tv-ativo={on ? 'true' : undefined}
              className={cn('tv-rail-item', on && 'tv-rail-item-ativo')}
              onClick={() => navigate(item.to)}
            >
              <Icon className="tv-rail-icon" aria-hidden="true" />
              <span className="tv-rail-label">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Rodapé da rail: planos e conta (mesma conta do site/mobile). */}
      <div className="tv-rail-rodape">
        <button
          type="button"
          data-tv-focusable
          tabIndex={0}
          className={cn('tv-rail-item', assinante && 'tv-rail-item-assinante')}
          onClick={() => navigate('/tv/assinatura')}
        >
          <Crown className="tv-rail-icon" aria-hidden="true" />
          <span className="tv-rail-label">{assinante ? 'Assinante' : 'Planos'}</span>
        </button>

        <button
          type="button"
          data-tv-focusable
          tabIndex={0}
          className="tv-rail-item"
          onClick={() => navigate(user ? '/tv/perfil' : '/tv/login')}
        >
          <User className="tv-rail-icon" aria-hidden="true" />
          <span className="tv-rail-label">{user ? 'Conta' : 'Entrar'}</span>
        </button>

        {/* Sair só aparece autenticado — nunca oferece logout para quem não entrou. */}
        {user ? (
          <button
            type="button"
            data-tv-focusable
            tabIndex={0}
            className="tv-rail-item tv-rail-item-sair"
            onClick={() => navigate('/tv/perfil?acao=sair')}
          >
            <LogOut className="tv-rail-icon" aria-hidden="true" />
            <span className="tv-rail-label">Sair</span>
          </button>
        ) : null}
      </div>

      {/* Nome do usuário (identifica a conta ativa, como no mobile). */}
      {user ? (
        <div className="tv-rail-user" title={user.email ?? ''}>
          <span className="tv-rail-user-nome">{user.email?.split('@')[0] ?? 'Conta'}</span>
        </div>
      ) : null}
    </nav>
  );
}
