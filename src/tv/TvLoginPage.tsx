import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Loader2, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TvMark } from './TvBrand';

/**
 * TvLoginPage — login DENTRO da experiência de TV.
 *
 * CAUSA RAIZ DO BUG "pós-login vira layout de celular/site": as telas de TV
 * mandavam o usuário para `/login` e `/selecionar-perfil` — rotas do SITE, que
 * vivem sob o `AppLayout` (Navbar no topo + Footer) e usam formulários no layout
 * mobile/web. Depois de autenticar, o usuário ficava preso nesse layout e nunca
 * voltava para a interface de TV.
 *
 * Aqui o login acontece DENTRO de `/tv/login`: mesma conta, mesmo Supabase,
 * mesma função `signIn` do AuthContext (nada de autenticação paralela), mas com
 * formulário grande, legível à distância e 100% controlável pelo D-pad.
 *
 * ENTRADA DE TEXTO COM CONTROLE REMOTO: o campo usa `inputMode` e aceita
 * `Enter`/OK para avançar entre e-mail → senha → entrar. Teclados de Android TV
 * e Google TV abrem o teclado na tela quando o campo recebe foco (comportamento
 * do próprio sistema), então não é preciso toque nem mouse.
 */
export function TvLoginPage() {
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const senhaRef = useRef<HTMLInputElement>(null);

  // Já autenticado: segue para a seleção de perfil / Home da TV.
  useEffect(() => {
    if (!authLoading && user) navigate('/tv/perfil', { replace: true });
  }, [authLoading, user, navigate]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      // MESMA função do site/mobile (AuthContext → Supabase).
      await signIn(email, senha);
      navigate('/tv/perfil', { replace: true });
    } catch (err) {
      setErro((err as Error).message ?? 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tv-page tv-page-center">
      <div className="tv-login">
        <div className="tv-login-marca">
          <TvMark className="tv-login-marca-img" />
        </div>
        <h1 className="tv-login-titulo">Entrar no MovieFlix</h1>
        <p className="tv-login-sub">
          Use a mesma conta do site e do aplicativo. Seu plano, favoritos e progresso continuam os mesmos.
        </p>

        <form onSubmit={entrar} className="tv-login-form">
          {erro ? (
            <div className="tv-login-erro" role="alert">
              <AlertCircle className="tv-icon-sm" />
              <span>{erro}</span>
            </div>
          ) : null}

          <label className="tv-login-campo">
            <span className="tv-login-rotulo">E-mail</span>
            <span className="tv-login-input-wrap">
              <Mail className="tv-login-icone" aria-hidden="true" />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  // OK/Enter no e-mail avança para a senha (fluxo de controle remoto).
                  if (e.key === 'Enter' || e.keyCode === 13 || e.keyCode === 23) {
                    e.preventDefault();
                    senhaRef.current?.focus();
                  }
                }}
                placeholder="voce@email.com"
                className="tv-login-input"
                data-tv-focusable
                data-tv-initial-focus
                tabIndex={0}
              />
            </span>
          </label>

          <label className="tv-login-campo">
            <span className="tv-login-rotulo">Senha</span>
            <span className="tv-login-input-wrap">
              <Lock className="tv-login-icone" aria-hidden="true" />
              <input
                ref={senhaRef}
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="tv-login-input"
                data-tv-focusable
                tabIndex={0}
              />
            </span>
          </label>

          <button
            type="submit"
            disabled={enviando}
            data-tv-focusable
            tabIndex={0}
            className="tv-btn tv-btn-primary tv-btn-lg tv-login-entrar"
          >
            {enviando ? <Loader2 className="tv-icon-sm tv-spin" /> : null}
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="tv-login-rodape">
          <button
            type="button"
            data-tv-focusable
            tabIndex={0}
            className="tv-btn tv-btn-ghost"
            onClick={() => navigate('/tv')}
          >
            <ChevronLeft className="tv-icon-sm" />
            Continuar sem entrar
          </button>
        </div>
      </div>
    </div>
  );
}
