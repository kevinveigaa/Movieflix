package com.movieflix.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Minha Lista / Favoritos — MESMA tabela `favorites` do site (Supabase).
 *
 * A tabela guarda { user_id, tmdb_id, media_type, created_at } e, quando as
 * migrations estão aplicadas, também viewer_profile_id e movie_id. O app
 * detecta as colunas (como `favoritesColumns.ts` faz) e grava conforme o
 * schema disponível — nunca quebra antes/depois da migration.
 *
 * O token da sessão (JWT) é enviado como Authorization Bearer, exatamente o
 * que o site faz; a RLS garante que cada usuário só lê/escreve a própria lista.
 */
object FavoritesRepository {

    data class Colunas(
        val viewerProfileId: Boolean,
        val movieId: Boolean,
    )

    @Volatile
    private var colunasCache: Colunas? = null

    private fun colunas(context: Context): Colunas {
        colunasCache?.let { return it }
        val vp = SupabaseRest.selectDetectando(context, "favorites", "select=viewer_profile_id&limit=0").second
        val mi = SupabaseRest.selectDetectando(context, "favorites", "select=movie_id&limit=0").second
        val c = Colunas(vp, mi)
        colunasCache = c
        return c
    }

    /** Lista de favoritos do perfil ativo: pares (tmdb_id, media_type). */
    fun listar(context: Context): List<Pair<Long, String>> = listarObjetos(context).map { it.tmdbId to it.mediaType }

    data class Favorito(val tmdbId: Long, val mediaType: String, val movieId: String?)

    /** Lista completa dos favoritos do perfil ativo. */
    fun listarObjetos(context: Context): List<Favorito> {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return emptyList()
        val c = colunas(context)
        val filtros = ArrayList<String>()
        filtros.add("select=tmdb_id,media_type" + if (c.movieId) ",movie_id" else "")
        filtros.add(SupabaseRest.eq("user_id", uid))
        if (c.viewerProfileId) {
            val perfil = ProfilesRepository.perfilAtivoId(context)
            filtros.add(
                if (perfil != null) SupabaseRest.eq("viewer_profile_id", perfil)
                else SupabaseRest.isNull("viewer_profile_id"),
            )
        }
        filtros.add(SupabaseRest.order("created_at", ascending = false))
        val arr = SupabaseRest.select(context, "favorites", filtros.joinToString("&"))
        val out = ArrayList<Favorito>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val t = o.optLong("tmdb_id", 0L)
            if (t > 0) {
                out.add(
                    Favorito(
                        tmdbId = t,
                        mediaType = o.optString("media_type", "movie"),
                        movieId = if (o.isNull("movie_id")) null else o.optString("movie_id"),
                    ),
                )
            }
        }
        return out
    }

    fun ehFavorito(context: Context, tmdbId: Long): Boolean =
        listarObjetos(context).any { it.tmdbId == tmdbId }

    /** Adiciona à lista (idempotente via on_conflict). */
    fun adicionar(context: Context, tmdbId: Long, mediaType: String, movieId: String? = null): Boolean {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return false
        val c = colunas(context)
        val row = JSONObject()
            .put("user_id", uid)
            .put("tmdb_id", tmdbId)
            .put("media_type", mediaType)
            .put("title", "")
            .put("poster_path", "")
            .put("backdrop_path", "")
            .put("vote_average", 0)
        if (c.movieId && !movieId.isNullOrBlank()) row.put("movie_id", movieId)
        if (c.viewerProfileId) {
            row.put("viewer_profile_id", ProfilesRepository.perfilAtivoId(context) ?: JSONObject.NULL)
        }
        return SupabaseRest.upsert(context, "favorites", row, "user_id,tmdb_id,media_type")
    }

    /** Remove da lista. */
    fun remover(context: Context, tmdbId: Long): Boolean {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return false
        val filtros = listOf(
            SupabaseRest.eq("user_id", uid),
            SupabaseRest.eqNum("tmdb_id", tmdbId),
        ).joinToString("&")
        return SupabaseRest.delete(context, "favorites", filtros)
    }
}
