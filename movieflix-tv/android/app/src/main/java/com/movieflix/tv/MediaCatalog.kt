package com.movieflix.tv

/**
 * Helpers do catálogo de mídia — temporadas/episódios.
 *
 * O catálogo MovieFlix descreve os episódios disponíveis no campo
 * `episodes_available` (ex.: ["1/1","1/2","2/1"]), exatamente como o site
 * consome em `src/lib/streamEmbed.ts` para montar a URL do embed.
 * Nada é inventado: só interpretamos o campo que já existe.
 */
object MediaCatalog {

    /** Lista de temporadas presentes (ordenada). */
    fun temporadas(movie: Movie): List<Int> =
        movie.episodes_available.mapNotNull { it.substringBefore("/").toIntOrNull() }
            .filter { it > 0 }
            .distinct()
            .sorted()
            .ifEmpty { listOf(1) }

    /** Episódios de uma temporada (ordenados). */
    fun episodios(movie: Movie, temporada: Int): List<Int> =
        movie.episodes_available.mapNotNull {
            val p = it.split("/")
            val s = p.getOrNull(0)?.toIntOrNull() ?: return@mapNotNull null
            val e = p.getOrNull(1)?.toIntOrNull() ?: return@mapNotNull null
            if (s == temporada && e > 0) e else null
        }.distinct().sorted().ifEmpty { listOf(1) }

    /** Rótulo do episódio (T2 • E5) — usado no histórico e nos cards. */
    fun rotuloEpisodio(season: Int?, episode: Int?): String {
        if (season == null && episode == null) return ""
        val s = season ?: 1
        val e = episode ?: 1
        return "T$s • E$e"
    }

    /**
     * Monta a URL do embed do título — MESMA regra do site/mobile:
     *  - série:  https://streambetter.shop/serie/{tmdbId}/{temporada}/{episodio}?lang=pt-BR
     *  - filme:  video_url do catálogo (ou .../filme/{tmdbId}?lang=pt-BR)
     */
    fun embedUrl(movie: Movie, temporada: Int?, episodio: Int?): String {
        // A chave pública do plano Creator é SEMPRE anexada — é o que faz o
        // provedor reconhecer a conta e devolver as fontes do vídeo (mesma
        // regra do site/mobile em src/lib/streamEmbed.ts).
        if (movie.ehSerie) {
            val tmdb = movie.tmdbIdNumerico ?: return ""
            val s = (temporada ?: 1).coerceAtLeast(1)
            val e = (episodio ?: 1).coerceAtLeast(1)
            return AppConfig.comChaveStreamBetter(
                "${AppConfig.STREAMBETTER_BASE}/serie/$tmdb/$s/$e",
            )
        }
        // Filme: o catálogo já traz a video_url completa; se não trouxer, é
        // montada pelo tmdb_id — nos dois casos com a chave anexada.
        if (movie.video_url.isNotBlank()) return AppConfig.comChaveStreamBetter(movie.video_url)
        val tmdb = movie.tmdbIdNumerico ?: return ""
        return AppConfig.comChaveStreamBetter("${AppConfig.STREAMBETTER_BASE}/filme/$tmdb")
    }
}
