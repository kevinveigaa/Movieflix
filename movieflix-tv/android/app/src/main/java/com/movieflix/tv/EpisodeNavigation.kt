package com.movieflix.tv

/**
 * Navegação entre EPISÓDIOS (anterior / próximo) — lógica PURA.
 *
 * Por que existe:
 *
 *  1. O player já sabia ir para o PRÓXIMO episódio, mas não tinha como voltar
 *     um episódio. O pedido exige os DOIS botões ("EPISÓDIO ANTERIOR e PRÓXIMO
 *     EPISÓDIO"), respeitando temporada/episódio/ordem e salvando o progresso
 *     ao trocar.
 *
 *  2. A decisão de qual é o episódio seguinte tem três casos que o código
 *     anterior resolvia espalhado pela Activity:
 *       · existe um episódio maior NESTA temporada → é ele;
 *       · senão, existe uma temporada posterior → o PRIMEIRO episódio dela
 *         (menor número), nunca o último;
 *       · senão, não há próximo.
 *     O anterior é o espelho disso e ainda não existia.
 *
 *  A decisão fica aqui, isolada e coberta por EpisodeNavigationTest, para a
 *  Activity apenas aplicar o resultado (`reiniciar`), salvando o progresso
 *  atual antes de trocar — exatamente como o mobile faz.
 *
 *  Nada é inventado: as temporadas e os episódios vêm de
 *  `MediaCatalog.temporadas()` / `MediaCatalog.episodios()`, que interpretam o
 *  campo real `episodes_available` do catálogo (mesma fonte do site/mobile).
 */
object EpisodeNavigation {

    /** Temporada + episódio destino. */
    data class Par(val season: Int, val episode: Int)

    /**
     * PRÓXIMO episódio, ou `null` se este for o último da série.
     *
     * @param temporadas     temporadas existentes (ordenadas, do catálogo).
     * @param epsDaTemporada episódios da temporada onde o usuário está AGORA.
     * @param epsDestino     episódios da temporada para onde o salto levaria
     *                       (só é consultado ao virar de temporada).
     */
    fun proximo(
        temporadas: List<Int>,
        epsDaTemporada: List<Int>,
        season: Int,
        episode: Int,
        epsDestino: List<Int> = emptyList(),
    ): Par? {
        // 1) Ainda há episódio depois deste, na MESMA temporada.
        val proxNaTemporada = epsDaTemporada.filter { it > episode }.minOrNull()
        if (proxNaTemporada != null) return Par(season, proxNaTemporada)

        // 2) Fim da temporada: salta para a PRÓXIMA temporada existente e usa o
        //    PRIMEIRO episódio dela (nunca o último — era o defeito do código
        //    antigo, que assumia que o maior número era o começo).
        val proxTemporada = temporadas.filter { it > season }.minOrNull() ?: return null
        return Par(proxTemporada, epsDestino.minOrNull() ?: 1)
    }

    /**
     * EPISÓDIO ANTERIOR, ou `null` se este for o primeiro da série.
     *
     * Espelho exato de [proximo]: ao voltar do primeiro episódio da temporada,
     * vai para a temporada ANTERIOR existente e usa o ÚLTIMO episódio dela.
     */
    fun anterior(
        temporadas: List<Int>,
        epsDaTemporada: List<Int>,
        season: Int,
        episode: Int,
        epsDestino: List<Int> = emptyList(),
    ): Par? {
        // 1) Ainda há episódio antes deste, na MESMA temporada.
        val antNaTemporada = epsDaTemporada.filter { it < episode }.maxOrNull()
        if (antNaTemporada != null) return Par(season, antNaTemporada)

        // 2) Começo da temporada: volta para a temporada ANTERIOR existente e
        //    usa o ÚLTIMO episódio dela.
        val antTemporada = temporadas.filter { it < season }.maxOrNull() ?: return null
        return Par(antTemporada, epsDestino.maxOrNull() ?: 1)
    }
}
