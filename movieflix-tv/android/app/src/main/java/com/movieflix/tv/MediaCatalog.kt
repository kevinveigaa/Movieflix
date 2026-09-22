package com.movieflix.tv

/**
 * Helpers do catalogo de midia — temporadas/episodios.
 *
 * O catalogo MovieFlix descreve os episodios disponiveis em
 * `episodes_available` (ex.: ["1/1","1/2","2/1"]), o MESMO campo que o site
 * consome para montar a URL do embed. Nada e inventado.
 */
object MediaCatalog {

    fun temporadas(movie: Movie): List<Int> =
        movie.episodes_available.mapNotNull { it.substringBefore("/").toIntOrNull() }
            .filter { it > 0 }
            .distinct()
            .sorted()
            .ifEmpty { listOf(1) }

    fun episodios(movie: Movie, temporada: Int): List<Int> =
        movie.episodes_available.mapNotNull {
            val p = it.split("/")
            val s = p.getOrNull(0)?.toIntOrNull() ?: return@mapNotNull null
            val e = p.getOrNull(1)?.toIntOrNull() ?: return@mapNotNull null
            if (s == temporada && e > 0) e else null
        }.distinct().sorted().ifEmpty { listOf(1) }

    fun rotuloEpisodio(season: Int?, episode: Int?): String {
        if (season == null && episode == null) return ""
        return "T${season ?: 1} • E${episode ?: 1}"
    }

    /**
     * Monta a URL do embed — MESMA regra do site/mobile:
     *  - serie: https://streambetter.shop/serie/{tmdbId}/{temporada}/{episodio}
     *  - filme: https://streambetter.shop/filme/{tmdbId}
     * A chave publica do plano Creator e SEMPRE anexada (e o que faz o provedor
     * devolver as fontes do video).
     */
    fun embedUrl(movie: Movie, temporada: Int?, episodio: Int?): String {
        if (movie.ehSerie) {
            val tmdb = movie.tmdbIdNumerico ?: return ""
            val s = (temporada ?: 1).coerceAtLeast(1)
            val e = (episodio ?: 1).coerceAtLeast(1)
            return AppConfig.comChaveStreamBetter("${AppConfig.STREAMBETTER_BASE}/serie/$tmdb/$s/$e")
        }
        val tmdb = movie.tmdbIdNumerico
        if (tmdb != null) return AppConfig.comChaveStreamBetter("${AppConfig.STREAMBETTER_BASE}/filme/$tmdb")
        if (movie.video_url.isNotBlank()) return AppConfig.comChaveStreamBetter(movie.video_url)
        return ""
    }
}
