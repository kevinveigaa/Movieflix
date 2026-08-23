/**
 * Importador em massa: troca o `video_url` dos filmes para o embed
 * megaembedapi.site (players "#1 Dublado"/"#2 Dublado" em pt-BR).
 *
 * Para cada filme do catálogo com `tmdb_id`:
 *   1. Resolve o `imdb_id` via API TMDb (proxy público do Movieflix);
 *   2. Monta https://megaembedapi.site/embed/tt{imdb_id};
 *   3. Verifica se o título existe no site (ausência = "movie not found");
 *   4. Se existir, atualiza `video_url` no Supabase (REST PATCH).
 *
 * Uso:
 *   node scripts/importar-megaembed.mjs --dry-run   # só resolve e checa
 *   node scripts/importar-megaembed.mjs             # atualiza o banco
 *
 * Reporte: scripts/relatorio-megaembed.json
 */
import fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mntyanfhxiqspdedmddb.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY || 'sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn';
const TMDB_API = process.env.TMDB_API || 'https://movieflix-api-udsv.onrender.com/api/tmdb';
const EMBED_BASE = 'https://megaembedapi.site/embed';

const dryRun = process.argv.includes('--dry-run');
const CONC = 6; // concorrência
const TIMEOUT = 20000;

const H = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

async function getJson(url, headers = {}, timeout = TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch { j = text; }
    return { status: r.status, data: j };
  } finally { clearTimeout(t); }
}

async function resolverImdb(tmdbId) {
  const { data } = await getJson(`${TMDB_API}/movie/${tmdbId}/external_ids`);
  return data && typeof data === 'object' && data.imdb_id ? data.imdb_id : null;
}

async function temPagina(imdb) {
  const r = await getJson(`${EMBED_BASE}/${imdb}`, { 'User-Agent': 'Mozilla/5.0' });
  if (r.status !== 200 || typeof r.data !== 'string') return false;
  return !r.data.includes('movie not found');
}

async function main() {
  // 1. catálogo
  const catalogo = [];
  for (let i = 0; i < 2000; i += 1000) {
    const { data } = await getJson(
      `${SUPABASE_URL}/rest/v1/movies?select=id,title,tmdb_id,video_url&offset=${i}&limit=1000`,
      H,
    );
    if (!Array.isArray(data)) { console.error('Falha ao ler catálogo:', JSON.stringify(data).slice(0,200)); process.exit(1); }
    catalogo.push(...data);
    if (data.length < 1000) break;
  }
  console.log('Catálogo:', catalogo.length, 'filmes');

  // 2. fila de trabalho
  const fila = catalogo.map((f) => ({ ...f }));
  let idx = 0;
  const relatorio = { atualizados: [], falhas: [], sem_imdb: [], nao_encontrado: [], dry_run: dryRun };

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= fila.length) return;
      const f = fila[i];
      const jaMega = (f.video_url || '').includes('megaembedapi');
      try {
        const imdb = await resolverImdb(f.tmdb_id);
        if (!imdb) {
          relatorio.sem_imdb.push({ id: f.id, title: f.title });
          console.log(`  - ${f.id} ${(f.title || '').slice(0, 40)}: sem imdb_id`);
          continue;
        }
        if (jaMega) {
          relatorio.atualizados.push({ id: f.id, title: f.title, video_url: f.video_url });
          console.log(`  = ${f.id} ${(f.title || '').slice(0, 40)}: já megaembed (mantido)`);
          continue;
        }
        const existe = await temPagina(imdb);
        if (!existe) {
          relatorio.nao_encontrado.push({ id: f.id, title: f.title, imdb_id: imdb });
          console.log(`  x ${f.id} ${(f.title || '').slice(0, 40)}: movie not found (${imdb})`);
          continue;
        }
        const novaUrl = `${EMBED_BASE}/${imdb}`;
        if (dryRun) {
          relatorio.atualizados.push({ id: f.id, title: f.title, video_url: novaUrl });
          console.log(`  [dry] ${f.id} ${(f.title || '').slice(0, 40)} => ${novaUrl}`);
          continue;
        }
        const r = await fetch(`${SUPABASE_URL}/rest/v1/movies?id=eq.${f.id}`, {
          method: 'PATCH',
          headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ video_url: novaUrl }),
        });
        if (!r.ok) {
          relatorio.falhas.push({ id: f.id, title: f.title, erro: `HTTP ${r.status}: ${(await r.text()).slice(0, 120)}` });
          console.log(`  ! ${f.id} ${(f.title || '').slice(0, 40)}: PATCH falhou HTTP ${r.status}`);
        } else {
          relatorio.atualizados.push({ id: f.id, title: f.title, video_url: novaUrl });
          console.log(`  ✓ ${f.id} ${(f.title || '').slice(0, 40)} => ${novaUrl}`);
        }
      } catch (err) {
        relatorio.falhas.push({ id: f.id, title: f.title, erro: err.message.slice(0, 120) });
        console.log(`  ! ${f.id} ${(f.title || '').slice(0, 40)}: ${err.message.slice(0, 80)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONC }, () => worker()));

  const resumo = {
    total: catalogo.length,
    atualizados: relatorio.atualizados.length,
    nao_encontrado: relatorio.nao_encontrado.length,
    sem_imdb: relatorio.sem_imdb.length,
    falhas: relatorio.falhas.length,
    dry_run: dryRun,
  };
  fs.writeFileSync('scripts/relatorio-megaembed.json', JSON.stringify({ resumo, ...relatorio }, null, 2));
  console.log('\n=== RESUMO ===');
  console.log(JSON.stringify(resumo, null, 2));
  console.log('Relatório salvo em scripts/relatorio-megaembed.json');
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
