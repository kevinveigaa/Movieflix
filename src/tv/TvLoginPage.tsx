import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Loader2, ChevronLeft, Keyboard } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TvMark } from './TvBrand';
import { TvKeyboard } from './TvKeyboard';
import { reabrirFocoDeTexto } from '@/lib/tecladoTv';
import { dentroDeFormularioTv } from './tvElementos';
import { cn } from '@/lib/cn';

/**
 * TvLoginPage — login DENTRO da experiência de TV.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * CAUSA RAIZ (REAL, medida no VÍDEO gravado na TV do usuário) — o foco era
 * EXPULSO do campo ao apertar OK e NENHUM teclado abria.
 * ══════════════════════════════════════════════════════════════════════════════
 * Relato: "eu coloco no campo do e-mail e da senha mas o foco sai antes de eu
 * escrever algo". O vídeo mostra o gatilho com precisão: o usuário leva o foco
 * até o campo de E-mail/Senha (o anel da marca aparece corretamente), aperta
 * **OK** — e o foco volta sozinho para a COLUNA LATERAL, sem teclado nenhum.
 *
 * Eram TRÊS coisas independentes agindo sobre o mesmo OK, sem coordenação:
 *
 *  1. `useTvNavigation` (keydown GLOBAL, em fase de CAPTURA) interceptava TODO
 *     `ArrowUp/Down/Left/Right`, `Enter/OK` e `Backspace`. Como roda na CAPTURA,
 *     ela agia ANTES de qualquer handler do formulário — e a sua lógica de "OK
 *     num campo de texto" chamava `preventDefault()`, cancelando justamente o
 *     gesto que o WebView do Android usa para abrir o teclado. Resultado: no
 *     aparelho real, o IME nunca subia.
 *
 *  2. O formulário tinha OUTRA regra para o mesmo OK. Detalhe que fecha o caso:
 *     no Android TV o "OK" do controle chega como `keyCode 23`, e uma tecla
 *     FÍSICA de digitação também tem número — `keyCode 23` cai na faixa de
 *     letras. Com dois handlers para a mesma tecla, a MESMA pulsação era
 *     interpretada duas vezes ("abrir teclado" E "seguir como digitação"), e o
 *     navegador executava a ativação padrão do elemento.
 *
 *  3. Como o foco saía do campo (por 1 ou 2), a seta seguinte era consumida pela
 *     navegação espacial — e o vizinho mais próximo à ESQUERDA do formulário é
 *     a coluna lateral. É exatamente o que o vídeo mostra: o foco "volta
 *     sozinho" para o menu.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * CORREÇÃO — UM ÚNICO DONO DO FOCO, DO OK E DO TECLADO
 * ══════════════════════════════════════════════════════════════════════════════
 *  • O formulário INTEIRO (campos + botão do teclado + teclado na tela) vive
 *    dentro de um mesmo `[data-tv-form]`. Com o foco em QUALQUER elemento daqui
 *    de dentro, o `useTvNavigation` NÃO intercepta mais NADA — nem setas, nem
 *    OK, nem digitação (ver a guarda `dentroDeFormularioTv` na navegação). Só o
 *    Voltar continua ativo, para o usuário nunca ficar preso na tela. É isto que
 *    impede o foco de escapar para a coluna lateral no meio da digitação.
 *
 *  • O OK tem UM caminho só (`abrirTexto`): foca o campo DENTRO do gesto do
 *    usuário e abre o TECLADO NA TELA. Não existe mais um segundo handler
 *    interpretando o mesmo OK.
 *
 *  • O teclado da digitação é o TECLADO NA TELA (TvKeyboard), de forma
 *    DETERMINÍSTICA — em TODOS os aparelhos, com ou sem IME:
 *      – não depende de o Android ter um teclado virtual instalado (muitos TV
 *        Box não têm nenhum, e era por isso que "nada abria");
 *      – não depende de a ponte nativa responder;
 *      – e, principalmente, NÃO convive com o teclado do sistema, então não
 *        existe o "dois teclados" nem o teclado abrindo e fechando em loop.
 *    O teclado na tela carrega TODOS os caracteres (abas ABC / 123 / #+&), é
 *    navegável só com o D-pad e escreve direto no campo — sem IME nenhum.
 *
 *  • A cadeia do D-pad é EXPLÍCITA e fechada (não depende da navegação espacial
 *    do navegador, que em WebView de TV é irregular):
 *      E-mail ─↓→ Senha ─↓→ [Teclado] ─↓→ Entrar ─↑→ Senha
 *      Teclado na tela: ↑ na primeira linha volta ao campo ativo;
 *                       ↓ na última linha vai ao botão "Entrar"/"Fechar".
 *
 *  • `data-tv-initial-focus` SAIU do campo de e-mail e a tela marca-se com
 *    `data-tv-sem-autofoco`: a recuperação automática de foco do `TvLayout`
 *    (que tentava recuperar o foco em 5 instantes) não toca nesta tela. O foco
 *    inicial é dado AQUI, uma única vez, no campo de e-mail.
 *
 *  • A DIGITAÇÃO nunca é interceptada: com um campo de texto focado, o handler
 *    do campo só trata `Enter/OK`, `↑` e `↓`. Toda outra tecla (letras, números,
 *    símbolos, espaço) segue direto para o campo.
 *
 * ── CONTEXTO HISTÓRICO ────────────────────────────────────────────────────────
 *  • As telas de TV mandavam o usuário para `/login` (rota do SITE, sob o
 *    AppLayout com Navbar + Footer). Agora o login acontece DENTRO de
 *    `/tv/login`, com a mesma conta/Supabase e a mesma função `signIn`.
 *  • O campo recebia foco por `.focus()` PROGRAMÁTICO — no WebView do Android
 *    isso não é gesto do usuário, e foco programático não abre o IME. Por isso a
 *    digitação NÃO depende de IME: ela tem o teclado na tela.
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
  /** O teclado na tela está aberto? Só abre quando o usuário pede. */
  const [tecladoAberto, setTecladoAberto] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const senhaRef = useRef<HTMLInputElement>(null);
  const tecladoRef = useRef<HTMLDivElement>(null);
  const btnTecladoRef = useRef<HTMLButtonElement>(null);
  const btnEntrarRef = useRef<HTMLButtonElement>(null);
  /** Instante da última mudança de foco feita pelo formulário (anti-repetição). */
  const ultimaMudancaFoco = useRef(0);
  /** O foco inicial já foi dado? (uma única vez por montagem) */
  const jaFocouInicial = useRef(false);

  // Já autenticado: segue para a seleção de perfil / Home da TV.
  useEffect(() => {
    if (!authLoading && user) navigate('/tv/perfil', { replace: true });
  }, [authLoading, user, navigate]);

  /**
   * FOCO INICIAL — uma única vez, no campo de E-mail.
   *
   * A tela está marcada com `data-tv-sem-autofoco`, então o `TvLayout` não tenta
   * recuperar o foco aqui (era uma das tentativas de recuperação que roubava o
   * foco no meio da digitação). O foco inicial é dado por nós, uma vez só, no
   * campo que o usuário quer preencher primeiro — e NÃO pedimos teclado nenhum:
   * numa TV o teclado aparece quando o usuário aperta OK no campo.
   */
  useEffect(() => {
    if (jaFocouInicial.current) return;
    jaFocouInicial.current = true;
    const t = window.setTimeout(() => {
      emailRef.current?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
  }, []);

  /**
   * Evita que uma única pulsação do controle seja contada duas vezes.
   *
   * O `click` nativo de um elemento focado e o `Enter/OK` do keydown chegam como
   * duas ativações. Sem esta trava, mover o foco no OK fazia o foco "passar
   * direto" pelo elemento (era parte do bug relatado). O limite é curto de
   * propósito: pulsar rápido continua funcionando, e a repetição de uma tecla
   * PRESA é suprimida.
   */
  const suprimirRepeticao = useCallback((ms = 250) => {
    const agora = Date.now();
    if (agora - ultimaMudancaFoco.current < ms) return true;
    ultimaMudancaFoco.current = agora;
    return false;
  }, []);

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
   * ABRE A DIGITAÇÃO para um campo — o ÚNICO caminho do OK no formulário.
   *
   * Reafirma o foco no campo DENTRO do gesto do usuário (sem blur: o foco nunca
   * sai do campo) e abre o TECLADO NA TELA. É o caminho que funciona em qualquer
   * TV Box, com ou sem teclado do sistema instalado.
   */
  const abrirTexto = useCallback(
    (campo: Campo) => {
      const alvo = campo === 'email' ? emailRef.current : senhaRef.current;
      setCampoAtivo(campo);
      if (alvo) reabrirFocoDeTexto(alvo);
      setTecladoAberto(true);
      window.setTimeout(() => focarTeclado(), 40);
    },
    [focarTeclado],
  );

  /**
   * Fecha o teclado e devolve o foco ao campo ativo (nunca fica sem foco — na TV
   * isso faria o controle remoto "sumir").
   */
  const fecharTeclado = useCallback(() => {
    setTecladoAberto(false);
    const alvo = campoAtivo === 'email' ? emailRef.current : senhaRef.current;
    alvo?.focus({ preventScroll: true });
  }, [campoAtivo]);

  /** Abre/fecha o teclado pelo botão discreto da mesma linha dos campos. */
  const alternarTeclado = useCallback(() => {
    if (tecladoAberto) fecharTeclado();
    else {
      const alvo = campoAtivo === 'email' ? emailRef.current : senhaRef.current;
      if (alvo) reabrirFocoDeTexto(alvo);
      setTecladoAberto(true);
      window.setTimeout(() => focarTeclado(), 40);
    }
  }, [tecladoAberto, campoAtivo, fecharTeclado, focarTeclado]);

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
   * Teclas DENTRO dos campos de texto.
   *
   * Só três teclas têm tratamento próprio: `Enter/OK` (abre o teclado e
   * PERMANECE no campo), `↓` (E-mail → Senha → Teclado → Entrar) e `↑` (volta).
   * TODA outra tecla é DIGITAÇÃO e segue para o campo sem ser interceptada —
   * era isso que impedia de escrever no login da TV.
   */
  function teclasDoCampo(campo: Campo) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Outro handler já tratou esta tecla. Sem esta guarda, o mesmo OK era
      // processado duas vezes (uma como "abrir teclado", outra como digitação).
      if (e.defaultPrevented) return;

      const c = e.keyCode || e.which;
      const desce = e.key === 'ArrowDown' || e.key === 'Down' || c === 40 || c === 20;
      const sobe = e.key === 'ArrowUp' || e.key === 'Up' || c === 38 || c === 19;
      const confirma =
        e.key === 'Enter' || e.key === 'OK' || e.key === 'Select' || c === 13 || c === 23;

      if (confirma) {
        e.preventDefault();
        e.stopPropagation();
        abrirTexto(campo);
        return;
      }
      if (desce) {
        e.preventDefault();
        e.stopPropagation();
        if (suprimirRepeticao()) return;
        if (campo === 'email') {
          focarCampo('senha');
          return;
        }
        // Da senha, ↓ leva ao teclado (aberto) ou ao botão do teclado.
        if (tecladoAberto) focarTeclado();
        else btnTecladoRef.current?.focus({ preventScroll: true });
        return;
      }
      if (sobe) {
        e.preventDefault();
        e.stopPropagation();
        if (suprimirRepeticao()) return;
        if (campo === 'senha') focarCampo('email');
        return;
      }
      // Qualquer outra tecla: DIGITAÇÃO. Segue direto para o campo.
    };
  }

  /** Teclas no BOTÃO DO TECLADO: ↓ continua a cadeia (teclado na tela ou Entrar). */
  function teclasDoBotaoTeclado(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.defaultPrevented) return;
    const c = e.nativeEvent.keyCode || e.nativeEvent.which;
    const desce = e.key === 'ArrowDown' || e.key === 'Down' || c === 40 || c === 20;
    const sobe = e.key === 'ArrowUp' || e.key === 'Up' || c === 38 || c === 19;
    if (desce) {
      e.preventDefault();
      e.stopPropagation();
      if (suprimirRepeticao()) return;
      if (tecladoAberto) focarTeclado();
      else btnEntrarRef.current?.focus({ preventScroll: true });
      return;
    }
    if (sobe) {
      e.preventDefault();
      e.stopPropagation();
      if (suprimirRepeticao()) return;
      focarCampo('senha');
    }
  }

  /**
   * SAÍDA do teclado na tela. O `TvKeyboard` resolve as setas DENTRO dele e, nas
   * bordas (primeira/última linha) ou no Back, avisa aqui — é assim que a cadeia
   * de foco se fecha, sem nunca deixar o foco cair no fim do documento.
   */
  const sairDoTeclado = useCallback(
    (sentido: 'cima' | 'baixo' | 'escapar') => {
      if (suprimirRepeticao()) return;
      if (sentido === 'escapar') {
        fecharTeclado();
        return;
      }
      if (sentido === 'cima') {
        focarCampo(campoAtivo);
        return;
      }
      // `baixo`: sai do teclado e vai à AÇÃO do formulário ("Entrar").
      btnEntrarRef.current?.focus({ preventScroll: true });
    },
    [campoAtivo, fecharTeclado, focarCampo, suprimirRepeticao],
  );

  const rotuloTeclado = tecladoAberto ? 'Fechar' : 'Teclado';

  return (
    /* `data-tv-sem-autofoco`: a recuperação automática de foco do TvLayout não
       age nesta tela. Sem isso, uma das tentativas de recuperação roubava o foco
       no meio da digitação — o bug relatado. O foco inicial é dado por esta
       própria tela, uma única vez, no campo de e-mail. */
    <div className="tv-page tv-page-login" data-tv-sem-autofoco>
      <div className="tv-login">
        <div className="tv-login-marca">
          <TvMark className="tv-login-marca-img" />
        </div>
        <h1 className="tv-login-titulo">Entrar no MovieFlix</h1>
        <p className="tv-login-sub">
          Use a mesma conta do site e do aplicativo. Seu plano, favoritos e progresso continuam os mesmos.
        </p>

        {/* `data-tv-form`: enquanto o foco estiver em QUALQUER elemento daqui de
            dentro — campo, tecla do teclado na tela ou botão — a navegação
            espacial global NÃO intercepta teclas (só o Voltar continua ativo).
            É o que impede o foco de escapar para a coluna lateral. */}
        <div data-tv-form>
          {/* noValidate: a validação nativa do navegador não é navegável pelo
              controle remoto; validamos aqui e mostramos o aviso na tela. */}
          <form onSubmit={entrar} className="tv-login-form" noValidate>
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

              {/* Botão PEQUENO e DISCRETO que abre/fecha o teclado. Fica na mesma
                  linha dos campos e é alcançável pelo D-pad (↓ a partir da
                  senha). É o atalho para o teclado na tela em qualquer TV. */}
              <button
                ref={btnTecladoRef}
                type="button"
                data-tv-focusable
                data-tv-keyboard-toggle
                tabIndex={0}
                aria-pressed={tecladoAberto}
                aria-label={tecladoAberto ? 'Fechar o teclado na tela' : 'Abrir o teclado'}
                title={tecladoAberto ? 'Fechar o teclado' : 'Abrir o teclado'}
                onClick={alternarTeclado}
                onKeyDown={teclasDoBotaoTeclado}
                className={cn('tv-login-teclado-btn', tecladoAberto && 'tv-login-teclado-btn-ativo')}
              >
                <Keyboard className="tv-icon-sm" aria-hidden="true" />
                <span className="tv-login-teclado-btn-txt">{rotuloTeclado}</span>
              </button>
            </div>

            {/* O teclado na tela SÓ existe no DOM quando o usuário o abre. */}
            {tecladoAberto ? (
              <div ref={tecladoRef} className="tv-login-teclado-wrap">
                <TvKeyboard
                  onTecla={digitar}
                  onApagar={apagar}
                  onLimpar={limpar}
                  onEntrar={() => void entrar()}
                  onFechar={fecharTeclado}
                  onSair={sairDoTeclado}
                />
              </div>
            ) : (
              <p className="tv-login-dica">
                Pressione OK no campo para abrir o teclado e digitar.
              </p>
            )}

            <button
              ref={btnEntrarRef}
              type="submit"
              disabled={enviando}
              data-tv-focusable
              tabIndex={0}
              onKeyDown={(e) => {
                // ↑ do botão Entrar devolve o foco à senha, para o D-pad nunca
                // ficar "preso" no último elemento do formulário.
                if (e.defaultPrevented) return;
                const c = e.nativeEvent.keyCode || e.nativeEvent.which;
                if (e.key === 'ArrowUp' || e.key === 'Up' || c === 38 || c === 19) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (suprimirRepeticao()) return;
                  focarCampo('senha');
                }
              }}
              className="tv-btn tv-btn-primary tv-btn-lg tv-login-entrar"
            >
              {enviando ? <Loader2 className="tv-icon-sm tv-spin" /> : null}
              {enviando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

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
