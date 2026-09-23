import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Loader2, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TvMark } from './TvBrand';
import { TvKeyboard } from './TvKeyboard';
import { cn } from '@/lib/cn';

/**
 * TvLoginPage — login DENTRO da experiência de TV.
 *
 * CAUSA RAIZ 1 — "pós-login vira layout de celular/site": as telas de TV
 * mandavam o usuário para `/login` e `/selecionar-perfil` — rotas do SITE, que
 * vivem sob o AppLayout (Navbar no topo + Footer). Agora o login acontece DENTRO
 * de `/tv/login`, com a mesma conta/Supabase e a mesma função `signIn`.
 *
 * CAUSA RAIZ 2 — FOCO E DIGITAÇÃO (a que este arquivo corrige): o formulário
 * dependia de dois mecanismos que NÃO funcionam juntos numa TV:
 *   a) a navegação espacial global (useTvNavigation) intercepta TODAS as setas e
 *      o OK em fase de CAPTURA — ao focar um campo, as setas eram consumidas
 *      pela navegação e não chegavam ao campo (parecia que "o foco saía");
 *   b) o hook ainda mandava `blur()+focus()` e pedia o teclado DO SISTEMA ao
 *      ganhar foco — foco programático NÃO abre o IME no WebView, então o campo
 *      ficava com o anel mas nada era digitável.
 *
 * CORREÇÃO (três camadas, nenhuma dependente de IME):
 *   1. o formulário marca-se com `data-tv-form`; com um CAMPO DE TEXTO focado
 *      dentro dele, o `useTvNavigation` não intercepta mais nada (o formulário é
 *      dono do foco). Foco e digitação param de ser "roubados".
 *   2. há um TECLADO NA TELA (TvKeyboard) navegável SÓ com o D-pad — a digitação
 *      funciona em qualquer TV Box, com ou sem IME.
 *   3. o plano de foco do D-pad é explícito: e-mail → senha → teclado → Entrar,
 *      com ↑ voltando — sem perda de foco em nenhum passo.
 *
 * O teclado físico/do controle continua funcionando direto no campo (onChange).
 */

type Campo = 'email' | 'senha';

/** Limite de caracteres por campo (e-mail e senha). */
const LIMITE = 120;

export function TvLoginPage() {
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  /** Campo que recebe o que o teclado na tela digita. */
  const [campoAtivo, setCampoAtivo] = useState<Campo>('email');

  const emailRef = useRef<HTMLInputElement>(null);
  const senhaRef = useRef<HTMLInputElement>(null);
  const tecladoRef = useRef<HTMLDivElement>(null);

  // Já autenticado: segue para a seleção de perfil / Home da TV.
  useEffect(() => {
    if (!authLoading && user) navigate('/tv/perfil', { replace: true });
  }, [authLoading, user, navigate]);

  /** Foca um campo e o torna o alvo da digitação do teclado na tela. */
  const focarCampo = useCallback((campo: Campo) => {
    setCampoAtivo(campo);
    const alvo = campo === 'email' ? emailRef.current : senhaRef.current;
    alvo?.focus({ preventScroll: true });
  }, []);

  /** Leva o foco para a PRIMEIRA tecla do teclado na tela. */
  const focarTeclado = useCallback(() => {
    const primeira = tecladoRef.current?.querySelector<HTMLButtonElement>('[data-tv-key]');
    primeira?.focus({ preventScroll: true });
  }, []);

  const digitar = useCallback(
    (t: string) => {
      const inserir = (v: string) => (v + t).slice(0, LIMITE);
      if (campoAtivo === 'email') setEmail(inserir);
      else setSenha(inserir);
    },
    [campoAtivo],
  );

  const apagar = useCallback(() => {
    const cortar = (v: string) => v.slice(0, -1);
    if (campoAtivo === 'email') setEmail(cortar);
    else setSenha(cortar);
  }, [campoAtivo]);

  const limpar = useCallback(() => {
    if (campoAtivo === 'email') setEmail('');
    else setSenha('');
  }, [campoAtivo]);

  const entrar = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (enviando) return;
      if (!email.trim() || !senha) {
        setErro('Preencha o e-mail e a senha para entrar.');
        return;
      }
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
    },
    [email, senha, enviando, signIn, navigate],
  );

  /**
   * Teclas DENTRO dos campos. Com um campo de texto focado, a navegação
   * espacial global sai de cena (ver useTvNavigation), então o formulário
   * define o caminho do D-pad:
   *   ↓  e-mail → senha → teclado na tela
   *   ↑  volta (senha → e-mail)
   *   OK/Enter  avança; no campo de senha, entra
   * ← → continuam movendo o cursor dentro do texto (comportamento nativo).
   */
  function teclasDoCampo(campo: Campo) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      const c = e.keyCode || e.which;
      const desce = e.key === 'ArrowDown' || e.key === 'Down' || c === 40 || c === 20;
      const sobe = e.key === 'ArrowUp' || e.key === 'Up' || c === 38 || c === 19;
      const confirma =
        e.key === 'Enter' || e.key === 'OK' || e.key === 'Select' || c === 13 || c === 23;

      if (desce) {
        e.preventDefault();
        if (campo === 'email') focarCampo('senha');
        else focarTeclado();
        return;
      }
      if (sobe) {
        e.preventDefault();
        if (campo === 'senha') focarCampo('email');
        return;
      }
      if (confirma) {
        e.preventDefault();
        if (campo === 'email') focarCampo('senha');
        else void entrar();
      }
    };
  }

  return (
    <div className="tv-page tv-page-login">
      <div className="tv-login">
        <div className="tv-login-marca">
          <TvMark className="tv-login-marca-img" />
        </div>
        <h1 className="tv-login-titulo">Entrar no MovieFlix</h1>
        <p className="tv-login-sub">
          Use a mesma conta do site e do aplicativo. Seu plano, favoritos e progresso continuam os mesmos.
        </p>

        {/* noValidate: a validação nativa do navegador não é navegável pelo
            controle remoto; validamos aqui e mostramos o aviso na tela. */}
        <form onSubmit={entrar} className="tv-login-form" data-tv-form noValidate>
          {erro ? (
            <div className="tv-login-erro" role="alert">
              <AlertCircle className="tv-icon-sm" />
              <span>{erro}</span>
            </div>
          ) : null}

          <div className="tv-login-campos">
            <label className="tv-login-campo">
              <span className="tv-login-rotulo">E-mail</span>
              <span
                className={cn(
                  'tv-login-input-wrap',
                  campoAtivo === 'email' && 'tv-login-campo-ativo',
                )}
              >
                <Mail className="tv-login-icone" aria-hidden="true" />
                <input
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setCampoAtivo('email')}
                  onKeyDown={teclasDoCampo('email')}
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
              <span
                className={cn(
                  'tv-login-input-wrap',
                  campoAtivo === 'senha' && 'tv-login-campo-ativo',
                )}
              >
                <Lock className="tv-login-icone" aria-hidden="true" />
                <input
                  ref={senhaRef}
                  type="password"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  onFocus={() => setCampoAtivo('senha')}
                  onKeyDown={teclasDoCampo('senha')}
                  className="tv-login-input"
                  data-tv-focusable
                  tabIndex={0}
                />
              </span>
            </label>
          </div>

          <div ref={tecladoRef} className="tv-login-teclado-wrap">
            <TvKeyboard
              onTecla={digitar}
              onApagar={apagar}
              onLimpar={limpar}
              onEntrar={() => void entrar()}
            />
          </div>

          <p className="tv-login-dica">
            Digite com as ← → ↑ ↓ e OK no teclado acima — ou use o teclado do controle remoto.
          </p>

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
