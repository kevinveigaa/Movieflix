/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VERIFICADOR DE VÍDEO DISPONÍVEL (MovieFlix)
 * ═══════════════════════════════════════════════════════════════════════════
 *   node scripts/verificar-videos.mjs [--filmes] [--series] [--novo]
 *
 * Objetivo: descobrir QUAIS títulos do catálogo realmente têm um vídeo
 * reproduzível e de BOA qualidade, usando exatamente o mesmo resolvedor que o
 * Player usa em produção (backend/streambetter-resolver.js). Fontes CAM/TS/TC/
 * screener são descartadas pelo próprio resolvedor (ehFonteRuim).
 *
 * Saída: filmes/disponibilidade.json (+ cópia em public/filmes) no formato
 *   {
 *     "gerado_em": "...",
 *     "filmes": ["550", "1437939", ...],            // tmdb_id com vídeo bom
 *     "series": { "283297": ["1/1","1/2"] },        // episódios com vídeo bom
 *     "series_verificadas": ["283297", ...]
 *   }
 *
 * O front (src/lib/disponibilidade.ts + useMovies) usa esse arquivo para
 * esconder o que não tem vídeo — ZERO requisições extras por título em runtime.
 * Nada é apagado do catálogo: o título continua cadastrado, só não aparece.
 *
 * Cache incremental em .disponibilidade-cache/resultados.jsonl → dá para
 * interromper e retomar (use --novo para ignorar o cache).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolverEmbed } = require('../backend/streambetter-resolver.js');

const RAIZ = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const DIR_FILMES = path.join(RAIZ, 'filmes');
const DIR_PUBLIC = path.join(RAIZ, 'public', 'filmes');
const CACHE_DIR = path.join(RAIZ, '.disponibilidade-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'resultados.jsonl');

const args = process.argv.slice(2);
const NOVO = args.includes('--novo');
const SO_FILMES = args.includes('--filmes');
const SO_SERIES = args.includes('--series');
const CONCORRENCIA = Number(process.env.CONCORRENCIA || 20);

const SB = 'https://streambetter.shop';
const urlFilme = (tmdb) => `${SB}/filme/${tmdb}?lang=pt-BR`;
const urlEpisodio = (tmdb, s, e) => `${SB}/serie/${tmdb}/${s}/${e}?lang=pt-BR`;

/* ---------- cache ---------- */
const cache = new Map(); // chave -> boolean
if (!NOVO && fs.existsSync(CACHE_FILE)) {
  for (const linha of fs.readFileSync(CACHE_FILE, 'utf8').split('\n')) {
    if (!linha.trim()) continue;
    try {
      const { k, ok } = JSON.parse(linha);
      cache.set(k, ok);
    } catch {
      /* linha corrompida: ignora */
    }
  }
  console.log(`cache: ${cache.size} verificações reaproveitadas`);
}
fs.mkdirSync(CACHE_DIR, { recursive: true });
const cacheStream = fs.createWriteStream(CACHE_FILE, { flags: NOVO ? 'w' : 'a' });

/** Tem vídeo bom e reproduzível? (com cache) */
async function temVideoBom(chave, embedUrl) {
  if (cache.has(chave)) return cache.get(chave);
  let ok = false;
  try {
    const r = await resolverEmbed(embedUrl);
    ok = Boolean(r?.success && r.url);
  } catch {
    ok = false;
  }
  cache.set(chave, ok);
  cacheStream.write(JSON.stringify({ k: chave, ok }) + '\n');
  return ok;
}

async function mapLimit(itens, limite, fn) {
  let i = 0;
  let feitos = 0;
  async function worker() {
    while (i < itens.length) {
      const idx = i++;
      await fn(itens[idx]);
      feitos++;
      if (feitos % 100 === 0) {
        console.log(`  ${feitos}/${itens.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, worker));
}

function lerJson(arquivo) {
  return JSON.parse(fs.readFileSync(path.join(DIR_FILMES, arquivo), 'utf8'));
}

/* ---------- main ---------- */
const saidaAnterior = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR_FILMES, 'disponibilidade.json'), 'utf8'));
  } catch {
    return { filmes: [], series: {}, series_verificadas: [] };
  }
})();

const filmesOk = new Set(SO_SERIES ? saidaAnterior.filmes ?? [] : []);
const seriesOk = { ...(SO_FILMES ? saidaAnterior.series ?? {} : {}) };
const seriesVerificadas = new Set(SO_FILMES ? saidaAnterior.series_verificadas ?? [] : []);

function salvar() {
  const saida = {
    gerado_em: new Date().toISOString(),
    filmes: [...filmesOk],
    series: seriesOk,
    series_verificadas: [...seriesVerificadas],
  };
  const json = JSON.stringify(saida);
  fs.writeFileSync(path.join(DIR_FILMES, 'disponibilidade.json'), json);
  fs.mkdirSync(DIR_PUBLIC, { recursive: true });
  fs.writeFileSync(path.join(DIR_PUBLIC, 'disponibilidade.json'), json);
}

if (!SO_SERIES) {
  const filmes = lerJson('filmes.json');
  console.log(`[filmes] verificando ${filmes.length}...`);
  await mapLimit(filmes, CONCORRENCIA, async (f) => {
    const tmdb = String(f.tmdb_id ?? f.id ?? '');
    if (!tmdb) return;
    if (await temVideoBom(`m:${tmdb}`, urlFilme(tmdb))) filmesOk.add(tmdb);
  });
  salvar();
  console.log(`[filmes] com vídeo bom: ${filmesOk.size}`);
}

if (!SO_FILMES) {
  const series = lerJson('series.json');
  const tarefas = [];
  for (const s of series) {
    const tmdb = String(s.tmdb_id ?? s.id ?? '');
    if (!tmdb) continue;
    for (const ep of s.episodes_available ?? []) {
      const [temporada, episodio] = String(ep).split('/').map(Number);
      if (!temporada || !episodio) continue;
      tarefas.push({ tmdb, ep, temporada, episodio });
    }
  }
  console.log(`[séries] verificando ${tarefas.length} episódios de ${series.length} séries...`);
  let salvoEm = Date.now();
  await mapLimit(tarefas, CONCORRENCIA, async (t) => {
    seriesVerificadas.add(t.tmdb);
    const ok = await temVideoBom(
      `e:${t.tmdb}:${t.ep}`,
      urlEpisodio(t.tmdb, t.temporada, t.episodio),
    );
    if (ok) {
      if (!seriesOk[t.tmdb]) seriesOk[t.tmdb] = [];
      seriesOk[t.tmdb].push(t.ep);
    }
    if (Date.now() - salvoEm > 60000) {
      salvoEm = Date.now();
      salvar();
    }
  });
  for (const k of Object.keys(seriesOk)) {
    seriesOk[k].sort((a, b) => {
      const [as, ae] = a.split('/').map(Number);
      const [bs, be] = b.split('/').map(Number);
      return as - bs || ae - be;
    });
  }
  salvar();
  console.log(`[séries] com ≥1 episódio bom: ${Object.keys(seriesOk).length}`);
}

salvar();
cacheStream.end();
console.log('pronto → filmes/disponibilidade.json');
