package com.movieflix.tv

/**
 * Classificação PURA da tela que o provedor (StreamBetter) está exibindo agora.
 *
 * Por que existe (bug real que travava a TV):
 *
 * 1. A versão anterior montava o embed com `loadDataWithBaseURL(AppConfig.STREAMBETTER_BASE, ...)`,
 *    ou seja, o documento wrapper tinha origem `https://streambetter.shop` — a MESMA
 *    origem do iframe. Quando o documento pai e o iframe têm a mesma origem, o
 *    Chromium **não aplica a política de frames aninhados** e a página de desafio do
 *    provedor (que só deve rodar como frame aninhado) detecta isso e responde
 *    *"Este link só funciona dentro de um iframe"*. Resultado: a verificação nunca
 *    começava e a TV ficava presa no texto "Confirmando que você é uma pessoa de
 *    verdade…", exatamente o defeito relatado.
 *
 * 2. A verificação era avaliada UMA única vez por `onPageFinished`, com
 *    `wv.evaluateJavascript(...)` no documento de TOPO — que é o NOSSO wrapper. O
 *    conteúdo real (widget Turnstile / `<video>`) vive DENTRO do iframe cross-origin,
 *    então o JS do topo não o enxerga. Sem reavaliação periódica, o app nunca
 *    percebia que o desafio havia passado (ou falhado) e não havia como o player
 *    aparecer depois do `window.location.reload()` que o próprio provedor dispara.
 *
 * A classificação é feita sobre texto e é testável em JVM puro (ChallengeScreenTest).
 */
object ChallengeScreen {

    const val CARREGANDO = "carregando"
    const val DESAFIO = "desafio"
    const val PLAYER = "player"
    const val IFRAME = "iframe"
    const val CONTROLES = "controles"

    /**
     * Marcadores do DESAFIO. São os strings que o provedor realmente publica
     * (conferidos no corpo HTTP da página de verificação do StreamBetter):
     *
     *   <title>Verificando...</title>
     *   <div class="cf-turnstile" data-sitekey="0x4AAAAAAEjS65cFP05h6kps"
     *   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js">
     *   <p>Confirmando que você é uma pessoa de verdade antes de carregar o vídeo...</p>
     *   "Este link só funciona dentro de um iframe"
     *   "Não deu pra confirmar. Atualize a página e tente de novo."
     */
    private val MARCADORES_DESAFIO = listOf(
        "cf-turnstile",
        "challenges.cloudflare.com",
        "turnstile",
        "pessoa de verdade",
        "deu pra confirmar",
        "so funciona dentro",
        "só funciona dentro",
        "just a moment",
        "verificando...",
    )

    /** Marcadores de que o vídeo já apareceu. */
    private val MARCADORES_PLAYER = listOf(
        "<video",
        "\"video\"",
        "jwplayer",
        "shaka",
        "dplayer",
        "fluid-player",
        "vjs",
    )

    /**
     * Classifica a tela a partir do que conseguimos ler do documento.
     *
     * @param htmlTopo     innerHTML do documento de TOPO (nosso wrapper / o embed).
     *                      `null` = ainda não conseguimos o documento.
     * @param iframeLegivel `true` quando o documento INTERNO do iframe pôde ser lido
     *                      (mesma origem) e `htmlInterno` traz o conteúdo dele.
     *                      `false` = cross-origin (situação normal no fluxo do
     *                      provedor: o desafio roda lá dentro e só o Chromium vê).
     * @param htmlInterno  innerHTML do iframe quando ele é legível na mesma origem.
     * @param temVideoTopo detectado por `document.querySelector('video')` no topo.
     */
    fun classificar(
        htmlTopo: String?,
        iframeLegivel: Boolean,
        htmlInterno: String?,
        temVideoTopo: Boolean,
    ): String {
        val topo = htmlTopo.orEmpty().lowercase()
        val dentro = if (iframeLegivel) htmlInterno.orEmpty().lowercase() else ""

        // 1) Desafio vem PRIMEIRO: a página de desafio do provedor contém o widget
        //    Turnstile e, em alguns casos, um <video> escondido de anúncio. Se
        //    olhássemos o player antes, classificaríamos errado e o watchdog nunca
        //    avisaria o usuário.
        if (temMarcador(topo, MARCADORES_DESAFIO) || temMarcador(dentro, MARCADORES_DESAFIO)) {
            return DESAFIO
        }

        // 2) Vídeo visível no documento de topo (o caso em que o provedor já
        //    entregou o player depois da verificação).
        if (temVideoTopo) return PLAYER

        // 3) Vídeo dentro do iframe legível (mesma origem).
        if (iframeLegivel && temMarcador(dentro, MARCADORES_PLAYER)) return PLAYER

        // 4) Ainda não sabemos o que existe dentro do iframe cross-origin: o
        //    fluxo é normal (o iframe está carregando). NÃO é erro e NÃO pode
        //    disparar o guard de "link só funciona dentro de iframe".
        if (!iframeLegivel) return IFRAME

        // 5) Iframe legível, sem desafio e sem vídeo: wrapper pronto / provedor
        //    ainda redirecionando.
        return CONTROLES
    }

    private fun temMarcador(texto: String, marcadores: List<String>): Boolean =
        marcadores.any { texto.contains(it) }

    /**
     * Só o marcador mais grave e inequívoco do provedor: "Este link só funciona
     * dentro de um iframe". Se aparecer, é defeito NOSSO (origem do wrapper),
     * não do usuário — o app deve se recuperar sozinho.
     */
    fun ehErroDeEnquadramento(htmlTopo: String?): Boolean {
        val t = htmlTopo.orEmpty().lowercase()
        return t.contains("so funciona dentro") || t.contains("só funciona dentro")
    }
}
