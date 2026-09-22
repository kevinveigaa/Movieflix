package com.movieflix.tv

import android.content.Context
import org.json.JSONObject

/**
 * Continuar assistindo + Historico (`watch_history`) — MESMA tabela do site.
 *
 * Regras de `src/lib/watchProgress.ts`: progresso real = posicao >= 10 min OU
 * >= 30% da duracao; nunca >= 95% (concluido) e nunca posicao/duracao <= 0.
 */
object WatchHistoryRepository {

    data class Registro(
        val id: String,
        val tmdbId: Long?,
        val mediaType: String,
        val title: String,
        val posterPath: String?,
        val backdropPath: String?,
        val positionSeconds: Int,
        val durationSeconds: Int,
        val season: Int?,
        val episode: Int?,
        val updatedAt: String?,
    )

    data class Colunas(val viewerProfileId: Boolean, val movieId: Boolean, val seasonEpisode: Boolean)

    @Volatile private var colunasCache: Colunas? = null

    private fun colunas(ctx: Context): Colunas {
        colunasCache?.let { return it }
        val vp = SupabaseRest.selectDetectando(ctx, "watch_history", "select=viewer_profile_id&limit=0").second
        val mi = SupabaseRest.selectDetectando(ctx, "watch_history", "select=movie_id&limit=0").second
        val se = SupabaseRest.selectDetectando(ctx, "watch_history", "select=season_number&limit=0").second
        return Colunas(vp, mi, se).also { colunasCache = it }
    }

    // ── Leitura ──

    fun doTitulo(ctx: Context, movieId: String): Registro? {
        val uid = AuthRepository.loadUserId(ctx)
        if (uid.isBlank()) return null
        val c = colunas(ctx)
        val filtros = ArrayList<String>()
        filtros.add("select=*")
        filtros.add(SupabaseRest.eq("user_id", uid))
        if (c.movieId && movieId.isNotBlank()) filtros.add(SupabaseRest.eq("movie_id", movieId))
        filtroPerfil(ctx, c)?.let { filtros.add(it) }
        filtros.add(SupabaseRest.order("updated_at", ascending = false))
        filtros.add(SupabaseRest.limit(1))
        val arr = SupabaseRest.select(ctx, "watch_history", filtros.joinToString("&"))
        return arr.optJSONObject(0)?.let { parse(it) }
    }

    fun listar(ctx: Context): List<Registro> {
        val uid = AuthRepository.loadUserId(ctx)
        if (uid.isBlank()) return emptyList()
        val c = colunas(ctx)
        val filtros = ArrayList<String>()
        filtros.add("select=*")
        filtros.add(SupabaseRest.eq("user_id", uid))
        filtroPerfil(ctx, c)?.let { filtros.add(it) }
        filtros.add(SupabaseRest.order("updated_at", ascending = false))
        filtros.add(SupabaseRest.limit(60))
        val arr = SupabaseRest.select(ctx, "watch_history", filtros.joinToString("&"))
        return (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let { parse(it) } }
    }

    /** Continuar assistindo: so registros com progresso REAL. */
    fun continuarAssistindo(ctx: Context, limite: Int = 20): List<Registro> =
        listar(ctx)
            .filter { temProgressoReal(it.positionSeconds, it.durationSeconds) }
            .filter { it.tmdbId != null }
            .take(limite)

    private fun filtroPerfil(ctx: Context, c: Colunas): String? {
        if (!c.viewerProfileId) return null
        val perfil = ProfilesRepository.perfilAtivoId(ctx)
        return if (perfil != null) SupabaseRest.eq("viewer_profile_id", perfil) else SupabaseRest.isNull("viewer_profile_id")
    }

    // ── Escrita ──

    data class UpsertArgs(
        val movie: Movie,
        val positionSeconds: Int,
        val durationSeconds: Int,
        val season: Int?,
        val episode: Int?,
    )

    fun upsert(ctx: Context, a: UpsertArgs) {
        val uid = AuthRepository.loadUserId(ctx)
        if (uid.isBlank()) return
        val c = colunas(ctx)
        val tmdb = a.movie.tmdbIdNumerico
        val filtros = ArrayList<String>()
        filtros.add("select=id")
        filtros.add(SupabaseRest.eq("user_id", uid))
        if (c.movieId && a.movie.id.isNotBlank()) {
            filtros.add(SupabaseRest.eq("movie_id", a.movie.id))
        } else if (tmdb != null) {
            filtros.add(SupabaseRest.eqNum("tmdb_id", tmdb))
            filtros.add(SupabaseRest.eq("media_type", if (a.movie.ehSerie) "tv" else "movie"))
        } else return
        filtroPerfil(ctx, c)?.let { filtros.add(it) }
        filtros.add(SupabaseRest.limit(1))
        val existente = SupabaseRest.select(ctx, "watch_history", filtros.joinToString("&"))

        val patch = JSONObject()
            .put("position_seconds", a.positionSeconds)
            .put("duration_seconds", a.durationSeconds)
            .put("title", a.movie.title)
            .put("poster_path", a.movie.poster_url)
            .put("backdrop_path", a.movie.backdrop_url)
            .put("updated_at", isoAgora())
        if (c.seasonEpisode) {
            patch.put("season_number", a.season ?: JSONObject.NULL)
            patch.put("episode_number", a.episode ?: JSONObject.NULL)
        }

        val idExistente = existente.optJSONObject(0)?.optString("id")
        if (!idExistente.isNullOrBlank()) {
            SupabaseRest.update(ctx, "watch_history", SupabaseRest.eq("id", idExistente), patch)
            return
        }

        val row = JSONObject()
            .put("user_id", uid)
            .put("tmdb_id", tmdb ?: JSONObject.NULL)
            .put("media_type", if (a.movie.ehSerie) "tv" else "movie")
            .put("title", a.movie.title)
            .put("poster_path", a.movie.poster_url)
            .put("backdrop_path", a.movie.backdrop_url)
            .put("position_seconds", a.positionSeconds)
            .put("duration_seconds", a.durationSeconds)
            .put("updated_at", isoAgora())
        if (c.movieId && a.movie.id.isNotBlank()) row.put("movie_id", a.movie.id)
        if (c.viewerProfileId) row.put("viewer_profile_id", ProfilesRepository.perfilAtivoId(ctx) ?: JSONObject.NULL)
        if (c.seasonEpisode) {
            row.put("season_number", a.season ?: JSONObject.NULL)
            row.put("episode_number", a.episode ?: JSONObject.NULL)
        }
        SupabaseRest.insert(ctx, "watch_history", row)
    }

    fun remover(ctx: Context, id: String): Boolean =
        SupabaseRest.delete(ctx, "watch_history", SupabaseRest.eq("id", id))

    fun limparTudo(ctx: Context): Boolean {
        val uid = AuthRepository.loadUserId(ctx)
        if (uid.isBlank()) return false
        return SupabaseRest.delete(ctx, "watch_history", SupabaseRest.eq("user_id", uid))
    }

    private fun isoAgora(): String = java.time.Instant.now().toString()

    private fun parse(o: JSONObject): Registro = Registro(
        id = o.optString("id"),
        tmdbId = if (o.isNull("tmdb_id")) null else o.optLong("tmdb_id"),
        mediaType = o.optString("media_type", "movie"),
        title = o.optString("title"),
        posterPath = if (o.isNull("poster_path")) null else o.optString("poster_path"),
        backdropPath = if (o.isNull("backdrop_path")) null else o.optString("backdrop_path"),
        positionSeconds = o.optInt("position_seconds", 0),
        durationSeconds = o.optInt("duration_seconds", 0),
        season = if (o.isNull("season_number")) null else o.optInt("season_number"),
        episode = if (o.isNull("episode_number")) null else o.optInt("episode_number"),
        updatedAt = if (o.isNull("updated_at")) null else o.optString("updated_at"),
    )

    // ── Regras de progresso (watchProgress.ts) ──

    private const val MIN_PROGRESS_SECONDS = 600
    private const val MIN_PROGRESS_PCT = 30
    private const val MAX_RESUME_PCT = 95

    fun temProgressoReal(positionSeconds: Int, durationSeconds: Int): Boolean {
        if (positionSeconds <= 0) return false
        if (durationSeconds > 0 && positionSeconds.toDouble() / durationSeconds >= MAX_RESUME_PCT / 100.0) return false
        if (positionSeconds >= MIN_PROGRESS_SECONDS) return true
        if (durationSeconds > 0 && positionSeconds.toDouble() / durationSeconds >= MIN_PROGRESS_PCT / 100.0) return true
        return false
    }

    fun ehProgressoLixo(positionSeconds: Int, durationSeconds: Int): Boolean =
        positionSeconds <= 0 || durationSeconds <= 0

    fun progressoPercentual(positionSeconds: Int, durationSeconds: Int): Int {
        if (durationSeconds <= 0) return 0
        return ((positionSeconds.toDouble() / durationSeconds) * 100.0).toInt().coerceIn(0, 100)
    }
}
