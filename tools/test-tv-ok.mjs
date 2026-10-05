/**
 * Teste do CAMINHO DE COMANDO do OK (play/pause) — o que o harness de navegação
 * NÃO consegue verificar, porque o embed do provedor está atrás do Cloudflare.
 * ═══════════════════════════════════════════════════════════════════════════
 * CAUSA RAIZ (medida na documentação do PRÓPRIO provedor, /docs):
 *
 * O protocolo `postMessage` do embed do StreamBetter define APENAS dois tipos:
 *   • `streambetter:seek`     (entrada — o site manda a posição);
 *   • `streambetter:progress` (saída — o player informa o tempo).
 * NÃO existe NENHUM comando de play/pause por `postMessage`.
 *
 * Por isso o OK NÃO usa `postMessage`: ele entrega uma TECLA REAL pela ponte
 * nativa do shell Android (MovieFlixApp.enviarTeclaPlayer) — o único caminho que
 * muda o estado do vídeo no aparelho. A tecla é ESPAÇO (32), não a tecla de
 * MÍDIA 85 (o WebView a roteia para a MediaSession, que não é o <video> do
 * iframe). Quando o <video> é legível (mesma origem), alterna direto pelo estado.
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

// ── 1. OK com a ponte nativa: entrega a tecla REAL de play/pause (ESPAÇO = 32)
{
  const teclas = [];
  const ponte = { enviarTeclaPlayer: (code) => { teclas.push(code); return true; } };
  const resultado = mod.alternarPlayPausePlayer(null, ponte);
  checar('OK com ponte nativa: a tecla REAL de play/pause (ESPAÇO = 32) foi entregue', teclas.includes(32), `teclas=[${teclas.join(',')}]`);
  checar('OK NÃO usa a tecla de MÍDIA 85 (o WebView a roteia para a MediaSession)', !teclas.includes(85), `teclas=[${teclas.join(',')}]`);
  checar('OK com ponte e sem estado legível: devolve null (o HUD mantém o otimista)', resultado === null, `resultado=${resultado}`);
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
  const ponte = { enviarTeclaPlayer: () => true };
  mod.alternarPlayPausePlayer(iframe, ponte);
  checar('play/pause nunca vira postMessage (só a tecla real pela ponte)', enviados.length === 0, `postados=${enviados.length}`);
}

console.log('\n── Teste do caminho de comando do OK (play/pause) ──────────────');
for (const p of passos) console.log(p);
console.log('────────────────────────────────────────────────────────────────────');
if (falhas.length) {
  console.log(`\n\u274c ${falhas.length} verificação(ões) falharam:`);
  for (const f of falhas) console.log(`   • ${f}`);
  process.exit(1);
}
console.log(`\n\u2705 Todas as ${passos.length} verificações passaram.`);
