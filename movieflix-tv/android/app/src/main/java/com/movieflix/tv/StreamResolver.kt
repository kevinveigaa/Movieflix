package com.movieflix.tv

import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Resolve o stream real de um título junto ao MovieFlix.
 *
 * Estratégia em duas camadas (resiliente a backend fora do ar / desatualizado):
 *  1. Tenta o backend oficial: /api/streambetter-resolve?embed=... (JSON).
 *     Se o backend responder JSON válido com url .m3u8/.mp4, usa direto.
 *  2. Fallback DIRETO (sem depender do backend): busca o HTML do embed no
 *     StreamBetter, extrai `sources`, e resolve a fonte:
 *       - kind "superflix"  → /api/extract-superflix → /api/proxy?t=...&ext=m3u8
 *       - kind "stream"     → URL /api/proxy?t=...&ext=m3u8 (HLS) ou .m3u8/.mp4
 *       - kind "embedplayer"→ /api/extract-embedplayer → HLS
 *     Mesma lógica do backend/streambetter-resolver.js + player do StreamBetter.
 *
 * Isso garante que "Assistir" SEMPRE tenta reproduzir dentro do app (ExoPlayer).
 * Nunca abre navegador/WebView; nunca sai do app. Se nada resolver, retorna
 * erro para a UI nativa mostrar "Tentar de novo".
 */
object StreamResolver {

    private val json = Json { ignoreUnknownKeys = true }
    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

    /**
     * ── CORREÇÃO DA REPRODUÇÃO (prioridade máxima) ────────────────────────────
     *
     * O cliente passou a usar o cookie jar do WebView ([WebViewCookieJar]).
     *
     * No site e no app mobile não existe diferença entre pedir a página e pedir o
     * vídeo: é o MESMO WebView, com o MESMO cookie jar. Quando o provedor exibe a
     * verificação e o usuário a confirma legitimamente, é gravado um cookie de
     * liberação — e é ELE que autoriza as requisições seguintes a receberem a
     * fonte de vídeo.
     *
     * Na TV o player é nativo (Media3/ExoPlayer sobre OkHttp), que tem um cookie jar
     * PRÓPRIO e VAZIO. Sem esta ponte, a verificação passava no WebView e a
     * requisição seguinte — feita pelo OkHttp — continuava ANÔNIMA, recebendo de novo
     * a página de verificação em vez da fonte. Era isso que fazia a TV "avançar mas
     * voltar para a verificação" enquanto o mobile tocava sem problema.
     *
     * Nada é forjado: os cookies são lidos do CookieManager do Android (o mesmo do
     * Chromium/WebView) e simplesmente repassados. Nenhum CAPTCHA é resolvido,
     * nenhum token é criado, nenhuma página protegida é raspada por fora do
     * navegador.
     */
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .cookieJar(WebViewCookieJar)
        .build()

    private const val STREAMBETTER_BASE = "https://streambetter.shop"
    private const val UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

    /**
     * Fonte de dados para o ExoPlayer usar o MESMO cliente desta resolução.
     *
     * Sem isto o player nativo faria as requisições de playlist e de segmentos
     * com um cliente PRÓPRIO, sem os cookies da sessão autorizada — o que fazia a
     * TV receber a página de verificação no lugar do vídeo enquanto o mobile
     * (mesmo WebView, mesmo cookie jar) tocava normalmente.
     */
    fun dataSourceFactory(): androidx.media3.datasource.okhttp.OkHttpDataSource.Factory =
        androidx.media3.datasource.okhttp.OkHttpDataSource.Factory(client)
            .setUserAgent(UA)
            .setDefaultRequestProperties(
                mapOf(
                    "Referer" to STREAMBETTER_BASE,
                    "Accept-Language" to "pt-BR,pt;q=0.9,en;q=0.8",
                ),
            )

    /** Tenta resolver o stream. Retorna URL se autorizado, senão motivo. */
    fun resolve(embedUrl: String, token: String?): StreamResolution {
        // 1) Backend primeiro (JSON real)
        val viaBackend = resolverViaBackend(embedUrl, token)
        if (viaBackend != null) return viaBackend

        // 2) Fallback direto no StreamBetter (sem backend)
        return resolverDireto(embedUrl)
    }

    // ---- Camada 1: backend ----

    private fun resolverViaBackend(embedUrl: String, token: String?): StreamResolution? {
        val url = AppConfig.BACKEND_URL + "/api/streambetter-resolve?embed=" +
            URLEncoder.encode(embedUrl, "UTF-8")

        val builder = Request.Builder().url(url).header("Accept", "application/json")
        if (!token.isNullOrBlank()) {
            builder.header("Authorization", "Bearer $token")
        }

        return try {
            client.newCall(builder.build()).execute().use { resp ->
                val text = resp.body?.string() ?: ""
                // Backend fora do ar / rota ausente → devolve HTML (SPA), não JSON.
                if (!text.trimStart().startsWith("{")) return@use null
                if (resp.isSuccessful) {
                    val r = json.decodeFromString<StreamResolution>(text)
                    if (r.success && !r.url.isNullOrBlank()) r else null
                } else {
                    null
                }
            }
        } catch (e: Exception) {
            null
        }
    }

    // ---- Camada 2: resolução direta no StreamBetter ----

    private fun resolverDireto(embedUrl: String): StreamResolution {
        return try {
            val html = buscarHtmlEmbed(embedUrl) ?: return StreamResolution(
                success = false, motivo = "embed", erro = "Não foi possível acessar a fonte do vídeo.",
            )

            val sources = extrairSources(html)
            if (sources.isEmpty()) {
                return StreamResolution(
                    success = false, motivo = "sem_fontes",
                    erro = "Este título ainda não possui fonte de vídeo disponível.",
                )
            }

            for (fonte in sources) {
                val kind = fonte.kind ?: "stream"
                val urlFonte = fonte.url ?: continue
                try {
                    when {
                        // superflix → extract-superflix → /api/proxy?t=...&ext=m3u8
                        kind == "superflix" -> {
                            val hls = resolverExtract("/api/extract-superflix", urlFonte)
                            if (hls != null) return StreamResolution(success = true, url = hls, kind = "stream")
                        }
                        // embedplayer → extract-embedplayer → HLS
                        kind == "embedplayer" || urlFonte.contains("embedplayer") -> {
                            val hls = resolverExtract("/api/extract-embedplayer", urlFonte)
                            if (hls != null) return StreamResolution(success = true, url = hls, kind = "stream")
                        }
                        // URL direta (m3u8 / mp4 / proxy com ext=m3u8)
                        urlFonte.contains(".m3u8") || urlFonte.contains("ext=m3u8") || urlFonte.contains(".mp4") -> {
                            val abs = if (urlFonte.startsWith("/")) STREAMBETTER_BASE + urlFonte else urlFonte
                            return StreamResolution(
                                success = true,
                                url = abs,
                                kind = if (urlFonte.contains(".mp4")) "mp4" else "stream",
                            )
                        }
                        // /api/proxy?t=... (sem ext) → tenta stream-token
                        urlFonte.startsWith("/api/proxy") -> {
                            val hls = resolverStreamToken(urlFonte)
                            if (hls != null) return StreamResolution(success = true, url = hls, kind = "stream")
                        }
                    }
                } catch (_: Exception) {
                    // tenta a próxima fonte
                }
            }
            StreamResolution(
                success = false, motivo = "sem_stream_direto",
                erro = "Nenhuma fonte de vídeo direta disponível para este título.",
            )
        } catch (e: Exception) {
            StreamResolution(success = false, motivo = "network", erro = e.message)
        }
    }

    /** Chama um extrator (/api/extract-superflix, /api/extract-embedplayer) e devolve a URL HLS. */
    private fun resolverExtract(endpoint: String, token: String): String? {
        val apiUrl = "$STREAMBETTER_BASE$endpoint?t=${URLEncoder.encode(token, "UTF-8")}"
        val req = Request.Builder().url(apiUrl)
            .header("User-Agent", UA)
            .header("Referer", STREAMBETTER_BASE)
            .header("Accept", "application/json")
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return null
            val text = resp.body?.string() ?: return null
            if (!text.trimStart().startsWith("{")) return null
            val obj = org.json.JSONObject(text)
            if (!obj.optBoolean("success", false)) return null
            val u = obj.optString("url", "")
            if (u.isBlank()) return null
            return if (u.startsWith("/")) STREAMBETTER_BASE + u else u
        }
    }

    /** Converte uma URL /api/proxy?t=... em HLS via /api/stream-token (POST). */
    private fun resolverStreamToken(proxyUrl: String): String? {
        val body = "{\"url\":\"$proxyUrl\"}".toRequestBody(JSON_MEDIA)
        val req = Request.Builder()
            .url("$STREAMBETTER_BASE/api/stream-token")
            .header("User-Agent", UA)
            .header("Referer", STREAMBETTER_BASE)
            .header("Accept", "application/json")
            .post(body)
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return null
            val text = resp.body?.string() ?: return null
            if (!text.trimStart().startsWith("{")) return null
            val obj = org.json.JSONObject(text)
            if (!obj.optBoolean("success", false)) return null
            val u = obj.optString("url", "")
            if (u.isBlank()) return null
            return if (u.startsWith("/")) STREAMBETTER_BASE + u else u
        }
    }

    /**
     * Baixa o HTML do embed PRESERVANDO a query original (em especial a chave
     * pública `key=sb_pk_*`) e apenas acrescentando `lang=pt-BR`.
     *
     * Isso é essencial: a versão anterior descartava tudo o que vinha depois do
     * `?`, então a chave do plano Creator nunca chegava ao provedor, o embed
     * voltava sem `sources` e a TV caía em "fonte indisponível" mesmo em
     * títulos que funcionam no celular.
     */
    private fun buscarHtmlEmbed(embedUrl: String): String? {
        val url = try {
            val u = java.net.URI(embedUrl)
            val base = "${u.scheme}://${u.authority}${u.path ?: ""}"
            val params = (u.rawQuery ?: "")
                .split("&")
                .filter { it.isNotBlank() && !it.startsWith("lang=") }
                .toMutableList()
            params.add("lang=pt-BR")
            "$base?" + params.joinToString("&")
        } catch (_: Exception) {
            AppConfig.comChaveStreamBetter(embedUrl)
        }
        // Cabeçalhos IDÊNTICOS aos que o iframe do site envia (medidos no fluxo do
        // mobile). Sem `Sec-Fetch-Dest: iframe` o provedor pode tratar a requisição
        // como navegação de topo e devolver a página de verificação em vez do
        // conteúdo do embed. Cookies vão automaticamente pelo cookie jar.
        val req = Request.Builder().url(url)
            .header("User-Agent", UA)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            .header("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8")
            .header("Upgrade-Insecure-Requests", "1")
            .header("Sec-Fetch-Dest", "iframe")
            .header("Sec-Fetch-Mode", "navigate")
            .header("Sec-Fetch-Site", "cross-site")
            .build()
        return try {
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) null else resp.body?.string()
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun extrairSources(html: String): List<Fonte> {
        // sources=[...];  ou  &sources=%5B...%5D&
        val re = Regex("sources\\s*=\\s*(\\[.*?\\])\\s*;", RegexOption.DOT_MATCHES_ALL)
        val m = re.find(html)
        if (m != null) {
            return try {
                val arr = json.decodeFromString<List<Map<String, String>>>(m.groupValues[1])
                arr.map { Fonte(it["kind"], it["url"]) }
            } catch (_: Exception) { emptyList() }
        }
        // formato URL-encoded
        val reEnc = Regex("(?:&|;)sources=([^&;\"'\\s]+)")
        val m2 = reEnc.find(html)
        if (m2 != null) {
            return try {
                val dec = java.net.URLDecoder.decode(m2.groupValues[1], "UTF-8")
                val arr = json.decodeFromString<List<Map<String, String>>>(dec)
                arr.map { Fonte(it["kind"], it["url"]) }
            } catch (_: Exception) { emptyList() }
        }
        return emptyList()
    }

    private data class Fonte(val kind: String?, val url: String?)
}