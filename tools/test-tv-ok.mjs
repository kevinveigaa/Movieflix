/**
 * Teste do CAMINHO DE COMANDO do OK (play/pause) — o que o harness de navegação
 * NÃO consegue verificar, porque o embed do provedor está atrás do Cloudflare.
 * ══════════════════════════════════════════════════════════════════════════════
 * CAUSA RAIZ (relato no APARELHO: "as setas/volume funcionam, mas o OK não
 * pausa"): o 'ok' era o ÚNICO comando que NÃO usava o canal `postMessage` —
 * dependia só da tecla nativa. O avançar/retroceder (que o usuário confirma que
 * funciona) usam esse canal. Este teste trava a correção: o 'ok' PRECISA mandar
 * o comando de alternância pelo `postMessage`, além da tecla nativa.
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

// ── 1. OK (sem ponte nativa) PRECISA postar o comando de alternância ─────────
{
  const { enviados, iframe } = iframeFalso();
  const agiu = mod.acionarControlePlayer(iframe, 'ok', 10, null);
  const n = nomes(enviados);
  checar('OK sem ponte nativa: o comando foi enviado (agiu=true)', agiu === true);
  checar(
    'OK manda o comando de ALTERNÂNCIA pelo postMessage (toggle/play/pause)',
    n.some((x) => x === 'toggle' || x === 'play' || x === 'pause'),
    `postados=[${n.join(',')}]`,
  );
}

// ── 2. OK COM a ponte nativa: a tecla 85 vai E o postMessage também ──────────
{
  const { enviados, iframe } = iframeFalso();
  const teclas = [];
  const ponte = { enviarTeclaPlayer: (code) => { teclas.push(code); return true; } };
  const agiu = mod.acionarControlePlayer(iframe, 'ok', 10, ponte);
  const n = nomes(enviados);
  checar('OK com ponte nativa: a tecla REAL de play/pause (85) foi entregue', teclas.includes(85), `teclas=[${teclas.join(',')}]`);
  checar('OK com ponte nativa: o postMessage TAMBÉM foi enviado (dois caminhos)', n.length > 0, `postados=[${n.join(',')}]`);
  checar('OK com ponte nativa: agiu=true', agiu === true);
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

console.log('\n── Teste do caminho de comando do OK (play/pause) ──────────────────');
for (const p of passos) console.log(p);
console.log('────────────────────────────────────────────────────────────────────');
if (falhas.length) {
  console.log(`\n❌ ${falhas.length} verificação(ões) falharam:`);
  for (const f of falhas) console.log(`   • ${f}`);
  process.exit(1);
}
console.log(`\n✅ Todas as ${passos.length} verificações passaram.`);
