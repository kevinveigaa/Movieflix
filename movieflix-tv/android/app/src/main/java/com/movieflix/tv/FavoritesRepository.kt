package com.movieflix.tv

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Minha Lista — mesma tabela `favorites` do site (Supabase).
 *
 * A tabela `favorites` guarda { user_id, tmdb_id, media_type, created_at }.
 * As regras RLS do banco permitem que cada usuário leia/escreva apenas a
 * própria lista (igual ao site). O app usa o token da sessão (JWT) como
 * Authorization Bearer — exatamente o que o site faz.
 */
object FavoritesRepository {

    private fun conn(url: URL, method: String, token: String): HttpURLConnection {
        val c = url.openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 15000
        c.readTimeout = 20000
        c.setRequestProperty("apikey", AppConfig.SUPABASE_ANON_KEY)
        c.setRequestProperty("Authorization", "Bearer $token")
        c.setRequestProperty("Content-Type", "application/json")
        return c
    }

    /** Lista de favoritos do usuário: lista de { tmdb_id, media_type }. */
    suspend fun listar(context: Context, token: String): List<Pair<Long, String>> =
        withContext(Dispatchers.IO) {
            val uid = AuthRepository.loadUserId(context)
            if (uid.isBlank()) return@withContext emptyList()
            val url = URL(
                AppConfig.SUPABASE_URL + "/rest/v1/favorites?select=tmdb_id,media_type" +
                    "&user_id=eq." + URLEncoder.encode("\"" + uid + "\"", "UTF-8") +
                    "&order=created_at.desc",
            )
            try {
                val c = conn(url, "GET", token)
                if (c.responseCode != 200) return@withContext emptyList()
                val body = c.inputStream.bufferedReader().use { it.readText() }
                c.disconnect()
                val arr = JSONArray(body)
                (0 until arr.length()).mapNotNull { i ->
                    val o = arr.getJSONObject(i)
                    val t = o.optLong("tmdb_id", 0L)
                    if (t <= 0) null else t to o.optString("media_type", "movie")
                }
            } catch (e: Exception) {
                emptyList()
            }
        }

    /** Adiciona à lista. Retorna true se ok (ou se já estava). */
    suspend fun adicionar(context: Context, token: String, tmdbId: Long, mediaType: String): Boolean =
        withContext(Dispatchers.IO) {
            val uid = AuthRepository.loadUserId(context)
            if (uid.isBlank()) return@withContext false
            val url = URL(AppConfig.SUPABASE_URL + "/rest/v1/favorites?on_conflict=user_id,tmdb_id,media_type")
            try {
                val c = conn(url, "POST", token)
                c.setRequestProperty("Prefer", "resolution=merge-duplicates,return=minimal")
                val body = JSONObject()
                    .put("user_id", uid)
                    .put("tmdb_id", tmdbId)
                    .put("media_type", mediaType)
                    .toString()
                c.doOutput = true
                c.outputStream.write(body.toByteArray())
                val ok = c.responseCode in 200..299
                c.disconnect()
                ok
            } catch (e: Exception) {
                false
            }
        }

    /** Remove da lista. Retorna true se ok. */
    suspend fun remover(context: Context, token: String, tmdbId: Long): Boolean =
        withContext(Dispatchers.IO) {
            val uid = AuthRepository.loadUserId(context)
            if (uid.isBlank()) return@withContext false
            val url = URL(
                AppConfig.SUPABASE_URL + "/rest/v1/favorites?user_id=eq." +
                    URLEncoder.encode("\"" + uid + "\"", "UTF-8") +
                    "&tmdb_id=eq.$tmdbId",
            )
            try {
                val c = conn(url, "DELETE", token)
                c.setRequestProperty("Prefer", "return=minimal")
                val ok = c.responseCode in 200..299
                c.disconnect()
                ok
            } catch (e: Exception) {
                false
            }
        }
}
