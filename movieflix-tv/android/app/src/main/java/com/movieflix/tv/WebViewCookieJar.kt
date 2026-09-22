package com.movieflix.tv

import android.webkit.CookieManager
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import java.net.URI

/**
 * Ponte de cookies WebView ⇄ OkHttp.
 *
 * ── Por que isto é necessário (e é o que o mobile/WebView faz de graça) ──
 *
 * O provedor protege a reprodução com a verificação do Cloudflare/Turnstile. Quem
 * passa pela verificação recebe um cookie de liberação (`cf_clearance`), e é ESSE
 * cookie que autoriza as requisições seguintes a receberem a fonte do vídeo.
 *
 * No site e no app mobile não existe esse problema porque quem pede tudo —
 * página e vídeo — é o MESMO WebView, com o mesmo cookie jar. Na TV, o player é
 * nativo (Media3/ExoPlayer com OkHttp, exigido pelo pedido: sem WebView como
 * player), e o OkHttp tem um cookie jar SEPARADO e VAZIO. Sem esta ponte, o
 * caminho legítimo "usuário confirma a verificação → fonte é liberada → player
 * nativo toca" nunca fecharia: a verificação passaria e a requisição seguinte
 * continuaria anônima.
 *
 * ── O que NÃO se faz aqui ──
 *
 * Nada é forjado, adivinhado ou contornado. Os cookies são lidos do CookieManager
 * do Android — que é exatamente o cookie jar do Chromium/WebView, mantido pelo
 * sistema — e apenas repassados ao OkHttp. É o mesmo comportamento de um
 * navegador que faz a requisição do vídeo depois de você resolver a verificação.
 * Nenhum CAPTCHA é resolvido por código, nenhum token é criado, nenhuma página
 * protegida é raspada por fora do navegador.
 *
 * Este arquivo mantém apenas o CONTRATO do jar (domínio/caminho/expiração), para
 * que a fonte continue sendo pedida ao domínio correto com a sessão correta.
 */
object WebViewCookieJar : CookieJar {

    /** Cookies aceitos pelo CookieManager para a URL, no formato que o OkHttp espera. */
    private fun cookiesDaUrl(url: HttpUrl): List<Cookie> {
        val cabecalho = try {
            CookieManager.getInstance().getCookie(url.toString())
        } catch (e: Exception) {
            null
        } ?: return emptyList()

        val host = url.host
        val agora = System.currentTimeMillis()
        val saida = ArrayList<Cookie>()
        for (par in cabecalho.split(";")) {
            val pedaco = par.trim()
            if (pedaco.isEmpty()) continue
            val igual = pedaco.indexOf('=')
            if (igual <= 0) continue
            val nome = pedaco.substring(0, igual).trim()
            val valor = pedaco.substring(igual + 1).trim()
            if (nome.isEmpty()) continue
            saida.add(
                Cookie.Builder()
                    .name(nome)
                    .value(valor)
                    .domain(host)
                    .path("/")
                    .expiresAt(agora + 60L * 60L * 1000L)
                    .build(),
            )
        }
        return saida
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> = cookiesDaUrl(url)

    /**
     * O CookieManager é a fonte de verdade (ele já grava o que o WebView recebe);
     * aqui não duplicamos escrita.
     */
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) = Unit

    /**
     * Devolve o cabeçalho `Cookie` pronto para uma URL arbitrária, para o caso de
     * requisições montadas à mão (extratores do provedor).
     */
    fun cabecalhoCookie(url: String): String = try {
        CookieManager.getInstance().getCookie(url) ?: ""
    } catch (e: Exception) {
        ""
    }

    /**
     * Constrói uma URL absoluta a partir de `Location: /api/proxy?...`, resolvendo
     * contra a origem de origem do embed — sem inventar host.
     */
    fun absolutizar(location: String, origem: String): String {
        if (location.startsWith("http://") || location.startsWith("https://")) return location
        return try {
            val base = URI(origem)
            "${base.scheme}://${base.authority}$location"
        } catch (e: Exception) {
            AppConfig.STREAMBETTER_BASE + location
        }
    }
}
