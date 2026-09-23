package com.movieflix.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Testes unitários do deep link do MovieFlix TV 4.0.1.
 *
 * Garantem que o app abre o site JÁ no conteúdo escolhido (filme/série/
 * temporada/episódio), preservando o título — requisito de produto.
 */
public class DeepLinkTest {

    private final String base = "https://movieflix-bszf.onrender.com";

    @Test
    public void reconheceDeepLinkMovieflix() {
        assertTrue(DeepLink.ehDeepLink("movieflix://tv/assistir/123"));
        assertTrue(DeepLink.ehDeepLink("movieflix:assistir/123"));
        assertFalse(DeepLink.ehDeepLink("https://movieflix-bszf.onrender.com"));
        assertFalse(DeepLink.ehDeepLink(null));
        assertFalse(DeepLink.ehDeepLink(""));
    }

    @Test
    public void detalheDeFilme() {
        assertEquals(base + "/#/tv/detalhe/movie/550",
                DeepLink.paraUrlSite("movieflix://tv/detalhe/movie/550", base));
        assertEquals(base + "/#/tv/detalhe/tv/1399",
                DeepLink.paraUrlSite("movieflix://tv/detalhe/tv/1399", base));
    }

    @Test
    public void tituloDoAppMobileViraDetalhe() {
        assertEquals(base + "/#/tv/detalhe/tv/1399",
                DeepLink.paraUrlSite("movieflix://titulo/tv/1399", base));
        // titulo/{id} sem tipo → assume filme
        assertEquals(base + "/#/tv/detalhe/movie/550",
                DeepLink.paraUrlSite("movieflix://titulo/550", base));
    }

    @Test
    public void assistirPreservaEpisodio() {
        assertEquals(base + "/#/tv/assistir/1399?season=2&episode=5",
                DeepLink.paraUrlSite("movieflix://assistir/1399?season=2&episode=5", base));
        // `ep` é normalizado para `episode` (formato canônico do site)
        assertEquals(base + "/#/tv/assistir/1399?season=2&episode=5",
                DeepLink.paraUrlSite("movieflix://assistir/1399?season=2&ep=5", base));
    }

    @Test
    public void rotaDeTvPassaDireto() {
        assertEquals(base + "/#/tv/pesquisa",
                DeepLink.paraUrlSite("movieflix://tv/pesquisa", base));
    }

    @Test
    public void linkNaoReconhecidoRetornaNull() {
        assertNull(DeepLink.paraUrlSite("movieflix://", base));
        assertNull(DeepLink.paraUrlSite("https://exemplo.com/x", base));
        assertNull(DeepLink.paraUrlSite("movieflix://desconhecido/1", base));
    }
}
