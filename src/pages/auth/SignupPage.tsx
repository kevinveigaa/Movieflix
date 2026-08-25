import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { AuthShell, ErrorBanner } from './LoginPage';

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('A senha deve ter ao menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password);
      // Guarda o nome informado no cadastro como sugestão para o primeiro
      // perfil (a criação do perfil acontece em /selecionar-perfil logo a
      // seguir — NENHUMA assinatura é exigida para criar a conta).
      if (name.trim()) localStorage.setItem('mf_signup_name', name.trim());
      navigate('/selecionar-perfil');
    } catch (err) {
      setError((err as Error).message ?? 'No foi possível cadastrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Criar conta" subtitle="Comece a assistir em segundos. Sem cartão de crédito.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-200">Nome</span>
          <span className="relative block">
            <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              required
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input pl-10"
            />
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-200">E-mail</span>
          <span className="relative block">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="você@email.com" className="input pl-10" />
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-200">Senha</span>
          <span className="relative block">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="" className="input pl-10" />
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-200">Confirmar senha</span>
          <span className="relative block">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="" className="input pl-10" />
          </span>
        </label>
        <button type="submit" disabled={loading} data-tv-focusable className="btn-primary w-full">
          {loading ? 'Criando conta' : 'Criar conta'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-400">
        J tem conta?{' '}
        <Link to="/login" data-tv-focusable className="font-semibold text-brand-400 hover:text-brand-300">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}