package com.movieflix.tv

import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Resolve o stream real de um título junto ao backend MovieFlix
 * (https://movieflix-bszf.onrender.com — mesmo backend do site).
 *
 * - Assinante ativo: /api/streambetter-resolve?embed=... com
 *   Authorization: Bearer <JWT do Supabase> → devolve o HLS direto.
 * - Sem assinatura: o servidor NÃO devolve stream (402/erro) — o app
 *   mostra a tela de assinatura. A regra é validada no BANCO (server-side),
 *   nunca só no cliente.
 */
object StreamResolver {

    private val json = Json { ignoreUnknownKeys = true }

    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .build()

    /** Tenta resolver o stream. Retorna URL se autorizado, senão motivo. */
    fun resolve(embedUrl: String, token: String?): StreamResolution {
        val url = AppConfig.BACKEND_URL + "/api/streambetter-resolve?embed=" +
            java.net.URLEncoder.encode(embedUrl, "UTF-8")

        val builder = Request.Builder().url(url).header("Accept", "application/json")
        if (!token.isNullOrBlank()) {
            builder.header("Authorization", "Bearer $token")
        }

        return try {
            client.newCall(builder.build()).execute().use { resp ->
                val text = resp.body?.string() ?: ""
                if (resp.isSuccessful) {
                    json.decodeFromString<StreamResolution>(text)
                } else {
                    StreamResolution(
                        success = false,
                        motivo = "http_${resp.code}",
                        erro = "Servidor recusou (${resp.code})",
                    )
                }
            }
        } catch (e: IOException) {
            StreamResolution(success = false, motivo = "network", erro = e.message)
        } catch (e: Exception) {
            StreamResolution(success = false, motivo = "parse", erro = e.message)
        }
    }
}
