import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { User, Plus, Check, LogOut, Loader2, AlertCircle, Crown, Baby } from 'lucide-react';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { useViewerProfiles } from '@/hooks/useViewerProfiles';
import { PROFILE_AVATARS } from '@/lib/avatars';
import { TvMark } from './TvBrand';
import { cn } from '@/lib/cn';

/**
 * TvAccountPage — Conta / Perfis DENTRO da experiência de TV (`/tv/perfil`).
 *
 * CAUSA RAIZ: a sidebar/header de TV mandava autenticados para `/perfil`
 * (`ProfilePage`) e novos logins para `/selecionar-perfil` — ambas rotas do SITE
 * sob o `AppLayout`. Era exatamente isso que fazia a interface "virar layout de
 * celular" logo depois do login. Aqui a seleção de perfil e o logout acontecem
 * na interface de TV, com os MESMOS dados e hooks do mobile (`useViewerProfiles`,
 * `setActiveViewerProfile`, `signOut`) — nenhuma lógica de conta paralela.
 *
 * PERFIS: tocar num perfil o ativa (mesma chave de histórico/favoritos do site)
 * e volta para a Home da TV. Sem perfil criado, oferece o primeiro.
 */
export function TvAccountPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, subscription, activeViewerProfile, setActiveViewerProfile, signOut, loading } = useAuth();
  const { profiles, loading: carregandoPerfis, create, refresh } = useViewerProfiles();
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const hasPlan = hasActiveSubscription(subscription);
  const maxPerfis = hasPlan ? Math.max(1, profiles.length + 1) : 1;
  const podeCriar = profiles.length < maxPerfis;

  /** `?acao=sair` (item "Sair" da sidebar) desloga de verdade. */
  const pediuSair = params.get('acao') === 'sair';

  useEffect(() => {
    if (!loading && !user) navigate('/tv/login', { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (pediuSair) void sairAgora();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pediuSair]);

  async function sairAgora() {
    await signOut();
    navigate('/tv', { replace: true });
  }

  function selecionar(id: string) {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setActiveViewerProfile(p);
    navigate('/tv');
  }

  async function criarPrimeiro() {
    setErro('');
    setSalvando(true);
    try {
      const res = await create({
        name: (user?.email?.split('@')[0] ?? 'Principal').slice(0, 20),
        avatar: PROFILE_AVATARS[0] ?? '',
        is_kid: false,
      });
      if (res && 'error' in res && res.error) setErro(String(res.error));
      else await refresh();
    } catch (e) {
      setErro((e as Error).message ?? 'Não foi possível criar o perfil.');
    } finally {
      setSalvando(false);
    }
  }

  const nomeConta = useMemo(() => user?.email?.split('@')[0] ?? 'Conta', [user]);

  if (loading || carregandoPerfis) {
    return (
      <div className="tv-page tv-page-center">
        <div className="tv-loading">
          <Loader2 className="tv-icon tv-spin" />
          <p>Carregando sua conta...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-page tv-page-conta">
      <div className="tv-conta-topo">
        <TvMark className="tv-conta-logo" />
        <div>
          <h1 className="tv-page-title">Sua conta</h1>
          <p className="tv-conta-email">{user?.email}</p>
        </div>
        <span className={cn('tv-conta-plano', hasPlan && 'tv-conta-plano-ativo')}>
          <Crown className="tv-icon-sm" />
          {hasPlan ? 'Assinatura ativa' : 'Sem assinatura'}
        </span>
      </div>

      {erro ? (
        <div className="tv-login-erro" role="alert">
          <AlertCircle className="tv-icon-sm" />
          <span>{erro}</span>
        </div>
      ) : null}

      <h2 className="tv-conta-secao">Quem está assistindo?</h2>

      <div className="tv-perfis">
        {profiles.map((p, i) => {
          const ativo = activeViewerProfile?.id === p.id;
          const icone = PROFILE_AVATARS[i % Math.max(1, PROFILE_AVATARS.length)];
          return (
            <button
              key={p.id}
              type="button"
              data-tv-focusable
              data-tv-initial-focus={ativo ? 'true' : undefined}
              tabIndex={0}
              className={cn('tv-perfil', ativo && 'tv-perfil-ativo')}
              onClick={() => selecionar(p.id)}
            >
              <span className="tv-perfil-avatar">
                {icone ? (
                  <img src={icone} alt="" />
                ) : p.is_kid ? (
                  <Baby className="tv-icon-lg" />
                ) : (
                  <User className="tv-icon-lg" />
                )}
                {ativo ? (
                  <span className="tv-perfil-check">
                    <Check className="tv-icon-sm" />
                  </span>
                ) : null}
              </span>
              <span className="tv-perfil-nome">{p.name}</span>
              {p.is_kid ? <span className="tv-perfil-kid">Infantil</span> : null}
            </button>
          );
        })}

        {podeCriar ? (
          <button
            type="button"
            data-tv-focusable
            data-tv-initial-focus={profiles.length === 0 ? 'true' : undefined}
            tabIndex={0}
            className="tv-perfil tv-perfil-novo"
            disabled={salvando}
            onClick={() => void criarPrimeiro()}
          >
            <span className="tv-perfil-avatar">
              {salvando ? <Loader2 className="tv-icon-lg tv-spin" /> : <Plus className="tv-icon-lg" />}
            </span>
            <span className="tv-perfil-nome">Criar perfil</span>
          </button>
        ) : null}
      </div>

      <div className="tv-conta-acoes">
        <button
          type="button"
          data-tv-focusable
          tabIndex={0}
          className="tv-btn tv-btn-ghost"
          onClick={() => navigate('/tv/assinatura')}
        >
          <Crown className="tv-icon-sm" />
          Ver planos
        </button>
        <button
          type="button"
          data-tv-focusable
          tabIndex={0}
          className="tv-btn tv-btn-ghost"
          onClick={() => void sairAgora()}
        >
          <LogOut className="tv-icon-sm" />
          Sair da conta
        </button>
      </div>

      <p className="tv-conta-nota">
        Conta conectada ao mesmo backend do site e do aplicativo — plano, favoritos e histórico são
        compartilhados.
      </p>
    </div>
  );
}
