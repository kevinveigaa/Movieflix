package com.movieflix.tv

/**
 * JANELAMENTO (windowing) do catalogo na TV.
 *
 * O catalogo MovieFlix e o MESMO do site: ~18.000 filmes e ~8.000 series.
 * O site pagina a exibicao; a TV precisa fazer igual. Montar TODOS os cards de
 * uma vez (dezenas de milhares de Views + dezenas de milhares de requisicoes de
 * imagem) trava a UI thread: a tela fica em branco e os cards nunca pintam —
 * e exatamente o sintoma de "os filmes e as series nao aparecem".
 *
 * Nada e inventado aqui: sao apenas recortes da mesma lista real.
 * Estas funcoes sao puras e cobertas por CatalogoJanelaTest.
 */
object CatalogoJanela {

    /** Itens adicionados por vez na grade de Filmes/Series. */
    const val TAMANHO_PAGINA = 60

    /** Teto de cards por linha horizontal (Home/carrosseis). */
    const val MAX_POR_LINHA = 40

    /** Teto de linhas de categoria montadas na Home. */
    const val MAX_LINHAS_CATEGORIA = 8

    /** Teto de resultados da busca (o site usa fuzzy + lista curta). */
    const val MAX_RESULTADOS_BUSCA = 120

    /** Recorte de uma pagina (zero-based) da lista. */
    fun <T> pagina(itens: List<T>, pagina: Int): List<T> {
        if (pagina < 0) return emptyList()
        val inicio = pagina * TAMANHO_PAGINA
        if (inicio >= itens.size) return emptyList()
        val fim = (inicio + TAMANHO_PAGINA).coerceAtMost(itens.size)
        return itens.subList(inicio, fim)
    }

    /** Ainda ha itens depois dos `jaExibidos` ja mostrados? */
    fun temMais(total: Int, jaExibidos: Int): Boolean = jaExibidos < total

    /**
     * Numero de colunas da grade a partir da largura REAL da tela.
     * Funciona em 720p, 1080p e 4K sem constante magica.
     */
    fun colunas(larguraPx: Int, cardPx: Int, vaoPx: Int, padPx: Int): Int {
        if (cardPx <= 0) return 6
        val util = larguraPx - padPx * 2
        val porColuna = cardPx + vaoPx
        if (porColuna <= 0) return 6
        return (util / porColuna).coerceIn(3, 8)
    }
}
