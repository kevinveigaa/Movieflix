package com.movieflix.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Testes de configuração do MovieFlix TV.
 *
 * Garantem o ponto mais sensível do produto: o app precisa carregar a
 * experiência de TV no domínio OFICIAL (mesma fonte de dados do mobile/web),
 * manter a navegação do MovieFlix dentro do WebView e empurrar todo o resto
 * (WhatsApp, tel, outros sites) para fora — no WebView essas navegações
 * falhariam em silêncio.
 */
public class TvConfigTest {

    @Test
    public void apontaParaOdominioOficial() {
        assertEquals("https://movieflix-bszf.onrender.com/#/tv", TvConfig.TV_URL);
        assertTrue(TvConfig.TV_URL.contains(TvConfig.HOST_OFICIAL));
    }

    @Test
    public void versaoBateComABuild() {
        assertEquals("4.0.1", TvConfig.VERSAO);
        assertEquals(41, TvConfig.VERSAO_CODIGO);
    }

    @Test
    public void mantemNavegacaoDoFilmeNoWebView() {
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/#/tv"));
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/#/tv/filmes"));
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/#/tv/assistir/123"));
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/apk/MovieFlix-TV-v4.0.1.apk"));
    }

    @Test
    public void empurraOutrosSitesParaFora() {
        assertFalse(TvConfig.ficaNoWebView("https://streambetter.shop/filme/550"));
        assertFalse(TvConfig.ficaNoWebView("https://example.com"));
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

    @Test
    public void naoConfundeSubdominioMalicioso() {
        assertFalse(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com.evil.com/x"));
        assertFalse(TvConfig.ficaNoWebView("https://fake-movieflix-bszf.onrender.com/x"));
    }

    @Test
    public void usaAsCoresDaMarca() {
        assertEquals(0xFFDF0A15, TvConfig.COR_VERMELHO);
        assertEquals(0xFF7C3AED, TvConfig.COR_ROXO);
        assertEquals(0xFF0A0A0F, TvConfig.COR_FUNDO);
    }
}
