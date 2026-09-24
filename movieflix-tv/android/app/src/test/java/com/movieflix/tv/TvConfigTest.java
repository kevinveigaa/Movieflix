package com.movieflix.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Testes de configuração do MovieFlix TV.
 *
 * Garantem os pontos mais sensíveis do produto:
 *  - o app carrega a experiência de TV no domínio OFICIAL (mesma fonte de dados
 *    do mobile/web);
 *  - o domínio oficial, os domínios do PROVEDOR DE VÍDEO e os de VERIFICAÇÃO
 *    (Cloudflare/Turnstile) permanecem no WebView — inclusive em iframe, que é
 *    onde a reprodução acontece. Expulsá-los derrubava o player e jogava o
 *    usuário para um app externo;
 *  - todo o resto (WhatsApp, tel, outros sites) continua tratado pela camada
 *    nativa, porque no WebView essas navegações falhariam em silêncio.
 */
public class TvConfigTest {

    @Test
    public void apontaParaOdominioOficial() {
        assertEquals("https://movieflix-bszf.onrender.com/#/tv", TvConfig.TV_URL);
        assertTrue(TvConfig.TV_URL.contains(TvConfig.HOST_OFICIAL));
    }

    @Test
    public void versaoBateComABuild() {
        assertEquals("4.0.2", TvConfig.VERSAO);
        assertEquals(42, TvConfig.VERSAO_CODIGO);
    }

    @Test
    public void mantemNavegacaoDoFilmeNoWebView() {
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/#/tv"));
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/#/tv/filmes"));
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/#/tv/assistir/123"));
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/apk/MovieFlix-TV-v4.0.2.apk"));
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com:443/#/tv"));
    }

    /**
     * O embed do provedor roda em IFRAME. Se ele fosse expulso do WebView, a
     * página do app seria substituída pelo navegador externo (o usuário sairia
     * do app de TV) e a reprodução nunca começaria.
     */
    @Test
    public void mantemOProvedorDeVideoNoWebView() {
        assertTrue(TvConfig.ficaNoWebView("https://streambetter.shop/filme/550?key=sb_pk_x"));
        assertTrue(TvConfig.ficaNoWebView("https://streambetter.shop/serie/1396/1/1?key=sb_pk_x"));
        assertTrue(TvConfig.ficaNoWebView("https://cdn.streambetter.shop/hls/master.m3u8"));
        assertTrue(TvConfig.ficaNoWebView("https://watchplayer.shop/embed/abc"));
        assertTrue(TvConfig.ficaNoWebView("https://yapgrid.com/e/xyz"));
    }

    /** O desafio de verificação precisa concluir dentro do app. */
    @Test
    public void mantemAVerificacaoNoWebView() {
        assertTrue(TvConfig.ficaNoWebView("https://challenges.cloudflare.com/turnstile/v0/api.js"));
        assertTrue(TvConfig.ficaNoWebView("https://movieflix.turnstile.foo/x"));
    }

    /** O que NÃO é do MovieFlix, do player ou da verificação continua de fora. */
    @Test
    public void empurraOutrosSitesParaFora() {
        assertFalse(TvConfig.ficaNoWebView("https://example.com"));
        assertFalse(TvConfig.ficaNoWebView("https://adsterra.com/pop"));
        assertFalse(TvConfig.ficaNoWebView(null));
        assertFalse(TvConfig.ficaNoWebView(""));
    }

    @Test
    public void reconheceEsquemasExternos() {
        assertTrue(TvConfig.ehEsquemaExterno("whatsapp://send?phone=5511943750307"));
        assertTrue(TvConfig.ehEsquemaExterno("tel:+5511943750307"));
        assertTrue(TvConfig.ehEsquemaExterno("mailto:contato@movieflix.tv"));
        assertTrue(TvConfig.ehEsquemaExterno("market://details?id=com.movieflix.tv"));
        assertFalse(TvConfig.ehEsquemaExterno("https://movieflix-bszf.onrender.com"));
    }

    /** data:/blob:/about: são conteúdo do documento, não navegação externa. */
    @Test
    public void reconheceEsquemasInternos() {
        assertTrue(TvConfig.ehEsquemaInterno("data:text/html;base64,PGI+"));
        assertTrue(TvConfig.ehEsquemaInterno("blob:https://movieflix-bszf.onrender.com/uuid"));
        assertTrue(TvConfig.ehEsquemaInterno("about:blank"));
        assertTrue(TvConfig.ehEsquemaInterno("javascript:void(0)"));
        assertFalse(TvConfig.ehEsquemaInterno("https://streambetter.shop/filme/550"));
    }

    /** Um host malicioso que apenas PARECE dos domínios permitidos fica de fora. */
    @Test
    public void naoConfundeSubdominioMalicioso() {
        assertFalse(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com.evil.com/x"));
        assertFalse(TvConfig.ficaNoWebView("https://fake-movieflix-bszf.onrender.com/x"));
        assertFalse(TvConfig.ficaNoWebView("https://streambetter.shop.evil.com/filme/550"));
        assertFalse(TvConfig.ficaNoWebView("https://notstreambetter.shop/filme/550"));
    }

    @Test
    public void extraiHostCorretamente() {
        assertEquals("streambetter.shop", TvConfig.host("https://streambetter.shop/filme/550?key=x"));
        assertEquals("movieflix-bszf.onrender.com", TvConfig.host("https://movieflix-bszf.onrender.com:443/#/tv"));
        assertEquals("cdn.streambetter.shop", TvConfig.host("HTTPS://CDN.StreamBetter.Shop/a.m3u8"));
        assertEquals("", TvConfig.host("whatsapp://send?phone=1"));
        assertEquals("", TvConfig.host(null));
    }

    @Test
    public void usaAsCoresDaMarca() {
        assertEquals(0xFFDF0A15, TvConfig.COR_VERMELHO);
        assertEquals(0xFF7C3AED, TvConfig.COR_ROXO);
        assertEquals(0xFF0A0A0F, TvConfig.COR_FUNDO);
    }
}
