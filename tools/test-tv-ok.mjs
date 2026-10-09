/**
 * Teste do CAMINHO DE COMANDO do OK (play/pause) — o que o harness de navegação
 * NÃO consegue verificar, porque o embed do provedor está atrás do Cloudflare.
 * ══════════════════════════════════════════════════════════════════════════════
 * CAUSA RAIZ (medida na documentação do PRÓPRIO provedor, /docs):
 *
 * O protocolo `postMessage` do embed do StreamBetter define APENAS dois tipos:
 *   • `streambetter:seek`     (entrada — o site manda a posição);
 *   • `streambetter:progress` (saída — o player informa o tempo).
 * NÃO existe NENHUM comando de play/pause por `postMessage`.
 *
 * Por isso o OK NÃO usa `postMessage`: entrega um TOQUE REAL no centro do player
 * pela ponte nativa do shell Android — o gesto que o WebView faz hit-testing e
 * entrega ao iframe (não depende de foco). A TECLA ESPAÇO fica apenas como
 * FALLBACK para APKs antigos, porque o teclado do WebView entrega a tecla ao
 * documento PAI e ela nunca chega ao `<video>` da OUTRA origem. Nunca se usa a
 * tecla de MÍDIA 85 (o WebView a roteia para a MediaSession). Quando o `<video>`
 * é legível (mesma origem), alterna direto pelo estado.
 *
 * REGRESSÃO CENTRAL (o bug do aparelho "o OK não pausa / não despausa"): cada OK
 * entrega UM ÚNICO gesto real. Antes havia um SEGUNDO gesto de "correção" ~1,3s
 * depois do OK, que DESFAZIA o primeiro (o vídeo pausava e voltava sozinho)
 * enquanto o ícone do botão já havia virado. Os testes abaixo travam isso:
 * "UM ÚNICO gesto por OK — nunca 2".
 *
 * Roda o módulo REAL (`src/tv/controlePlayer.ts`) com iframes/vídeos FALSOS —
 * sem rede, sem navegador.
 *
 * Uso: node tools/test-tv-ok.mjs
 */

import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');

const passos = [];
const falhas = [];
function checar(nome, condicao, detalhe = '') {
  passos.push(`${condicao ? '\u2705' : '\u274c'} ${nome}${detalhe ? ` \u2014 ${detalhe}` : ''}`);
  if (!condicao) falhas.push(nome);
}

// ── Compila o módulo REAL (com o alias `@/` do projeto) ──────────────────────
const dir = await mkdtemp(path.join(tmpdir(), 'mf-ok-'));
const saida = path.join(dir, 'controlePlayer.mjs');
await build({
  entryPoints: [path.join(raiz, 'src/tv/controlePlayer.ts')],
  outfile: saida,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  plugins: [
    {
      name: 'alias-arroba',
      setup(b) {
        b.onResolve({ filter: /^@\// }, (args) => ({
          path: path.join(raiz, 'src', `${args.path.slice(2)}.ts`),
        }));
      },
    },
  ],
});

const mod = await import(pathToFileURL(saida).href);

/** Iframe FALSO: registra tudo o que for postado no `contentWindow`. */
function iframeFalso() {
  const enviados = [];
  return {
    enviados,
    iframe: { contentWindow: { postMessage: (m) => enviados.push(m) } },
  };
}

/** Vídeo FALSO legível (mesma origem), com estado controlável. */
function videoFalso(inicialPausado) {
  return {
    paused: inicialPausado,
    ended: false,
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  };
}

// ── 1. OK com a ponte nativa: UM ÚNICO TOQUE REAL (caminho primário) ─────────
{
  const toques = [];
  const teclas = [];
  const ponte = {
    enviarToquePlayer: () => { toques.push(1); return true; },
    enviarTeclaPlayer: (code) => { teclas.push(code); return true; },
  };
  const resultado = mod.alternarPlayPausePlayer(null, ponte);
  checar(
    'OK com ponte nativa: entrega o TOQUE REAL de toggle (o único gesto que ATRAVESSA ao iframe)',
    toques.length === 1,
    `toques=${toques.length}`,
  );
  checar(
    'OK com ponte nativa: UM ÚNICO gesto por OK — nunca 2 (fim do retry que desfazia o toggle)',
    toques.length === 1 && teclas.length === 0,
    `toques=${toques.length} teclas=[${teclas.join(',')}]`,
  );
  checar('OK com ponte e sem estado legível: devolve null (o HUD mantém o otimista)', resultado === null, `resultado=${resultado}`);
}

// ── 1a2. Mecanismo explícito 'toque' (é o padrão) ────────────────────────────
{
  const toques = [];
  const teclas = [];
  const ponte = {
    enviarToquePlayer: () => { toques.push(1); return true; },
    enviarTeclaPlayer: (code) => { teclas.push(code); return true; },
  };
  const resultado = mod.alternarPlayPausePlayer(null, ponte, 'toque');
  checar("mecanismo 'toque' usa o TOQUE REAL", toques.length === 1, `toques=${toques.length}`);
  checar("mecanismo 'toque' NÃO manda também a tecla (um único gesto)", teclas.length === 0, `teclas=[${teclas.join(',')}]`);
  checar("mecanismo 'toque' devolve null (confirmado pelo progresso real)", resultado === null, `resultado=${resultado}`);
}

// ── 1a3. Ponte SEM tecla: cai no TOQUE REAL (fallback) ───────────────────────
{
  const toques = [];
  const ponte = { enviarToquePlayer: () => { toques.push(1); return true; } };
  const r = mod.alternarPlayPausePlayer(null, ponte);
  checar('Ponte SEM tecla: cai no TOQUE REAL (fallback)', toques.length === 1 && r === null, `toques=${toques.length} r=${r}`);
}

// ── 1b. Ponte ANTIGA (só tecla): cai na TECLA REAL (ESPAÇO = 32) ─────────────
{
  const teclas = [];
  const ponte = { enviarTeclaPlayer: (code) => { teclas.push(code); return true; } };
  const resultado = mod.alternarPlayPausePlayer(null, ponte);
  checar('APK antigo (sem toque): cai na TECLA REAL de play/pause (ESPAÇO = 32)', teclas.includes(32), `teclas=[${teclas.join(',')}]`);
  checar('APK antigo: NÃO usa a tecla de MÍDIA 85 (o WebView a roteia para a MediaSession)', !teclas.includes(85), `teclas=[${teclas.join(',')}]`);
  checar('APK antigo: devolve null (o HUD mantém o otimista)', resultado === null, `resultado=${resultado}`);
}

// ── 1c. AUTOPLAY: entrega um TOQUE REAL (inicia a reprodução) ───────────────
{
  const toques = [];
  const ponte = { enviarToquePlayer: () => { toques.push(1); return true; } };
  const r = mod.iniciarReproducaoPlayer(null, ponte);
  checar('AUTOPLAY com ponte nativa: entrega um TOQUE REAL ao player', toques.length === 1 && r === true, `toques=${toques.length} r=${r}`);
}

// ── 2. OK sem ponte e sem vídeo: nada a fazer, nenhum comando inventado ──────
{
  const { enviados } = iframeFalso();
  const resultado = mod.alternarPlayPausePlayer(null, null);
  checar('OK sem ponte e sem vídeo nativo: NÃO posta comando inventado', enviados.length === 0, `postados=${enviados.length}`);
  checar('OK sem ponte e sem vídeo nativo: devolve null (estado desconhecido)', resultado === null, `resultado=${resultado}`);
}

// ── 3. Vídeo LEGÍVEL (mesma origem): alterna pelo estado REAL ────────────────
{
  const video = videoFalso(true); // começa pausado
  const iframe = { contentDocument: { querySelector: (sel) => (sel === 'video' ? video : null) } };
  const r1 = mod.alternarPlayPausePlayer(iframe, null);
  checar('vídeo legível pausado: o OK dá play() e devolve false (não pausado)', r1 === false && video.paused === false, `r=${r1} paused=${video.paused}`);
  const r2 = mod.alternarPlayPausePlayer(iframe, null);
  checar('vídeo legível tocando: o OK dá pause() e devolve true (pausado)', r2 === true && video.paused === true, `r=${r2} paused=${video.paused}`);
}

// ── 4. Nenhum caminho usa postMessage para play/pause ────────────────────────
{
  const { enviados, iframe } = iframeFalso();
  const ponte = { enviarToquePlayer: () => true };
  mod.alternarPlayPausePlayer(iframe, ponte);
  checar('play/pause nunca vira postMessage (só o gesto real pela ponte)', enviados.length === 0, `postados=${enviados.length}`);
}

console.log('\n── Teste do caminho de comando do OK (play/pause) ──────────────');
for (const p of passos) console.log(p);
console.log('────────────────────────────────────────────────────────────────');
if (falhas.length) {
  console.log(`\n\u274c ${falhas.length} verificação(ões) falharam:`);
  for (const f of falhas) console.log(`   • ${f}`);
  process.exit(1);
}
console.log(`\n\u2705 Todas as ${passos.length} verificações passaram.`);
