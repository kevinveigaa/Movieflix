import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Loader2, ChevronLeft, Keyboard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TvMark } from './TvBrand';
import { TvKeyboard } from './TvKeyboard';
import { abrirTecladoDaTv } from '@/lib/tecladoTv';
import { cn } from '@/lib/cn';

/**
 * TvLoginPage — login DENTRO da experiência de TV.
 *
 * CAUSA RAIZ 1 — "pós-login vira layout de celular/site": as telas de TV
 * mandavam o usuário para `/login` e `/selecionar-perfil` — rotas do SITE, que
 * vivem sob o AppLayout (Navbar no topo + Footer). Agora o login acontece DENTRO
 * de `/tv/login`, com a mesma conta/Supabase e a mesma função `signIn`.
 *
 * CAUSA RAIZ 2 — FOCO E DIGITAÇÃO: o formulário dependia de dois mecanismos que
 * NÃO funcionam juntos numa TV:
 *   a) a navegação espacial global (useTvNavigation) intercepta TODAS as setas e
 *      o OK em fase de CAPTURA — ao focar um campo, as setas eram consumidas
 *      pela navegação e não chegavam ao campo (parecia que "o foco saía");
 *   b) o hook ainda mandava `blur()+focus()` e pedia o teclado DO SISTEMA ao
 *      ganhar foco — foco programático NÃO abre o IME no WebView, então o campo
 *      ficava com o anel mas nada era digitável.
 *
 * CORREÇÃO (três camadas, nenhuma dependente de IME):
 *   1. o formulário marca-se com `data-tv-form`; com um CAMPO DE TEXTO focado
 *      dentro dele, o `useTvNavigation` não intercepta mais nada (o formulário
 *      é dono do foco). Foco e digitação param de ser "roubados".
 *   2. há um TECLADO NA TELA (TvKeyboard) navegável SÓ com o D-pad — a digitação
 *      funciona em qualquer TV Box, com ou sem IME.
 *   3. o plano de foco do D-pad é explícito: e-mail → senha → teclado → Entrar,
 *      com ↑ voltando — sem perda de foco em nenhum passo.
 *
 * ── O QUE MUDOU NESTA VERSÃO (relato: "o teclado aparece sozinho e está
 *    faltando caractere") ─────────────────────────────────────────────────────
 *   • O TECLADO AGORA FICA OCULTO POR PADRÃO (`tecladoAberto = false`). Ele não
 *     ocupa mais a tela ao abrir o login — só aparece quando o usuário pede.
 *   • Há um BOTÃO PEQUENO E DISCRETO (ícone de teclado) ao lado dos campos, na
 *     mesma linha, alcançável pelo D-pad, que ABRE e FECHA o teclado. O rótulo
 *     muda com o estado, então o usuário sabe o que o botão faz.
 *   • O teclado passou a ter TODOS os caracteres (abas Letras/Números/Símbolos);
 *     o detalhe está documentado no TvKeyboard.
 *   • Com o teclado fechado, ↓ vai de E-mail para Senha e de Senha para Entrar;
 *     com o teclado aberto, ↓ de Senha leva ao teclado. ↑ sempre volta.
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
  /**
   * O teclado na tela está aberto? COMEÇA FECHADO — o teclado não deve aparecer
   * sozinho ao abrir o login; quem decide é o usuário, pelo botão de teclado.
   */
  const [tecladoAberto, setTecladoAberto] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const senhaRef = useRef<HTMLInputElement>(null);
  const tecladoRef = useRef<HTMLDivElement>(null);
  const btnTecladoRef = useRef<HTMLButtonElement>(null);

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

  /**
   * Leva o foco para a PRIMEIRA LETRA do teclado na tela.
   *
   * Cuidado com o seletor: a barra de ABAS (ABC / 123 / #+& / Fechar) também
   * carrega `data-tv-key`, então um `querySelector('[data-tv-key]')` genérico
   * focava o botão da ABA — e o usuário teria de descer para chegar às letras.
   * A grade tem a sua própria marca (`tv-keyboard-grade`), e é nela que o foco
   * deve cair: quem abriu o teclado quer DIGITAR.
   */
  const focarTeclado = useCallback(() => {
    const primeira = tecladoRef.current?.querySelector<HTMLButtonElement>(
      '.tv-keyboard-grade [data-tv-key]',
    );
    primeira?.focus({ preventScroll: true });
  }, []);

  /**
   * Abre/fecha o teclado na tela. Ao abrir, o foco vai para a primeira tecla; ao
   * fechar, volta para o campo ativo (nunca fica sem foco — na TV isso faria o
   * controle remoto "sumir").
   */
  const alternarTeclado = useCallback(() => {
    setTecladoAberto((aberto) => {
      const proximo = !aberto;
      window.setTimeout(() => {
        if (proximo) focarTeclado();
        else {
          const alvo = campoAtivo === 'email' ? emailRef.current : senhaRef.current;
          alvo?.focus({ preventScroll: true });
        }
      }, 40);
      return proximo;
    });
  }, [campoAtivo, focarTeclado]);

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
   *   ↓  e-mail → senha → (teclado, se aberto) → Entrar
   *   ↑  volta (senha → e-mail)
   *   OK/Enter  avançava; no campo de senha, entra
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
        else if (tecladoAberto) focarTeclado();
        else btnTecladoRef.current?.focus({ preventScroll: true });
        return;
      }
      if (sobe) {
        e.preventDefault();
        if (campo === 'senha') focarCampo('email');
        return;
      }
      if (confirma) {
        // OK/ENTER num campo de texto: SOBE O TECLADO DA TV e MANTÉM o foco no
        // campo. Antes o OK movia o foco para o OUTRO campo (e-mail → senha) em
        // ~1 ms: o campo confirmado perdia o foco no mesmo instante, o teclado
        // era re-alvo/fechado e não sobrava tempo de digitar — exatamente o
        // "o teclado abre e sai sozinho" relatado.
        e.preventDefault();
        const alvo = campo === 'email' ? emailRef.current : senhaRef.current;
        alvo?.focus({ preventScroll: true });
        if (alvo && alvo.dataset.mfTecladoOk !== '1') {
          alvo.dataset.mfTecladoOk = '1';
          abrirTecladoDaTv();
        }
        // Atalho preservado: OK na SENHA com os dois campos já preenchidos entra.
        if (campo === 'senha' && email.trim() && senha) void entrar();
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

            {/* Botão PEQUENO e DISCRETO que abre/fecha o teclado na tela. Fica na
                mesma linha dos campos e é alcançável pelo D-pad: sem ele o
                usuário não teria como pedir o teclado numa TV sem IME. */}
            <button
              ref={btnTecladoRef}
              type="button"
              data-tv-focusable
              data-tv-keyboard-toggle
              tabIndex={0}
              aria-pressed={tecladoAberto}
              aria-label={tecladoAberto ? 'Fechar o teclado na tela' : 'Abrir o teclado na tela'}
              title={tecladoAberto ? 'Fechar o teclado' : 'Abrir o teclado'}
              onClick={alternarTeclado}
              className={cn('tv-login-teclado-btn', tecladoAberto && 'tv-login-teclado-btn-ativo')}
            >
              <Keyboard className="tv-icon-sm" aria-hidden="true" />
              <span className="tv-login-teclado-btn-txt">
                {tecladoAberto ? 'Fechar' : 'Teclado'}
              </span>
            </button>
          </div>

          {/* O teclado SÓ existe no DOM quando o usuário o abre (oculto por padrão). */}
          {tecladoAberto ? (
            <div ref={tecladoRef} className="tv-login-teclado-wrap">
              <TvKeyboard
                onTecla={digitar}
                onApagar={apagar}
                onLimpar={limpar}
                onEntrar={() => void entrar()}
                onFechar={alternarTeclado}
              />
            </div>
          ) : (
            <p className="tv-login-dica">
              Use o teclado do controle remoto — ou abra o teclado na tela no botão acima.
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            data-tv-focusable
            tabIndex={0}
            onKeyDown={(e) => {
              // ↑ do botão Entrar devolve o foco à senha, para o D-pad nunca
              // ficar "preso" no último elemento do formulário.
              const c = e.nativeEvent.keyCode || e.nativeEvent.which;
              if (e.key === 'ArrowUp' || e.key === 'Up' || c === 38 || c === 19) {
                e.preventDefault();
                focarCampo('senha');
              }
            }}
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
