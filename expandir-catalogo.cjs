/**
 * EXPANSÃO DO CATÁLOGO MOVIEFLIX (somente adição).
 * - NÃO remove nem altera nenhum título existente.
 * - Adiciona filmes/séries novos do StreamBetter (com fonte + capa, sem anime),
 *   enriquecidos via TMDb (proxy pt-BR), no MESMO formato de gerar-catalogo.cjs.
 * - Atualiza disponibilidade.json para os novos títulos aparecerem no front.
 */
const fs = require("fs");
const path = require("path");

const SB = "https://streambetter.shop";
const TMDB_PROXY = process.env.TMDB_PROXY || "https://movieflix-api-udsv.onrender.com/api/tmdb";
const OUT_DIR = path.join(__dirname, "filmes");
const PUB_DIR = path.join(__dirname, "public", "filmes");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, { retries = 3, timeout = 25000 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      clearTimeout(t);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

/* Reutiliza o regex de anime do gerador oficial (mesma regra do dono). */
const src = fs.readFileSync(path.join(__dirname, "gerar-catalogo.cjs"), "utf8");
const m = src.match(/const ANIME_KEYWORDS =\s*(\/[\s\S]*?\/i);/);
const ANIME_KEYWORDS = eval(m[1]);

function ehAnime(t) {
  const det = t._tmdb || {};
  const titulo = String(t.title || "").toLowerCase();
  const lang = String(det.original_language || "").toLowerCase();
  const paises = (det.origin_country || []).map((c) => String(c).toUpperCase());
  const ehAnimacao = (det.genres || []).some((g) => g.id === 16);
  const nomeJp = lang === "ja" || paises.includes("JP") || /\b(jap|japan)/i.test(String(det.original_title || ""));
  if (ANIME_KEYWORDS.test(titulo)) return true;
  if (ehAnimacao && nomeJp) return true;
  return false;
}

const TMDB_GENRES = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  36: "História", 27: "Terror", 10402: "Música", 9648: "Mistério",
  10749: "Romance", 878: "Ficção Científica", 10770: "Cinema TV",
  53: "Suspense", 10752: "Guerra", 37: "Faroeste",
};
function genresToCategories(genres) {
  return (genres || []).map((g) => TMDB_GENRES[g.id]).filter(Boolean);
}

function qualidadeDoItem(t) {
  const bruto = [t.quality, t.label, t.tags, t.resolution, t.quality_label].filter(Boolean).join(" ");
  if (!bruto) return "HD";
  const s = bruto.toLowerCase();
  if (s.includes("4k") || s.includes("2160") || s.includes("uhd")) return "4K";
  if (s.includes("1080") || s.includes("bluray") || s.includes("blu-ray") || s.includes("fullhd")) return "1080p";
  if (s.includes("720")) return "720p";
  if (s.includes("web")) return "WEB-DL";
  if (s.includes("cam") || s.includes("telesync") || s.includes("telecine") || /(^|\b)ts(\b|$)/.test(s)) return "CAM";
  if (s.includes("dvd")) return "DVDRip";
  return "HD";
}

async function coletarTitulos(tipo) {
  const todos = [];
  const vistos = new Set();
  for (let page = 1; ; page++) {
    let data;
    try { data = await getJson(`${SB}/api/titles?type=${tipo}&page=${page}&limit=100`); }
    catch { break; }
    const lista = data?.titles ?? [];
    if (!lista.length) break;
    for (const t of lista) {
      const chave = String(t.tmdb_id ?? "");
      if (!chave || vistos.has(chave)) continue;
      vistos.add(chave);
      todos.push(t);
    }
    const pag = data?.pagination;
    if (!pag || page >= (pag.totalPages || 1)) break;
    await sleep(250);
  }
  return todos;
}

async function coletarRecents(tipo) {
  const todos = new Map();
  for (let page = 1; ; page++) {
    let data;
    try { data = await getJson(`${SB}/api/recents/${tipo}?page=${page}&limit=100`); }
    catch { break; }
    const lista = data?.titles ?? [];
    if (!lista.length) break;
    for (const t of lista) if (t.tmdb_id != null) todos.set(String(t.tmdb_id), t);
    const pag = data?.pagination;
    if (!pag || page >= (pag.totalPages || 1)) break;
    await sleep(250);
  }
  return [...todos.values()];
}

async function coletarEpisodiosComFonte() {
  const mapa = new Map();
  for (let page = 1; ; page++) {
    let data;
    try { data = await getJson(`${SB}/api/recents/episodes?page=${page}&limit=100`); }
    catch { break; }
    const eps = data?.episodes ?? [];
    if (!eps.length) break;
    for (const e of eps) {
      if (!e.series_tmdb_id) continue;
      const chave = `${e.season_number || 1}/${e.episode_number || 1}`;
      if (!mapa.has(String(e.series_tmdb_id))) mapa.set(String(e.series_tmdb_id), new Set());
      mapa.get(String(e.series_tmdb_id)).add(chave);
    }
    const pag = data?.pagination;
    if (!pag || page >= (pag.totalPages || 1)) break;
    await sleep(250);
  }
  const out = {};
  for (const [k, v] of mapa) out[k] = [...v];
  return out;
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

(async () => {
  const t0 = Date.now();
  const filmes = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "filmes.json"), "utf8"));
  const series = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "series.json"), "utf8"));
  const disp = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "disponibilidade.json"), "utf8"));
  const existentes = new Set([
    ...filmes.map((f) => String(f.tmdb_id ?? f.id)),
    ...series.map((s) => String(s.tmdb_id ?? s.id)),
  ]);
  console.log(`Catálogo atual: ${filmes.length} filmes, ${series.length} séries`);

  console.log("[1/4] Coletando StreamBetter...");
  const [filmesSb, seriesSb, recM, recS, epsComFonte] = await Promise.all([
    coletarTitulos("movie"), coletarTitulos("tv"),
    coletarRecents("movies"), coletarRecents("series"),
    coletarEpisodiosComFonte(),
  ]);
  const comFonte = new Set([...recM, ...recS].map((t) => String(t.tmdb_id)));
  console.log(`  SB: ${filmesSb.length} filmes, ${seriesSb.length} séries | com fonte: ${comFonte.size}`);

  const candidatos = [...filmesSb, ...seriesSb]
    .filter((t) => !existentes.has(String(t.tmdb_id)))
    .filter((t) => comFonte.has(String(t.tmdb_id)))
    .filter((t) => t.type !== "tv" || epsComFonte[String(t.tmdb_id)])
    .filter((t) => Boolean(t.poster_path));
  console.log(`[2/4] ${candidatos.length} candidatos NOVOS (com fonte + capa)`);

  console.log("[3/4] Enriquecendo TMDb...");
  await mapLimit(candidatos, 6, async (t) => {
    const tipo = t.type === "tv" ? "tv" : "movie";
    try {
      t._tmdb = (await getJson(`${TMDB_PROXY}/${tipo}/${t.tmdb_id}?language=pt-BR`)) || {};
    } catch { t._tmdb = {}; }
  });

  const novosFilmes = [];
  const novasSeries = [];
  let animes = 0;
  for (const t of candidatos) {
    if (ehAnime(t)) { animes++; continue; }
    const isSerie = t.type === "tv";
    const det = t._tmdb || {};
    const cats = genresToCategories(det.genres);
    const year = (det.release_date || det.first_air_date || "").slice(0, 4) || "";
    const eps = isSerie ? (epsComFonte[String(t.tmdb_id)] || []) : [];
    const entry = {
      id: String(t.tmdb_id),
      title: det.title || det.name || t.title || "Sem título",
      description: det.overview || t.overview || null,
      poster_url: t.poster_path,
      backdrop_url: det.backdrop_path ? `https://image.tmdb.org/t/p/w1280${det.backdrop_path}` : (t.poster_path || null),
      video_url: isSerie ? "" : `https://streambetter.shop/filme/${t.tmdb_id}?lang=pt-BR`,
      player: isSerie ? "" : `https://streambetter.shop/filme/${t.tmdb_id}?lang=pt-BR`,
      vote_average: det.vote_average || null,
      popularity: det.popularity || null,
      release_date: det.release_date || det.first_air_date || null,
      category: cats.length ? cats.join(", ") : "Outros",
      language: "Dublado (pt-BR)",
      quality: qualidadeDoItem(t),
      type: isSerie ? "series" : "movie",
      media_type: isSerie ? "tv" : "movie",
      tmdb_id: t.tmdb_id,
      year: year || null,
      duration: det.runtime || null,
      seasons: isSerie ? det.number_of_seasons || null : null,
      episodes: isSerie ? det.number_of_episodes || null : null,
      episodes_available: isSerie ? eps : undefined,
      dublado_ptbr: true,
    };
    (isSerie ? novasSeries : novosFilmes).push(entry);
  }
  console.log(`  novos: ${novosFilmes.length} filmes, ${novasSeries.length} séries (animes filtrados: ${animes})`);

  console.log("[4/4] Mesclando e salvando...");
  const byData = (a, b) => String(b.release_date || b.year || "").localeCompare(String(a.release_date || a.year || ""));
  const filmesFinal = [...filmes, ...novosFilmes].sort(byData);
  const seriesFinal = [...series, ...novasSeries].sort(byData);
  filmesFinal.forEach((f, i) => (f._ordem = i));
  seriesFinal.forEach((s, i) => (s._ordem = i));

  // Disponibilidade: novos títulos TÊM fonte (vieram dos recents), então entram nas listas.
  const dispFilmes = new Set((disp.filmes || []).map(String));
  for (const f of novosFilmes) dispFilmes.add(String(f.tmdb_id));
  disp.filmes = [...dispFilmes];
  disp.series = disp.series || {};
  const dispSeriesVer = new Set((disp.series_verificadas || []).map(String));
  for (const s of novasSeries) {
    disp.series[String(s.tmdb_id)] = s.episodes_available || [];
    dispSeriesVer.add(String(s.tmdb_id));
  }
  disp.series_verificadas = [...dispSeriesVer];
  disp.gerado_em = new Date().toISOString();

  const catalogoMeta = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "_catalogo.json"), "utf8"));
  catalogoMeta.gerado_em = new Date().toISOString();
  catalogoMeta.total_filmes = filmesFinal.length;
  catalogoMeta.total_series = seriesFinal.length;
  catalogoMeta.expansao = `+${novosFilmes.length} filmes, +${novasSeries.length} séries em ${new Date().toISOString()}`;

  for (const dir of [OUT_DIR, PUB_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "filmes.json"), JSON.stringify(filmesFinal, null, 2));
    fs.writeFileSync(path.join(dir, "series.json"), JSON.stringify(seriesFinal, null, 2));
    fs.writeFileSync(path.join(dir, "disponibilidade.json"), JSON.stringify(disp, null, 2));
    fs.writeFileSync(path.join(dir, "_catalogo.json"), JSON.stringify(catalogoMeta, null, 2));
  }

  console.log(`\n✔ filmes.json: ${filmes.length} → ${filmesFinal.length}`);
  console.log(`✔ series.json: ${series.length} → ${seriesFinal.length}`);
  console.log("Tempo:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
})();
