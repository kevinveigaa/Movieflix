package com.movieflix.tv

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Resolve o stream real de um titulo junto ao MovieFlix.
 *
 * Camadas (resiliente a backend fora do ar):
 *  1. Backend oficial: GET /api/streambetter-resolve?embed=... (JSON).
 *  2. Fallback direto no StreamBetter: baixa o HTML do embed (preservando a
 *     chave publica), extrai `sources` e resolve a fonte — mesma logica do
 *     backend/streambetter-resolver.js. Nunca abre navegador; se nada resolver,
 *     devolve erro para a UI nativa mostrar "Tentar de novo".
 */
object StreamResolver {

    private val json = Json { ignoreUnknownKeys = true }
    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

    private val client = SupabaseRest.client.newBuilder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .cookieJar(WebViewCookieJar)
        .build()

    private const val SB = AppConfig.STREAMBETTER_BASE
    private const val UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

    /** Fonte de dados para o ExoPlayer usar o MESMO cliente desta resolucao. */
    fun dataSourceFactory(): androidx.media3.datasource.okhttp.OkHttpDataSource.Factory =
        androidx.media3.datasource.okhttp.OkHttpDataSource.Factory(client)
            .setUserAgent(UA)
            .setDefaultRequestProperties(
                mapOf(
                    "Referer" to SB,
                    "Accept-Language" to "pt-BR,pt;q=0.9,en;q=0.8",
                ),
            )

    fun resolve(embedUrl: String, token: String?): StreamResolution {
        resolverViaBackend(embedUrl, token)?.let { return it }
        return resolverDireto(embedUrl)
    }

    private fun resolverViaBackend(embedUrl: String, token: String?): StreamResolution? {
        val urlResolve = AppConfig.SITE_URL + "/api/streambetter-resolve?embed=" + URLEncoder.encode(embedUrl, "UTF-8")
        val builder = Request.Builder().url(urlResolve).header("Accept", "application/json")
        if (!token.isNullOrBlank()) builder.header("Authorization", "Bearer $token")
        return try {
            client.newCall(builder.build()).execute().use { resp ->
                val text = resp.body?.string() ?: ""
                if (!text.trimStart().startsWith("{")) return@use null
                if (resp.isSuccessful) {
                    val r = json.decodeFromString<StreamResolution>(text)
                    if (r.success && !r.url.isNullOrBlank()) r else null
                } else null
            }
        } catch (_: Exception) { null }
    }

    private fun resolverDireto(embedUrl: String): StreamResolution {
        return try {
            val html = buscarHtmlEmbed(embedUrl) ?: return StreamResolution(
                success = false, motivo = "embed", erro = "Nao foi possivel acessar a fonte do video.",
            )
            val sources = extrairSources(html)
            if (sources.isEmpty()) return StreamResolution(
                success = false, motivo = "sem_fontes",
                erro = "Este titulo ainda nao possui fonte de video disponivel.",
            )

            for (fonte in sources) {
                val kind = fonte.kind ?: "stream"
                val urlFonte = fonte.url ?: continue
                try {
                    when {
                        kind == "superflix" -> {
                            val hls = resolverExtract("/api/extract-superflix", urlFonte)
                            if (hls != null) return StreamResolution(success = true, url = hls, kind = "stream")
                        }
                        kind == "embedplayer" || urlFonte.contains("embedplayer") -> {
                            val hls = resolverExtract("/api/extract-embedplayer", urlFonte)
                            if (hls != null) return StreamResolution(success = true, url = hls, kind = "stream")
                        }
                        urlFonte.contains(".m3u8") || urlFonte.contains("ext=m3u8") || urlFonte.contains(".mp4") -> {
                            val abs = if (urlFonte.startsWith("/")) SB + urlFonte else urlFonte
                            return StreamResolution(
                                success = true, url = abs,
                                kind = if (urlFonte.contains(".mp4")) "mp4" else "stream",
                            )
                        }
                        urlFonte.startsWith("/api/proxy") -> {
                            val hls = resolverStreamToken(urlFonte)
                            if (hls != null) return StreamResolution(success = true, url = hls, kind = "stream")
                        }
                    }
                } catch (_: Exception) { }
            }
            StreamResolution(
                success = false, motivo = "sem_stream_direto",
                erro = "Nenhuma fonte de video direta disponivel para este titulo.",
            )
        } catch (e: Exception) {
            StreamResolution(success = false, motivo = "network", erro = e.message)
        }
    }

    private fun resolverExtract(endpoint: String, token: String): String? {
        val apiUrl = "$SB$endpoint?t=" + URLEncoder.encode(token, "UTF-8")
        val req = Request.Builder().url(apiUrl)
            .header("User-Agent", UA)
            .header("Referer", SB)
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
            return if (u.startsWith("/")) SB + u else u
        }
    }

    private fun resolverStreamToken(proxyUrl: String): String? {
        val body = "{\"url\":\"$proxyUrl\"}".toRequestBody(JSON_MEDIA)
        val req = Request.Builder()
            .url("$SB/api/stream-token")
            .header("User-Agent", UA)
            .header("Referer", SB)
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
            return if (u.startsWith("/")) SB + u else u
        }
    }

    /**
     * Baixa o HTML do embed PRESERVANDO a query original (em especial a chave
     * publica `key=sb_pk_*`) e apenas acrescentando `lang=pt-BR`.
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
        } catch (_: Exception) { null }
    }

    private fun extrairSources(html: String): List<Fonte> {
        val re = Regex("sources\\s*=\\s*(\\[.*?\\])\\s*;", RegexOption.DOT_MATCHES_ALL)
        re.find(html)?.let { m ->
            return try {
                json.decodeFromString<List<Map<String, String>>>(m.groupValues[1])
                    .map { Fonte(it["kind"], it["url"]) }
            } catch (_: Exception) { emptyList() }
        }
        val reEnc = Regex("(?:&|;)sources=([^&;\"'\\s]+)")
        reEnc.find(html)?.let { m ->
            return try {
                val dec = java.net.URLDecoder.decode(m.groupValues[1], "UTF-8")
                json.decodeFromString<List<Map<String, String>>>(dec).map { Fonte(it["kind"], it["url"]) }
            } catch (_: Exception) { emptyList() }
        }
        return emptyList()
    }

    private data class Fonte(val kind: String?, val url: String?)
}
