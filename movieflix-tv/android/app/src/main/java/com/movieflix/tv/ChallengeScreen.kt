package com.movieflix.tv

/**
 * Classificacao da tela servida pelo provedor de embed.
 *
 * Distingue: PLAYER (video pronto), DESAFIO (verificacao/Cloudflare/Turnstile),
 * IFRAME (wrapper cross-origin normal) e CONTROLES (pronto, sem video visivel).
 * O DESAFIO tem prioridade sobre um <video> escondido de anuncio.
 */
object ChallengeScreen {

    const val PLAYER = "player"
    const val DESAFIO = "desafio"
    const val IFRAME = "iframe"
    const val CONTROLES = "controles"
    const val ERRO = "erro"

    private val MARCADORES_DESAFIO = listOf(
        "cf-turnstile", "turnstile", "challenges.cloudflare.com",
        "verificando", "confirmando que voce", "g-recaptcha", "hcaptcha",
    )

    private val MARCADORES_ENQUADRAMENTO = listOf(
        "so funciona dentro de um iframe", "only works inside an iframe",
        "dentro do iframe",
    )

    fun ehDesafio(html: String?): Boolean {
        if (html.isNullOrBlank()) return false
        val low = html.lowercase()
        return MARCADORES_DESAFIO.any { low.contains(it) }
    }

    fun ehErroDeEnquadramento(html: String?): Boolean {
        if (html.isNullOrBlank()) return false
        val low = html.lowercase()
        return MARCADORES_ENQUADRAMENTO.any { low.contains(it) }
    }

    /**
     * @param htmlTopo       HTML do documento de topo (pode ser null).
     * @param iframeLegivel  o conteudo do iframe foi lido?
     * @param htmlInterno    HTML lido de dentro do iframe (ou null).
     * @param temVideoTopo   existe um <video> no documento de topo?
     */
    fun classificar(
        htmlTopo: String?,
        iframeLegivel: Boolean,
        htmlInterno: String?,
        temVideoTopo: Boolean,
    ): String {
        if (ehDesafio(htmlTopo) || ehDesafio(htmlInterno)) return DESAFIO
        if (temVideoTopo) return PLAYER
        if (iframeLegivel && htmlInterno != null) {
            val low = htmlInterno.lowercase()
            if (low.contains("<video") || low.contains("sources") || low.contains(".m3u8")) return PLAYER
            return CONTROLES
        }
        return IFRAME
    }
}
