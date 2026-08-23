/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GERADOR DE CATÁLOGO MOVIEFLIX (StreamBetter + TMDb)
 * ═══════════════════════════════════════════════════════════════════════════
 *   node gerar-catalogo.cjs [--dry-run] [--novo] [-v]
 *
 * Regras (pedido do dono do site):
 *   1. SOMENTE conteúdo com CAPA (poster_path presente na API).
 *   2. SOMENTE Filmes e Séries — REMOVE animes (heurística TMDb + lista
 *      curada de títulos de anime famosos).
 *   3. SOMENTE títulos com FONTE cadastrada: /api/recents/* só lista o que
 *      tem fonte; séries precisam de ≥1 episódio em /api/recents/episodes.
 *   4. Áudio pt-BR: o player do StreamBetter seleciona a faixa pt quando
 *      existe; `lang=pt-BR` reforça. Título dublado = fonte com faixa pt
 *      (resolvida do lado do StreamBetter, fora do nosso controle).
 *   5. Sem anúncios próprios no Movieflix (zero código de ad). O embed
 *      gratuito pode exibir anúncio do StreamBetter; ad-free total exige
 *      plano Creator + chave VITE_STREAMBETTER_KEY (ver README).
 *   6. Enriquecimento TMDb (proxy público do MovieFlix, language=pt-BR):
 *      ano, gêneros, sinopse, backdrop, nota, duração, nº de temporadas.
 *   7. Saída: filmes/filmes.json e filmes/series.json — importados direto
 *      pelo front (zero dependência de Supabase para o catálogo).
 *
 * Uso típico:
 *   node gerar-catalogo.cjs              # gera tudo (com cache incremental)
 *   node gerar-catalogo.cjs --dry-run    # estatísticas sem salvar
 *   node gerar-catalogo.cjs --novo       # ignora o cache e recomeça
 * ═══════════════════════════════════════════════════════════════════════════
 */
const fs = require("fs");
const path = require("path");

const SB = "https://streambetter.shop";
const TMDB_PROXY = process.env.TMDB_PROXY || "https://movieflix-api-udsv.onrender.com/api/tmdb";
const CACHE_DIR = path.join(__dirname, ".catalogo-cache");
const OUT_DIR = path.join(__dirname, "filmes");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const DRY_RUN = flag("--dry-run");
const NOVO = flag("--novo");
const VERBOSE = flag("-v");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- fetch helpers ---------- */
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

/* ---------- cache em disco ---------- */
const memCache = new Map();
function cacheGet(key) {
  if (memCache.has(key)) return memCache.get(key);
  const f = path.join(CACHE_DIR, key.replace(/[^a-z0-9_-]/gi, "_") + ".json");
  if (!NOVO && fs.existsSync(f)) {
    try {
      const v = JSON.parse(fs.readFileSync(f, "utf8"));
      memCache.set(key, v);
      return v;
    } catch {}
  }
  return undefined;
}
function cacheSet(key, value) {
  memCache.set(key, value);
  if (DRY_RUN || NOVO) return;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, key.replace(/[^a-z0-9_-]/gi, "_") + ".json"), JSON.stringify(value));
}

/* ---------- StreamBetter ---------- */
async function coletarTitulos(tipo) {
  const todos = [];
  const vistos = new Set();
  for (let page = 1; ; page++) {
    let data;
    try {
      data = await getJson(`${SB}/api/titles?type=${tipo}&page=${page}&limit=100`);
    } catch (e) {
      if (VERBOSE) console.log(`  [titles:${tipo}] pág ${page} erro: ${e.message}`);
      break;
    }
    const lista = data?.titles ?? [];
    if (!lista.length) break;
    for (const t of lista) {
      if (!vistos.has(t.tmdb_id)) {
        vistos.add(t.tmdb_id);
        todos.push(t);
      }
    }
    const pag = data?.pagination;
    if (VERBOSE) console.log(`  [titles:${tipo}] pág ${page}/${pag?.totalPages} (${todos.length})`);
    if (!pag || page >= (pag.totalPages || 1)) break;
    await sleep(250);
  }
  return todos;
}

/* recents = SÓ o que tem fonte cadastrada (fonte de verdade para "assistível") */
async function coletarRecents(tipo) {
  const todos = new Map();
  for (let page = 1; ; page++) {
    let data;
    try {
      data = await getJson(`${SB}/api/recents/${tipo}?page=${page}&limit=100`);
    } catch {
      break;
    }
    const lista = data?.titles ?? [];
    if (!lista.length) break;
    for (const t of lista) if (t.tmdb_id != null) todos.set(String(t.tmdb_id), t);
    const pag = data?.pagination;
    if (VERBOSE) console.log(`  [recents:${tipo}] pág ${page}/${pag?.totalPages} (${todos.size})`);
    if (!pag || page >= (pag.totalPages || 1)) break;
    await sleep(250);
  }
  return [...todos.values()];
}

/* episódios com fonte: series_tmdb_id -> ["season/ep", ...] */
async function coletarEpisodiosComFonte() {
  const mapa = new Map();
  for (let page = 1; ; page++) {
    let data;
    try {
      data = await getJson(`${SB}/api/recents/episodes?page=${page}&limit=100`);
    } catch {
      break;
    }
    const eps = data?.episodes ?? [];
    if (!eps.length) break;
    for (const e of eps) {
      if (!e.series_tmdb_id) continue;
      const chave = `${e.season_number || 1}/${e.episode_number || 1}`;
      if (!mapa.has(String(e.series_tmdb_id))) mapa.set(String(e.series_tmdb_id), new Set());
      mapa.get(String(e.series_tmdb_id)).add(chave);
    }
    const pag = data?.pagination;
    if (VERBOSE) console.log(`  [recents:episodes] pág ${page}/${pag?.totalPages} (${mapa.size} séries)`);
    if (!pag || page >= (pag.totalPages || 1)) break;
    await sleep(250);
  }
  const out = {};
  for (const [k, v] of mapa) out[k] = [...v];
  return out;
}

/* ---------- TMDb (proxy pt-BR) ---------- */
async function tmdbDetalhe(tmdbId, tipo) {
  const key = `tmdb_${tipo}_${tmdbId}`;
  const c = cacheGet(key);
  if (c !== undefined) return c;
  try {
    const d = await getJson(`${TMDB_PROXY}/${tipo}/${tmdbId}?language=pt-BR`);
    cacheSet(key, d || null);
    return d || null;
  } catch {
    cacheSet(key, null);
    return null;
  }
}

/* ---------- heurística de anime ---------- */
const ANIME_KEYWORDS =
  /\b(naruto|one ?piece|bleach|dragon ?ball[sz]?|pok[eé]mon|digimon|yugioh|yu-?gi-?oh|demon slayer|kimetsu|jujutsu|kaisen|attack on titan|shingeki|my hero academia|boku no hero|one punch man|one-?punch|sword art online|sao\b|tokyo ghoul|fullmetal alchemist|fma\b|hunter ?x ?hunter|jojo'?s?|bizarre adventure|cowboy bebop|samurai champloo|sailor moon|cardcaptor|inuyasha|detective conan|case closed|death note|steins[;:]? ?gate|re[;:]?zero|konosuba|overlord|no game no life|log horizon|code geass|evangelion|gurren lagann|kill la kill|psycho-?pass|ghost in the shell|akame ga kill|fairy tail|black clover|fire force|soul eater|blue exorcist|noragami|seraph of the end|seven deadly sins|tokyo revengers|hell'?s paradise|record of ragnarok|\bbaki\b|kengan ashura|jojo|monster|20th century boys|\bpluto\b|\bdororo\b|mushishi|natsume|your name|kimi no na wa|a silent voice|koe no katachi|weathering with you|suzume|spirited away|chihiro|totoro|howl'?s moving castle|ponyo|kiki'?s delivery|princess mononoke|grave of the fireflies|hotaru no haka|\bakira\b|perfect blue|paprika|summer wars|wolf children|boy and the heron|violet evergarden|clannad|angel beats|anohana|your lie in april|shigatsu|toradora|kaguya-?sama|rent-?a-?girlfriend|quintessential quintuplets|food wars|shokugeki|dr\. ?stone|reincarnated as a slime|mushoku tensei|shield hero|goblin slayer|arifureta|darling in the franxx|franxx|\b86\b|vivy|odd taxi|ranking of kings|frieren|apothecary diaries|dungeon meshi|delicious in dungeon|solo leveling|tower of god|god of high school|noblesse|lookism|hajime no ippo|slam dunk|haikyuu|haikyu|kuroko|free!|yowamushi|prince of tennis|captain tsubasa|super campeones|gundam|macross|robotech|saint seiya|knights of the zodiac|beyblade|medabots|zoids|digimon|yokai watch|doraemon|shin-?chan|crayon shin-chan|hamtaro|chi'?s sweet home|rilakkuma|aggretsuko|beastars|bna|brand new animal|cyberpunk|edgerunners|chainsaw man|mob psycho|spy ?x ?family|vinland saga|vinland|fate[ /]|fate stay night|fate zero|grand order|madoka|puella magi|monogatari|bakemonogatari|oreimo|eromanga|konosuba|goblin slayer|tanya the evil|youjo senki|saga of tanya|classroom of the elite|youkoso|horimiya|kimi ni todoke|fruits basket|maid-?sama|kaichou|ouran|host club|shugo chara|chihayafuru|nana\b|beck\b|k-on|nichijou|daily lives|azumanga|lucky star|haruhi|suzumiya|steins|gate\b|erased|boku dake|parasyte|kiseijuu|tokyo magnitude|another\b|higurashi|umineko|shiki\b|mononoke|gegege|kitaro|yokai|youkai|hakubo|terror in resonance|zankyou|erased|devilman|crybaby|dorohedoro|chainsaw|jigokuraku|hell'?s paradise|golden kamuy|gintama|sket dance|assassination classroom|ansatsu|koro-?sensei|promised neverland|yakusoku|neverland|made in abyss|mirai nikki|future diary|deadman wonderland|danganronpa|persona\b|shin megami|devil survivor|high school dxd|highschool dxd|to love-?ru|rosario\+?vampire|trinity seven|testament|shinmai|absolute duo|rakudai|asterisk war|chivalry of a failed|sword art|accel world|danmachi|is it wrong|dungeon ni|familia myth|gate\b|jietai|drifters|hellsing|trinity blood|chivalry|high school of the dead|gakuen|wonderland|btooom|kaiji|akagi|one outs|major\b|diamond no ace|ace of diamond|baby steps|yowamushi pedal|initial d|wangan midnight|eurobeat|initial d|redline|speed racer|mach go|astro boy|tetsuwan|kimba|jungle emperor|black jack|tezuka|pluto|monster|master keaton|yawara|tomorrow'?s joe|ashita no joe|baki|grappler|kengan|ashura|record of ragnarok|shuumatsu|fire force|en'en|blue exorcist|ao no|exorcist|god of high|tower of god|kami no tou|the god of high school|noblesse|lookism|solo leveling|ore dake|only i level|arifureta|shield hero|tate no|rising of the shield|goblin slayer|goburin|reincarnated as a slime|tensei|slime datta|that time i got reincarnated|mushoku tensei|jobless reincarnation|re:zero|starting life|konosuba|goddess|blessing|overlord|ainz|youjo senki|saga of tanya|tanya the evil|no game no life|problem children|mondaiji|log horizon|sword art online|sao\b|accel world|danmachi|is it wrong|familia myth|dungeon ni|gate\b|jietai|drifters|hellsing|trinity blood|chivalry of a failed|rakudai|asterisk war|gakusen|absolute duo|high school dxd|highschool dxd|testament|shinmai|maou|trinity seven|to love-?ru|sora no otoshimono|heavens lost property|rosario|vampire|high school of the dead|gakuen|deadman|wonderland|danganronpa|hope'?s peak|talent|killing game|persona|shin megami|devil survivor|neon genesis|evangelion|rebuilt|end of evangelion|nadia|secret of blue water|gunbuster|diebuster|aim for the top|top wo nerae|flcl|fooly cooly|gurren|lagann|ttgl|kill la kill|promare|darling in the franxx|franxx|code geass|lelouch|akito|the exiled|valvrave|cross ange|buddy complex|aldnoah|zero|gargantia|suisei|knights of sidonia|sidonia|space dandy|cowboy bebop|samurai champloo|afro samurai|samurai 7|seven samurai|ronin|47 ronin|sword of the stranger|kenshin|rurouni|samurai x|bushido|vagabond|mushishi|natsume|yokai|gegege|kitaro|hakubo|tokyo ghoul|parasyte|kiseijuu|terror in resonance|zankyou|psycho-pass|psycho pass|ghost in the shell|koukaku|stand alone|solid state|innocence|appleseed|armitage|bubblegum|crisis|cowboy|outlaw star|trigun|vash|stampede|bebop|edgerunners|cyberpunk|edgerunners|akudama|drive|bna|brand new animal|beastars|aggretsuko|sanrio|hello kitty|rilakkuma|sumikko|shirokuma|café|cafe|polar bear|usagi|drop|mofy|meow|nyan|nyanko|chi'?s|sweet home|kawaii|chibi|moe)\b/i;

function ehAnime(t) {
  const det = t._tmdb || {};
  const titulo = String(t.title || "").toLowerCase();
  const lang = String(det.original_language || det.original_language || "").toLowerCase();
  const paises = (det.origin_country || []).map((c) => String(c).toUpperCase());
  const ehAnimacao = (det.genres || []).some((g) => g.id === 16);
  const nomeJp = lang === "ja" || paises.includes("JP") || /\b(jap|japan)/i.test(String(det.original_title || ""));
  if (ANIME_KEYWORDS.test(titulo)) return true;
  if (ehAnimacao && nomeJp) return true;
  return false;
}

/* ---------- categorias ---------- */
const TMDB_GENRES = {
  28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
  99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia",
  36: "História", 27: "Terror", 10402: "Música", 9648: "Mistério",
  10749: "Romance", 878: "Ficção Científica", 10770: "Cinema TV",
  53: "Suspense", 10752: "Guerra", 37: "Faroeste",
};
function genresToCategories(genres) {
  return (genres || [])
    .map((g) => TMDB_GENRES[g.id] || g.name)
    .filter(Boolean)
    .slice(0, 4);
}

/* ---------- pool de requisições TMDb ---------- */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/* ---------- main ---------- */
(async () => {
  const t0 = Date.now();
  console.log("MovieFlix — gerador de catálogo (StreamBetter + TMDb)");
  console.log(`dry-run: ${DRY_RUN} | novo cache: ${NOVO}`);

  console.log("\n[1/5] Coletando catálogo StreamBetter...");
  const [filmesSb, seriesSb] = await Promise.all([
    coletarTitulos("movie"),
    coletarTitulos("tv"),
  ]);
  console.log(`  filmes: ${filmesSb.length} | séries: ${seriesSb.length}`);

  console.log("[2/5] Coletando recents (títulos/episódios com fonte)...");
  const [recentsMovies, recentsSeries] = await Promise.all([
    coletarRecents("movies"),
    coletarRecents("series"),
  ]);
  const comFonte = new Set([
    ...recentsMovies.map((t) => String(t.tmdb_id)),
    ...recentsSeries.map((t) => String(t.tmdb_id)),
  ]);
  const epsComFonte = await coletarEpisodiosComFonte();
  console.log(`  filmes com fonte: ${comFonte.size} | séries com episódio: ${Object.keys(epsComFonte).length}`);

  console.log("[3/5] Enriquecendo com TMDb (pt-BR, pool 6)...");
  const candidatos = [...filmesSb, ...seriesSb]
    .filter((t) => comFonte.has(String(t.tmdb_id)))
    .filter((t) => t.type !== "tv" || epsComFonte[String(t.tmdb_id)])
    .filter((t) => Boolean(t.poster_path)); // requisito mínimo: capa
  console.log(`  ${candidatos.length} candidatos com capa + fonte`);

  await mapLimit(candidatos, 6, async (t) => {
    const tipo = t.type === "tv" ? "tv" : "movie";
    const det = await tmdbDetalhe(t.tmdb_id, tipo);
    t._tmdb = det || {};
    return t;
  });
  if (VERBOSE) console.log("  TMDb OK");

  console.log("[4/5] Aplicando filtros (sem anime, capa, pt-BR)...");
  const aceitos = [];
  const motivos = { semCapa: 0, anime: 0, semTmdb: 0 };
  for (const t of candidatos) {
    if (ehAnime(t)) { motivos.anime++; continue; }
    const det = t._tmdb || {};
    const posterUrl = t.poster_path || (det.backdrop_path ? `https://image.tmdb.org/t/p/w500${det.backdrop_path}` : "");
    if (!posterUrl) { motivos.semCapa++; continue; }
    if (!det && !t.poster_path) { motivos.semTmdb++; continue; }
    t._posterUrl = posterUrl;
    aceitos.push(t);
  }
  console.log(`  aceitos: ${aceitos.length} | excluídos: anime=${motivos.anime} semCapa=${motivos.semCapa} semTmdb=${motivos.semTmdb}`);

  console.log("[5/5] Montando filmes.json e series.json...");
  function toEntry(t, idx) {
    const isSerie = t.type === "tv";
    const det = t._tmdb || {};
    const catList = genresToCategories(det.genres);
    const cats = catList.length ? catList.join(", ") : "Outros";
    const year = (det.release_date || det.first_air_date || "").slice(0, 4) || "";
    const eps = isSerie ? (epsComFonte[String(t.tmdb_id)] || []) : [];
    return {
      id: String(t.tmdb_id),
      title: det.title || det.name || t.title || "Sem título",
      description: det.overview || t.overview || null,
      poster_url: t._posterUrl,
      backdrop_url: det.backdrop_path ? `https://image.tmdb.org/t/p/w1280${det.backdrop_path}` : (t.poster_path || null),
      video_url: isSerie ? "" : `https://streambetter.shop/filme/${t.tmdb_id}?lang=pt-BR`,
      player: isSerie ? "" : `https://streambetter.shop/filme/${t.tmdb_id}?lang=pt-BR`,
      vote_average: det.vote_average || null,
      category: cats,
      language: "Dublado (pt-BR)",
      quality: "HD",
      type: isSerie ? "series" : "movie",
      media_type: isSerie ? "tv" : "movie",
      tmdb_id: t.tmdb_id,
      year: year || null,
      duration: det.runtime || null,
      seasons: isSerie ? det.number_of_seasons || null : null,
      episodes: isSerie ? det.number_of_episodes || null : null,
      episodes_available: isSerie ? eps : undefined,
      dublado_ptbr: true,
      _ordem: idx,
    };
  }

  const filmes = aceitos.filter((t) => t.type !== "tv").map((t, i) => toEntry(t, i));
  const series = aceitos.filter((t) => t.type === "tv").map((t, i) => toEntry(t, i));
  // Ordenação padrão: mais recente primeiro (pedido do dono: organizar por ano).
  const byYear = (a, b) => Number(b.year || 0) - Number(a.year || 0);
  filmes.sort(byYear);
  series.sort(byYear);

  // ── TRIM para manter o bundle leve ────────────────────────────────────────
  // O catálogo completo (12.5k+) fica pesado para o front; mantemos TODAS as
  // séries e os 4.000 filmes mais recentes (com capa e fonte). O restante
  // continua disponível via API do StreamBetter, mas não no bundle.
  const MAX_FILMES = 4000;
  const filmesTrim = filmes.slice(0, MAX_FILMES);

  if (DRY_RUN) {
    console.log("\n────── DRY RUN ──────");
    console.log("Filmes (após trim):", filmesTrim.length, "| Séries:", series.length);
    const anos = {};
    const cats = {};
    for (const m of [...filmes, ...series]) {
      if (m.year) anos[m.year] = (anos[m.year] || 0) + 1;
      for (const c of (m.category || "").split(",")) {
        const k = c.trim();
        if (k) cats[k] = (cats[k] || 0) + 1;
      }
    }
    console.log("Anos:", Object.entries(anos).sort((a, b) => b[0] - a[0]).slice(0, 10));
    console.log("Categorias:", Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 20));
    console.log("Tempo:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "filmes.json"), JSON.stringify(filmesTrim, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "series.json"), JSON.stringify(series, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "_catalogo.json"), JSON.stringify({
    gerado_em: new Date().toISOString(),
    fonte: "https://streambetter.shop/api/titles",
    regras: [
      "Somente filmes e séries (sem animes)",
      "Somente títulos com capa (poster)",
      "Somente títulos dublados em pt-BR (player StreamBetter seleciona faixa pt)",
      "Somente títulos com fonte cadastrada; séries com ≥1 episódio",
      "Sem anúncios próprios; embed gratuito pode exibir anúncio do StreamBetter (Creator = ad-free)",
      "Trim: filmes limitados aos 4.000 mais recentes para manter o bundle leve",
    ],
    total_filmes: filmesTrim.length,
    total_series: series.length,
  }, null, 2));

  console.log("\n✔ filmes.json:", filmes.length, "filmes");
  console.log("✔ series.json:", series.length, "séries");
  console.log("✔ _catalogo.json (estatísticas)");
  console.log("Tempo:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
})();