import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronLeft, Keyboard, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TvMark } from './TvBrand';
import { TvKeyboard } from './TvKeyboard';
import { cn } from '@/lib/cn';
import {
  ehCampoDeTexto,
  esconderTecladoNativo,
  pedirTecladoNativo,
  reabrirFocoDeTexto,
  temPonteDeTeclado,
} from '@/lib/tecladoTv';
import { instalarGuardaDeFoco } from '@/tv/focoTv';

/**
 * TvLoginPage — tela de login do MovieFlix TV, RECONSTRUÍDA DO ZERO.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * REQUISITO DO DONO (especificação formal)
 * ═══════════════════════════════════════════════════════════════════════════
 *  • Tela IMERSIVA: sem menu/barra lateral e sem elementos focáveis
 *    concorrentes ao lado do formulário (era para a coluna lateral que o foco
 *    fugia).
 *  • O foco PERMANECE no campo selecionado até o usuário sair deliberadamente
 *    (↑/↓ ou Voltar) — nenhum timer, recuperação automática ou revalidação
 *    pode roubar o foco durante a digitação.
 *  • OK no campo abre o teclado e ele PERMANECE aberto — teclado nativo da TV
 *    quando existe, teclado na tela quando não existe; NUNCA os dois.
 *  • ↑/↓ alternam só entre campos e teclado; OK no campo abre o teclado (não
 *    pula para o próximo campo).
 *  • Voltar fecha o teclado quando ele está aberto.
 *  • Nada de lógica concorrente de foco/blur herdada da implementação antiga.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CAUSAS RAIZ ENCONTRADAS (por que as tentativas anteriores não resolveram)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1) O SITE AO VIVO NUNCA RECEBEU AS CORREÇÕES. O `main` já tinha as três
 *    tentativas anteriores, mas o `index.html` servido em produção era um
 *    build de 23/09 — ou seja, a TV estava executando o código ANTIGO, não as
 *    correções. Isso explica "funciona no navegador e não no aparelho".
 *    → Além do código, esta entrega adiciona a marcação de versão do site e o
 *      cache-buster na URL carregada pelo app (ver TvApp/TvConfig).
 *
 * 2) DOIS DONOS PARA O MESMO OK. A navegação espacial global rodava em fase de
 *    CAPTURA e consumia setas/OK antes do formulário — e ainda pedia o teclado
 *    do sistema (`data-mf-teclado-ok`) enquanto ESTA tela abria o teclado na
 *    tela. Eram dois pedidos de teclado para a mesma pulsação: era isso que
 *    fazia o teclado "ligar e desligar" e trocar de um para o outro.
 *    → Agora a tela é marcada como um formulário de TV (`data-tv-form`) e a
 *      navegação global se abstém POR COMPLETO enquanto o foco está aqui
 *      dentro (menos o Voltar), e esta tela é o ÚNICO dono do OK, das setas e
 *      do teclado.
 *
 * 3) O FOCO "VOLTANDO SOZINHO" PARA A COLUNA LATERAL. A rota `/tv/login` não
 *    era imersiva, então a barra lateral era o vizinho mais próximo à esquerda
 *    do formulário — o destino natural quando o foco saía. E a recuperação
 *    automática de foco do layout tentava recuperar o foco em 5 instantes
 *    (250/700/1300/2100/3200 ms), inclusive DURANTE a digitação.
 *    → A rota do login agora é imersiva (sem barra lateral) e a tela marca-se
 *      com `data-tv-sem-autofoco`: nenhum timer de recuperação age aqui.
 *
 * 4) O PRÓPRIO "flash de foco" (blur()+focus()) do `reabrirFocoDeTexto`
 *    disparava `focusout` no meio do gesto, e o handler global reagia
 *    limpando o destaque e re-validando o "primeiro OK" — o campo piscava e o
 *    foco caía fora. → Blur eliminado do módulo do teclado.
 *
 * 5) NO LADO ANDROID, o monitor de geometria (usado para manter tela cheia com
 *    teclado) chamava `webView.requestFocus()` a CADA mudança de geometria.
 *    Com o IME aberto, isso puxava o foco nativo de volta para o WebView e
 *    fechava o teclado — que mudava a geometria de novo: um LOOP de teclado
 *    abrindo/fechando. → Removido no MainActivity (ver o APK 4.0.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * COMO O FOCO SE MANTÉM NO CAMPO (sem timer nenhum)
 * ═══════════════════════════════════════════════════════════════════════════
 * A tela registra UM listener de `focusin` no documento. No instante EXATO em
 * que o foco passa a estar fora do formulário (um script de terceiro, o IME do
 * sistema, uma re-renderização do React, o que for), a tela devolve o foco ao
 * campo ativo — sincronamente, sem `setTimeout`, sem polling e sem "recuperação
 * retardada". É a tradução literal do requisito: "o foco permanece no campo
 * selecionado até o usuário sair deliberadamente".
 *
 * Como as outras telas continuam funcionando: enquanto o foco está em qualquer
 * elemento marcado `[data-tv-focusable]`, a recuperação NÃO age — só quando o
 * foco escapa para um elemento que não é navegável do formulário.
 */

type Campo = 'email' | 'senha';

/** Limite de caracteres por campo (e-mail e senha). */
const LIMITE = 120;

/**
 * Intervalo mínimo entre duas ativações por OK.
 *
 * Vale SÓ para o OK/Enter — nunca para as setas. O "click" nativo de um
 * elemento focado e o "Enter/OK" do keydown podem chegar como duas ativações
 * da MESMA pulsação; sem a trava, o teclado abria e fechava no mesmo toque.
 * Aplicar o mesmo intervalo às setas fazia `↓↓` rápido ser engolido — o
 * usuário aperta duas vezes e move uma.
 */
const INTERVALO_OK_MS = 600;

interface TeclaControle {
  ok: boolean;
  cima: boolean;
  baixo: boolean;
  esquerda: boolean;
  direita: boolean;
  voltar: boolean;
}

/** Traduz o evento do controle remoto (Android TV usa keyCode 19-23 e 4). */
function lerTecla(e: KeyboardEvent): TeclaControle {
  const c = e.keyCode || e.which;
  const k = e.key || '';
  return {
    ok: k === 'Enter' || k === 'OK' || k === 'Select' || c === 13 || c === 23,
    cima: k === 'ArrowUp' || k === 'Up' || c === 38 || c === 19,
    baixo: k === 'ArrowDown' || k === 'Down' || c === 40 || c === 20,
    esquerda: k === 'ArrowLeft' || k === 'Left' || c === 37 || c === 21,
    direita: k === 'ArrowRight' || k === 'Right' || c === 39 || c === 22,
    voltar:
      k === 'Escape' ||
      k === 'GoBack' ||
      k === 'BrowserBack' ||
      k === 'XF86Back' ||
      c === 27 ||
      c === 4 ||
      c === 461 ||
      c === 10009 ||
      c === 166,
  };
}

/** A tecla é de CONTROLE (navegação/ativação) — as demais são digitação. */
function ehTeclaDeControle(t: TeclaControle): boolean {
  return t.ok || t.cima || t.baixo || t.esquerda || t.direita || t.voltar;
}

/**
 * Escreve dentro do `<input>` REAL do campo ativo.
 *
 * A digitação vai para o elemento nativo e depois é sincronizada com o estado
 * do React pelo `onChange` — assim o cursor, a seleção e o `maxLength` do
 * próprio campo continuam valendo.
 */
function escreverNoCampo(el: HTMLInputElement, texto: string): void {
  const inicio = el.selectionStart ?? el.value.length;
  const fim = el.selectionEnd ?? el.value.length;
  el.setRangeText(texto, inicio, fim, 'end');
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Apaga o caractere anterior (ou a seleção) do campo. */
function apagarNoCampo(el: HTMLInputElement): void {
  const inicio = el.selectionStart ?? el.value.length;
  const fim = el.selectionEnd ?? el.value.length;
  if (inicio !== fim) {
    el.setRangeText('', inicio, fim, 'end');
  } else if (inicio > 0) {
    el.setRangeText('', inicio - 1, inicio, 'end');
  } else {
    return;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

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
   * O teclado NA TELA está aberto? Só é usado em aparelhos SEM teclado de
   * sistema — em aparelho com IME quem aparece é o teclado nativo, e nunca os
   * dois ao mesmo tempo.
   */
  const [tecladoNaTela, setTecladoNaTela] = useState(false);

  /**
   * O aparelho TEM teclado de sistema (IME)?
   *
   * NÃO é uma suposição: é CONFIRMADO pela geometria. Quando o teclado de
   * sistema abre no Android, a janela do WebView encolhe; o monitor abaixo
   * observa exatamente isso. Enquanto não houver confirmação, tratamos como
   * "não tem" — foi a suposição contrária ("a ponte existe, logo tem IME") que
   * deixava muitos TV Box sem NENHUMA forma de digitar.
   */
  const dispositivoTemIme = useRef(false);
  /** Timer da rede de proteção: IME pedido mas não abriu → teclado na tela. */
  const fallbackTeclado = useRef<number | null>(null);
  /** Altura da janela com o teclado FECHADO (referência da geometria). */
  const alturaSemTeclado = useRef<number>(
    typeof window === 'undefined' ? 0 : window.innerHeight,
  );

  const raizRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const senhaRef = useRef<HTMLInputElement>(null);
  const btnTecladoRef = useRef<HTMLButtonElement>(null);
  const btnEntrarRef = useRef<HTMLButtonElement>(null);
  const btnSairRef = useRef<HTMLButtonElement>(null);

  const campoAtivoRef = useRef<Campo>('email');
  const tecladoNaTelaRef = useRef(false);

  /** Instante da última ativação por OK (anti-repetição SÓ do OK). */
  const ultimaAtivacao = useRef(0);
  /** O foco inicial já foi dado? (uma única vez por montagem) */
  const jaFocouInicial = useRef(false);

  const campoDoRef = useCallback(
    (campo: Campo) => (campo === 'email' ? emailRef.current : senhaRef.current),
    [],
  );

  // Já autenticado: segue para a conta/Home da TV.
  useEffect(() => {
    if (!authLoading && user) navigate('/tv/perfil', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    campoAtivoRef.current = campoAtivo;
  }, [campoAtivo]);

  useEffect(() => {
    tecladoNaTelaRef.current = tecladoNaTela;
  }, [tecladoNaTela]);

  /**
   * MONITOR DE GEOMETRIA — descobre se o aparelho tem teclado de sistema.
   *
   * Quando o IME do Android sobe, a área visível do WebView encolhe (~140 px ou
   * muito mais). É a única forma confiável de saber, sem heurística de
   * user-agent, se ESTE aparelho realmente exibe um teclado.
   *
   * Ele serve a dois propósitos, e nenhum deles mexe no foco:
   *  1. marcar o aparelho como "tem IME" — a partir daí o OK no campo pede o
   *     teclado da TV e o teclado na tela NUNCA entra em cena (requisito: nunca
   *     os dois ao mesmo tempo, nunca piscando entre eles);
   *  2. cancelar a rede de proteção assim que o IME aparece (o teclado na tela
   *     só assume se o IME NÃO vier).
   */
  useEffect(() => {
    const aoMudarGeometria = () => {
      const altura = window.innerHeight;
      if (altura < alturaSemTeclado.current - 140) {
        dispositivoTemIme.current = true;
        if (fallbackTeclado.current !== null) {
          window.clearTimeout(fallbackTeclado.current);
          fallbackTeclado.current = null;
        }
        return;
      }
      // Janela inteira: o teclado de sistema está fechado.
      if (!dispositivoTemIme.current) alturaSemTeclado.current = altura;
    };
    window.addEventListener('resize', aoMudarGeometria);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', aoMudarGeometria);
    return () => {
      window.removeEventListener('resize', aoMudarGeometria);
      vv?.removeEventListener('resize', aoMudarGeometria);
    };
  }, []);

  /** Cancela a rede de proteção do teclado (IME abriu, ou o usuário saiu). */
  const cancelarFallbackTeclado = useCallback(() => {
    if (fallbackTeclado.current !== null) {
      window.clearTimeout(fallbackTeclado.current);
      fallbackTeclado.current = null;
    }
  }, []);

  /**
   * Registro de evidências para o teste automatizado (headless) e para o
   * usuário conseguir relatar onde o foco estava. Exposto no `window`.
   */
  const registrar = useCallback((evento: string, alvo?: HTMLElement | null) => {
    try {
      const w = window as unknown as { __mfLoginQA?: Array<Record<string, unknown>> };
      if (!w.__mfLoginQA) w.__mfLoginQA = [];
      const el = alvo ?? (document.activeElement as HTMLElement | null);
      w.__mfLoginQA.push({
        t: Date.now(),
        evento,
        alvo:
          el?.dataset?.tvKey ??
          (el?.tagName === 'INPUT' ? `input:${(el as HTMLInputElement).type}` : el?.tagName ?? 'nenhum'),
        dentroFormulario: !!el?.closest?.('[data-tv-form]'),
        tecladoNaTela: tecladoNaTelaRef.current,
      });
    } catch {
      /* diagnóstico nunca pode quebrar a tela */
    }
  }, []);

  /**
   * ── INVARIANTE DO FOCO (o coração desta reconstrução) ──────────────────────
   *
   * Devolve o foco ao alvo indicado se — e somente se — ele tiver escapado do
   * formulário. Roda SEMPRE de forma SÍNCRONA, dentro do próprio evento que
   * causou a saída (`focusin`), sem timer nenhum.
   *
   * @param preferido elemento que deve receber o foco, quando informado.
   * @returns true quando foi preciso recuperar o foco.
   */
  /**
   * Devolve o foco ao campo ativo SE ele tiver escapado do formulário.
   *
   * É o resgate usado DENTRO do próprio gesto do usuário (antes de tratar uma
   * tecla do controle): se o foco não estiver no formulário, a tecla é do
   * formulário e não do elemento invasor. `focus()` num elemento já ativo é
   * no-op, então não há custo quando está tudo certo.
   *
   * A GUARDA CONTÍNUA (para o instante em que NENHUMA tecla foi apertada) é
   * instalada abaixo por `instalarGuardaDeFoco` — os dois compartilham a mesma
   * noção de "dentro do formulário", que é o que evita os dois divergirem.
   */
  const recuperarFoco = useCallback((preferido?: HTMLElement | null): boolean => {
    const raiz = raizRef.current;
    if (!raiz) return false;
    const ativo = document.activeElement as HTMLElement | null;
    if (ativo && raiz.contains(ativo)) return false;
    const alvo = preferido ?? campoDoRef(campoAtivoRef.current);
    if (!alvo || !alvo.isConnected) return false;
    try {
      alvo.focus({ preventScroll: true });
    } catch {
      return false;
    }
    registrar('foco-recuperado', alvo);
    return true;
  }, [campoDoRef, registrar]);

  /**
   * FOCO INICIAL — uma única vez, no campo de E-mail, sem timer.
   *
   * A tela também está marcada com `data-tv-sem-autofoco`, então a recuperação
   * automática do layout não age aqui: o foco desta tela pertence a ela.
   */
  useEffect(() => {
    if (jaFocouInicial.current) return;
    jaFocouInicial.current = true;
    emailRef.current?.focus({ preventScroll: true });
    registrar('foco-inicial', emailRef.current);
  }, [registrar]);

  /**
   * A GUARDA DO FOCO: se o foco sair do formulário por QUALQUER motivo
   * (script de terceiro, IME do sistema, re-render, etc.), ele volta na hora.
   */
  /**
   * A GUARDA DO FOCO — a invariante desta tela, compartilhada em `@/tv/focoTv`.
   *
   * Ela observa `focusin`/`focusout` NO DOCUMENTO e devolve o foco ao campo ativo
   * no INSTANTE em que ele escapa — de forma síncrona, sem `setTimeout`, sem
   * `blur()` e sem escrever no DOM. Cobre os dois casos que quebravam o login:
   *  • um elemento fora do formulário recebendo foco (script de terceiro, uma
   *    re-renderização) — `focusin`, tratado no mesmo evento;
   *  • o foco indo para o `body` (o sistema fechando o teclado, por exemplo) —
   *    que NÃO emite `focusin`: coberto pela verificação no microtask seguinte.
   *
   * É a tradução literal do requisito "o foco permanece no campo durante toda
   * a digitação (do início ao fim do login)".
   */
  useEffect(() => {
    const raiz = raizRef.current;
    if (!raiz) return;
    return instalarGuardaDeFoco({
      raiz,
      alvoPreferido: () => campoDoRef(campoAtivoRef.current),
      aoRecuperar: (alvo) => registrar('foco-guarda', alvo),
    });
  }, [campoDoRef, registrar]);

  /** Teclado de sistema fechado ao sair da tela (não vaza para a Home). */
  useEffect(
    () => () => {
      cancelarFallbackTeclado();
      esconderTecladoNativo();
    },
    [cancelarFallbackTeclado],
  );

  // ───────────────────────────── AÇÕES ─────────────────────────────────────

  const focarElemento = useCallback(
    (el: HTMLElement | null | undefined, evento: string) => {
      if (!el) return;
      el.focus({ preventScroll: true });
      registrar(evento, el);
    },
    [registrar],
  );

  const focarCampo = useCallback(
    (campo: Campo) => {
      setCampoAtivo(campo);
      campoAtivoRef.current = campo;
      focarElemento(campoDoRef(campo), 'dpad-campo');
    },
    [campoDoRef, focarElemento],
  );

  /**
   * ABRE A DIGITAÇÃO para um campo — o ÚNICO caminho do OK no formulário.
   *
   * Garante que o campo continua sendo o elemento ativo (sem blur) e então:
   *  • há teclado de sistema → pede o teclado NATIVO da TV (IME) e mantém o
   *    teclado na tela fechado (nunca os dois);
   *  • não há teclado de sistema → abre o TECLADO NA TELA, que funciona em
   *    qualquer TV Box.
   */
  const abrirTexto = useCallback(
    (campo: Campo) => {
      setCampoAtivo(campo);
      campoAtivoRef.current = campo;
      const alvo = campoDoRef(campo);
      if (alvo) reabrirFocoDeTexto(alvo);

      // Já CONFIRMAMOS que este aparelho tem teclado de sistema: quem digita é
      // ele. O teclado na tela não entra em cena (nunca os dois).
      if (dispositivoTemIme.current) {
        cancelarFallbackTeclado();
        setTecladoNaTela(false);
        tecladoNaTelaRef.current = false;
        pedirTecladoNativo();
        registrar('ok-campo-ime', alvo);
        return;
      }

      // Ainda não sabemos. Se o app nativo está presente, pedimos o teclado da
      // TV — é a melhor experiência em Android TV / Google TV.
      if (temPonteDeTeclado()) {
        cancelarFallbackTeclado();
        setTecladoNaTela(false);
        tecladoNaTelaRef.current = false;
        pedirTecladoNativo();
        registrar('ok-campo-ime-ponte', alvo);
        // REDE DE PROTEÇÃO — é isto que impede o usuário de ficar sem teclado
        // nenhum num TV Box sem IME: se em 700 ms a janela não encolher, o
        // teclado de sistema NÃO abriu, então o teclado NA TELA assume. Nunca
        // ficam os dois abertos: o monitor de geometria cancela este fallback
        // no instante em que o IME sobe.
        fallbackTeclado.current = window.setTimeout(() => {
          fallbackTeclado.current = null;
          if (dispositivoTemIme.current) return; // o IME subiu: quem digita é ele
          if (tecladoNaTelaRef.current) return; // já aberto por outra via
          setTecladoNaTela(true);
          tecladoNaTelaRef.current = true;
          registrar('ok-campo-fallback-tela', alvo);
        }, 700);
        return;
      }

      // Sem a ponte do app (navegador de TV Box, WebView sem a ponte: aparelhos
      // em que o teclado de sistema não é confiável): teclado NA TELA, que
      // funciona em qualquer aparelho.
      setTecladoNaTela(true);
      tecladoNaTelaRef.current = true;
      registrar('ok-campo-teclado-na-tela', alvo);
    },
    [campoDoRef, cancelarFallbackTeclado, registrar],
  );

  /**
   * Fecha o teclado e devolve o foco ao campo ativo (nunca fica sem foco — na
   * TV isso faria o controle remoto "sumir").
   */
  const fecharTeclado = useCallback(() => {
    cancelarFallbackTeclado();
    setTecladoNaTela(false);
    tecladoNaTelaRef.current = false;
    esconderTecladoNativo();
    const alvo = campoDoRef(campoAtivoRef.current);
    focarElemento(alvo, 'teclado-fechado');
  }, [campoDoRef, cancelarFallbackTeclado, focarElemento]);

  /**
   * Abre/fecha o teclado NA TELA pelo botão da linha dos campos.
   *
   * É explícito: o usuário pediu o teclado na tela, então ele abre mesmo em
   * aparelho com teclado de sistema (o IME é escondido antes, para nunca haver
   * dois teclados na tela). E é a segunda tentativa: se o IME não abriu, aqui
   * ele abre de verdade.
   */
  const alternarTeclado = useCallback(() => {
    if (tecladoNaTelaRef.current) {
      fecharTeclado();
      return;
    }
    cancelarFallbackTeclado();
    esconderTecladoNativo();
    const alvo = campoDoRef(campoAtivoRef.current);
    if (alvo) reabrirFocoDeTexto(alvo);
    setTecladoNaTela(true);
    tecladoNaTelaRef.current = true;
    registrar('botao-teclado');
  }, [campoDoRef, cancelarFallbackTeclado, fecharTeclado, registrar]);

  // ── Digitação do teclado NA TELA (escreve no input real) ──────────────────

  const digitar = useCallback(
    (t: string) => {
      const alvo = campoDoRef(campoAtivoRef.current);
      if (!alvo) return;
      reabrirFocoDeTexto(alvo);
      if ((alvo.value?.length ?? 0) >= LIMITE) return;
      escreverNoCampo(alvo, t);
      registrar('digitar');
    },
    [campoDoRef, registrar],
  );

  const apagar = useCallback(() => {
    const alvo = campoDoRef(campoAtivoRef.current);
    if (!alvo) return;
    reabrirFocoDeTexto(alvo);
    apagarNoCampo(alvo);
    registrar('apagar');
  }, [campoDoRef, registrar]);

  const limpar = useCallback(() => {
    const alvo = campoDoRef(campoAtivoRef.current);
    if (!alvo) return;
    alvo.value = '';
    alvo.dispatchEvent(new Event('input', { bubbles: true }));
    registrar('limpar');
  }, [campoDoRef, registrar]);

  // ── Entrar ───────────────────────────────────────────────────────────────

  const estadoEntrar = useRef({ email, senha, enviando });
  estadoEntrar.current = { email, senha, enviando };

  const entrar = useCallback(async () => {
    const { email: e, senha: s, enviando: emAndamento } = estadoEntrar.current;
    if (emAndamento) return;
    if (!e.trim() || !s) {
      setErro('Preencha o e-mail e a senha para entrar.');
      const alvo = campoDoRef(!e.trim() ? 'email' : 'senha');
      setCampoAtivo(!e.trim() ? 'email' : 'senha');
      focarElemento(alvo, 'erro-campo');
      return;
    }
    esconderTecladoNativo();
    setTecladoNaTela(false);
    tecladoNaTelaRef.current = false;
    setErro('');
    setEnviando(true);
    registrar('entrar');
    try {
      // MESMA função do site/mobile (AuthContext → Supabase).
      await signIn(e, s);
      navigate('/tv/perfil', { replace: true });
    } catch (err) {
      setErro((err as Error).message ?? 'Não foi possível entrar.');
      const alvo = campoDoRef('senha');
      focarElemento(alvo, 'erro-login');
    } finally {
      setEnviando(false);
    }
  }, [campoDoRef, focarElemento, navigate, registrar, signIn]);

  // ── Navegação do D-pad DENTRO do formulário (cadeia explícita) ────────────

  const focarPrimeiraTeclaDaTela = useCallback(() => {
    const tecla = raizRef.current?.querySelector<HTMLButtonElement>(
      '[data-tv-keyboard-grade] [data-tv-focusable]',
    );
    focarElemento(tecla, 'dpad-teclado');
  }, [focarElemento]);

  const navegar = useCallback(
    (dir: 'cima' | 'baixo') => {
      const ativo = document.activeElement as HTMLElement | null;
      const naTela = !!ativo?.closest?.('[data-tv-keyboard-grade]');
      if (naTela) return; // o teclado na tela resolve as setas dentro dele
      const noBotaoTeclado = ativo === btnTecladoRef.current;
      const noEntrar = ativo === btnEntrarRef.current;

      if (dir === 'cima') {
        if (noEntrar) {
          // "Entrar" → Teclado → Senha → E-mail é a MESMA cadeia que o
          // usuário desceu: ↑ não pode "dar a volta" e pular etapas.
          focarElemento(btnTecladoRef.current, 'dpad');
          return;
        }
        if (noBotaoTeclado) {
          focarCampo('senha');
          return;
        }
        if (ehCampoDeTexto(ativo) && (ativo as HTMLInputElement).type === 'password') {
          focarCampo('email');
          return;
        }
        focarCampo('email');
        return;
      }

      // baixo
      if (ativo === emailRef.current) {
        focarCampo('senha');
        return;
      }
      if (ativo === senhaRef.current) {
        if (tecladoNaTelaRef.current) focarPrimeiraTeclaDaTela();
        else focarElemento(btnTecladoRef.current, 'dpad');
        return;
      }
      if (noBotaoTeclado) {
        focarElemento(btnEntrarRef.current, 'dpad');
        return;
      }
      if (noEntrar) {
        focarElemento(btnSairRef.current, 'dpad');
        return;
      }
      focarElemento(btnSairRef.current, 'dpad');
    },
    [focarCampo, focarElemento, focarPrimeiraTeclaDaTela],
  );

  // ── O ÚNICO handler de teclado da tela (fase de captura) ─────────────────

  const aoTeclar = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.defaultPrevented) return;
      const t = lerTecla(e.nativeEvent);

      // Digitção (letras, números, símbolos, espaço): segue para o campo.
      if (!ehTeclaDeControle(t)) return;

      // VOLTAR: com o teclado na tela aberto, fecha o teclado (não navega).
      if (t.voltar) {
        if (tecladoNaTelaRef.current) {
          e.preventDefault();
          e.stopPropagation();
          fecharTeclado();
          return;
        }
        // Sem teclado aberto: deixa o Voltar seguir para a navegação global,
        // que leva o usuário à tela anterior (ele nunca fica preso aqui).
        return;
      }

      // Se o foco escapou, devolve ANTES de tratar a tecla: a tecla é do
      // formulário, não do elemento invasor.
      recuperarFoco();

      const ativo = document.activeElement as HTMLElement | null;
      const dentroDoTecladoNaTela = !!ativo?.closest?.('[data-tv-keyboard-grade]');

      // OK: um caminho único e explícito por controle.
      if (t.ok) {
        // Com o foco numa TECLA do teclado na tela, o OK é da tecla (a
        // ativação nativa do botão). Só a trava de repetição global se aplica.
        if (dentroDoTecladoNaTela) return;

        const agora = Date.now();
        if (agora - ultimaAtivacao.current < INTERVALO_OK_MS) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        ultimaAtivacao.current = agora;

        e.preventDefault();
        e.stopPropagation();

        if (!ativo || ativo === raizRef.current) {
          focarCampo(campoAtivoRef.current);
          return;
        }
        if (ativo === btnTecladoRef.current) {
          alternarTeclado();
          return;
        }
        if (ativo === btnEntrarRef.current) {
          void entrar();
          return;
        }
        if (ativo === btnSairRef.current) {
          navigate('/tv');
          return;
        }
        if (ehCampoDeTexto(ativo)) {
          abrirTexto((ativo as HTMLInputElement).type === 'password' ? 'senha' : 'email');
          return;
        }
        // Qualquer outro foco dentro do formulário: volta ao campo ativo.
        focarCampo(campoAtivoRef.current);
        return;
      }

      // SETAS: ←/→ dentro de um campo de texto movem o cursor (não navegam).
      if (ehCampoDeTexto(ativo) && (t.esquerda || t.direita)) return;

      e.preventDefault();
      e.stopPropagation();

      if (t.cima) navegar('cima');
      else if (t.baixo) navegar('baixo');
      else focarCampo(campoAtivoRef.current);
    },
    [abrirTexto, alternarTeclado, entrar, fecharTeclado, focarCampo, navegar, navigate, recuperarFoco],
  );

  /** Saída do teclado na tela: a cadeia de foco se fecha sem ir ao fim do doc. */
  const sairDoTeclado = useCallback(
    (sentido: 'cima' | 'baixo' | 'escapar') => {
      if (sentido === 'escapar') {
        fecharTeclado();
        return;
      }
      if (sentido === 'cima') {
        const alvo = campoDoRef(campoAtivoRef.current);
        setCampoAtivo(campoAtivoRef.current);
        focarElemento(alvo, 'teclado-sai-cima');
        return;
      }
      focarElemento(btnEntrarRef.current, 'teclado-sai-baixo');
    },
    [campoDoRef, fecharTeclado, focarElemento],
  );

  return (
    /* `data-tv-sem-autofoco`: a recuperação automática do layout não age aqui.
       `data-tv-form`: a navegação espacial global se abstém de TODA tecla
       enquanto o foco estiver dentro desta tela (só o Voltar é repassado). */
    <div
      ref={raizRef}
      className="tv-page tv-page-login"
      data-tv-sem-autofoco
      data-tv-form
      data-tv-teclado-aberto={tecladoNaTela ? '' : undefined}
      onKeyDown={aoTeclar}
    >
      <div className="tv-login">
        <div className="tv-login-marca">
          <TvMark className="tv-login-marca-img" />
        </div>
        <h1 className="tv-login-titulo">Entrar no MovieFlix</h1>
        <p className="tv-login-sub">
          Use a mesma conta do site e do aplicativo. Seu plano, favoritos e progresso continuam
          os mesmos.
        </p>

        {/* noValidate: a validação nativa do navegador não é navegável pelo
            controle remoto; validamos aqui e mostramos o aviso na tela. */}
        <form
          className="tv-login-form"
          noValidate
          onSubmit={(ev) => {
            ev.preventDefault();
            void entrar();
          }}
        >
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
                  onChange={(ev) => setEmail(ev.target.value)}
                  onFocus={() => {
                    setCampoAtivo('email');
                    campoAtivoRef.current = 'email';
                    registrar('focus-email');
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
                  onChange={(ev) => setSenha(ev.target.value)}
                  onFocus={() => {
                    setCampoAtivo('senha');
                    campoAtivoRef.current = 'senha';
                    registrar('focus-senha');
                  }}
                  className="tv-login-input"
                  data-tv-focusable
                  tabIndex={0}
                />
              </span>
            </label>

            {/* Botão discreto que abre/fecha o teclado NA TELA. Fica sempre na
                cadeia do D-pad (E-mail → Senha → Teclado → Entrar). */}
            <button
              ref={btnTecladoRef}
              type="button"
              data-tv-focusable
              data-tv-keyboard-toggle
              tabIndex={0}
              aria-pressed={tecladoNaTela}
              aria-label={tecladoNaTela ? 'Fechar o teclado na tela' : 'Abrir o teclado na tela'}
              title={tecladoNaTela ? 'Fechar o teclado' : 'Abrir o teclado'}
              onClick={alternarTeclado}
              className={cn('tv-login-teclado-btn', tecladoNaTela && 'tv-login-teclado-btn-ativo')}
            >
              <Keyboard className="tv-icon-sm" aria-hidden="true" />
              <span className="tv-login-teclado-btn-txt">Teclado</span>
            </button>
          </div>

          {/* O teclado NA TELA só existe no DOM quando o usuário o abre — e só
              é usado em aparelho sem teclado de sistema. */}
          {tecladoNaTela ? (
            <div className="tv-login-teclado-wrap">
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
            onKeyDown={(ev) => {
              // Guarda: quando o handler da TELA já tratou esta tecla, não
              // processa de novo (era a origem das ativações duplicadas).
              if (ev.defaultPrevented) return;
              const t = lerTecla(ev.nativeEvent);
              if (t.cima) {
                ev.preventDefault();
                ev.stopPropagation();
                navegar('cima');
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
            ref={btnSairRef}
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
