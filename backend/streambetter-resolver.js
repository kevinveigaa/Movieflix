/**
 * StreamBetter Direct Resolver
 *
 * Resolve o stream HLS REAL de um título do StreamBetter SEM usar o iframe
 * do player deles. Isso elimina 100% dos anúncios do plano free (o overlay
 * "Só mais um passo" / "Reprodução bloqueada" vive DENTRO do iframe
 * cross-origin — impossível de fechar via JS da página pai) e elimina
 * qualquer possibilidade de redirecionamento para fora do site.
 *
 * Fluxo:
 *   1. Busca o HTML do embed (servidor → servidor, sem CORS):
 *        https://streambetter.shop/filme/{tmdb}?lang=pt-BR   (filme)
 *        https://streambetter.shop/serie/{tmdb}/{s}/{e}?lang=pt-BR (episódio)
 *   2. Extrai `sources=[...]` e `window.__PLAYER_CAPS__` do HTML.
 *   3. Resolve a fonte:
 *        - kind "embedplayer" → chama /api/extract-embedplayer?t=... → recebe
 *          uma URL /api/proxy?t=...&ext=m3u8 (HLS com token).
 *        - URL direta .m3u8 → usa como está.
 *        - kind "iframe"/vidmoly → não resolvível → fallback para iframe.
 *   4. Retorna { success, url, kind, label, titleId, episodeId }.
 *
 * O HLS retornado é servido por https://streambetter.shop/api/proxy com CORS
 * aberto (access-control-allow-origin: *), então o <video> nativo do Movieflix
 * reproduz direto. Se algum segmento não tiver CORS, o endpoint
 * /api/streambetter-hls (abaixo) reescreve as URLs para passar pelo nosso
 * backend.
 */

const STREAMBETTER_BASE = 'https://streambetter.shop';

/**
 * Chave do plano Creator do StreamBetter (sb_pk_*).
 *
 * O provedor passou a proteger as páginas de embed com um desafio
 * anti-bot (Cloudflare Turnstile: "Confirmando que você é uma pessoa de
 * verdade..."). Uma requisição servidor→servidor NUNCA resolve esse
 * desafio, então o HTML devolvido não tem `sources=[...]` e o resolver
 * retornava `sem_fontes` para TODOS os títulos (player quebrado no
 * catálogo inteiro).
 *
 * A chave Creator libera o acesso programático (embed com ?key= e a API
 * /api/sources), sem desafio e sem anúncios. Defina STREAMBETTER_KEY
 * (ou VITE_STREAMBETTER_KEY) no ambiente do backend (Render).
 */
function chaveStreambetter() {
  return process.env.STREAMBETTER_KEY || process.env.VITE_STREAMBETTER_KEY || '';
}

/** A resposta é a página de verificação anti-bot do provedor? */
function ehDesafioAntiBot(html) {
  return /challenges\.cloudflare\.com\/turnstile|cf-turnstile|turnstile-verify/i.test(html);
}

/** Cabeçalhos padrão das chamadas ao provedor (inclui a chave quando existe). */
function cabecalhosProvedor(extra = {}) {
  const key = chaveStreambetter();
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Referer: STREAMBETTER_BASE,
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    ...(key ? { 'X-Api-Key': key, Authorization: `Bearer ${key}` } : {}),
    ...extra,
  };
}

/**
 * Consulta a API autenticada do provedor (/api/sources), que não passa pelo
 * desafio anti-bot. Só funciona com a chave Creator configurada.
 * Devolve o array de fontes ou null.
 */
async function buscarFontesViaApi(tipo, tmdbId, season, episode) {
  const key = chaveStreambetter();
  if (!key || !tmdbId) return null;
  const params = new URLSearchParams({ tmdb: String(tmdbId), lang: 'pt-BR', key });
  if (tipo === 'serie') {
    params.set('season', String(season || 1));
    params.set('episode', String(episode || 1));
  }
  try {
    const resp = await fetch(`${STREAMBETTER_BASE}/api/sources?${params.toString()}`, {
      headers: cabecalhosProvedor({ Accept: 'application/json' }),
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const fontes = Array.isArray(data?.sources) ? data.sources : Array.isArray(data) ? data : null;
    return fontes && fontes.length > 0 ? fontes : null;
  } catch {
    return null;
  }
}

/** Extrai tipo/tmdbId/temporada/episódio de uma URL de embed do StreamBetter. */
function dadosDoEmbed(embedUrl) {
  try {
    const partes = new URL(embedUrl).pathname.split('/').filter(Boolean);
    if (partes[0] === 'serie') {
      return { tipo: 'serie', tmdbId: partes[1], season: Number(partes[2]) || 1, episode: Number(partes[3]) || 1 };
    }
    return { tipo: 'filme', tmdbId: partes[1], season: 1, episode: 1 };
  } catch {
    return { tipo: 'filme', tmdbId: null, season: 1, episode: 1 };
  }
}

// Kinds de fonte que o provedor resolve via /api/extract-<kind>?t=<token>,
// devolvendo { success, url } com um HLS (/api/proxy?...&ext=m3u8).
// O provedor mudou o formato das fontes: além de `embedplayer`, hoje usa
// superflix, watchplay, vidara, azullog, pluto, doramogo, redetoons,
// streamflash, anonmp4 e rdse. Sem tratar esses kinds, o resolvedor retornava
// `sem_stream_direto` para a maioria dos títulos.
const KINDS_EXTRAIVEIS = new Set([
  'embedplayer', 'superflix', 'watchplay', 'vidara', 'azullog',
  'pluto', 'doramogo', 'redetoons', 'streamflash', 'anonmp4', 'rdse',
]);

// Kinds que NÃO são resolvíveis para stream direto (painéis externos crus /
// descontinuados) — devem ser ignorados como fonte reproduzível.
const KINDS_IGNORADOS = new Set(['stream', 'descontinuado', 'iframe']);

/**
 * Fontes de BAIXA QUALIDADE (pedido do dono): CAM/CAMRip/HDCAM, TS/Telesync,
 * TC/Telecine, screener e gravações de tela NUNCA devem ser reproduzidas —
 * é melhor o título não aparecer do que exibir um vídeo ruim.
 * A checagem olha o rótulo (label) e a URL da fonte devolvida pelo embed.
 */
const PADROES_QUALIDADE_RUIM = [
  /\bhd?cam\b/i, /\bcam(rip)?\b/i, /\bts\b/i, /\btelesync\b/i,
  /\bhd-?ts\b/i, /\btc\b/i, /\btelecine\b/i, /\bhd-?tc\b/i,
  /\bscreener\b/i, /\bscr\b/i, /\bcinema\b/i, /\bpirat/i,
  /\bworkprint\b/i, /\bwp\b/i,
];

/** A fonte tem qualidade ruim (CAM/TS/TC/screener)? */
function ehFonteRuim(fonte) {
  const texto = decodeURIComponent(
    [fonte?.label, fonte?.quality, fonte?.url].filter(Boolean).join(' '),
  ).replace(/[+_]/g, ' ');
  return PADROES_QUALIDADE_RUIM.some((re) => re.test(texto));
}

function extrairJsonScript(html, chave) {
  // Ex.: sources=[...];  window.__PLAYER_CAPS__ = {...};  ou
  // &sources=%5B%7B...%7D%5D&titleId=... (JSON URL-encoded num script inline).
  const esc = chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Tenta primeiro o formato cru: chave = [ ... ]; ou { ... };
  const re = new RegExp(esc + '\\s*=\\s*(\\[.*?\\]|\\{.*?\\})\\s*;', 's');
  let m = html.match(re);
  if (!m) {
    // Formato URL-encoded: &sources=%5B...%5D& (ou terminando em " ou ;).
    // O & ou ; antes da chave já delimita — não precisa de \b.
    const reEnc = new RegExp('(?:&|;)' + esc + '=([^&;"\'\\s]+)', 's');
    m = html.match(reEnc);
    if (!m) return null;
    try {
      return JSON.parse(decodeURIComponent(m[1]));
    } catch {
      return null;
    }
  }
  try {
    const raw = m[1].trim();
    if (raw.startsWith('%')) return JSON.parse(decodeURIComponent(raw));
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extrairParam(html, chave) {
  // Ex.: titleId=4925  ou  skipTmdbId=693134  dentro do mesmo script.
  const esc = chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${esc}=(\\d+)`);
  const m = html.match(re);
  return m ? Number(m[1]) : null;
}

/** Resolve uma fonte do tipo `kind` para a URL de stream real via /api/extract-<kind>. */
async function resolverExtract(kind, urlToken) {
  const key = chaveStreambetter();
  const apiUrl =
    `${STREAMBETTER_BASE}/api/extract-${kind}?t=${encodeURIComponent(urlToken)}` +
    (key ? `&key=${encodeURIComponent(key)}` : '');
  const resp = await fetch(apiUrl, {
    headers: cabecalhosProvedor({ Accept: 'application/json' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`extract-${kind} HTTP ${resp.status}`);
  const data = await resp.json();
  if (!data || !data.success || !data.url) return null;
  // A URL retornada costuma ser relativa (/api/proxy?t=...&ext=m3u8).
  if (data.url.startsWith('/')) return `${STREAMBETTER_BASE}${data.url}`;
  return data.url;
}

/**
 * Valida que uma URL de fonte está acessível e é HTTPS.
 * - HTTPS obrigatório: o site é servido em HTTPS e o navegador bloqueia
 *   mixed content (http:// dentro de página https://) no <video>.
 * - Faz um GET com Range para confirmar que o upstream responde (2xx/206).
 *   Fontes mortas (ex.: hubby.cx devolvendo 403) são rejeitadas aqui.
 */
async function validarFonte(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return { ok: false, motivo: 'http_mixed_content' };
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: STREAMBETTER_BASE,
        Accept: '*/*',
        Range: 'bytes=0-1023',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (resp.ok || resp.status === 206) return { ok: true };
    return { ok: false, motivo: `http_${resp.status}` };
  } catch (e) {
    return { ok: false, motivo: 'network' };
  }
}

/** Busca o HTML do embed e devolve a melhor fonte de stream direto. */
async function resolverEmbed(embedUrl, startSeconds) {
  const url = new URL(embedUrl);
  url.searchParams.set('lang', 'pt-BR');
  const key = chaveStreambetter();
  if (key) url.searchParams.set('key', key);
  if (startSeconds && startSeconds > 0) url.searchParams.set('t', String(startSeconds));

  const resp = await fetch(url.toString(), {
    headers: cabecalhosProvedor({ Accept: 'text/html,application/xhtml+xml' }),
    signal: AbortSignal.timeout(25000),
  });
  if (!resp.ok) throw new Error(`embed HTTP ${resp.status}`);

  const html = await resp.text();

  let sources = extrairJsonScript(html, 'sources');
  const caps = extrairJsonScript(html, 'window.__PLAYER_CAPS__');
  const titleId = extrairParam(html, 'titleId');
  const episodeId = extrairParam(html, 'episodeId');

  // Caminho alternativo: API autenticada do provedor (sem desafio anti-bot).
  if (!Array.isArray(sources) || sources.length === 0) {
    const { tipo, tmdbId, season, episode } = dadosDoEmbed(embedUrl);
    sources = await buscarFontesViaApi(tipo, tmdbId, season, episode);
  }

  if (!Array.isArray(sources) || sources.length === 0) {
    // Distingue "o provedor exigiu verificação humana" (falha de acesso, que
    // afeta todo o catálogo) de "este título não tem fontes".
    const bloqueado = ehDesafioAntiBot(html);
    return {
      success: false,
      motivo: bloqueado ? 'provedor_bloqueado' : 'sem_fontes',
      detalhe: bloqueado
        ? (key
            ? 'O provedor exigiu verificação humana mesmo com a chave configurada — verifique se a chave Creator é válida e se o domínio está cadastrado.'
            : 'O provedor exigiu verificação humana (Turnstile). Configure STREAMBETTER_KEY (plano Creator) no backend para o acesso programático.')
        : undefined,
      titleId,
      episodeId,
      showAds: caps?.showAds === true,
    };
  }

  const erros = [];

  // Ordena as fontes: HLS/stream primeiro (funcionam via proxy https), mp4
  // por último (frequentemente apontam para hosts mortos como hubby.cx).
  const fontesOrdenadas = [...sources].sort((a, b) => {
    const peso = (f) => {
      const k = f.kind || '';
      const u = f.url || '';
      if (KINDS_EXTRAIVEIS.has(k)) return 0;
      if (u.includes('.m3u8') || u.includes('ext=m3u8')) return 1;
      if (u.includes('.mp4')) return 2;
      return 3;
    };
    return peso(a) - peso(b);
  });

  for (const fonte of fontesOrdenadas) {
    const kind = fonte.kind || 'stream';
    const label = fonte.label || 'Fonte';
    const urlFonte = fonte.url || '';
    const sub = fonte.sub || '';

    // Descarta fontes de baixa qualidade (CAM/TS/TC/screener) ANTES de resolver.
    if (ehFonteRuim(fonte)) {
      erros.push(`${label}: descartada (baixa qualidade)`);
      continue;
    }

    try {
      // Kinds resolvíveis via /api/extract-<kind> (embedplayer, superflix,
      // watchplay, vidara, azullog, pluto, doramogo, redetoons, streamflash,
      // anonmp4, rdse). O provedor devolve um HLS (/api/proxy?...&ext=m3u8).
      if (KINDS_EXTRAIVEIS.has(kind)) {
        const hls = await resolverExtract(kind, urlFonte);
        if (hls) {
          // Valida a URL HLS antes de aceitar (https + upstream acessível).
          const v = await validarFonte(hls);
          if (v.ok) {
            return {
              success: true,
              // IMPORTANTE: o HLS do streambetter.shop responde 403 quando o
              // navegador envia o header Origin (CORS bloqueado) — o hls.js
              // sempre envia Origin, então a URL direta falha para TODOS os
              // títulos. Por isso devolvemos o stream via o proxy do nosso
              // backend (/api/streambetter-hls), que reescreve a playlist e os
              // segmentos e responde com CORS aberto. O frontend prefixa o
              // caminho relativo com a API_URL.
              url: `/api/streambetter-hls?url=${encodeURIComponent(hls)}`,
              kind: 'stream',
              label,
              sub,
              titleId,
              episodeId,
              showAds: caps?.showAds === true,
            };
          }
          erros.push(`${label}: HLS inválido (${v.motivo})`);
          continue;
        }
        erros.push(`${label}: extração falhou`);
        continue;
      }

      // Kinds não-resolvíveis para stream direto (painéis externos crus /
      // descontinuados): não são fonte reproduzível — pula.
      if (KINDS_IGNORADOS.has(kind)) {
        erros.push(`${label}: fonte ${kind} não resolvível`);
        continue;
      }

      // URL direta (m3u8 / mp4).
      if (urlFonte.includes('.m3u8') || urlFonte.includes('ext=m3u8') || urlFonte.includes('.mp4')) {
        const abs = urlFonte.startsWith('/') ? `${STREAMBETTER_BASE}${urlFonte}` : urlFonte;
        // Valida a URL direta antes de aceitar (https + upstream acessível).
        // Fontes mp4 mortas (ex.: hubby.cx 403) são rejeitadas e tentamos a
        // próxima candidata.
        const v = await validarFonte(abs);
        if (v.ok) {
          return {
            success: true,
            url: abs,
            kind: urlFonte.includes('.mp4') ? 'mp4' : 'stream',
            label,
            sub,
            titleId,
            episodeId,
            showAds: caps?.showAds === true,
          };
        }
        erros.push(`${label}: fonte inacessível (${v.motivo})`);
        continue;
      }

      // kind iframe / vidmoly: não resolvível aqui — fallback para iframe.
      erros.push(`${label}: fonte iframe (${urlFonte.slice(0, 40)})`);
    } catch (e) {
      erros.push(`${label}: ${e.message}`);
    }
  }

  return { success: false, motivo: 'sem_stream_direto', detalhe: erros.join(' | '), titleId, episodeId };
}

/**
 * Proxy HLS de fallback: reescreve as URLs do m3u8 para passar pelo backend,
 * garantindo reprodução mesmo sem CORS no upstream. Também serve segmentos.
 */
async function proxyHls(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).json({ erro: 'url ausente' });

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: STREAMBETTER_BASE,
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!upstream.ok) return res.status(upstream.status).send('upstream error');

    const ct = upstream.headers.get('content-type') || 'application/octet-stream';
    const body = Buffer.from(await upstream.arrayBuffer());

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cache-Control', 'no-store');

    // Se for playlist HLS, reescreve URIs internas para o proxy.
    if (ct.includes('mpegurl') || ct.includes('m3u8') || /#EXTM3U/.test(body.toString('utf8', 0, 200))) {
      let text = body.toString('utf8');
      text = text.split('\n').map((linha) => {
        const l = linha.trim();
        if (!l) return linha;
        // Reescreve URIs dentro de tags que carregam mídia (MAP/KEY) e linhas
        // de segmento. Tags puras (EXTINF, EXT-X-*, etc.) ficam intactas.
        const tagMap = /^#EXT-X-MAP:URI="([^"]+)"/.exec(l);
        if (tagMap) {
          const abs = new URL(tagMap[1], target).toString();
          return `#EXT-X-MAP:URI="/api/streambetter-hls?url=${encodeURIComponent(abs)}"`;
        }
        const tagKey = /^#EXT-X-KEY:METHOD=([^,]+),URI="([^"]+)"/.exec(l);
        if (tagKey) {
          const abs = new URL(tagKey[2], target).href;
          return `#EXT-X-KEY:METHOD=${tagKey[1]},URI="/api/streambetter-hls?url=${encodeURIComponent(abs)}"`;
        }
        if (l.startsWith('#')) return linha;
        // Linha de segmento (relativa ou absoluta) → proxy.
        const abs = new URL(l, target).href;
        return `/api/streambetter-hls?url=${encodeURIComponent(abs)}`;
      }).join('\n');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(text);
    }

    res.setHeader('Content-Type', ct);
    return res.send(body);
  } catch (e) {
    return res.status(502).send(`proxy hls error: ${e.message}`);
  }
}

function registrarStreambetterResolver(app) {
  app.get('/api/streambetter-resolve', async (req, res) => {
    const embed = req.query.embed;
    if (!embed) return res.status(400).json({ erro: 'Parâmetro embed ausente' });

    const startSeconds = req.query.t ? Number(req.query.t) : undefined;

    try {
      const resultado = await resolverEmbed(String(embed), startSeconds);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.json(resultado);
    } catch (e) {
      console.error('[StreambetterResolver] erro:', e.message);
      res.status(502).json({ success: false, erro: e.message });
    }
  });

  app.get('/api/streambetter-hls', proxyHls);
}

module.exports = { registrarStreambetterResolver, resolverEmbed, ehFonteRuim };