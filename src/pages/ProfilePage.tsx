import { useState } from 'react';
import { useAuth, hasActiveSubscription } from '@/context/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useViewerProfiles } from '@/hooks/useViewerProfiles';
import { ProfileFormModal } from '@/components/profile/ProfileFormModal';
import { supabase } from '@/lib/supabase';
import {
  User as UserIcon,
  Mail,
  Crown,
  Calendar,
  Shield,
  Check,
  Loader2,
  Users,
  Pencil,
  Trash2,
  Plus,
  Baby,
  ArrowLeftRight,
  MessageCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorBanner } from '@/pages/auth/LoginPage';
import type { ViewerProfile } from '@/types';
import { linkContratarPlano, linkRenovarPlano, linkSuporte, WHATSAPP_LABEL } from '@/lib/whatsapp';

export function ProfilePage() {
  const { user, profile, subscription, refreshProfile, activeViewerProfile, setActiveViewerProfile } = useAuth();
  const { planName, entitlements } = useEntitlements();
  const { profiles, loading: loadingProfiles, create, update, remove } = useViewerProfiles();

  const [name, setName] = useState(profile?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ViewerProfile | null>(null);
  const [profileMsg, setProfileMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-white">
        <Link to="/login" className="btn-primary">
          Entrar
        </Link>
      </div>
    );
  }

  const hasPlan = hasActiveSubscription(subscription);
  const planLimit = entitlements?.maxProfiles ?? 1;
  const maxProfiles = hasPlan ? planLimit : 1;
  const remaining = Math.max(0, maxProfiles - (profiles?.length ?? 0));
  const atLimit = (profiles?.length ?? 0) >= maxProfiles;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setOk(false);

    try {
      const { error: updErr } = await supabase.auth.updateUser({
        data: {
          full_name: name,
        },
      });

      if (updErr) {
        throw updErr;
      }

      await refreshProfile();
      setOk(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  function openCreate() {
    if (atLimit) return;
    setEditingProfile(null);
    setModalOpen(true);
  }

  function openEdit(p: ViewerProfile) {
    setEditingProfile(p);
    setModalOpen(true);
  }

  async function handleSubmit(input: { name: string; avatar: string; is_kid: boolean }) {
    const res = editingProfile ? await update(editingProfile.id, input) : await create(input);
    if (res.error) throw new Error(res.error);
    setProfileMsg({ tipo: 'ok', texto: editingProfile ? 'Perfil atualizado.' : 'Perfil criado.' });
  }

  async function handleRemove(p: ViewerProfile) {
    if (!window.confirm(`Excluir o perfil "${p.name}"? O histórico dele será apagado.`)) return;
    const res = await remove(p.id);
    if (res.error) {
      setProfileMsg({ tipo: 'erro', texto: res.error });
      return;
    }
    if (activeViewerProfile?.id === p.id) {
      setActiveViewerProfile(null);
    }
    setProfileMsg({ tipo: 'ok', texto: 'Perfil excluído.' });
  }

  function switchProfile(p: ViewerProfile) {
    setActiveViewerProfile(p);
    setProfileMsg({ tipo: 'ok', texto: `Agora assistindo como ${p.name}.` });
  }

  return (
    <div className="min-h-screen bg-ink-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold">
          Meu perfil
        </h1>

        <p className="mt-2 text-ink-300">
          Gerencie suas informações de conta e perfis de exibição.
        </p>

        <div className="mt-8 space-y-6">
          {/* ---- Perfis de exibição (troca de perfil + limite por plano) ---- */}
          <div className="card-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-semibold text-white">
                <Users className="h-5 w-5 text-roxo-400" />
                Perfis de exibição
              </h2>

              <span className="chip">
                {profiles.length}/{maxProfiles} perfis •{' '}
                {atLimit ? 'limite do plano' : `${remaining} restante${remaining === 1 ? '' : 's'}`}
              </span>
            </div>

            <p className="mt-2 text-sm text-ink-300">
              Cada perfil tem seu próprio histórico de reprodução.{' '}
              {atLimit
                ? `Você atingiu o limite de ${maxProfiles} perfil${maxProfiles === 1 ? '' : 's'}${hasPlan ? ' do seu plano' : '. Assine um plano para criar mais perfis (2, 3 ou 5)'}.`
                : `Seu plano permite até ${maxProfiles} perfis (incluindo o infantil).`}
            </p>

            {profileMsg && (
              <p
                className={`mt-3 text-sm ${
                  profileMsg.tipo === 'ok' ? 'text-emerald-300' : 'text-red-400'
                }`}
              >
                {profileMsg.texto}
              </p>
            )}

            {loadingProfiles ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-ink-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando perfis…
              </p>
            ) : (
              <div className="mt-5 flex flex-wrap gap-4">
                {(profiles ?? []).map((p) => {
                  const isActive = activeViewerProfile?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`group relative w-32 rounded-2xl border p-3 text-center transition ${
                        isActive
                          ? 'border-roxo-500 bg-roxo-600/10'
                          : 'border-white/10 bg-white/5 hover:border-white/25'
                      }`}
                    >
                      <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-xl bg-ink-800">
                        <img src={p.avatar_url} alt={p.name} className="h-full w-full object-cover" />
                        {p.is_kid && (
                          <span className="absolute inset-x-0 bottom-0 flex justify-center pb-0.5">
                            <span className="flex items-center gap-0.5 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[9px] font-bold text-black">
                              <Baby className="h-2.5 w-2.5" /> Infantil
                            </span>
                          </span>
                        )}
                      </div>

                      <p className="mt-2 truncate text-sm font-semibold text-white">{p.name}</p>
                      <p className="text-[10px] text-ink-400">
                        {isActive ? 'Perfil atual' : p.is_kid ? 'Apenas infantil' : 'Acesso total'}
                      </p>

                      <div className="mt-2 flex items-center justify-center gap-1">
                        {!isActive && (
                          <button
                            onClick={() => switchProfile(p)}
                            className="flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-roxo-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:from-brand-500 hover:to-roxo-500"
                            title="Trocar para este perfil"
                          >
                            <ArrowLeftRight className="h-3 w-3" /> Trocar
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded-full bg-white/10 p-1.5 text-ink-200 transition hover:bg-white/20 hover:text-white"
                          title="Editar perfil"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleRemove(p)}
                          className="rounded-full bg-white/10 p-1.5 text-ink-200 transition hover:bg-red-600/80 hover:text-white"
                          title="Excluir perfil"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {!atLimit && (
                  <button
                    onClick={openCreate}
                    className="flex w-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 bg-ink-800/40 p-3 text-ink-400 transition hover:border-roxo-500 hover:text-roxo-400"
                  >
                    <Plus className="h-8 w-8" />
                    <span className="text-xs font-medium">Adicionar perfil</span>
                  </button>
                )}
                {atLimit && (
                  <div className="flex w-48 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-ink-800/30 p-3 text-center">
                    <span className="text-xs font-medium text-ink-400">Limite do plano atingido</span>
                    <span className="text-[10px] leading-tight text-ink-500">
                      {hasPlan
                        ? `Seu plano permite até ${maxProfiles} perfis.`
                        : 'Assine um plano para criar mais perfis.'}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4 text-xs text-ink-400">
              <span>
                Limite do plano <strong className="text-white">{planName ?? 'sem assinatura'}</strong>: até{' '}
                <strong className="text-white">{maxProfiles} perfis</strong> — o perfil infantil está disponível
                em todos os planos.
              </span>
            </div>
          </div>

          {/* ---- Dados da conta ---- */}
          <div className="card-surface p-6">
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <UserIcon className="h-5 w-5 text-roxo-400" />
              Dados da conta
            </h2>

            <form onSubmit={save} className="mt-4 space-y-4">
              {error && <ErrorBanner message={error} />}

              {ok && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                  <Check className="h-4 w-4" />
                  Perfil atualizado com sucesso.
                </div>
              )}

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-200">
                  Nome de exibição
                </span>

                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="input"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-200">
                  E-mail
                </span>

                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />

                  <input
                    readOnly
                    value={profile?.email ?? ''}
                    className="input pl-10 opacity-70"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="btn-primary"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Salvar
              </button>
            </form>
          </div>

          {/* ---- Assinatura + Admin ---- */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card-surface p-6">
              <h2 className="flex items-center gap-2 font-semibold text-white">
                <Crown className="h-5 w-5 text-roxo-400" />
                Assinatura
              </h2>

              {hasPlan ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-ink-300">
                    Plano:{' '}
                    <span className="font-semibold text-white">
                      {planName ?? 'Ativo'}
                    </span>
                  </p>

                  <p className="text-ink-300">
                    Status:{' '}
                    <span className="font-semibold text-emerald-400">
                      Ativa
                    </span>
                  </p>

                  {subscription?.expires_at && (
                    <p className="flex items-center gap-1 text-ink-300">
                      <Calendar className="h-4 w-4" />
                      Vence em{' '}
                      {new Date(
                        subscription.expires_at
                      ).toLocaleDateString('pt-BR')}
                    </p>
                  )}

                  <Link
                    to="/minha-assinatura"
                    className="btn-outline mt-3 w-full"
                  >
                    Gerenciar assinatura
                  </Link>
                </div>
              ) : subscription ? (
                /* Assinatura expirada */
                <div className="mt-3 space-y-3 text-sm">
                  <p className="text-ink-300">
                    Status:{' '}
                    <span className="font-semibold text-red-400">
                      Expirada
                    </span>
                  </p>
                  <p className="text-ink-300">
                    Sua assinatura venceu. Renove pelo WhatsApp para voltar a assistir.
                  </p>
                  <a
                    href={linkRenovarPlano({ email: user.email ?? '', planoNome: planName, planoCodigo: subscription.plan_code })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary flex w-full items-center justify-center gap-2"
                  >
                    <MessageCircle className="h-4 w-4" /> RENOVAR PELO WHATSAPP
                  </a>
                </div>
              ) : (
                /* Sem assinatura (aguardando ativação manual) */
                <div className="mt-3 space-y-3 text-sm">
                  <p className="text-ink-300">
                    Status:{' '}
                    <span className="font-semibold text-amber-400">
                      Pendente
                    </span>
                  </p>
                  <p className="text-ink-300">
                    Seu cadastro foi realizado, mas sua assinatura ainda não está ativa.
                    Contrate pelo WhatsApp para ativar.
                  </p>
                  <a
                    href={linkContratarPlano({
                      email: user?.email ?? '',
                      planoNome: 'Plano 1',
                      planoCodigo: 'simple',
                      valorCents: 1990,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary flex w-full items-center justify-center gap-2"
                  >
                    <MessageCircle className="h-4 w-4" /> CONTRATAR PELO WHATSAPP
                  </a>
                  <Link
                    to="/minha-assinatura"
                    className="btn-outline w-full"
                  >
                    Ver planos
                  </Link>
                </div>
              )}

              <a
                href={linkSuporte(user?.email ?? '')}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-2 text-xs text-ink-400 transition hover:text-white"
              >
                <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
                Falar com o {WHATSAPP_LABEL}
              </a>
            </div>

            {profile?.is_admin && (
              <div className="card-surface p-6">
                <h2 className="flex items-center gap-2 font-semibold text-white">
                  <Shield className="h-5 w-5 text-roxo-400" />
                  Administrador
                </h2>

                <p className="mt-2 text-sm text-ink-300">
                  Você tem acesso ao painel administrativo.
                </p>

                <Link
                  to="/admin"
                  className="btn-outline mt-3 w-full"
                >
                  Abrir painel
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <ProfileFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editingProfile}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
