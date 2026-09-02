import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Lock, Loader2, Check, Bell, Globe, Moon, Trash2 } from 'lucide-react';
import { ErrorBanner } from '@/pages/auth/LoginPage';

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (newPwd.length < 6) {
      setError('A nova senha deve ter ao menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPwd });
      if (err) throw err;
      setOk('Senha alterada com sucesso.');
      setOldPwd('');
      setNewPwd('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const cancelSubscription = async () => {
    if (!user || !confirm('Deseja realmente cancelar sua assinatura? O acesso será bloqueado ao fim do período.')) return;
    setLoading(true);
    setError('');
    setOk('');
    try {
      // Usa a função SECURITY DEFINER (o UPDATE direto falhava por RLS).
      const { data, error } = await supabase.rpc('cancel_my_subscription');
      if (error) throw error;
      const res = data as { ok?: boolean; mensagem?: string; erro?: string } | null;
      if (res && res.ok === false) throw new Error(res.erro ?? 'Não foi possível cancelar.');
      setOk(res?.mensagem ?? 'Assinatura cancelada.');
      await new Promise((r) => setTimeout(r, 1200));
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-app py-10">
      <h1 className="font-display text-3xl tracking-wide text-white sm:text-4xl">
        <span className="text-gradient-strong">Configurações</span>
      </h1>
      <p className="mt-1 text-sm text-ink-400">Segurança e preferências da sua conta.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="card-surface p-6">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <Lock className="h-5 w-5 text-roxo-400" /> Alterar senha
          </h2>
          <form onSubmit={changePassword} className="mt-4 space-y-4">
            {error && <ErrorBanner message={error} />}
            {ok && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                <Check className="h-4 w-4" /> {ok}
              </div>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-200">Senha atual (confirmação)</span>
              <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} className="input" placeholder="" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink-200">Nova senha</span>
              <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="input" placeholder="" />
            </label>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Alterar senha
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="card-surface p-6">
            <h2 className="font-semibold text-white">Preferências</h2>
            <div className="mt-4 space-y-3">
              <Toggle icon={<Bell className="h-4 w-4" />} label="Notificações por e-mail" defaultOn />
              <Toggle icon={<Globe className="h-4 w-4" />} label="Conteúdo em português" defaultOn />
              <Toggle icon={<Moon className="h-4 w-4" />} label="Tema escuro" defaultOn />
            </div>
          </div>

          <div className="card-surface border-red-500/20 p-6">
            <h2 className="font-semibold text-white">Assinatura</h2>
            <p className="mt-2 text-sm text-ink-300">Cancele sua assinatura a qualquer momento.</p>
            <button onClick={cancelSubscription} className="btn-outline mt-4 w-full border-red-500/30 text-red-300 hover:bg-red-500/10">
              <Trash2 className="h-4 w-4" /> Cancelar assinatura
            </button>
          </div>

          <div className="card-surface p-6">
            <h2 className="font-semibold text-white">Sair da conta</h2>
            <p className="mt-2 text-sm text-ink-300">Encerre sua sessão neste dispositivo.</p>
            <button onClick={() => signOut()} className="btn-outline mt-4 w-full">
              Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ icon, label, defaultOn }: { icon: React.ReactNode; label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <button
      onClick={() => setOn((v) => !v)}
      className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-ink-200 transition hover:bg-white/10"
    >
      <span className="flex items-center gap-2">{icon} {label}</span>
      <span className={`relative h-5 w-9 rounded-full transition ${on ? 'bg-gradient-to-r from-brand-600 to-roxo-600' : 'bg-ink-700'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-4' : 'left-0.5'}`} />
      </span>
    </button>
  );
}




