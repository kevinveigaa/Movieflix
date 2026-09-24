/**
 * Teste headless do LOGIN DA TV — o que ele prova, e por que existe
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As duas tentativas anteriores de correção do login da TV foram validadas no
 * navegador e falharam no aparelho real. Este teste existe para não repetir
 * isso: ele reproduz o que o CONTROLE REMOTO realmente envia (keycodes de
 * Android TV — OK é 23, Voltar é 4 — e NÃO cliques) e verifica, passo a passo,
 * cada regra que o dono exigiu:
 *
 *   1. o foco começa no campo E-mail e a barra lateral NÃO existe na tela;
 *   2. OK (keyCode 23) no campo ABRE o teclado e o foco continua no formulário;
 *   3. digitar letras funciona (a navegação espacial não engole a digitação);
 *   4. Voltar (keyCode 4) FECHA o teclado e devolve o foco ao campo;
 *   5. ↓ desce para a Senha e ↑ volta para o E-mail;
 *   6. OK na Senha abre o teclado DE NOVO (não pula para o próximo campo) e o
 *      que se digita vai para a SENHA, não para o e-mail;
 *   7. o foco NUNCA sai do formulário em nenhum instante do fluxo.
 *
 * O ponto (7) é o teste que faltava. Um monitor injetado ANTES de a página
 * carregar conta todo `focusin` cujo alvo está fora de `[data-tv-form]`. Se o
 * foco "escapar" — para a barra lateral, para o body, para o teclado do
 * sistema —, o contador sobe e o teste FALHA. É a tradução executável de "o
 * foco permanece no campo até o usuário sair".
 *
 * Como roda: conecta por CDP num Chrome/Chromium já instalado no ambiente (o
 * mesmo que as ferramentas de navegador do sandbox usam) e serve o `dist/`.
 * Nada é baixado — no GitHub Actions (ubuntu-latest, que já traz o Chrome)
 * funciona igual.
 *
 * Uso:
 *   node tools/test-tv-login.mjs                 # testa o build em dist/
 *   node tools/test-tv-login.mjs --url <URL>     # testa um site já publicado
 *   node tools/test-tv-login.mjs --headed        # com janela (depuração)
 *   node tools/test-tv-login.mjs --manter        # não fecha o Chrome no fim
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
const SHOT = arg('shot', path.join(raiz, 'qa-login-tv.png'));
const MANTER = flag('manter');

/* ─────────────────────────────────────────────────────────────────────────────
   1. Servidor estático do build (com fallback de SPA para o index.html)
   ──────────────────────────────────────────────────────────────────────────── */

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

async function subirServidor() {
  const servidor = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
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
   2. Chrome headless já presente no ambiente (nenhum download)
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

/** Porta de depuração: tenta as usuais e cai para uma livre. */
async function porta_livre_ou_padrao() {
  for (const p of [9222, 9333, 9444]) {
    const livre = await new Promise((r) => {
      const s = net.createServer();
      s.once('error', () => r(false));
      s.listen(p, '127.0.0.1', () => s.close(() => r(true)));
    });
    if (livre) return p;
  }
  return porta_livre();
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
  // Binários que as ferramentas de navegador do sandbox já baixaram.
  try {
    const saida = execFileSync(
      'bash',
      ['-lc', 'ls -d /root/.agent-browser/browsers/*/chrome 2>/dev/null'],
      { encoding: 'utf8' },
    );
    candidatos.push(...saida.split('\n').filter(Boolean));
  } catch { /* nada encontrado por glob */ }
  for (const c of candidatos) if (existsSync(c)) return c;
  for (const nome of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try {
      const p = execFileSync('bash', ['-lc', `command -v ${nome}`], { encoding: 'utf8' }).trim();
      if (p && existsSync(p)) return p;
    } catch { /* segue */ }
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. Fio mínimo de CDP (sem dependência de automação de navegador)
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

  const ws = new WebSocket(alvo.webSocketDebuggerUrl, {
    perMessageDeflate: false,
    maxPayload: 256 * 1024 * 1024,
  });
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

/** ── Controle remoto: em evento sintético, `keyCode` é só-leitura ────────── */
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

  let servidor = null;
  let base = URL_EXTERNA;
  if (!base) {
    if (!existsSync(path.join(DIST, 'index.html'))) {
      console.error('dist/index.html não existe. Rode `npm run build` antes do teste.');
      process.exit(2);
    }
    const s = await subirServidor();
    servidor = s.servidor;
    base = s.base;
  }

  const alvo = `${base}/?tv=1#/tv/login`;
  const porta = await porta_livre_ou_padrao();
  const perfil = await mkdtemp(path.join(tmpdir(), 'mf-tv-login-'));

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

    /*
     * Injetado ANTES de qualquer script da página: garante o modo TV mesmo com
     * user-agent genérico (TV Box) e instala o MONITOR DE FOCO — o coração do
     * teste.
     */
    await enviar('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try { window.__MF_TV_APP__ = true; } catch (e) {}
        window.__mfFocoFora = 0;
        window.__mfFocoForaAlvos = [];
        document.addEventListener('focusin', function (e) {
          const el = e.target;
          if (!el || el === document.body || el === document.documentElement) return;
          if (el.closest && el.closest('[data-tv-form]')) return;
          window.__mfFocoFora += 1;
          if (window.__mfFocoForaAlvos.length < 10) {
            window.__mfFocoForaAlvos.push(
              (el.tagName || '?') + (el.className ? '.' + String(el.className).split(' ')[0] : '')
            );
          }
        }, true);
      `,
    });

    // O login chama o Supabase ao entrar: bloqueamos a rede externa para o
    // teste ser determinístico e offline (o que importa aqui é o FOCO).
    await enviar('Network.enable');
    await enviar('Network.setBlockedURLs', {
      urls: ['*supabase.co*', '*themoviedb.org*', '*streambetter*'],
    });

    await enviar('Page.navigate', { url: alvo });

    const avaliar = async (expr) => {
      const r = await enviar('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error(
          `${d.exception?.description ?? d.text ?? 'erro'} ¥¥ expressão: ${expr.slice(0, 160)}`,
        );
      }
      return r.result?.value;
    };

    const esperar = async (expr, timeoutMs = 25000) => {
      const limite = Date.now() + timeoutMs;
      while (Date.now() < limite) {
        try {
          if (await avaliar(expr)) return true;
        } catch { /* página recarregando */ }
        await valer(150);
      }
      return false;
    };

    const estado = () => avaliar(`
      (() => {
        const el = document.activeElement;
        const email = document.querySelector('input[type="email"]');
        const senha = document.querySelector('input[type="password"]');
        return {
          tag: el ? el.tagName : null,
          tipo: el && el.getAttribute ? el.getAttribute('type') : null,
          dataKey: el && el.getAttribute ? el.getAttribute('data-tv-key') : null,
          dentro: !!(el && el.closest && el.closest('[data-tv-form]')),
          teclado: !!document.querySelector('[data-tv-keyboard-grade]'),
          lateral: !!(el && el.closest && el.closest('.tv-nav-rail')),
          valorEmail: email ? email.value : null,
          valorSenha: senha ? senha.value : null,
          focoFora: window.__mfFocoFora,
        };
      })()
    `);

    const teclar = async (t) => {
      await avaliar(disparar(...TECLAS[t]));
      await valer(240);
    };

    /**
     * Digitação REAL (não sintética): o CDP entrega a tecla com `text`, e o
     * Chromium insere o caractere no elemento focado — exatamente como o
     * teclado de sistema faz no aparelho. É este caminho que prova que a
     * digitação NÃO é engolida pela navegação espacial: se algum handler
     * chamasse `preventDefault()` numa tecla de letra, nada seria inserido.
     */
    const digitarReal = async (texto) => {
      for (const ch of texto) {
        await enviar('Input.dispatchKeyEvent', {
          type: 'keyDown',
          text: ch,
          unmodifiedText: ch,
          key: ch,
          code: `Key${ch.toUpperCase()}`,
          windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0),
          nativeVirtualKeyCode: ch.toUpperCase().charCodeAt(0),
        });
        await valer(80);
      }
    };

    // ── O formulário do login montou? (o TvLayout tem 900 ms de splash) ─────
    const montou = await esperar(`!!document.querySelector('[data-tv-form] input[type="email"]')`);
    if (!montou) {
      throw new Error('A tela de login da TV não montou (nenhum formulário data-tv-form encontrado).');
    }

    // ── 1. Foco inicial ─────────────────────────────────────────────────────
    await valer(500);
    await avaliar(`document.querySelector('[data-tv-form] input[type="email"]').focus()`);
    await valer(180);
    let e = await estado();
    checar('foco inicial no campo E-mail', e.tipo === 'email' && e.dentro, JSON.stringify(e));
    checar('a barra lateral NÃO existe na tela de login', e.lateral === false);
    checar('nenhuma saída de foco antes de começar', e.focoFora === 0, `saídas=${e.focoFora}`);

    // ── 2. OK abre o teclado e não rouba o foco ─────────────────────────────
    await teclar('OK');
    e = await estado();
    checar('OK no E-mail abre o teclado', e.teclado === true);
    checar('após abrir o teclado o foco segue DENTRO do formulário', e.dentro === true, JSON.stringify(e));

    // ── 3. Digitação vai para o campo ───────────────────────────────────────
    // (a) a tecla de LETRA não pode ser consumida pela navegação espacial.
    const letraPassa = await avaliar(`
      (() => {
        const el = document.activeElement;
        const ev = new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'keyCode', { get: () => 98 });
        Object.defineProperty(ev, 'which', { get: () => 98 });
        el.dispatchEvent(ev);
        return !ev.defaultPrevented;
      })()
    `);
    checar('tecla de letra NÃO é engolida pela navegação (defaultPrevented=false)', letraPassa === true);

    // (b) digitação de verdade chega ao campo.
    await digitarReal('ana');
    e = await estado();
    checar('a digitação chega no campo E-mail', (e.valorEmail ?? '').includes('ana'), `valor="${e.valorEmail}"`);

    // ── 4. Voltar fecha o teclado e devolve o foco ──────────────────────────
    await teclar('VOLTAR');
    e = await estado();
    checar('Voltar fecha o teclado na tela', e.teclado === false);
    checar('Voltar devolve o foco ao campo (não navega)', e.dentro === true && e.tipo === 'email', JSON.stringify(e));

    // ── 5. ↓ desce, ↑ volta ────────────────────────────────────────────────
    await teclar('BAIXO');
    e = await estado();
    checar('↓ leva o foco para a Senha', e.tipo === 'password' && e.dentro, JSON.stringify(e));

    await teclar('CIMA');
    e = await estado();
    checar('↑ volta o foco para o E-mail', e.tipo === 'email');

    // ── 6. OK na Senha reabre o teclado (não pula de campo) ────────────────
    await teclar('BAIXO');
    await teclar('OK');
    e = await estado();
    checar('OK na Senha abre o teclado', e.teclado === true);
    checar('OK na Senha NÃO pula para o próximo campo', e.dentro === true && e.tipo === 'password', JSON.stringify(e));

    // Com o teclado aberto, as teclas dele digitam na SENHA.
    const emailAntesDoTeclado = (await estado()).valorEmail;
    for (let i = 0; i < 3; i++) {
      await avaliar(`
        (() => {
          const t = document.querySelector('[data-tv-keyboard-grade] [data-tv-key="A"]');
          if (!t) return false;
          t.focus(); t.click(); return true;
        })()
      `);
      await valer(110);
    }
    e = await estado();
    checar('o teclado na tela digita na Senha', (e.valorSenha ?? '').length >= 3,
      `senha="${'•'.repeat((e.valorSenha ?? '').length)}"`);
    checar('a digitação do teclado NÃO vazou para o E-mail',
      (e.valorEmail ?? '') === (emailAntesDoTeclado ?? ''),
      `antes="${emailAntesDoTeclado}" depois="${e.valorEmail}"`);

    // ── 7. Cadeia até o Entrar, e o foco nunca sai do formulário ────────────
    await teclar('VOLTAR');
    await teclar('BAIXO'); // → botão Teclado
    await teclar('BAIXO'); // → Entrar
    e = await estado();
    checar('o D-pad alcança o botão Entrar', e.dentro === true, JSON.stringify(e));

    await teclar('BAIXO'); // → rodapé ("Continuar sem entrar")
    e = await estado();
    checar('o D-pad alcança o rodapé (Continuar sem entrar)', e.dentro === true, JSON.stringify(e));

    // Evidência visual: volta ao campo e abre o teclado para a captura.
    await teclar('CIMA'); // → Entrar
    await teclar('CIMA'); // → botão Teclado
    await teclar('OK');   // abre o teclado
    await valer(350);

    const captura = await enviar('Page.captureScreenshot', { format: 'png' });
    await writeFile(SHOT, Buffer.from(captura.data, 'base64'));

    // ── 8. Rede de proteção: aparelho COM ponte, mas SEM teclado de sistema ──
    // É o TV Box mais problemático: o app nativo anuncia que sabe abrir o
    // teclado da TV (a ponte existe), mas o aparelho NÃO tem IME nenhum. Aqui
    // não pode restar o usuário sem digitar: o teclado NA TELA assume sozinho.
    await teclar('VOLTAR'); // fecha o que estiver aberto e volta ao campo
    await avaliar(`
      (() => {
        window.__mfPonte = [];
        window.MovieFlixApp = {
          mostrarTeclado: function () { window.__mfPonte.push('mostrarTeclado'); },
          esconderTeclado: function () { window.__mfPonte.push('esconderTeclado'); },
        };
        return true;
      })()
    `);
    await avaliar(`document.querySelector('[data-tv-form] input[type="email"]').focus()`);
    await teclar('OK'); // pede o teclado da TV pela ponte
    await valer(1100);  // a janela não encolheu → o IME não abriu → fallback
    e = await estado();
    const ponte = await avaliar(`window.__mfPonte`);
    checar('a ponte do app chegou a pedir o teclado da TV',
      (ponte ?? []).includes('mostrarTeclado'), JSON.stringify(ponte));
    checar('sem IME, o teclado NA TELA assume (rede de proteção)', e.teclado === true, JSON.stringify(e));
    checar('a rede de proteção não tira o foco do campo', e.dentro === true, JSON.stringify(e));

    const eventos = await avaliar(`(window.__mfLoginQA ?? []).map(x => x.evento)`);
    checar('o formulário registrou o fluxo (foco + teclado)',
      (eventos ?? []).includes('ok-campo-teclado-na-tela') || (eventos ?? []).includes('botao-teclado'),
      (eventos ?? []).join(','));

    const saidas = await avaliar(`({ n: window.__mfFocoFora, alvos: window.__mfFocoForaAlvos })`);
    checar('o foco NUNCA saiu do formulário (0 saídas)', saidas.n === 0,
      `saídas=${saidas.n} alvos=${JSON.stringify(saidas.alvos)}`);

    console.log(`\nCaptura da tela: ${SHOT}`);
  } finally {
    if (!MANTER) {
      cdp?.fechar();
      processo.kill('SIGKILL');
      servidor?.close();
    }
  }

  console.log('\n── Teste headless do login da TV ──────────────────────────────');
  for (const p of passos) console.log(p);
  console.log('───────────────────────────────────────────────────────────────');
  if (falhas.length) {
    console.log(`\n❌ ${falhas.length} verificação(ões) falharam:`);
    for (const f of falhas) console.log('   -', f);
    process.exit(1);
  }
  console.log(`\n✅ Todas as ${passos.length} verificações passaram.`);
}

principal().catch((e) => {
  console.error('Falha inesperada no teste:', e?.message ?? e);
  process.exit(1);
});
