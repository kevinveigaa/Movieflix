package com.movieflix.tv

import android.webkit.CookieManager
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * CookieJar do OkHttp ligado ao CookieManager do Android (o mesmo do WebView).
 *
 * O provedor libera a fonte de video por COOKIE depois da verificacao. O player
 * nativo (OkHttp) tem cookie jar proprio e VAZIO; sem esta ponte, a verificacao
 * passava no WebView e a requisicao seguinte — feita pelo OkHttp — continuava
 * anonima, recebendo de novo a pagina de verificacao. Nada e forjado: os cookies
 * sao apenas repassados.
 */
object WebViewCookieJar : CookieJar {

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val cm = CookieManager.getInstance()
        for (c in cookies) {
            cm.setCookie(url.toString(), c.toString())
        }
        cm.flush()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val header = CookieManager.getInstance().getCookie(url.toString()) ?: return emptyList()
        val out = ArrayList<Cookie>()
        for (par in header.split(";")) {
            val p = par.trim()
            if (p.isEmpty()) continue
            val eq = p.indexOf('=')
            if (eq <= 0) continue
            val cookie = Cookie.Builder()
                .name(p.substring(0, eq).trim())
                .value(p.substring(eq + 1).trim())
                .domain(url.host)
                .path("/")
                .build()
            out.add(cookie)
        }
        return out
    }
}
