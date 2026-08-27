package com.movieflix.tv

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Catálogo MovieFlix (filmes.json + series.json — mesma fonte do site).
 *
 * Estratégia leve e resiliente:
 *  1. Assets embutidos no APK (navegação instantânea, funciona offline).
 *  2. Em background, tenta baixar a versão ATUAL do backend oficial e guarda
 *     em cache no disco — nas próximas aberturas usa o cache se mais novo.
 *  3. Nenhum processo em background: a atualização roda apenas na primeira
 *     leitura de cada execução do app (uma única chamada assíncrona).
 */
object CatalogRepository {

    private val json = Json { ignoreUnknownKeys = true }

    @Volatile
    private var cache: List<Movie>? = null

    private const val FILMES_URL = "https://movieflix-bszf.onrender.com/filmes/filmes.json"
    private const val SERIES_URL = "https://movieflix-bszf.onrender.com/filmes/series.json"
    private const val CACHE_FILE = "catalogo_v1.json"

    fun all(context: Context): List<Movie> {
        cache?.let { return it }
        val lista = carregar(context)
        cache = lista
        return lista
    }

    fun filmes(context: Context): List<Movie> = all(context).filter { !it.ehSerie }
    fun series(context: Context): List<Movie> = all(context).filter { it.ehSerie }

    /** Categorias presentes, ordenadas por quantidade (maiores primeiro). */
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

    fun porAno(context: Context, ano: Int): List<Movie> =
        all(context).filter { (it.year ?: "").toIntOrNull() == ano }

    fun buscar(context: Context, termo: String): List<Movie> {
        val t = termo.trim().lowercase()
        if (t.isEmpty()) return emptyList()
        return all(context)
            .filter { it.title.lowercase().contains(t) || it.categorias.any { c -> c.lowercase().contains(t) } }
            .sortedByDescending { it.vote_average }
            .take(80)
    }

    fun porId(context: Context, id: String): Movie? =
        all(context).firstOrNull { it.id == id }

    // ---- carregamento ----

    private fun carregar(context: Context): List<Movie> {
        // 1) cache em disco (atualizado pelo backend em execuções anteriores)
        val disco = File(context.filesDir, CACHE_FILE)
        if (disco.exists()) {
            val m = lerArquivo(disco)
            if (m != null) return m
        }
        // 2) assets embutidos
        val assets = lerAssets(context)
        if (assets != null) return assets
        // 3) último recurso: lista vazia (não quebra o app)
        return emptyList()
    }

    private fun lerAssets(context: Context): List<Movie>? = try {
        val filmes = context.assets.open("filmes.json").bufferedReader().use { it.readText() }
        val series = context.assets.open("series.json").bufferedReader().use { it.readText() }
        json.decodeFromString<List<Movie>>(filmes) + json.decodeFromString<List<Movie>>(series)
    } catch (e: Exception) {
        null
    }

    private fun lerArquivo(f: File): List<Movie>? = try {
        json.decodeFromString<List<Movie>>(f.readText())
    } catch (e: Exception) {
        null
    }

    /**
     * Atualização silenciosa do catálogo a partir do backend oficial.
     * Chamada UMA vez por execução (a partir da Home). Nunca bloqueia a UI.
     */
    suspend fun atualizarSeNecessario(context: Context) {
        val disco = File(context.filesDir, CACHE_FILE)
        // só atualiza 1x por dia (economiza dados em TVs com internet limitada)
        if (disco.exists() && System.currentTimeMillis() - disco.lastModified() < 86_400_000L) return

        val atualizados = withContext(Dispatchers.IO) { baixarAtual() }
        if (atualizados != null) {
            try {
                disco.writeText(json.encodeToString(kotlinx.serialization.builtins.ListSerializer(Movie.serializer()), atualizados))
                cache = atualizados
            } catch (e: Exception) {
                // cache falhou, segue com o que tem
            }
        }
    }

    private fun baixarAtual(): List<Movie>? {
        val filmes = baixarJson(FILMES_URL) ?: return null
        val series = baixarJson(SERIES_URL) ?: return null
        return try {
            json.decodeFromString<List<Movie>>(filmes) + json.decodeFromString<List<Movie>>(series)
        } catch (e: Exception) {
            null
        }
    }

    private fun baixarJson(urlStr: String): String? {
        return try {
            val conn = URL(urlStr).openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("User-Agent", "MovieFlixTV/1.2")
            if (conn.responseCode != 200) {
                conn.disconnect()
                return null
            }
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            body
        } catch (e: IOException) {
            null
        }
    }
}
