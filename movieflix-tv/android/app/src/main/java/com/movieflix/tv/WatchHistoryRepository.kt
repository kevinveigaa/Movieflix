package com.movieflix.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Continuar assistindo + Histórico (`watch_history`) — MESMA tabela do site.
 *
 * Regras replicadas de `src/lib/watchProgress.ts` e `useWatchHistory.ts`:
 *  - Progresso REAL: posição >= 10 min OU >= 30% da duração; nunca >= 95%
 *    (título concluído) e nunca "lixo" (posição/duração <= 0).
 *  - Registro por perfil (viewer_profile_id) e por título (movie_id = tmdb id).
 *  - O upsert procura o registro existente e faz PATCH; senão INSERT — o mesmo
 *    fluxo do mobile (evita duplicar linhas).
 *
 * As colunas opcionais (viewer_profile_id / movie_id / season_number) são
 * detectadas uma vez, para o app funcionar antes e depois das migrations.
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

    data class Colunas(
        val viewerProfileId: Boolean,
        val movieId: Boolean,
        val seasonEpisode: Boolean,
    )

    @Volatile
    private var colunasCache: Colunas? = null

    private fun colunas(context: Context): Colunas {
        colunasCache?.let { return it }
        val vp = SupabaseRest.selectDetectando(context, "watch_history", "select=viewer_profile_id&limit=0").second
        val mi = SupabaseRest.selectDetectando(context, "watch_history", "select=movie_id&limit=0").second
        val se = SupabaseRest.selectDetectando(context, "watch_history", "select=season_number&limit=0").second
        val c = Colunas(vp, mi, se)
        colunasCache = c
        return c
    }

    // ─────────────────────── Leitura ───────────────────────

    /** Registro mais recente de um título (para retomar). */
    fun doTitulo(context: Context, movieId: String): Registro? {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return null
        val c = colunas(context)
        val filtros = ArrayList<String>()
        filtros.add("select=*")
        filtros.add(SupabaseRest.eq("user_id", uid))
        if (c.movieId && movieId.isNotBlank()) filtros.add(SupabaseRest.eq("movie_id", movieId))
        filtros.add(filtroPerfil(context, c))
        filtros.add(SupabaseRest.order("updated_at", ascending = false))
        filtros.add(SupabaseRest.limit(1))
        val arr = SupabaseRest.select(context, "watch_history", filtros.joinToString("&"))
        if (arr.length() == 0) return null
        return parse(arr.optJSONObject(0) ?: return null)
    }

    /** Histórico do perfil ativo (mais recente primeiro). */
    fun listar(context: Context): List<Registro> {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return emptyList()
        val c = colunas(context)
        val filtros = ArrayList<String>()
        filtros.add("select=*")
        filtros.add(SupabaseRest.eq("user_id", uid))
        filtros.add(filtroPerfil(context, c))
        filtros.add(SupabaseRest.order("updated_at", ascending = false))
        filtros.add(SupabaseRest.limit(60))
        val arr = SupabaseRest.select(context, "watch_history", filtros.joinToString("&"))
        return (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let { parse(it) } }
    }

    private fun filtroPerfil(context: Context, c: Colunas): String {
        if (!c.viewerProfileId) return "select=id&limit=0".let { "" } // sem a coluna não filtra
        val perfil = ProfilesRepository.perfilAtivoId(context)
        return if (perfil != null) SupabaseRest.eq("viewer_profile_id", perfil) else SupabaseRest.isNull("viewer_profile_id")
    }

    // ─────────────────────── Escrita ───────────────────────

    data class UpsertArgs(
        val movieId: String?,
        val tmdbId: Long?,
        val mediaType: String,
        val title: String,
        val posterPath: String?,
        val backdropPath: String?,
        val positionSeconds: Int,
        val durationSeconds: Int,
        val season: Int?,
        val episode: Int?,
    )

    fun upsert(context: Context, a: UpsertArgs) {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return
        val c = colunas(context)

        // 1) procura registro existente (mesma lógica do useUpsertHistory)
        val filtros = ArrayList<String>()
        filtros.add("select=id")
        filtros.add(SupabaseRest.eq("user_id", uid))
        if (c.movieId && !a.movieId.isNullOrBlank()) {
            filtros.add(SupabaseRest.eq("movie_id", a.movieId))
        } else if (a.tmdbId != null) {
            filtros.add(SupabaseRest.eqNum("tmdb_id", a.tmdbId))
            filtros.add(SupabaseRest.eq("media_type", a.mediaType))
        } else {
            return
        }
        if (c.viewerProfileId) {
            val perfil = ProfilesRepository.perfilAtivoId(context)
            filtros.add(
                if (perfil != null) SupabaseRest.eq("viewer_profile_id", perfil)
                else SupabaseRest.isNull("viewer_profile_id"),
            )
        }
        filtros.add(SupabaseRest.limit(1))
        val existente = SupabaseRest.select(context, "watch_history", filtros.joinToString("&"))

        val patch = JSONObject()
            .put("position_seconds", a.positionSeconds)
            .put("duration_seconds", a.durationSeconds)
            .put("title", a.title)
            .put("poster_path", a.posterPath ?: JSONObject.NULL)
            .put("backdrop_path", a.backdropPath ?: JSONObject.NULL)
            .put("updated_at", isoAgora())
        if (c.seasonEpisode) {
            patch.put("season_number", a.season ?: JSONObject.NULL)
            patch.put("episode_number", a.episode ?: JSONObject.NULL)
        }

        val idExistente = existente.optJSONObject(0)?.optString("id")
        if (!idExistente.isNullOrBlank()) {
            SupabaseRest.update(context, "watch_history", SupabaseRest.eq("id", idExistente), patch)
            return
        }

        // 2) não existe → INSERT
        val row = JSONObject()
            .put("user_id", uid)
            .put("tmdb_id", a.tmdbId ?: JSONObject.NULL)
            .put("media_type", a.mediaType)
            .put("title", a.title)
            .put("poster_path", a.posterPath ?: JSONObject.NULL)
            .put("backdrop_path", a.backdropPath ?: JSONObject.NULL)
            .put("position_seconds", a.positionSeconds)
            .put("duration_seconds", a.durationSeconds)
            .put("updated_at", isoAgora())
        if (c.movieId && !a.movieId.isNullOrBlank()) row.put("movie_id", a.movieId)
        if (c.viewerProfileId) row.put("viewer_profile_id", ProfilesRepository.perfilAtivoId(context) ?: JSONObject.NULL)
        if (c.seasonEpisode) {
            row.put("season_number", a.season ?: JSONObject.NULL)
            row.put("episode_number", a.episode ?: JSONObject.NULL)
        }
        SupabaseRest.insert(context, "watch_history", row)
    }

    fun remover(context: Context, id: String): Boolean =
        SupabaseRest.delete(context, "watch_history", SupabaseRest.eq("id", id))

    fun limparTudo(context: Context): Boolean {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return false
        return SupabaseRest.delete(context, "watch_history", SupabaseRest.eq("user_id", uid))
    }

    private fun isoAgora(): String {
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            return java.time.Instant.now().toString()
        }
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return fmt.format(java.util.Date())
    }

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

    // ─────────────────────── Regras de progresso (watchProgress.ts) ───────────────────────

    private const val MIN_PROGRESS_SECONDS = 600
    private const val MIN_PROGRESS_PCT = 30
    private const val MAX_RESUME_PCT = 95

    /** O registro representa progresso REAL (merece "continuar assistindo")? */
    fun temProgressoReal(positionSeconds: Int, durationSeconds: Int): Boolean {
        val pos = positionSeconds
        val dur = durationSeconds
        if (pos <= 0) return false
        if (dur > 0 && pos.toDouble() / dur.toDouble() >= MAX_RESUME_PCT / 100.0) return false
        if (pos >= MIN_PROGRESS_SECONDS) return true
        if (dur > 0 && pos.toDouble() / dur.toDouble() >= MIN_PROGRESS_PCT / 100.0) return true
        return false
    }

    /** Progresso "lixo" (gravado por engano ao abrir o player) — nunca exibir. */
    fun ehProgressoLixo(positionSeconds: Int, durationSeconds: Int): Boolean =
        positionSeconds <= 0 || durationSeconds <= 0

    /** % concluído (0–100) para a barra de progresso nos cards. */
    fun progressoPercentual(positionSeconds: Int, durationSeconds: Int): Int {
        if (durationSeconds <= 0) return 0
        val pct = (positionSeconds.toDouble() / durationSeconds.toDouble()) * 100.0
        return pct.toInt().coerceIn(0, 100)
    }
}
