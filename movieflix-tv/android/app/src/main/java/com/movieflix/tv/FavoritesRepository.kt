package com.movieflix.tv

import android.content.Context
import org.json.JSONObject

/**
 * Minha Lista / Favoritos — MESMA tabela `favorites` do site (Supabase).
 *
 * A tabela guarda { user_id, tmdb_id, media_type, ... } e, quando as migrations
 * estao aplicadas, tambem viewer_profile_id e movie_id. As colunas opcionais sao
 * detectadas uma vez — o app funciona antes e depois das migrations.
 *
 * A decisao de adicionar/remover NUNCA vem do estado da tela: ela pergunta ao
 * servidor (ver FavoritesLogic.decidir) — foi assim que o site sempre fez.
 */
object FavoritesRepository {

    data class Colunas(val viewerProfileId: Boolean, val movieId: Boolean)

    @Volatile private var colunasCache: Colunas? = null

    private fun colunas(ctx: Context): Colunas {
        colunasCache?.let { return it }
        val vp = SupabaseRest.selectDetectando(ctx, "favorites", "select=viewer_profile_id&limit=0").second
        val mi = SupabaseRest.selectDetectando(ctx, "favorites", "select=movie_id&limit=0").second
        return Colunas(vp, mi).also { colunasCache = it }
    }

    data class Favorito(val id: String?, val tmdbId: Long, val mediaType: String, val movieId: String?)

    data class ResultadoLista(val itens: List<Favorito>, val semTmdb: Int, val erro: String?)

    fun listarResultado(ctx: Context): ResultadoLista {
        val uid = AuthRepository.loadUserId(ctx)
        if (uid.isBlank()) {
            return ResultadoLista(emptyList(), 0, "Sessao nao encontrada. Entre de novo com a conta do site.")
        }
        val c = colunas(ctx)
        val filtros = ArrayList<String>()
        filtros.add("select=id,tmdb_id,media_type" + if (c.movieId) ",movie_id" else "")
        filtros.add(SupabaseRest.eq("user_id", uid))
        if (c.viewerProfileId) {
            val perfil = ProfilesRepository.perfilAtivoId(ctx)
            filtros.add(
                if (perfil != null) SupabaseRest.eq("viewer_profile_id", perfil)
                else SupabaseRest.isNull("viewer_profile_id"),
            )
        }
        filtros.add(SupabaseRest.order("created_at", ascending = false))
        val arr = SupabaseRest.select(ctx, "favorites", filtros.joinToString("&"))
        val itens = ArrayList<Favorito>(arr.length())
        var semTmdb = 0
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val t = o.optLong("tmdb_id", 0L)
            if (t <= 0L) { semTmdb++; continue }
            itens.add(
                Favorito(
                    id = if (o.isNull("id")) null else o.optString("id"),
                    tmdbId = t,
                    mediaType = o.optString("media_type", "movie"),
                    movieId = if (o.isNull("movie_id")) null else o.optString("movie_id"),
                ),
            )
        }
        // Deduplica pela chave (media_type, tmdb_id): o mesmo titulo aparece UMA vez.
        val unicos = FavoritesLogic.deduplicar(itens.map { FavoritesLogic.Linha(it.id, it.tmdbId, it.mediaType) })
        val porChave = itens.associateBy { FavoritesLogic.chave(it.mediaType, it.tmdbId) }
        val finais = unicos.mapNotNull { porChave[FavoritesLogic.chave(it.mediaType, it.tmdbId)] }
        return ResultadoLista(finais, semTmdb, null)
    }

    fun listar(ctx: Context): List<Pair<Long, String>> =
        listarResultado(ctx).itens.map { it.tmdbId to it.mediaType }

    fun contem(ctx: Context, tmdbId: Long, mediaType: String? = null): Boolean =
        listarResultado(ctx).itens.any { it.tmdbId == tmdbId && (mediaType == null || it.mediaType == mediaType) }

    fun linha(ctx: Context, tmdbId: Long): Favorito? =
        listarResultado(ctx).itens.firstOrNull { it.tmdbId == tmdbId }

    /**
     * ADICIONA aos favoritos — INSERT puro, como o site.
     * Idempotente: se ja esta salvo, nao insere de novo.
     */
    fun adicionar(ctx: Context, movie: Movie): Boolean {
        val uid = AuthRepository.loadUserId(ctx)
        if (uid.isBlank()) return false
        val tmdb = movie.tmdbIdNumerico ?: return false
        val mediaType = if (movie.ehSerie) "tv" else "movie"
        if (contem(ctx, tmdb, mediaType)) return true
        val c = colunas(ctx)
        val row = JSONObject()
            .put("user_id", uid)
            .put("tmdb_id", tmdb)
            .put("media_type", mediaType)
            .put("title", movie.title)
            .put("poster_path", movie.poster_url)
            .put("backdrop_path", movie.backdrop_url)
            .put("vote_average", movie.vote_average)
        if (c.movieId) row.put("movie_id", movie.id)
        if (c.viewerProfileId) row.put("viewer_profile_id", ProfilesRepository.perfilAtivoId(ctx) ?: JSONObject.NULL)
        val criado = SupabaseRest.insert(ctx, "favorites", row) ?: return false
        return criado.length() > 0
    }

    /** REMOVE dos favoritos (DELETE por id; apaga todas as linhas do titulo). */
    fun remover(ctx: Context, tmdbId: Long): Boolean {
        val uid = AuthRepository.loadUserId(ctx)
        if (uid.isBlank()) return false
        val locais = listarResultado(ctx).itens.filter { it.tmdbId == tmdbId }
        val filtro = if (locais.isNotEmpty() && locais.all { !it.id.isNullOrBlank() }) {
            "id=in.(" + locais.mapNotNull { it.id }.joinToString(",") + ")"
        } else {
            listOf(SupabaseRest.eq("user_id", uid), SupabaseRest.eqNum("tmdb_id", tmdbId)).joinToString("&")
        }
        return SupabaseRest.delete(ctx, "favorites", filtro)
    }
}
