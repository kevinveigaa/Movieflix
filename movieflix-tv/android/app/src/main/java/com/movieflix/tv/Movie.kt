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
    val tmdb_id: Long? = null,
    val year: String? = null,
    val duration: Long? = null,
    val seasons: Int? = null,
    val episodes: Int? = null,
    val episodes_available: List<String> = emptyList(),
    val dublado_ptbr: Boolean? = null,
    /** Campos extras do MESMO catálogo, usados para ordenar lançamentos/populares. */
    val popularity: Double = 0.0,
    val release_date: String? = null,
) {
    val ehSerie: Boolean
        get() = type.equals("series", true) || type.equals("serie", true) || type.equals("tv", true)

    val tmdbIdNumerico: Long?
        get() = tmdb_id ?: id.toLongOrNull()

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

    /** Ano numérico (0 quando ausente) — usado para ordenar "Lançamentos". */
    val anoNumerico: Int
        get() = (year ?: release_date?.take(4))?.toIntOrNull() ?: 0

    companion object {
        /**
         * Gênero PT-BR → gênero do catálogo.
         *
         * O catálogo guarda `category` em português ("Ação, Aventura"), mas a API
         * pública de gêneros (usada pelas LINHAS por gênero da Home, paridade com o
         * site) devolve os nomes em inglês. Este mapa traduz um no outro — os DADOS
         * continuam vindo do mesmo catálogo e do mesmo endpoint; nada é inventado.
         */
        val CATEGORIAS: Map<String, String> = mapOf(
            "Action" to "Ação",
            "Adventure" to "Aventura",
            "Animation" to "Animação",
            "Comedy" to "Comédia",
            "Crime" to "Crime",
            "Documentary" to "Documentário",
            "Drama" to "Drama",
            "Family" to "Família",
            "Fantasy" to "Fantasia",
            "History" to "História",
            "Horror" to "Terror",
            "Music" to "Música",
            "Mystery" to "Mistério",
            "Romance" to "Romance",
            "Science Fiction" to "Ficção científica",
            "TV Movie" to "Cinema TV",
            "Thriller" to "Suspense",
            "War" to "Guerra",
            "Western" to "Faroeste",
        )
    }
}
