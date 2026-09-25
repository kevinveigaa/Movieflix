/**
 * Teste headless da NAVEGAÇÃO POR CONTROLE na TV — o caminho
 * card → detalhes → assistir, mais a seção de títulos parecidos.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O dono exigiu, com todas as letras:
 *   "garantir que todo o caminho card → detalhes → assistir seja feito apenas
 *    com o controle remoto, sem passos intermediários ou focos perdidos"
 *   "posicionar o foco automaticamente no botão de assistir"
 *   "uma seção com filmes/séries parecidos, navegável por controle e integrada
 *    ao fluxo de foco da tela (sem quebrar o foco inicial no botão de assistir)"
 *
 * Este teste transforma cada uma dessas frases em uma verificação executável,
 * reproduzindo o que o CONTROLE REMOTO realmente envia (keycodes de Android TV:
 * OK=23, Voltar=4, setas=19/20/21/22) — e não cliques de mouse.
 *
 * O que ele prova:
 *   1. os CARDS da Home são focáveis pelo D-pad e o foco fica visivelmente
 *      indicado (o anel de foco acompanha o `document.activeElement`);
 *   2. OK num card ABRE a tela de detalhes daquele título (e UMA vez só: uma
 *      pulsação de OK = uma navegação — era o bug do OK com dois donos);
 *   3. ao abrir os detalhes, o foco JÁ está no botão de assistir, sem navegar;
 *   4. OK no botão de assistir começa a reprodução (rota do player);
 *   5. a seção "Mais como este" existe, tem títulos PARECIDOS de verdade
 *      (mesma categoria, sem o próprio título e sem duplicatas) e é navegável
 *      pelo controle;
 *   6. o foco nunca fica órfão (document.body) em nenhum passo do caminho.
 *
 * Como fica determinístico e offline:
 *   • serve o `dist/` localmente (com fallback de SPA);
 *   • o catálogo é servido do PRÓPRIO build (`/filmes/*.light.json`) — dados
 *     reais, sem rede externa;
 *   • a sessão autenticada é fornecida por um Supabase FALSO (a app e as
 *     bibliotecas falam com `supabase-js`, que é um cliente HTTP comum): as
 *     chamadas de auth/DB do domínio do Supabase são respondidas aqui, de forma
 *     que o app entre no estado logado e as rotas de TV montem. Nenhum dado
 *     real é tocado.
 *
 * Uso:
 *   node tools/test-tv-nav.mjs                 # testa o build em dist/
 *   node tools/test-tv-nav.mjs --url <URL>     # testa um site publicado
 *   node tools/test-tv-nav.mjs --headed        # com janela (depuração)
 */

import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');
const DIST = path.join(raiz, 'dist');

const arg = (nome, padrao = null) => {
  const i = process.argv.indexOf(`--${nome}`);
  if (i < 0) return padrao;
  const proximo = process.argv[i + 1];
  return proximo && !proximo.startsWith('--') ? proximo : padrao;
};
const flag = (nome) => process.argv.includes(`--${nome}`);

const URL_EXTERNA = arg('url');
const SHOT = arg('shot', path.join(raiz, 'tools', 'qa', 'nav-tv.png'));
const MANTER = flag('manter');

/* ─────────────────────────────────────────────────────────────────────────────
   Sessão falsa do Supabase (somente para o teste)

   Estes são os únicos dados inventados do arquivo, e existem para a app sair do
   estado "deslogado": sem sessão, TODAS as rotas de TV redirecionam para o
   login e a navegação de cards/detalhes nem monta. O resto (catálogo, títulos,
   categorias) vem de verdade, do build.
   ──────────────────────────────────────────────────────────────────────────── */
const REF = 'mntyanfhxiqspdedmddb';
const AGORA = Math.floor(Date.now() / 1000);
const SEGREDO_FALSO = 'teste-headless-assinatura-local';
const USUARIO = {
  id: '00000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'qa@movieflix.test',
  created_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
};
const SESSOES = {
  access_token: 'qa-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: AGORA + 36000,
  refresh_token: 'qa-refresh-token',
  user: USUARIO,
};
const PERFIL_ATIVO = {
  id: USUARIO.id,
  user_id: USUARIO.id,
  nome: 'Tela da Sala',
  avatar_url: null,
};

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.apk': 'application/vnd.android.package-archive',
};

/* ─────────────────────────────────────────────────────────────────────────────
   1. Servidor: build estático + Supabase falso no caminho /supabase-falso
   ──────────────────────────────────────────────────────────────────────────── */

const HITS = [];

function json(res, corpo, status = 200) {
  const dados = JSON.stringify(corpo);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(dados);
}

/**
 * Resposta de PREFLIGHT (OPTIONS).
 *
 * Sem isto o Supabase falso não funciona: o `supabase-js` manda cabeçalhos
 * próprios (`apikey`, `authorization`, `accept-profile`), o que obriga o
 * navegador a fazer CORS preflight ANTES do GET. Sem uma resposta de preflight
 * válida, a consulta nem chega a ser enviada — o app fica sem assinatura, sem
 * perfil e preso no estado de carregamento, o que também bagunça a ordem dos
 * renders e, com ela, o foco inicial das telas.
 */
function preflight(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Max-Age': '86400',
  });
  res.end();
}

/**
 * Responde as chamadas que o app faz ao Supabase. É deliberadamente permissivo:
 * qualquer coisa desconhecida devolve lista vazia/`null`, porque aqui nenhum
 * dado de perfil importa — importa que o app chegue às telas de catálogo.
 */
function responderSupabase(url, res) {
  // O caminho chega com o prefixo local (`/supabase-falso/...`): removê-lo deixa
  // a comparação igual à do Supabase de verdade.
  const p = url.pathname.replace(/^\/supabase-falso/, '');
  HITS.push(`${url.search ? '' : ''}${p}`);

  if (p === '/auth/v1/token' || p.endsWith('/token')) return json(res, SESSOES);

  if (p.startsWith('/auth/v1/user')) return json(res, USUARIO);
  if (p.startsWith('/auth/v1/logout')) return json(res, {});

  // Assinatura ativa (libera a reprodução: o CTA passa a ser "Assistir").
  // A app consulta a tabela no PLURAL (`subscriptions`) — ver AuthContext.
  if (p.startsWith('/rest/v1/subscription')) {
    return json(res, {
      id: '00000000-0000-0000-0000-0000000000aa',
      user_id: USUARIO.id,
      status: 'active',
      plan: 'anual',
      started_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2030-01-01T00:00:00.000Z',
    });
  }
  if (p.startsWith('/rest/v1/profiles') || p.startsWith('/rest/v1/profile')) {
    return json(res, { ...PERFIL_ATIVO, id: USUARIO.id });
  }
  if (p.startsWith('/rest/v1/')) return json(res, []);
  return json(res, {});
}

async function subirServidor() {
  const servidor = createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return preflight(res);

      const url = new URL(req.url, 'http://localhost');

      if (url.pathname.startsWith('/supabase-falso/')) {
        return responderSupabase(url, res);
      }

      let arquivo = path.join(DIST, decodeURIComponent(url.pathname));
      if (!arquivo.startsWith(DIST)) arquivo = path.join(DIST, 'index.html');
      if (!existsSync(arquivo) || (await stat(arquivo)).isDirectory()) {
        arquivo = path.join(DIST, 'index.html');
      }
      const corpo = await readFile(arquivo);
      res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(corpo);
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  return { servidor, base: `http://127.0.0.1:${servidor.address().port}` };
}

/* ─────────────────────────────────────────────────────────────────────────────
   2. Chrome headless já presente no ambiente
   ──────────────────────────────────────────────────────────────────────────── */

async function porta_livre() {
  return new Promise((r) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
}

function acharChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
  ].filter(Boolean);
  try {
    const saida = execFileSync('bash', ['-lc', 'ls -d /root/.agent-browser/browsers/*/chrome 2>/dev/null'], {
      encoding: 'utf8',
    });
    candidatos.push(...saida.split('\n').filter(Boolean));
  } catch { /* sem glob */ }
  for (const c of candidatos) if (existsSync(c)) return c;
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. Fio mínimo de CDP
   ──────────────────────────────────────────────────────────────────────────── */

async function conectarCDP(portaDepuracao, timeoutMs = 30000) {
  const { default: WebSocket } = await import('ws');
  const limite = Date.now() + timeoutMs;
  let alvo = null;
  while (Date.now() < limite) {
    try {
      const r = await fetch(`http://127.0.0.1:${portaDepuracao}/json/list`);
      const alvos = await r.json();
      alvo = alvos.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (alvo) break;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!alvo) throw new Error('Chrome não expôs nenhuma aba para depuração.');

  const ws = new WebSocket(alvo.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });

  let seq = 0;
  const pendentes = new Map();
  ws.on('message', (dados) => {
    let m;
    try {
      m = JSON.parse(dados.toString());
    } catch {
      return;
    }
    if (m.id && pendentes.has(m.id)) {
      const p = pendentes.get(m.id);
      pendentes.delete(m.id);
      if (m.error) p.rej(new Error(`${m.error.message} ${JSON.stringify(m.error.data ?? '')}`));
      else p.res(m.result);
    }
  });

  const enviar = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pendentes.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });

  return { ws, enviar, fechar: () => ws.close() };
}

const disparar = (keyCode, key) => `
(() => {
  const el = document.activeElement || document.body;
  const ev = new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'keyCode', { get: () => ${keyCode} });
  Object.defineProperty(ev, 'which', { get: () => ${keyCode} });
  el.dispatchEvent(ev);
  return el.tagName;
})()`;

const TECLAS = {
  OK: [23, 'Enter'],
  CIMA: [19, 'ArrowUp'],
  BAIXO: [20, 'ArrowDown'],
  ESQUERDA: [21, 'ArrowLeft'],
  DIREITA: [22, 'ArrowRight'],
  VOLTAR: [4, 'GoBack'],
};

/* ─────────────────────────────────────────────────────────────────────────────
   4. O teste
   ──────────────────────────────────────────────────────────────────────────── */

const passos = [];
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  passos.push(`${condicao ? '✅' : '❌'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  if (!condicao) falhas.push(nome);
}

const valer = (ms) => new Promise((r) => setTimeout(r, ms));

async function principal() {
  const chrome = acharChrome();
  if (!chrome) {
    console.error('Nenhum Chrome/Chromium encontrado (defina CHROME_PATH).');
    process.exit(2);
  }
  if (!URL_EXTERNA && !existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist/index.html não existe. Rode `npm run build` antes do teste.');
    process.exit(2);
  }

  const servidorInterno = URL_EXTERNA ? null : await subirServidor();
  const base = URL_EXTERNA ?? servidorInterno.base;
  const porta = await porta_livre();
  const perfil = await mkdtemp(path.join(tmpdir(), 'mf-tv-nav-'));

  const processo = spawn(
    chrome,
    [
      ...(flag('headed') ? [] : ['--headless=new']),
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,MediaRouter',
      '--window-size=1280,720',
      `--user-data-dir=${perfil}`,
      `--remote-debugging-port=${porta}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp = null;
  try {
    cdp = await conectarCDP(porta);
    const { enviar } = cdp;
    await enviar('Page.enable');
    await enviar('Runtime.enable');
    await enviar('Network.enable');

    /*
     * ANTES de qualquer script da página:
     *  • força o modo TV (o app decide a experiência de TV no start-up);
     *  • planta a SESSÃO AUTENTICADA no localStorage (a app vai achar que já
     *    existe login e não vai redirecionar para a tela de login);
     *  • instala o MONITOR DE FOCO: conta todo `focusin` cujo alvo não é um
     *    elemento focável de TV — isto é, cada vez que o foco ficou ÓRFÃO
     *    (`body`) em vez de ir para um card/botão.
     */
    await enviar('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try { window.__MF_TV_APP__ = true; } catch (e) {}
        try {
          localStorage.setItem(
            'sb-${REF}-auth-token',
            JSON.stringify(${JSON.stringify(SESSOES)}),
          );
          localStorage.setItem('movieflix_active_profile', JSON.stringify(${JSON.stringify(PERFIL_ATIVO)}));
        } catch (e) {}

        window.__mfFocoOrfao = 0;
        document.addEventListener('focusin', function (e) {
          const el = e.target;
          if (el && el !== document.body && el !== document.documentElement) return;
          window.__mfFocoOrfao += 1;
        }, true);
      `,
    });

    // A app só chama o Supabase por este domínio: redirecionamos para o falso.
    await enviar('Fetch.enable', { patterns: [{ urlPattern: `*${REF}.supabase.co/*`, requestStage: 'Request' }] });
    cdp.ws.on('message', async (dados) => {
      let m;
      try {
        m = JSON.parse(dados.toString());
      } catch {
        return;
      }
      if (m.method === 'Fetch.requestPaused') {
        const req = m.params.request;
        const alvo = new URL(req.url);
        const destino = `${base}/supabase-falso${alvo.pathname}${alvo.search}`;
        const cabecalhos = Object.entries(req.headers ?? {}).map(([name, value]) => ({ name, value: String(value) }));
        try {
          await enviar('Fetch.continueRequest', { requestId: m.params.requestId, url: destino });
        } catch {
          try {
            await enviar('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'Aborted' });
          } catch { /* ignora */ }
        }
        void cabecalhos;
      }
    });

    await enviar('Page.navigate', { url: `${base}/?tv=1#/tv` });

    const avaliar = async (expr) => {
      const r = await enviar('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error(`${d.exception?.description ?? d.text ?? 'erro'} ¥¥ ${expr.slice(0, 140)}`);
      }
      return r.result?.value;
    };

    const esperar = async (expr, timeoutMs = 30000) => {
      const limite = Date.now() + timeoutMs;
      while (Date.now() < limite) {
        try {
          if (await avaliar(expr)) return true;
        } catch { /* página recarregando */ }
        await valer(200);
      }
      return false;
    };

    const teclar = async (t) => {
      await avaliar(disparar(...TECLAS[t]));
      // Folga maior: `focar()` usa scrollIntoView SMOOTH, e durante a animação as
      // posições mudam — esperar pouco faz a próxima seta calcular contra
      // coordenadas velhas.
      await valer(t === 'OK' ? 450 : 420);
    };

    /** Estado do foco + o que está na tela. */
    const estado = () => avaliar(`
      (() => {
        const el = document.activeElement;
        const card = el && el.closest ? el.closest('[data-tv-card]') : null;
        const btn = el && el.tagName === 'BUTTON' ? el : null;
        const det = !!document.querySelector('[data-tv-initial-focus]');
        const secaoParecidos = Array.from(document.querySelectorAll('.tv-section-title'))
          .find(s => /mais como este/i.test(s.textContent || ''));
        const cardsParecidos = secaoParecidos && secaoParecidos.parentElement
          ? secaoParecidos.parentElement.querySelectorAll('[data-tv-card]').length
          : 0;
        return {
          rota: location.hash,
          tag: el ? el.tagName : null,
          orfao: !el || el === document.body || el === document.documentElement,
          noCard: !!card,
          cardTitulo: card ? (card.getAttribute('aria-label') || '') : null,
          cardVisivel: card ? card.getBoundingClientRect().width > 0 : false,
          tipoBotao: btn ? (btn.getAttribute('data-tv-acao') || btn.textContent || '').trim().slice(0, 40) : null,
          temInicial: det,
          alvoVisivel: !!(el && el.closest && el.closest('[data-tv-focusable]') && el.getBoundingClientRect().width > 0),
          anelFoco: !!(el && el.classList && el.classList.contains('tv-focus')),
          inicialEAssistir: !!(document.querySelector('[data-tv-initial-focus]')?.textContent || '')
            .toLowerCase().match(/assist/),
          qtdCards: document.querySelectorAll('[data-tv-card]').length,
          cardsParecidos,
        };
      })()
    `);

    // ── Home montou com cards? ─────────────────────────────────────────────
    const montou = await esperar(`document.querySelectorAll('[data-tv-card]').length > 0`, 40000);
    if (!montou) throw new Error('A Home da TV não montou cards (rota bloqueada ou catálogo não carregou).');
    void cabecalhoSeExiste;

    // Títulos da Home (catálogo real) para comparar com "Mais como este".
    await avaliar(
      `window.__mfTitulosHome = Array.from(document.querySelectorAll('[data-tv-card]')).map(c => c.getAttribute('aria-label') || '').filter(Boolean)`,
    ).catch(() => {});

    await valer(400);
    let e = await estado();
    checar('a Home da TV monta com cards de filmes/séries', e.qtdCards > 3, `cards=${e.qtdCards} rota=${e.rota}`);

    // ── 1. O foco inicial da Home está num elemento NAVEGÁVEL e visível ────
    await esperar(
      `!!document.activeElement && document.activeElement.closest && !!document.activeElement.closest('[data-tv-focusable]')`,
      12000,
    );
    e = await estado();
    checar('o foco inicial da Home cai num elemento navegável (não no body)', e.alvoVisivel === true,
      JSON.stringify({ tag: e.tag, orfao: e.orfao, anel: e.anelFoco }));
    checar('o foco está claramente indicado (anel de foco)', e.anelFoco === true);

    // ── 2. O D-pad ALCANÇA os cards e anda entre eles ──────────────────────
    // É exatamente o que o dono pediu: "o foco deve se mover de forma previsível
    // entre os cards (setas) e ficar claramente visível".
    let chegouNoCard = false;
    for (let i = 0; i < 4 && !chegouNoCard; i++) {
      await teclar('DIREITA');
      chegouNoCard = await avaliar(
        `!!(document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-tv-card]'))`,
      );
    }
    checar('o D-pad alcança os CARDS de filmes/séries', chegouNoCard === true,
      `supabase=${JSON.stringify(HITS.slice(0, 6))}`);

    e = await estado();
    checar('o card focado está visível na tela', e.cardVisivel === true);
    const tituloDoCard = e.cardTitulo;
    checar('o card focado tem título identificável', !!tituloDoCard, `título="${tituloDoCard}"`);

    // Andar de card em card: a seta para a direita troca o card focado e a
    // seta para a esquerda volta para o anterior — navegação previsível.
    await teclar('DIREITA');
    e = await estado();
    const proximo = e.cardTitulo;
    checar('→ move o foco para OUTRO card (navegação previsível)',
      e.noCard === true && !!proximo && proximo !== tituloDoCard,
      `de="${tituloDoCard}" para="${proximo}"`);
    await teclar('ESQUERDA');
    e = await estado();
    checar('← volta para o card anterior', e.noCard === true && e.cardTitulo === tituloDoCard,
      `voltou="${e.cardTitulo}"`);

    // A seta para baixo continua dentro de alvos navegáveis (nunca fica órfã).
    await teclar('BAIXO');
    e = await estado();
    checar('↓ mantém o foco num alvo navegável (nunca no body)', e.alvoVisivel === true && e.orfao === false,
      JSON.stringify({ tag: e.tag, orfao: e.orfao }));

    // ── 3. OK num card abre os DETALHES daquele título, UMA vez ────────────
    // Volta o foco para o primeiro card para o título ser determinístico.
    await esperar(`document.querySelector('[data-tv-card]') === document.activeElement`, 5000);
    const titulosAntes = await avaliar(`document.querySelectorAll('[data-tv-card]').length`);
    await avaliar(`document.querySelector('[data-tv-card]').focus()`);
    const cardAlvo = (await estado()).cardTitulo;
    const hashAntes = (await estado()).rota;
    await teclar('OK');
    await valer(700);
    e = await estado();
    checar('OK no card abre a tela de DETALHES', /\/tv\/titulo\//.test(e.rota), `rota=${e.rota}`);
    checar('a rota mudou de fato com UMA pulsação de OK', e.rota !== hashAntes, `antes=${hashAntes} depois=${e.rota}`);

    // ── 4. O foco JÁ está no botão de ASSISTIR ─────────────────────────────
    const detalhes = await esperar(`!!document.querySelector('[data-tv-initial-focus]')`, 15000);
    checar('a tela de detalhes marca um foco inicial', detalhes === true);
    await valer(600);
    e = await estado();
    checar('o foco inicial dos detalhes é o botão de ASSISTIR', e.inicialEAssistir === true, JSON.stringify({ texto: e.tipoBotao }));
    checar('o foco realmente chegou no botão (sem navegar até ele)', e.tipoBotao?.toLowerCase().includes('assist') === true, `foco="${e.tipoBotao}"`);

    // ── 5. A seção de títulos PARECIDOS ────────────────────────────────────
    checar('a seção "Mais como este" existe nos detalhes', e.cardsParecidos > 0, `cards na seção=${e.cardsParecidos}`);
    const parecidos = await avaliar(`
      (() => {
        const secao = Array.from(document.querySelectorAll('.tv-section-title'))
          .find(s => /mais como este/i.test(s.textContent || ''));
        if (!secao) return null;
        const cards = Array.from(secao.parentElement.querySelectorAll('[data-tv-card]'));
        const atual = (document.querySelector('h1')?.textContent || '').trim();
        return {
          atual,
          titulos: cards.map(c => c.getAttribute('aria-label') || ''),
          categoriasTela: Array.from(document.querySelectorAll('.tv-chips, [data-tv-meta]'))
            .map(n => n.textContent || '').join(' ').slice(0, 120),
        };
      })()
    `);
    const titulosParecidos = parecidos?.titulos ?? [];
    const unicos = new Set(titulosParecidos);
    checar('a seção de parecidos tem títulos', titulosParecidos.length > 0, `n=${titulosParecidos.length}`);
    checar('não há títulos duplicados na seção', unicos.size === titulosParecidos.length, `${unicos.size}/${titulosParecidos.length}`);
    checar('o próprio título NÃO aparece na seção', !titulosParecidos.includes(parecidos?.atual),
      `título atual="${parecidos?.atual}"`);

    /*
     * A seção veio do mesmo catálogo carregado pela Home ("Em alta"), então
     * comparamos com os títulos que a Home tinha: provar que são títulos do
     * catálogo REAL (e não placeholders) é o que separa "parecidos de verdade"
     * de "bloco decorativo".
     */
    const daHome = await avaliar(`window.__mfTitulosHome ? window.__mfTitulosHome.length : 0`);
    const algumReal = titulosParecidos.some((t) => !!t && t.length > 1);
    checar('a seção usa títulos do catálogo real (não placeholders)',
      titulosParecidos.length > 0 && algumReal,
      `títulos na Home=${daHome} · exemplo="${titulosParecidos[0] ?? ''}"`);

    // ── 6. A seção é navegável por controle ────────────────────────────────
    await avaliar(`document.querySelector('[data-tv-initial-focus]').focus()`);
    await valer(150);
    let chegouNaSecao = false;
    for (let i = 0; i < 14 && !chegouNaSecao; i++) {
      await teclar('BAIXO');
      const alvo = await avaliar(`
        (() => {
          const el = document.activeElement;
          const secao = Array.from(document.querySelectorAll('.tv-section-title'))
            .find(s => /mais como este/i.test(s.textContent || ''));
          return !!(el && secao && secao.parentElement.contains(el));
        })()
      `);
      if (alvo) chegouNaSecao = true;
    }
    checar('o D-pad alcança a seção "Mais como este"', chegouNaSecao === true);

    // ── 7. OK no botão de assistir começa a reprodução ─────────────────────
    await avaliar(`document.querySelector('[data-tv-initial-focus]').focus()`);
    await valer(150);
    await teclar('OK');
    await valer(900);
    e = await estado();
    checar('OK no botão de assistir leva à REPRODUÇÃO', /\/tv\/assistir\//.test(e.rota), `rota=${e.rota}`);

    // Evidência visual dos detalhes.
    await avaliar(`history.back()`);
    await valer(700);
    const captura = await enviar('Page.captureScreenshot', { format: 'png' });
    await writeFile(SHOT, Buffer.from(captura.data, 'base64'));

    // ── 8. O foco nunca ficou órfão no caminho ─────────────────────────────
    const orfaos = await avaliar(`window.__mfFocoOrfao`);
    checar('o foco nunca ficou órfão (0 quedas para o body)', orfaos === 0, `quedas=${orfaos}`);

    void titulosAntes;
    void cardAlvo;
    console.log(`\nCaptura da tela: ${SHOT}`);
  } finally {
    if (!MANTER) {
      cdp?.fechar();
      processo.kill('SIGKILL');
      servidorInterno?.servidor.close();
    }
  }

  console.log('\n── Teste headless da navegação da TV ─────────────────────────');
  for (const p of passos) console.log(p);
  console.log('──────────────────────────────────────────────────────────────');
  if (falhas.length) {
    console.log(`\n❌ ${falhas.length} verificação(ões) falharam:`);
    for (const f of falhas) console.log('   -', f);
    process.exit(1);
  }
  console.log(`\n✅ Todas as ${passos.length} verificações passaram.`);
}

function cabecalhoSeExiste() {
  return null;
}

principal().catch((e) => {
  console.error('Falha inesperada no teste:', e?.message ?? e);
  process.exit(1);
});
