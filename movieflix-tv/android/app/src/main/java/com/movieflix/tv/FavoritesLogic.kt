package com.movieflix.tv

/**
 * Lógica PURA dos Favoritos — a parte que decidiu o bug relatado.
 *
 * Sintoma: "clicar várias vezes em FAVORITOS adiciona o mesmo conteúdo várias vezes".
 *
 * Causa (provada pelo código anterior + pelo fluxo do site):
 *
 *  1. `DetailsActivity.alternarLista()` decidia o que fazer lendo o campo `naLista`,
 *     que é uma variável de ESTADO DA TELA. Ela só era atualizada DEPOIS que a
 *     requisição terminava (`if (ok) { naLista = !naLista }`). Com o controle remoto
 *     é trivial apertar OK duas ou três vezes antes da resposta chegar — cada
 *     clique enxergava `naLista == false` e disparava um INSERT. Resultado: 2, 3, N
 *     linhas iguais em `favorites`.
 *
 *  2. `FavoritesRepository.adicionar()` fazia INSERT direto, sem conferir se o
 *     título já estava salvo. O site (`src/hooks/useFavorite.ts`) sempre confere a
 *     linha antes (`if (row) delete else insert`) — a TV não conferia.
 *
 *  3. Nada deduplicava a leitura: `listarResultado()` devolvia todas as linhas, então
 *     o mesmo título aparecia várias vezes na tela Favoritos.
 *
 * Aqui ficam as três regras, isoladas e testáveis (FavoritesLogicTest).
 */
object FavoritesLogic {

    /** Linha crua de `favorites` usada para deduplicar (equivale a FavoritesRepository.Favorito). */
    data class Linha(val id: String?, val tmdbId: Long, val mediaType: String)

    /**
     * Ação a executar — decidida pelo ESTADO REAL (a linha existe no banco?),
     * nunca pelo estado da tela.
     */
    enum class Acao { ADICIONAR, REMOVER, IGNORAR }

    /**
     * Decide o que fazer a partir do estado REAL do servidor.
     *
     * @param jaNoServidor a linha do título já existe em `favorites`?
     * @param travado      há uma operação em andamento para este título? (guarda
     *                     anti-duplo-toque: enquanto true, cliques são ignorados)
     * @param podeEscrever sessão válida + TMDb numérico presente?
     */
    fun decidir(jaNoServidor: Boolean, travado: Boolean, podeEscrever: Boolean): Acao = when {
        !podeEscrever -> Acao.IGNORAR
        travado -> Acao.IGNORAR
        jaNoServidor -> Acao.REMOVER
        else -> Acao.ADICIONAR
    }

    /**
     * Mantém UMA única linha por título, preservando a ordem de chegada.
     *
     * A lista chega ordenada por `created_at desc`, então a PRIMEIRA ocorrência de
     * cada (media_type, tmdb_id) é a mais recente — é ela que fica. Assim o título
     * aparece exatamente uma vez na tela Favoritos mesmo que o banco já tenha
     * duplicatas antigas.
     */
    fun deduplicar(linhas: List<Linha>): List<Linha> {
        val vistas = HashSet<String>()
        val saida = ArrayList<Linha>(linhas.size)
        for (l in linhas) {
            val chave = chave(l.mediaType, l.tmdbId)
            if (vistas.add(chave)) saida.add(l)
        }
        return saida
    }

    /**
     * Todas as linhas do mesmo título, para REMOÇÃO.
     *
     * Remover só a primeira deixaria as duplicatas antigas no banco: o título
     * continuaria aparecendo nos Favoritos e o botão voltaria para "favoritado"
     * logo depois de remover. Por isso o `remover` apaga todas.
     */
    fun linhasDoTitulo(linhas: List<Linha>, tmdbId: Long, mediaType: String?): List<Linha> =
        linhas.filter { it.tmdbId == tmdbId && (mediaType == null || it.mediaType == mediaType) }

    fun chave(mediaType: String, tmdbId: Long): String = "${mediaType.lowercase()}#$tmdbId"

    /**
     * Estado visual do botão. Deixa explícito o que o pedido exige:
     *  - não favoritado → "♡  Favoritos" (botão normal);
     *  - favoritado     → "♥  Remover dos Favoritos" com destaque amarelo
     *                     (a mesma cor da nota ★ do MovieFlix).
     */
    data class EstadoBotao(val rotulo: String, val cor: Int, val fundo: Int)

    fun estadoBotao(favoritado: Boolean, corNormal: Int, corAtivo: Int, fundoAtivo: Int): EstadoBotao =
        if (favoritado) {
            EstadoBotao("♥  Remover dos Favoritos", corAtivo, fundoAtivo)
        } else {
            EstadoBotao("♡  Favoritos", corNormal, 0)
        }
}
