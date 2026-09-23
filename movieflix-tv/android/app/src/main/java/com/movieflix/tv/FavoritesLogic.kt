package com.movieflix.tv

/**
 * Logica PURA dos Favoritos.
 *
 * O bug historico era: clicar varias vezes em FAVORITOS adicionava o mesmo
 * conteudo varias vezes, porque a decisao era tomada pelo estado DA TELA (que
 * so atualizava depois da resposta). Aqui a decisao passa a depender do ESTADO
 * REAL do servidor, com guarda anti-duplo-toque, e a leitura deduplica.
 */
object FavoritesLogic {

    data class Linha(val id: String?, val tmdbId: Long, val mediaType: String)

    enum class Acao { ADICIONAR, REMOVER, IGNORAR }

    fun decidir(jaNoServidor: Boolean, travado: Boolean, podeEscrever: Boolean): Acao = when {
        !podeEscrever -> Acao.IGNORAR
        travado -> Acao.IGNORAR
        jaNoServidor -> Acao.REMOVER
        else -> Acao.ADICIONAR
    }

    /** Mantem UMA unica linha por titulo, preservando a ordem de chegada. */
    fun deduplicar(linhas: List<Linha>): List<Linha> {
        val vistas = HashSet<String>()
        val saida = ArrayList<Linha>(linhas.size)
        for (l in linhas) {
            if (vistas.add(chave(l.mediaType, l.tmdbId))) saida.add(l)
        }
        return saida
    }

    fun linhasDoTitulo(linhas: List<Linha>, tmdbId: Long, mediaType: String?): List<Linha> =
        linhas.filter { it.tmdbId == tmdbId && (mediaType == null || it.mediaType == mediaType) }

    fun chave(mediaType: String, tmdbId: Long): String = "${mediaType.lowercase()}#$tmdbId"

    data class EstadoBotao(val rotulo: String, val cor: Int, val fundo: Int)

    fun estadoBotao(favoritado: Boolean, corNormal: Int, corAtivo: Int, fundoAtivo: Int): EstadoBotao =
        if (favoritado) EstadoBotao("♥  Remover dos Favoritos", corAtivo, fundoAtivo)
        else EstadoBotao("♡  Favoritos", corNormal, 0)
}
