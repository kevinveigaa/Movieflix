package com.movieflix.tv

import kotlinx.serialization.Serializable

/** Item do catalogo MovieFlix (espelha filmes.json / series.json do site). */
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
    val tmdb_id: Long? = null,
    val year: String? = null,
    val duration: Long? = null,
    val seasons: Int? = null,
    val episodes: Int? = null,
    val episodes_available: List<String> = emptyList(),
    val dublado_ptbr: Boolean? = null,
    val popularity: Double = 0.0,
    val release_date: String? = null,
) {
    val ehSerie: Boolean
        get() = type.equals("series", true) || type.equals("serie", true) || type.equals("tv", true)

    /** Id numerico do TMDb (campo `tmdb_id` ou o proprio `id`). */
    val tmdbIdNumerico: Long?
        get() = tmdb_id ?: id.toLongOrNull()

    val categorias: List<String>
        get() = category.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            .ifEmpty { listOf("Outros") }

    val nota: String
        get() = if (vote_average > 0) "%.1f".format(vote_average) else "—"

    val anoNumerico: Int
        get() = (year ?: release_date?.take(4))?.toIntOrNull() ?: 0

    val embedUrl: String
        get() = if (video_url.isNotBlank()) video_url else player

    fun qualidade(): String = if (quality.isNotBlank()) quality else if (ehSerie) "Serie" else "Filme"

    companion object {
        /** Genero PT-BR -> genero do catalogo (mesma tabela do site). */
        val CATEGORIAS: Map<String, String> = mapOf(
            "Action" to "Acao",
            "Adventure" to "Aventura",
            "Animation" to "Animacao",
            "Comedy" to "Comedia",
            "Crime" to "Crime",
            "Documentary" to "Documentario",
            "Drama" to "Drama",
            "Family" to "Familia",
            "Fantasy" to "Fantasia",
            "History" to "Historia",
            "Horror" to "Terror",
            "Music" to "Musica",
            "Mystery" to "Misterio",
            "Romance" to "Romance",
            "Science Fiction" to "Ficcao cientifica",
            "TV Movie" to "Cinema TV",
            "Thriller" to "Suspense",
            "War" to "Guerra",
            "Western" to "Faroeste",
        )
    }
}
