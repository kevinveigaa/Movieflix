import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { User as UserIcon, Mail, Crown, Calendar, Shield, Check, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorBanner } from '@/pages/auth/LoginPage';

export function ProfilePage() {
  const { user, profile, subscription, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  if (!user) {
    return (
      <div className="container-app flex min-h-[50vh] items-center justify-center">
        <Link to="/login" className="btn-primary">Entrar</Link>
      </div>
    );
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setOk(false);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ data: { full_name: name } });
      if (updErr) throw updErr;
      await refreshProfile();
      setOk(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-app py-10">
      <h1 className="font-display text-3xl tracking-wide text-white sm:text-4xl">Meu perfil</h1>
      <p className="mt-1 text-sm text-ink-400">Gerencie suas informaes de conta.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="card-surface p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <UserIcon className="h-5 w-5 text-brand-400" /> Dados da conta
          </h2>
          <form onSubmit={save} className="mt-4 space-y-4">
            {error && <ErrorBanner message={error} />}
            {ok && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                <Check className="h-4 w-4" /> Perfil atualizado com sucesso.
              </div>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-200">Nome de exibio</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="input"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-200">E-mail</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input readOnly value={profile?.email ?? ''} className="input pl-10 opacity-70" />
              </div>
            </label>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="card-surface p-6">
            <h2 className="flex items-center gap-2 font-semibold text-white">
              <Crown className="h-5 w-5 text-brand-400" /> Assinatura
            </h2>
            {subscription && subscription.status === 'active' ? (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-ink-300">Plano: <span className="font-semibold text-white">{subscription.plan?.name}</span></p>
                <p className="text-ink-300">Status: <span className="font-semibold text-emerald-400">Ativa</span></p>
                {subscription.expires_at && (
                  <p className="flex items-center gap-1 text-ink-300">
                    <Calendar className="h-4 w-4" /> Vence em {new Date(subscription.expires_at).toLocaleDateString('pt-BR')}
                  </p>
                )}
                <Link to="/minha-assinatura" className="btn-outline mt-3 w-full">Gerenciar assinatura</Link>
              </div>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <p className="text-ink-300">Voc no tem assinatura ativa.</p>
                <Link to="/minha-assinatura" className="btn-primary w-full">Assinar agora</Link>
              </div>
            )}
          </div>

          {profile?.is_admin && (
            <div className="card-surface p-6">
              <h2 className="flex items-center gap-2 font-semibold text-white">
                <Shield className="h-5 w-5 text-brand-400" /> Administrador
              </h2>
              <p className="mt-2 text-sm text-ink-300">Voc tem acesso ao painel administrativo.</p>
              <Link to="/admin" className="btn-outline mt-3 w-full">Abrir painel</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}




