package com.movieflix.tv

import android.content.Context
import kotlinx.serialization.json.Json

/**
 * Carrega o catálogo a partir dos JSONs embutidos no APK
 * (filmes.json + series.json — mesma fonte usada pelo site).
 * 100% offline: nenhuma dependência do site para navegar o catálogo.
 */
object CatalogRepository {

    private val json = Json { ignoreUnknownKeys = true }

    @Volatile
    private var cache: List<Movie>? = null

    fun all(context: Context): List<Movie> {
        cache?.let { return it }
        val filmes = read(context, "filmes.json")
        val series = read(context, "series.json")
        val lista = filmes + series
        cache = lista
        return lista
    }

    fun filmes(context: Context): List<Movie> = all(context).filter { !it.ehSerie }
    fun series(context: Context): List<Movie> = all(context).filter { it.ehSerie }

    /** Categorias presentes no catálogo, ordenadas por quantidade (maiores primeiro). */
    fun categorias(context: Context): List<String> {
        val contagem = LinkedHashMap<String, Int>()
        for (m in all(context)) {
            for (c in m.categorias) {
                contagem[c] = (contagem[c] ?: 0) + 1
            }
        }
        return contagem.entries.sortedByDescending { it.value }.map { it.key }
    }

    fun porCategoria(context: Context, categoria: String): List<Movie> =
        all(context).filter { it.categorias.contains(categoria) }

    fun buscar(context: Context, termo: String): List<Movie> {
        val t = termo.trim().lowercase()
        if (t.isEmpty()) return emptyList()
        return all(context).filter { it.title.lowercase().contains(t) }
            .sortedByDescending { it.vote_average }
            .take(50)
    }

    fun porId(context: Context, id: String): Movie? =
        all(context).firstOrNull { it.id == id }

    private fun read(context: Context, nome: String): List<Movie> {
        val raw = context.assets.open(nome).bufferedReader().use { it.readText() }
        return json.decodeFromString<List<Movie>>(raw)
    }
}
