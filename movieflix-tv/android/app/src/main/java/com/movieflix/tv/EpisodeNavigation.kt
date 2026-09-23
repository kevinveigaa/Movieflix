package com.movieflix.tv

/**
 * Navegacao entre EPISODIOS (anterior / proximo) — logica PURA.
 *
 * O player precisa acertar com o controle remoto:
 *  - existe episodio maior NESTA temporada -> e ele;
 *  - senao, existe temporada posterior -> o PRIMEIRO episodio dela
 *    (menor numero), nunca o ultimo;
 *  - senao, nao ha proximo. O anterior e o espelho disso.
 */
object EpisodeNavigation {

    data class Par(val season: Int, val episode: Int)

    fun proximo(
        temporadas: List<Int>,
        epsDaTemporada: List<Int>,
        season: Int,
        episode: Int,
        epsDestino: List<Int> = emptyList(),
    ): Par? {
        val proxNaTemporada = epsDaTemporada.filter { it > episode }.minOrNull()
        if (proxNaTemporada != null) return Par(season, proxNaTemporada)
        val proxTemporada = temporadas.filter { it > season }.minOrNull() ?: return null
        return Par(proxTemporada, epsDestino.minOrNull() ?: 1)
    }

    fun anterior(
        temporadas: List<Int>,
        epsDaTemporada: List<Int>,
        season: Int,
        episode: Int,
        epsDestino: List<Int> = emptyList(),
    ): Par? {
        val antNaTemporada = epsDaTemporada.filter { it < episode }.maxOrNull()
        if (antNaTemporada != null) return Par(season, antNaTemporada)
        val antTemporada = temporadas.filter { it < season }.maxOrNull() ?: return null
        return Par(antTemporada, epsDestino.maxOrNull() ?: 1)
    }
}
