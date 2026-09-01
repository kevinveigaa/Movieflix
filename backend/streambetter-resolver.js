/**
 * StreamBetter Direct Resolver (API oficial de link direto)
 *
 * Resolve o stream HLS REAL de um t�tulo do StreamBetter SEM usar o iframe do
 * player deles e SEM passar pelo desafio anti-bot (Cloudflare Turnstile).
 *
 * O embed do StreamBetter (https://streambetter.shop/filme/{tmdb_id}) passou a
 * exigir verifica��o humana ("Confirmando que voc� � uma pessoa de verdade...")
 * para TODOS os t�tulos, inclusive com a chave p�blica (sb_pk_*). Uma
 * requisi��o servidor�servidor nunca resolve esse desafio, e abrir o embed no
 * navegador deixa o usu�rio preso na verifica��o. Por isso este resolver usa a
 * �NICA rota oficial que devolve o link direto (m3u8/mp4) sem o player deles:
 *
 *   GET https://streambetter.shop/api/v1/stream
 *       ?tmdb_id={id}&type=movie|tv[&season=S&episode=E]
 *   Authorization: Bearer sb_sk_...   (chave SECRETA do plano API)
 *
 * A chave p�blica (sb_pk_*) N�O funciona nesse endpoint (retorna
 * plan_missing_feature) e nunca deve ser usada em chamada servidor�servidor.
 * Configure STREAMBETTER_API_KEY no ambiente do backend (Render) com a chave
 * secreta sb_sk_* gerada no perfil do StreamBetter (plano API).
 *
 * Fluxo:
 *   1. Extrai tipo/tmdb_id/temporada/epis�dio da URL de embed recebida
 *      (ex.: streambetter.shop/filme/1550338 ou /serie/283297/1/1).
 *   2. Chama /api/v1/stream com a chave secreta.
 *   3. Sucesso � devolve a URL do m3u8 (via proxy /api/streambetter-hls quando
 *      a fonte exige headers, para garantir CORS e headers de origem).
 *   4. Sem chave secreta / plano API ausente / erro � retorna
 *      { success:false, motivo } SEM tentar abrir o embed Cloudflare.
 */

const STREAMBETTER_BASE = 'https://streambetter.shop';

/**
 * Chave SECRETA do plano API do StreamBetter (sb_sk_*).
 * � a �nica credencial que autentica a rota oficial de link direto
 * /api/v1/stream. Defina STREAMBETTER_API_KEY no ambiente do backend (Render).
 * NUNCA coloque essa chave no bundle do frontend.
 */
function chaveApiSecreta() {
  return process.env.STREAMBETTER_API_KEY || '';
}

/** Cabe�alhos padr�o das chamadas ao provedor. */
function cabecalhosProvedor(extra = {}) {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Referer: STREAMBETTER_BASE,
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    ...extra,
  };
}

/** Extrai tipo/tmdbId/temporada/epis�dio de uma URL de embed do StreamBetter. */
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

/**
 * Cache (curto, em mem�ria) dos headers que uma fonte da API v1 exige
 * (User-Agent / Referer / Origin / Accept). O proxyHls consulta esse cache
 * para reproduzir a mesma chamada que o player do StreamBetter faria.
 */
const cacheHeadersFonte = new Map();

function guardarHeadersFonte(url, headers) {
  if (!url || !headers) return;
  try {
    cacheHeadersFonte.set(url, { headers, ts: Date.now() });
    // TTL de 10 minutos para n�o acumular entradas para sempre.
    if (cacheHeadersFonte.size > 500) {
      const agora = Date.now();
      for (const [k, v] of cacheHeadersFonte) {
        if (agora - v.ts > 600_000) cacheHeadersFonte.delete(k);
      }
    }
  } catch { /* n�o cr�tico */ }
}

function pegarHeadersFonte(url) {
  try {
    const v = cacheHeadersFonte.get(url);
    if (!v) return null;
    if (Date.now() - v.ts > 600_000) {
      cacheHeadersFonte.delete(url);
      return null;
    }
    return v.headers;
  } catch {
    return null;
  }
}

/**
 * Consulta a API oficial de link direto /api/v1/stream.
 * � a �nica rota que devolve o m3u8/mp4 real SEM o player e SEM o desafio
 * anti-bot do Cloudflare. Exige a chave SECRETA sb_sk_* (plano API).
 */
async function buscarStreamViaApiV1(tipo, tmdbId, season, episode) {
  const key = chaveApiSecreta();
  if (!key) {
    return {
      success: false,
      motivo: 'secret_key_required',
      detalhe:
        'Configure STREAMBETTER_API_KEY (chave secreta sb_sk_* do plano API do StreamBetter) no ambiente do backend para obter o link direto m3u8 sem verifica��o.',
    };
  }
  if (!tmdbId) {
    return { success: false, motivo: 'tmdb_ausente', detalhe: 'tmdb_id ausente na URL do embed.' };
  }

  const params = new URLSearchParams({ tmdb_id: String(tmdbId), type: tipo === 'serie' ? 'tv' : 'movie' });
  if (tipo === 'serie') {
    params.set('season', String(season || 1));
    params.set('episode', String(episode || 1));
  }

  try {
    const resp = await fetch(`${STREAMBETTER_BASE}/api/v1/stream?${params.toString()}`, {
      headers: cabecalhosProvedor({ Authorization: `Bearer ${key}`, Accept: 'application/json' }),
      signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) {
      return { success: false, motivo: `http_${resp.status}`, detalhe: `API /api/v1/stream respondeu HTTP ${resp.status}.` };
    }

    const data = await resp.json();

    if (!data || data.success === false) {
      const erro = data?.error || 'api_recusou';
      return {
        success: false,
        motivo: erro === 'plan_missing_feature' ? 'plan_api_ausente' : 'api_recusou',
        detalhe: String(erro),
      };
    }

    const fontes = Array.isArray(data?.sources) ? data.sources : null;
    if (!fontes || fontes.length === 0) {
      return { success: false, motivo: 'sem_stream_direto', detalhe: 'A API n�o retornou fontes para este t�tulo.' };
    }

    // Prioriza a primeira fonte com URL de stream (m3u8/dash/mp4).
    const fonte = fontes.find((f) => f && f.url && typeof f.url === 'string') || null;
    if (!fonte || !fonte.url) {
      return { success: false, motivo: 'sem_stream_direto', detalhe: 'As fontes retornadas n�o t�m URL de stream.' };
    }

    let url = fonte.url;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') {
        return { success: false, motivo: 'http_mixed_content', detalhe: 'Fonte n�o � HTTPS (mixed content bloqueado pelo navegador).' };
      }
    } catch {
      return { success: false, motivo: 'url_invalida', detalhe: 'URL de fonte inv�lida.' };
    }

    // Se a fonte exige headers (User-Agent/Referer/Origin), guarda para o proxy.
    if (fonte.headers && typeof fonte.headers === 'object') {
      guardarHeadersFonte(url, fonte.headers);
    }

    // Devolve via proxy do nosso backend: reescreve a playlist e os segmentos
    // e responde com CORS aberto, garantindo reprodu��o no <video> nativo.
    return {
      success: true,
      url: `/api/streambetter-hls?url=${encodeURIComponent(url)}`,
      kind: 'stream',
      label: fonte.label || 'Fonte',
      sub: fonte.subtitle_url || '',
      titleId: Number(tmdbId) || null,
      episodeId: tipo === 'serie' ? Number(episode) || null : null,
      showAds: false,
    };
  } catch (e) {
    return { success: false, motivo: 'network', detalhe: e.message };
  }
}

/**
 * Resolve o stream HLS real de uma URL de embed do StreamBetter.
 * Usa EXCLUSIVAMENTE a API oficial de link direto; nunca faz scraping do HTML
 * do embed (que exige o desafio anti-bot e nunca resolve em servidor).
 */
async function resolverEmbed(embedUrl, startSeconds) {
  const { tipo, tmdbId, season, episode } = dadosDoEmbed(embedUrl);
  const viaApi = await buscarStreamViaApiV1(tipo, tmdbId, season, episode);

  if (viaApi.success) {
    return viaApi;
  }

  return {
    success: false,
    motivo: viaApi.motivo || 'sem_stream_direto',
    detalhe: viaApi.detalhe || '',
    titleId: Number(tmdbId) || null,
    episodeId: tipo === 'serie' ? Number(episode) || null : null,
    showAds: false,
  };
}

/**
 * Proxy HLS: reescreve as URLs do m3u8 para passar pelo backend, garantindo
 * reprodu��o mesmo sem CORS no upstream. Tamb�m serve segmentos e aplica os
 * headers exigidos pela fonte (User-Agent/Referer/Origin da API v1).
 */
async function proxyHls(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).json({ erro: 'url ausente' });

  const headersFonte = pegarHeadersFonte(String(target));

  try {
    const upstream = await fetch(target, {
      headers: cabecalhosProvedor({
        Accept: '*/*',
        ...(headersFonte || {}),
      }),
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
        // Reescreve URIs dentro de tags que carregam m�dia (MAP/KEY) e linhas
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
    if (!embed) return res.status(400).json({ erro: 'Par�metro embed ausente' });

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

module.exports = { registrarStreambetterResolver, resolverEmbed };
