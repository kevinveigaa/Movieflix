/**
 * Proxy de player — serve conteúdo de embeds de terceiros pelo domínio próprio,
 * removendo headers que bloqueiam iframe (X-Frame-Options, CSP).
 * VERSÃO SIMPLIFICADA: sem injeção de scripts, sem reescrita de links.
 */

const express = require('express');
const axios = require('axios');
const router = express.Router();

const BLOCKED_HEADERS = [
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'frame-options',
  'x-content-type-options',
];

router.get('/', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url parameter');

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': req.headers['accept-language'] || 'pt-BR,pt;q=0.9,en;q=0.8',
        'Referer': 'https://vidsrc.cc/',
      },
      responseType: 'arraybuffer',
      timeout: 15000,
      maxRedirects: 5,
    });

    // Copiar headers, removendo os de bloqueio
    Object.entries(response.headers).forEach(([key, value]) => {
      if (!BLOCKED_HEADERS.includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // Forçar content-type correto
    const contentType = response.headers['content-type'] || 'text/html';
    res.setHeader('Content-Type', contentType);

    // Enviar conteúdo como está (sem modificação)
    res.status(response.status).send(response.data);

  } catch (error) {
    console.error('[Player Proxy] Error:', error.message);
    res.status(500).send(`Error loading player: ${error.message}`);
  }
});

module.exports = router;
