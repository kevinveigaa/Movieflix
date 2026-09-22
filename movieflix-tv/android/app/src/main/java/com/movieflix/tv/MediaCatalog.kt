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
        // ── FILME: paridade EXATA com o mobile/site ──────────────────────────
        // A fonte primária é SEMPRE o embed OFICIAL montado a partir do
        // `tmdb_id`, com a chave pública do plano Creator — é o que
        // `buildStreamBetterMovieUrl()` faz no site (src/lib/streamEmbed.ts).
        //
        // O site/mobile NUNCA usam a `video_url` do catálogo como fonte
        // primária do player: eles montam `streambetter.shop/filme/{tmdb_id}`
        // e anexam a chave. Era essa a última diferença entre os dois fluxos —
        // a `video_url` do catálogo pode não trazer a chave, e sem ela o
        // provedor não reconhece a conta Creator, devolve o HTML sem `sources`
        // e a TV ficava presa na verificação enquanto o MESMO título abria no
        // celular. A `video_url` fica apenas como último recurso, quando o
        // título não tem `tmdb_id` (e recebe a chave se ainda não tiver).
        val tmdb = movie.tmdbIdNumerico
        if (tmdb != null) {
            return AppConfig.comChaveStreamBetter("${AppConfig.STREAMBETTER_BASE}/filme/$tmdb")
        }
        if (movie.video_url.isNotBlank()) return AppConfig.comChaveStreamBetter(movie.video_url)
        return ""
    }
}
