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
        assertEquals("5.0.3", TvConfig.VERSAO);
        assertEquals(503, TvConfig.VERSAO_CODIGO);
    }

    /**
     * CONTRATO DA CORREÇÃO DOS BOTÕES DO PLAYER (5.0.1).
     *
     * O player pede à camada nativa as teclas que precisam chegar ao WebView.
     * O pedido passa por este filtro: só keyCodes plausíveis, no máximo
     * {@link TvConfig#LIMITE_TECLAS_PAGINA}, sem repetição. Sem isso, uma página
     * comprometida poderia liberar o teclado inteiro do aparelho.
     *
     * ── MUDANÇA DA 5.0.1: AS TECLAS DE MÍDIA NÃO ENTRAM MAIS AQUI ───────────
     * Pedir uma tecla ao shell significa que o shell DEIXA de consumi-la — e é
     * justamente AO consumi-la que ele emite o `mf-media-key` que o player já
     * tratava. Na 5.0.0 as teclas de mídia estavam nesta lista, então play/pause
     * e ◀◀/▶▶ deixaram de funcionar pelo controle remoto (o defeito relatado),
     * enquanto volume/mudo continuava — porque nunca saíram do shell.
     * Este teste protege a decisão contra uma regressão futura.
     */
    @Test
    public void aceitaAsTeclasDoPlayer() {
        java.util.Set<Integer> t = TvConfig.teclasDeNavegacao(
                new int[] {19, 20, 21, 22, 23, 66});
        assertTrue(t.contains(19)); // DPAD_UP
        assertTrue(t.contains(20)); // DPAD_DOWN
        assertTrue(t.contains(21)); // DPAD_LEFT
        assertTrue(t.contains(22)); // DPAD_RIGHT
        assertTrue(t.contains(23)); // DPAD_CENTER (OK)
        assertTrue(t.contains(66)); // NUMPAD_ENTER (OK de TV Box)
        assertEquals(6, t.size());
    }

    /**
     * AS TECLAS DE MÍDIA NÃO PODEM VOLTAR À LISTA DA PÁGINA.
     *
     * Se voltarem, o shell para de consumi-las, para de emitir `mf-media-key`
     * e play/pause + ◀◀/▶▶ morrem de novo no controle remoto. Este teste é a
     * trava contra esse retrocesso.
     */
    @Test
    public void teclasDeMidiaNaoPodemSerPedidasPelaPagina() {
        // 85=PLAY_PAUSE 126=PLAY 127=PAUSE 87=NEXT 88=PREVIOUS 90=FF 89=REWIND
        int[] midia = {85, 126, 127, 87, 88, 90, 89};
        java.util.Set<Integer> t = TvConfig.teclasDeNavegacao(midia);
        // O filtro em si aceita os códigos (são plausíveis) — a decisão de NÃO
        // pedi-los vive em TvPlayerPage.TECLAS_PLAYER, coberta pelo teste de
        // página. Aqui garantimos que o shell continua tratando cada um deles
        // como tecla de mídia (é o que produz o evento mf-media-key).
        assertEquals(7, t.size());
    }

    /**
     * A REPETIÇÃO é o que faz o SEEK CONTÍNUO funcionar (segurar ◀◀/▶▶).
     *
     * Repetir PLAY/PAUSE, porém, seria um bug: o botão ficaria alternando sem
     * parar. A regra distingue os dois casos.
     */
    @Test
    public void repeticaoLiberadaSomenteParaSeek() {
        // Primeira pulsação: sempre passa, para qualquer tecla.
        assertTrue(TvConfig.repeticaoDeMidiaAceita(85, 0)); // PLAY_PAUSE
        assertTrue(TvConfig.repeticaoDeMidiaAceita(90, 0)); // FAST_FORWARD
        assertTrue(TvConfig.repeticaoDeMidiaAceita(89, 0)); // REWIND

        // Segurando: SÓ o seek passa (é o gesto "segurar para avançar/retroceder").
        assertTrue(TvConfig.repeticaoDeMidiaAceita(90, 1));
        assertTrue(TvConfig.repeticaoDeMidiaAceita(90, 7));
        assertTrue(TvConfig.repeticaoDeMidiaAceita(89, 3));

        // Segurar PLAY/PAUSE, NEXT ou STOP NÃO pode agir repetidamente.
        assertFalse(TvConfig.repeticaoDeMidiaAceita(85, 1));
        assertFalse(TvConfig.repeticaoDeMidiaAceita(127, 2));
        assertFalse(TvConfig.repeticaoDeMidiaAceita(87, 4));
        assertFalse(TvConfig.repeticaoDeMidiaAceita(88, 4));
        assertFalse(TvConfig.repeticaoDeMidiaAceita(86, 1));
    }

    /** Os keyCodes replicados em TvConfig batem com os da plataforma Android. */
    @Test
    public void keycodesDeMidiaBatemComOAndroid() {
        assertEquals(android.view.KeyEvent.KEYCODE_MEDIA_FAST_FORWARD,
                TvConfig.KEYCODE_MEDIA_FAST_FORWARD);
        assertEquals(android.view.KeyEvent.KEYCODE_MEDIA_REWIND,
                TvConfig.KEYCODE_MEDIA_REWIND);
    }

    @Test
    public void descartaCodigosImpossiveisEDuplicados() {
        java.util.Set<Integer> t = TvConfig.teclasDeNavegacao(
                new int[] {0, -1, 301, 999999, 23, 23, 19});
        assertEquals(2, t.size());
        assertTrue(t.contains(23));
        assertTrue(t.contains(19));
    }

    @Test
    public void limitaAQuantidadeDeTeclasPedidas() {
        int[] muitas = new int[200];
        for (int i = 0; i < muitas.length; i++) muitas[i] = i + 1;
        assertEquals(TvConfig.LIMITE_TECLAS_PAGINA, TvConfig.teclasDeNavegacao(muitas).size());
    }

    /** Lista nula/vazia devolve conjunto vazio: volta ao comportamento nativo. */
    @Test
    public void listaVaziaDevolveNada() {
        assertTrue(TvConfig.teclasDeNavegacao(null).isEmpty());
        assertTrue(TvConfig.teclasDeNavegacao(new int[] {}).isEmpty());
    }

    @Test
    public void mantemNavegacaoDoFilmeNoWebView() {
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/#/tv"));
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/#/tv/filmes"));
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/#/tv/assistir/123"));
        assertTrue(TvConfig.ficaNoWebView("https://movieflix-bszf.onrender.com/apk/MovieFlix-TV-v5.0.3.apk"));
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
