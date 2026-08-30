#!/usr/bin/env node
/**
 * verificar-watchplayer.cjs — Verifica quais títulos do catálogo têm fonte
 * reproduzível no WatchPlayer (via playerflixapi, a mesma fonte que o
 * embed-movies usa). Gera um JSON com os tmdb_ids que funcionam.
 *
 * Uso:
 *   node verificar-watchplayer.cjs            # varre tudo (10 workers)
 *   node verificar-watchplayer.cjs --only=603,1396
 *   node verificar-watchplayer.cjs --json     # saída JSON
 */
const fs = require('fs');
const path = require('path');

const FILMES_PATH = path.join(__dirname, 'filmes', 'filmes.json');
const SERIES_PATH = path.join(__dirname, 'filmes', 'series.json');
const OUT_PATH = path.join(__dirname, 'filmes', 'watchplayer_ok.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';
const TIMEOUT_MS = 15000;

const args = process.argv.slice(2);
const workers = Number((args.find((a) => a.startsWith('--workers=')) || '').split('=')[1] || 10);
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;
const jsonOut = args.includes('--json');

const filmes = JSON.parse(fs.readFileSync(FILMES_PATH, 'utf8'));
const series = JSON.parse(fs.readFileSync(SERIES_PATH, 'utf8'));

// Coleta todos os tmdb_ids (filmes + séries). Para séries, testa o primeiro
// episódio disponível (mesma lógica do app).
const alvos = [];

for (const f of filmes) {
  if (!f.tmdb_id) continue;
  alvos.push({ id: String(f.tmdb_id), type: 'movie', title: f.title });
}
for (const s of series) {
  if (!s.tmdb_id) continue;
  const eps = s.episodes_available || [];
  let season = 1, episode = 1;
  if (eps.length > 0) {
    const ordenados = eps
      .map((e) => {
        const [se, ep] = String(e).split('/');
        return { season: Number(se), episode: Number(ep) };
      })
      .filter((e) => Number.isFinite(e.season) && Number.isFinite(e.episode))
      .sort((a, b) => a.season - b.season || a.episode - b.episode);
    if (ordenados.length > 0) {
      season = ordenados[0].season;
      episode = ordenados[0].episode;
    }
  }
  alvos.push({ id: String(s.tmdb_id), type: 'tv', season, episode, title: s.title });
}

// Filtra por --only se fornecido
const alvosFiltrados = onlyArg
  ? alvos.filter((a) => only.includes(a.id))
  : alvos;

console.log(`Total de títulos: ${alvos.length} (filmes: ${filmes.length}, séries: ${series.length})`);
console.log(`Testando ${alvosFiltrados.length} títulos com ${workers} workers...`);

/** Verifica se um título tem fonte no playerflixapi. */
async function verificar(alvo) {
  const url = alvo.type === 'movie'
    ? `https://playerflixapi.com/pages/ajax.php?id=${alvo.id}&type=movie`
    : `https://playerflixapi.com/pages/ajax.php?id=${alvo.id}&type=tv&season=${alvo.season}&episode=${alvo.episode}`;
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': '*/*',
        'Accept-Language': 'pt-BR,pt;q=0.8',
        'Referer': alvo.type === 'movie'
          ? `https://playerflixapi.com/filme/${alvo.id}`
          : `https://playerflixapi.com/serie/${alvo.id}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) return { ...alvo, ok: false, motivo: `http_${resp.status}` };
    const html = await resp.text();
    // Tem fonte se houver data-embed (players) OU player-name
    const temEmbed = /data-embed=/.test(html) || /player-name/.test(html);
    return { ...alvo, ok: temEmbed, motivo: temEmbed ? 'ok' : 'sem_fonte' };
  } catch (e) {
    return { ...alvo, ok: false, motivo: 'network' };
  }
}

// Pool de workers
let idx = 0;
const resultados = [];
const falhas = [];

async function worker() {
  while (idx < alvosFiltrados.length) {
    const alvo = alvosFiltrados[idx++];
    const r = await verificar(alvo);
    resultados.push(r);
    if (!r.ok) falhas.push(r);
    if (idx % 25 === 0 || idx === alvosFiltrados.length) {
      console.log(`  ...${idx}/${alvosFiltrados.length} (${resultados.filter((x) => x.ok).length} ok, ${falhas.length} falhas)`);
    }
  }
}

(async () => {
  const pool = Array.from({ length: Math.min(workers, alvosFiltrados.length) }, worker);
  await Promise.all(pool);

  const okIds = new Set(resultados.filter((r) => r.ok).map((r) => r.id));
  const okFilmes = filmes.filter((f) => f.tmdb_id && okIds.has(String(f.tmdb_id)));
  const okSeries = series.filter((s) => s.tmdb_id && okIds.has(String(s.tmdb_id)));

  const resumo = {
    total: alvosFiltrados.length,
    ok: resultados.filter((r) => r.ok).length,
    falhas: falhas.length,
    filmes_ok: okFilmes.length,
    series_ok: okSeries.length,
    filmes_total: filmes.length,
    series_total: series.length,
    ok_ids: [...okIds],
    falhas: falhas.map((f) => ({ id: f.id, type: f.type, title: f.title, motivo: f.motivo })),
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(resumo, null, 2));
  console.log('\n=== RESUMO ===');
  console.log(`OK: ${resumo.ok}/${alvosFiltrados.length}`);
  console.log(`Filmes OK: ${okFilmes.length}/${filmes.length}`);
  console.log(`Séries OK: ${okSeries.length}/${series.length}`);
  console.log(`Falhas: ${falhas.length}`);
  if (falhas.length > 0) {
    console.log('\nFalhas (primeiras 30):');
    falhas.slice(0, 30).forEach((f) => console.log(`  [${f.type}] ${f.id} - ${f.title} (${f.motivo})`));
  }
  console.log(`\nResultado salvo em ${OUT_PATH}`);
  process.exit(falhas.length > 0 ? 1 : 0);
})();