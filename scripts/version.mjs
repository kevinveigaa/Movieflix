#!/usr/bin/env node
/**
 * MovieFlix — gera a IDENTIDADE DO BUILD antes do `vite build`.
 * ════════════════════════════════════════════════════════════════════════════
 * Escreve:
 *   1. `public/version.json` — arquivo ESTÁTICO auditável. É o primeiro lugar a
 *      olhar quando se quer saber qual build está no ar:
 *          curl -s https://movieflix-bszf.onrender.com/version.json
 *      Não depende do servidor Node, então funciona mesmo quando o site está
 *      publicado como Static Site.
 *   2. `.env.production.local` — injeta a identidade no bundle (Vite), para que
 *      o console do app/TV mostre o commit que está executando.
 *
 * Roda automaticamente via `prebuild` (npm lifecycle) — nunca é preciso
 * chamá-lo à mão antes de um build.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Executa git de forma tolerante (ambiente sem git não deve quebrar o build). */
function git(args, padrao = '') {
  try {
    return execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim() || padrao;
  } catch {
    return padrao;
  }
}

const commit = git(['rev-parse', '--short=7', 'HEAD'], 'local');
const commitFull = git(['rev-parse', 'HEAD'], 'local');
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], 'local');
const mensagem = git(['log', '-1', '--pretty=%s'], '');
const buildTime = new Date().toISOString();

/** Lê a versão do produto de TV direto da fonte da verdade (`src/lib/appInfo.ts`). */
function versaoDoApp() {
  try {
    const fonte = readFileSync(path.join(raiz, 'src', 'lib', 'appInfo.ts'), 'utf8');
    // Pega o primeiro `version:` dentro do bloco `TV_APP_INFO`.
    const bloco = fonte.split('export const TV_APP_INFO')[1] ?? fonte;
    const m = bloco.match(/version:\s*'([^']+)'/);
    return m ? m[1] : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const version = versaoDoApp();

const info = {
  app: 'MovieFlix',
  siteVersion: version,
  tvAppVersion: version,
  commit,
  commitFull,
  branch,
  buildTime,
  message: mensagem,
};

// 1) Marcador estático
writeFileSync(
  path.join(raiz, 'public', 'version.json'),
  JSON.stringify(info, null, 2) + '\n',
  'utf8',
);

// 2) Injeção no bundle (Vite lê `.env.production.local` no build de produção).
//    Faz MERGE: preserva qualquer variável que já exista no arquivo (chaves de
//    API, por exemplo) e só atualiza as quatro chaves de identidade do build.
const caminhoEnv = path.join(raiz, '.env.production.local');
let envExistente = '';
try {
  envExistente = readFileSync(caminhoEnv, 'utf8');
} catch { /* ainda não existe */ }

const MARCAS = new Set([
  'VITE_APP_VERSION',
  'VITE_BUILD_COMMIT',
  'VITE_BUILD_BRANCH',
  'VITE_BUILD_TIME',
]);
const preservadas = envExistente
  .split('\n')
  .filter((linha) => {
    const chave = linha.split('=')[0]?.trim();
    return chave && !MARCAS.has(chave);
  })
  .join('\n')
  .trim();

const env = [
  preservadas,
  `VITE_APP_VERSION=${version}`,
  `VITE_BUILD_COMMIT=${commit}`,
  `VITE_BUILD_BRANCH=${branch}`,
  `VITE_BUILD_TIME=${buildTime}`,
  '',
]
  .filter((linha, i) => i > 0 || linha)
  .join('\n');
writeFileSync(caminhoEnv, env, 'utf8');

console.log(
  `[version] build ${commit} (v${version}, ${branch}) — public/version.json + .env.production.local gerados`,
);
