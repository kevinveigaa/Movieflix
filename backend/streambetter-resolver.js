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

/** Resolve uma fonte do tipo embedplayer para a URL de stream real. */
async function resolverEmbedPlayer(urlToken) {
  const apiUrl = `${STREAMBETTER_BASE}/api/extract-embedplayer?t=${encodeURIComponent(urlToken)}`;
  const resp = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: STREAMBETTER_BASE,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`extract-embedplayer HTTP ${resp.status}`);
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
  if (startSeconds && startSeconds > 0) url.searchParams.set('t', String(startSeconds));

  const resp = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(25000),
  });
  if (!resp.ok) throw new Error(`embed HTTP ${resp.status}`);

  const html = await resp.text();

  const sources = extrairJsonScript(html, 'sources');
  const caps = extrairJsonScript(html, 'window.__PLAYER_CAPS__');
  const titleId = extrairParam(html, 'titleId');
  const episodeId = extrairParam(html, 'episodeId');

  if (!Array.isArray(sources) || sources.length === 0) {
    return { success: false, motivo: 'sem_fontes', titleId, episodeId, showAds: caps?.showAds === true };
  }

  const erros = [];

  // Ordena as fontes: HLS/stream primeiro (funcionam via proxy https), mp4
  // por último (frequentemente apontam para hosts mortos como hubby.cx).
  const fontesOrdenadas = [...sources].sort((a, b) => {
    const peso = (f) => {
      const k = f.kind || '';
      const u = f.url || '';
      if (k === 'embedplayer' || u.includes('embedplayer')) return 0;
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
      if (kind === 'embedplayer' || (!kind && urlFonte.includes('embedplayer'))) {
        const hls = await resolverEmbedPlayer(urlFonte);
        if (hls) {
          // Valida a URL HLS antes de aceitar (https + upstream acessível).
          const v = await validarFonte(hls);
          if (v.ok) {
            return {
              success: true,
              url: hls,
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
        if (!l || l.startsWith('#') || l.startsWith('http')) return linha;
        const abs = new URL(l, target).toString();
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