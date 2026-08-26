package com.movieflix.tv

import kotlinx.serialization.Serializable

/** Item do catálogo MovieFlix (espelha filmes.json / series.json). */
@Serializable
data class Movie(
    val id: String,
    val title: String,
    val description: String = "",
    val poster_url: String = "",
    val backdrop_url: String = "",
    val video_url: String = "",
    val player: String = "",
    val vote_average: Double = 0.0,
    val category: String = "",
    val language: String = "",
    val quality: String = "",
    val type: String = "movie",
    val media_type: String = "",
    val tmdb_id: String? = null,
    val year: String? = null,
    val duration: String? = null,
    val seasons: Int? = null,
    val episodes: Int? = null,
    val episodes_available: List<String> = emptyList(),
    val dublado_ptbr: Boolean? = null,
) {
    val ehSerie: Boolean
        get() = type.equals("series", true) || type.equals("serie", true) || type.equals("tv", true)

    val categorias: List<String>
        get() = category.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            .ifEmpty { listOf("Outros") }

    val nota: String
        get() = if (vote_average > 0) "%.1f".format(vote_average) else "—"

    val ano: String
        get() = year ?: ""

    /** URL do embed (fonte de verdade do catálogo). */
    val embedUrl: String
        get() = if (video_url.isNotBlank()) video_url else player

    /** Rótulo de qualidade (ou tipo, quando não informada). */
    fun qualidade(): String = if (quality.isNotBlank()) quality else if (ehSerie) "Série" else "Filme"
}
