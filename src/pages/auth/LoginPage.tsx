import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, Film, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      navigate('/selecionar-perfil');
    } catch (err) {
      setError((err as Error).message ?? 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Entrar" subtitle="Bem-vindo de volta ao MovieFlix.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <Field icon={<Mail className="h-4 w-4" />} label="E-mail">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="você@email.com"
            className="input pl-10"
          />
        </Field>
        <Field icon={<Lock className="h-4 w-4" />} label="Senha">
          <input
            type={show ? 'text' : 'password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder=""
            className="input pl-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white"
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </Field>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-ink-300">
            <input type="checkbox" className="rounded border-white/20 bg-ink-800" /> Lembrar-me
          </label>
          <Link to="/recuperar-senha" data-tv-focusable className="text-brand-400 hover:text-brand-300">
            Esqueceu a senha?
          </Link>
        </div>
        <button type="submit" disabled={loading} data-tv-focusable className="btn-primary w-full">
          {loading ? 'Entrando' : 'Entrar'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-400">
        Não tem conta?{' '}
        <Link to="/cadastro" data-tv-focusable className="font-semibold text-brand-400 hover:text-brand-300">
          Cadastre-se grátis
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4 py-12">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-brand-700/40 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-brand-900/40 blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-white">
            <Film className="h-5 w-5" />
          </span>
          <span className="font-display text-2xl tracking-wide text-white">MOVIEFLIX</span>
        </Link>
        <div className="card-surface p-6 animate-fade-in sm:p-8">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-200">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">{icon}</span>
        {children}
      </span>
    </label>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
      <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}




