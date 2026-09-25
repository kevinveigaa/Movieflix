#!/usr/bin/env node
/**
 * MovieFlix — VERIFICADOR DE DEPLOY.
 * ════════════════════════════════════════════════════════════════════════════
 * Responde, sem ambiguidade, a pergunta que custou três rodadas de correção:
 *
 *     "o que está publicado no ar é o MESMO código que eu acabei de enviar?"
 *
 * Por que isso importa: um deploy parado é indistinguível, de fora, de um bug.
 * O usuário via "o foco continua saindo" no aparelho enquanto a causa era o
 * site estar servindo um build de dois dias antes.
 *
 * Como funciona:
 *   • lê o commit local (HEAD);
 *   • busca `/version.json` do site no ar (arquivo estático gerado no build —
 *     ver `scripts/version.mjs`, não depende do servidor Node);
 *   • compara os dois e também a idade do `index.html` publicado.
 *
 * Uso:
 *   node tools/verificar-deploy.mjs
 *   node tools/verificar-deploy.mjs --url https://outro-endereco
 *
 * Saída: código 0 quando o ar está atualizado; 1 quando está atrasado (com o
 * passo a passo do que fazer), 2 quando não foi possível consultar.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');

const arg = (nome, padrao = null) => {
  const i = process.argv.indexOf(`--${nome}`);
  if (i < 0) return padrao;
  const proximo = process.argv[i + 1];
  return proximo && !proximo.startsWith('--') ? proximo : padrao;
};

const SITE = arg('url', 'https://movieflix-bszf.onrender.com');

function git(args, padrao = '') {
  try {
    return execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim() || padrao;
  } catch {
    return padrao;
  }
}

const local = {
  commit: git(['rev-parse', '--short=7', 'HEAD'], 'local'),
  commitFull: git(['rev-parse', 'HEAD'], ''),
  branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], ''),
  message: git(['log', '-1', '--pretty=%s'], ''),
  date: git(['log', '-1', '--date=iso', '--pretty=%ad'], ''),
};

/** Consulta uma URL devolvendo corpo + cabeçalhos, sem lançar. */
async function buscar(url) {
  try {
    const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    const texto = await r.text();
    return { ok: r.ok, status: r.status, texto, headers: r.headers };
  } catch (e) {
    return { ok: false, status: 0, texto: '', headers: null, erro: e?.message ?? String(e) };
  }
}

function linha(titulo) {
  console.log(`\n${titulo}`);
  console.log('─'.repeat(Math.max(28, titulo.length)));
}

async function principal() {
  linha(`Deploy do MovieFlix — local × ${SITE}`);

  console.log(`Local  : ${local.commit}  (${local.branch})`);
  console.log(`         ${local.date}`);
  console.log(`         "${local.message}"`);

  const version = await buscar(`${SITE}/version.json?cb=${Date.now()}`);
  const raizSite = await buscar(`${SITE}/?cb=${Date.now()}`);
  const bundlePublicado = (raizSite.texto.match(/assets\/index-[A-Za-z0-9_-]+\.js/) ?? [])[0] ?? null;
  const lastModified = raizSite.headers?.get?.('last-modified') ?? null;

  let remoto = null;
  try {
    remoto = JSON.parse(version.texto);
  } catch {
    remoto = null;
  }

  if (!remoto || !remoto.commit) {
    linha('❌ NÃO FOI POSSÍVEL CONFIRMAR O BUILD PUBLICADO');
    if (version.erro) console.log(`Erro de rede: ${version.erro}`);
    else if (version.status === 404) console.log('HTTP 404 — /version.json não existe no ar.');
    else
      console.log(
        `HTTP ${version.status}, mas a resposta é o HTML do site (fallback de SPA), não o JSON do build.`,
      );
    console.log(
      '\nO arquivo /version.json não existe (ou não é JSON) no ar. Isso significa que o build\n' +
        'publicado é ANTERIOR à criação deste arquivo — ou seja, o ar NÃO é o build local.\n' +
        'É a assinatura exata de um deploy automático parado.',
    );
    console.log(`\nBundle publicado agora: ${bundlePublicado ?? '(não encontrado)'}`);
    console.log(`index.html modificado em: ${lastModified ?? '(sem cabeçalho)'}`);
    console.log('\nPasso a passo para publicar:', );
    console.log(
      '  1. https://dashboard.render.com → abra o serviço do MovieFlix;\n' +
        '  2. Confira o commit exibido no topo; se não for o último, o deploy está parado;\n' +
        '  3. MANUAL DEPLOY → Deploy latest commit (ou "Clear build cache & deploy");\n' +
        '  4. Quando ficar "Live", rode: node tools/verificar-deploy.mjs',
    );
    return 1;
  }

  console.log(`\nNo ar  : ${remoto.commit}  (${remoto.branch ?? '?'})`);
  console.log(`         ${remoto.buildTime ?? '?'}`);
  console.log(`         "${remoto.message ?? ''}"`);
  console.log(`Bundle : ${bundlePublicado ?? '(não encontrado)'}`);
  console.log(`index.html modificado em: ${lastModified ?? '(sem cabeçalho)'}`);

  linha('Resultado');

  if (remoto.commitFull && local.commitFull && remoto.commitFull === local.commitFull) {
    console.log(`✅ O AR ESTÁ ATUALIZADO — o site publicado é o commit ${local.commit}.`);
    console.log('   O que você vê no navegador/TV é o código deste repositório.');
    return 0;
  }

  if (remoto.commit === local.commit) {
    console.log(`✅ O AR ESTÁ ATUALIZADO (commit ${local.commit}, comparação curta).`);
    return 0;
  }

  console.log('❌ O AR ESTÁ ATRASADO.');
  console.log(`   Publicado: ${remoto.commit}`);
  console.log(`   Local    : ${local.commit}`);
  console.log(
    '\n   Nenhum push novo muda isto sozinho: o deploy automático do Render não está\n' +
      '   disparando. Publicar exige acesso ao painel (o token do GitHub não dá acesso\n' +
      '   ao Render). Passo a passo:',
  );
  console.log(
    '\n   1. Entre em https://dashboard.render.com e abra o serviço do MovieFlix;\n' +
      '   2. Veja o commit no topo: se não for o último, o deploy está parado;\n' +
      '   3. MANUAL DEPLOY → Deploy latest commit (ou "Clear build cache & deploy");\n' +
      '   4. Espere o status "Live" e rode: node tools/verificar-deploy.mjs;\n' +
      '   5. O campo "No ar" acima deve passar a mostrar o commit local.',
  );
  return 1;
}

principal()
  .then((codigo) => process.exit(codigo))
  .catch((e) => {
    console.error('Falha ao verificar o deploy:', e?.message ?? e);
    process.exit(2);
  });
