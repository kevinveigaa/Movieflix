import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Users, Crown, CheckCircle2, XCircle, CalendarX, DollarSign, Search, Loader2, TrendingUp } from 'lucide-react';
import { FullScreenLoader } from '@/components/ui/Feedback';
import type { Payment, Plan, Profile, Subscription } from '@/types';

export function AdminPage() {
  const { profile, loading } = useAuth();
  const [search, setSearch] = useState('');

  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    enabled: !!profile?.is_admin,
    queryFn: async () => {
      const [profiles, subs, payments, plans] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('subscriptions').select('*, plan:plans(*)'),
        supabase.from('payments').select('*, plan:plans(*)'),
        supabase.from('plans').select('*'),
      ]);
      return {
        profiles: (profiles.data ?? []) as Profile[],
        subs: (subs.data ?? []) as (Subscription & { plan?: Plan })[],
        payments: (payments.data ?? []) as (Payment & { plan?: Plan })[],
        plans: (plans.data ?? []) as Plan[],
      };
    },
  });

  if (loading) return <FullScreenLoader />;
  if (!profile?.is_admin) {
    return (
      <div className="container-app flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <XCircle className="h-12 w-12 text-red-400" />
        <p className="text-lg font-semibold text-white">Acesso restrito</p>
        <p className="text-sm text-ink-400">Voc no tem permisso para acessar o painel administrativo.</p>
      </div>
    );
  }

  if (stats.isLoading) return <FullScreenLoader label="Carregando mtricas" />;

  const users = stats.data?.profiles ?? [];
  const subs = stats.data?.subs ?? [];
  const payments = stats.data?.payments ?? [];

  const activeSubs = subs.filter((s) => s.status === 'active' && (!s.expires_at || new Date(s.expires_at) >= new Date()));
  const expiredSubs = subs.filter((s) => s.status === 'expired' || (s.status === 'active' && s.expires_at && new Date(s.expires_at) < new Date()));
  const cancelledSubs = subs.filter((s) => s.status === 'cancelled');

  const approvedPayments = payments.filter((p) => p.status === 'approved');
  const now = new Date();
  const monthRevenue = approvedPayments
    .filter((p) => new Date(p.created_at).getMonth() === now.getMonth() && new Date(p.created_at).getFullYear() === now.getFullYear())
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const yearRevenue = approvedPayments
    .filter((p) => new Date(p.created_at).getFullYear() === now.getFullYear())
    .reduce((sum, p) => sum + p.amount_cents, 0);

  const filteredUsers = search.trim()
    ? users.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <div className="container-app py-10">
      <h1 className="font-display text-3xl tracking-wide text-white sm:text-4xl">Painel Administrativo</h1>
      <p className="mt-1 text-sm text-ink-400">Viso geral da plataforma MovieFlix.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Users className="h-5 w-5" />} label="Total de usurios" value={String(users.length)} accent="text-sky-400" />
        <StatCard icon={<Crown className="h-5 w-5" />} label="Assinantes ativos" value={String(activeSubs.length)} accent="text-emerald-400" />
        <StatCard icon={<CalendarX className="h-5 w-5" />} label="Assinaturas vencidas" value={String(expiredSubs.length)} accent="text-amber-400" />
        <StatCard icon={<XCircle className="h-5 w-5" />} label="Assinaturas canceladas" value={String(cancelledSubs.length)} accent="text-red-400" />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Receita mensal" value={`R$ ${(monthRevenue / 100).toFixed(2).replace('.', ',')}`} accent="text-brand-400" />
        <StatCard icon={<DollarSign className="h-5 w-5" />} label="Receita anual" value={`R$ ${(yearRevenue / 100).toFixed(2).replace('.', ',')}`} accent="text-brand-400" />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-white">Buscar usurios</h2>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="input pl-10"
          />
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-800/60 text-xs uppercase text-ink-400">
              <tr>
                <th className="px-4 py-3">Usurio</th>
                <th className="px-4 py-3">Cadastro</th>
                <th className="px-4 py-3">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.length === 0 ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-ink-400">Nenhum usurio encontrado.</td></tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="bg-ink-900/40 hover:bg-ink-900/70">
                    <td className="px-4 py-3 text-white">{u.email}</td>
                    <td className="px-4 py-3 text-ink-300">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3">{u.is_admin ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <span className="text-ink-500"></span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-white">Histórico de pagamentos</h2>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-800/60 text-xs uppercase text-ink-400">
              <tr>
                <th className="px-4 py-3">Usurio</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {payments.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-400">Nenhum pagamento registrado.</td></tr>
              ) : (
                payments.slice(0, 50).map((p) => (
                  <tr key={p.id} className="bg-ink-900/40 hover:bg-ink-900/70">
                    <td className="px-4 py-3 text-white">{users.find((u) => u.id === p.user_id)?.email ?? p.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-ink-300">{p.plan?.name ?? ''}</td>
                    <td className="px-4 py-3 text-ink-300">R$ {(p.amount_cents / 100).toFixed(2).replace('.', ',')}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-ink-300">{new Date(p.created_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ${accent}`}>{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-ink-400">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-emerald-500/15 text-emerald-300',
    pending: 'bg-amber-500/15 text-amber-300',
    rejected: 'bg-red-500/15 text-red-300',
    cancelled: 'bg-ink-700 text-ink-300',
  };
  const labels: Record<string, string> = {
    approved: 'Aprovado',
    pending: 'Pendente',
    rejected: 'Recusado',
    cancelled: 'Cancelado',
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${map[status] ?? 'bg-ink-700 text-ink-300'}`}>{labels[status] ?? status}</span>;
}




