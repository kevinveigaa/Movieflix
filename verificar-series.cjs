#!/usr/bin/env node
/**
 * verificar-series.cjs — Verifica a disponibilidade de fonte no StreamBetter
 * para todas as séries do catálogo (filmes/series.json).
 *
 * Como funciona:
 *   O embed do StreamBetter (https://streambetter.shop/serie/{tmdb}/{s}/{e})
 *   é renderizado no servidor: quando o episódio TEM fonte cadastrada, o HTML
 *   contém `__PLAYER_PARAMS__` com a lista `sources` (ex.: "Embed Public
 *   (Dublado)"). Quando NÃO tem fonte, o HTML é pequeno e traz a mensagem
 *   "nenhuma fonte de vídeo está cadastrada ou funcionando agora".
 *
 *   Cada série é testada no PRIMEIRO episódio disponível (a mesma lógica do
 *   app: primeiroEpisodioDisponivel — ordena "T/E" e pega o menor).
 *
 * Uso:
 *   node verificar-series.cjs                 # varre tudo (padrão: 8 workers)
 *   node verificar-series.cjs --workers=4     # ajusta paralelismo
 *   node verificar-series.cjs --only=58841,48891  # testa só alguns tmdb_ids
 *   node verificar-series.cjs --json          # saída JSON para scripts
 *
 * Saída:
 *   - Lista as séries SEM fonte (FAIL) no final
 *   - Exit code 0 se todas OK; 1 se alguma falhou (útil para CI)
 *
 * Nota: falsos negativos podem ocorrer por rate-limit do servidor durante
 * varreduras em massa. O script re-testa cada FAIL até 3 vezes com pausa.
 */
const fs = require('fs');
const path = require('path');

const SERIES_PATH = path.join(__dirname, 'filmes', 'series.json');
const BASE = 'https://streambetter.shop';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const TIMEOUT_MS = 15000;

// ---------- args ----------
const args = process.argv.slice(2);
const workers = Number((args.find((a) => a.startsWith('--workers=')) || '').split('=')[1] || 8);
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
const asJson = args.includes('--json');

function primeiroEpisodio(serie) {
  const eps = serie.episodes_available || [];
  const ordenados = eps
    .map((e) => {
      const [s, ep] = String(e).split('/');
      const season = Number(s);
      const episode = Number(ep);
      if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;
      return { season, episode };
    })
    .filter(Boolean)
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
  return ordenados[0] || null;
}

function temFonte(html) {
  return html.includes('__PLAYER_PARAMS__') && html.includes('sources=%5B%7B%22kind%22');
}

function checa(tmdb, season, episode) {
  return new Promise((resolve) => {
    const url = `${BASE}/serie/${tmdb}/${season}/${episode}?lang=pt-BR`;
    const curl = require('child_process').spawn('curl', [
      '-s', '--max-time', String(TIMEOUT_MS / 1000), '-A', UA, url,
    ]);
    let html = '';
    curl.stdout.on('data', (d) => { html += d; });
    curl.on('error', () => resolve(false));
    curl.on('close', (code) => {
      if (code !== 0) return resolve(false);
      resolve(temFonte(html));
    });
  });
}

async function checaComRetry(tmdb, season, episode, tentativas = 3) {
  for (let i = 1; i <= tentativas; i++) {
    const ok = await checa(tmdb, season, episode);
    if (ok) return true;
    if (i < tentativas) await new Promise((r) => setTimeout(r, 1200 * i));
  }
  return false;
}

(async () => {
  if (!fs.existsSync(SERIES_PATH)) {
    console.error(`Arquivo não encontrado: ${SERIES_PATH}`);
    process.exit(2);
  }
  const series = JSON.parse(fs.readFileSync(SERIES_PATH, 'utf8'));
  const alvo = only ? series.filter((s) => only.includes(String(s.tmdb_id))) : series;

  console.log(`Verificando ${alvo.length} séries (${workers} workers)...`);

  const resultados = new Map();
  let done = 0;

  const fila = [...alvo];
  async function worker() {
    while (fila.length) {
      const s = fila.shift();
      const pe = primeiroEpisodio(s);
      if (!pe) {
        resultados.set(String(s.tmdb_id), { status: 'SEM_EPS', title: s.title });
      } else {
        const ok = await checaComRetry(s.tmdb_id, pe.season, pe.episode);
        resultados.set(String(s.tmdb_id), { status: ok ? 'OK' : 'FAIL', title: s.title });
      }
      done += 1;
      if (done % 100 === 0 || done === alvo.length) {
        console.log(`  ${done}/${alvo.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(workers, alvo.length) }, worker));

  const fails = [...resultados.values()].filter((r) => r.status !== 'OK');
  const okCount = [...resultados.values()].filter((r) => r.status === 'OK').length;

  if (asJson) {
    console.log(JSON.stringify({ total: alvo.length, ok: okCount, fails }, null, 2));
  } else {
    console.log(`\nRESULTADO: ${okCount}/${alvo.length} com fonte OK`);
    if (fails.length) {
      console.log(`\n⚠️  ${fails.length} série(s) SEM fonte (recomenda-se remover do catálogo):`);
      for (const f of fails) console.log(`  - ${f.title} (tmdb=${f.status === 'SEM_EPS' ? 'sem episódios' : ''})`);
      process.exit(1);
    } else {
      console.log('✅ Todas as séries têm fonte válida.');
    }
  }
})();
