import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthShell, ErrorBanner } from './LoginPage';

/**
 * ResetPasswordPage — REDEFINIÇÃO DE SENHA (link do e-mail do Supabase).
 *
 * Fluxo: o usuário clica em "Esqueci minha senha" → resetPasswordForEmail envia
 * um e-mail com um link que aponta para /#/redefinir-senha (redirectTo). O
 * Supabase anexa ao link um hash com o token de recuperação
 * (#access_token=...&type=recovery). O supabase-js (detectSessionInUrl: true)
 * processa esse hash e dispara o evento PASSWORD_RECOVERY com uma sessão
 * temporária. Aqui detectamos esse evento e mostramos o formulário para definir
 * a nova senha, que é salva via supabase.auth.updateUser({ password }).
 *
 * Se o usuário acessar a rota sem token de recuperação, mostramos um aviso
 * claro com link para a página de recuperação (sem deixar o usuário preso).
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(true);
  const [temRecovery, setTemRecovery] = useState(false);

  useEffect(() => {
    let mounted = true;

    // O supabase-js já processa o hash da URL (detectSessionInUrl). O evento
    // PASSWORD_RECOVERY indica que o usuário veio do link de recuperação.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        setTemRecovery(true);
        setChecking(false);
      }
    });

    // Fallback: se o evento não disparar (ex.: sessão já processada), verifica
    // se há uma sessão ativa com o tipo recovery no hash da URL.
    const hash = window.location.hash;
    const temTokenRecovery = hash.includes('type=recovery') || hash.includes('access_token=');
    if (temTokenRecovery) {
      // Aguarda o supabase-js processar o hash (assíncrono).
      const t = window.setTimeout(() => {
        if (mounted) {
          setTemRecovery(true);
          setChecking(false);
        }
      }, 1200);
      return () => {
        mounted = false;
        sub.subscription.unsubscribe();
        window.clearTimeout(t);
      };
    }

    // Sem token de recuperação na URL: não é um fluxo de redefinição válido.
    window.setTimeout(() => {
      if (mounted) {
        setTemRecovery(false);
        setChecking(false);
      }
    }, 400);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('A nova senha deve ter ao menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      // Após redefinir, leva ao login para entrar com a nova senha.
      window.setTimeout(() => navigate('/login', { replace: true }), 1800);
    } catch (err) {
      setError((err as Error).message ?? 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Definir nova senha" subtitle="Crie uma nova senha para acessar sua conta.">
      {checking ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-roxo-400" />
          <p className="text-sm text-ink-300">Verificando o link de recuperação…</p>
        </div>
      ) : done ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle className="h-12 w-12 text-emerald-400" />
          <p className="text-sm text-ink-200">
            Senha redefinida com sucesso! Redirecionando para o login…
          </p>
          <Link to="/login" data-tv-focusable className="btn-primary mt-2">Ir para o login</Link>
        </div>
      ) : !temRecovery ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <AlertCircle className="h-12 w-12 text-amber-400" />
          <p className="text-sm text-ink-200">
            Este link de redefinição de senha é inválido ou expirou. Solicite um novo link de recuperação.
          </p>
          <Link to="/recuperar-senha" data-tv-focusable className="btn-primary mt-2">
            Solicitar novo link
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorBanner message={error} />}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-200">Nova senha</span>
            <span className="relative block">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type={show ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
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
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-200">Confirmar nova senha</span>
            <span className="relative block">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type={show ? 'text' : 'password'}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repita a nova senha"
                className="input pl-10"
              />
            </span>
          </label>
          <button type="submit" disabled={loading} data-tv-focusable className="btn-primary w-full">
            {loading ? 'Salvando…' : 'Redefinir senha'}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-ink-400">
        Lembrou a senha?{' '}
        <Link to="/login" className="font-semibold text-roxo-400 hover:text-roxo-300">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}