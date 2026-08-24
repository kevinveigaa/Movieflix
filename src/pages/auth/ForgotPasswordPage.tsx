import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthShell, ErrorBanner } from './LoginPage';

export function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setDone(true);
    } catch (err) {
      setError((err as Error).message ?? 'No foi possível enviar o e-mail.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link de recuperação para o seu e-mail.">
      {done ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle className="h-12 w-12 text-emerald-400" />
          <p className="text-sm text-ink-200">
            Se houver uma conta com <span className="font-semibold text-white">{email}</span>, você receber um link de recuperação em instantes.
          </p>
          <Link to="/login" data-tv-focusable className="btn-primary mt-2">Voltar ao login</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorBanner message={error} />}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-200">E-mail</span>
            <span className="relative block">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="você@email.com" className="input pl-10" />
            </span>
          </label>
          <button type="submit" disabled={loading} data-tv-focusable className="btn-primary w-full">
            {loading ? 'Enviando' : 'Enviar link'}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-ink-400">
        Lembrou a senha?{' '}
        <Link to="/login" className="font-semibold text-brand-400 hover:text-brand-300">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}




