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
 * A correção ANTERIOR inventou um `{event:'command',func:'toggle'}` que o
 * provedor NUNCA escuta — por isso o OK continuou sem pausar no aparelho, mesmo
 * com o teste antigo passando (ele só provava que a mensagem SAÍA, não que o
 * player a entendia). Este teste trava a correção CERTA:
 *   • o `ok` NÃO pode mandar nenhum `postMessage` de play/pause fabricado;
 *   • o `ok` PRECISA entregar a TECLA REAL 85 (KEYCODE_MEDIA_PLAY_PAUSE) pela
 *     ponte nativa — o único caminho que muda o estado do vídeo no aparelho;
 *   • o seek (que funciona) continua postando seus comandos.
 *
 * Roda o módulo REAL (`src/tv/controlePlayer.ts`) com um iframe FALSO que
 * registra o que foi postado — sem rede, sem navegador.
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
  passos.push(`${condicao ? '✅' : '❌'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
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

/** Os nomes de comando postados (aceita string JSON e objeto). */
function nomes(enviados) {
  return enviados
    .map((m) => {
      if (typeof m === 'string') {
        try { return JSON.parse(m).func; } catch { return null; }
      }
      return m && (m.func || m.command);
    })
    .filter(Boolean);
}

// ── 1. OK COM a ponte nativa: a tecla REAL de play/pause é entregue ──────────
{
  const { enviados, iframe } = iframeFalso();
  const teclas = [];
  const ponte = { enviarTeclaPlayer: (code) => { teclas.push(code); return true; } };
  const agiu = mod.acionarControlePlayer(iframe, 'ok', 10, ponte);
  checar('OK com ponte nativa: a tecla REAL de play/pause (ESPAÇO = 32) foi entregue', teclas.includes(32), `teclas=[${teclas.join(',')}]`);
  checar(
    'OK NÃO usa a tecla de MÍDIA 85 (o WebView a roteia para a MediaSession e o player não a recebe)',
    !teclas.includes(85),
    `teclas=[${teclas.join(',')}]`,
  );
  checar('OK com ponte nativa: agiu=true', agiu === true);
  checar(
    'OK NÃO manda postMessage de play/pause fabricado (o provedor não escuta)',
    nomes(enviados).length === 0,
    `postados=[${nomes(enviados).join(',')}]`,
  );
}

// ── 2. OK SEM ponte nativa: NÃO inventa comando; só o vídeo nativo ───────────
{
  const { enviados, iframe } = iframeFalso();
  const agiu = mod.acionarControlePlayer(iframe, 'ok', 10, null);
  checar(
    'OK sem ponte nativa: NÃO posta comando de play/pause inventado',
    nomes(enviados).length === 0,
    `postados=[${nomes(enviados).join(',')}]`,
  );
  checar('OK sem ponte nativa e sem vídeo nativo: agiu=false (nada a fazer)', agiu === false);
}

// ── 3. Regressão: avançar/retroceder continuam postando seus comandos ────────
{
  const { enviados, iframe } = iframeFalso();
  mod.acionarControlePlayer(iframe, 'seekFwd', 10, null);
  const n = nomes(enviados);
  checar('REGRESSÃO — avançar continua postando seekForward', n.includes('seekForward'), `postados=[${n.join(',')}]`);
}
{
  const { enviados, iframe } = iframeFalso();
  mod.acionarControlePlayer(iframe, 'seekBack', 10, null);
  const n = nomes(enviados);
  checar('REGRESSÃO — retroceder continua postando seekBackward', n.includes('seekBackward'), `postados=[${n.join(',')}]`);
}

// ── 4. Regressão: play/pause explícitos continuam postando ───────────────────
{
  const { enviados, iframe } = iframeFalso();
  mod.acionarControlePlayer(iframe, 'play', 10, null);
  checar('REGRESSÃO — play continua postando play', nomes(enviados).includes('play'), `postados=[${nomes(enviados).join(',')}]`);
}
{
  const { enviados, iframe } = iframeFalso();
  mod.acionarControlePlayer(iframe, 'pause', 10, null);
  checar('REGRESSÃO — pause continua postando pause', nomes(enviados).includes('pause'), `postados=[${nomes(enviados).join(',')}]`);
}

// ── 5. Regressão: seek COM ponte nativa também entrega a tecla real ──────────
{
  const { iframe } = iframeFalso();
  const teclas = [];
  const ponte = { enviarTeclaPlayer: (code) => { teclas.push(code); return true; } };
  mod.acionarControlePlayer(iframe, 'seekFwd', 10, ponte);
  checar('REGRESSÃO — avançar com ponte entrega a tecla real 90', teclas.includes(90), `teclas=[${teclas.join(',')}]`);
}

console.log('\n── Teste do caminho de comando do OK (play/pause) ──────────────────');
for (const p of passos) console.log(p);
console.log('────────────────────────────────────────────────────────────────────');
if (falhas.length) {
  console.log(`\n❌ ${falhas.length} verificação(ões) falharam:`);
  for (const f of falhas) console.log(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ Todas as ${passos.length} verificações passaram.`);
