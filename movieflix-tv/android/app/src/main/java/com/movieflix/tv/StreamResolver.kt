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

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .build()

    private const val STREAMBETTER_BASE = "https://streambetter.shop"
    private const val UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

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

    private fun buscarHtmlEmbed(embedUrl: String): String? {
        val url = try {
            val u = java.net.URI(embedUrl).toURL()
            val base = u.toString().substringBefore("?")
            val sep = if (base.contains("?")) "&" else "?"
            base + sep + "lang=pt-BR"
        } catch (_: Exception) {
            embedUrl
        }
        val req = Request.Builder().url(url)
            .header("User-Agent", UA)
            .header("Accept", "text/html,application/xhtml+xml")
            .header("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8")
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