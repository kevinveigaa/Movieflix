package com.movieflix.tv

import android.content.Context
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Catalogo MovieFlix (filmes.json + series.json — mesma fonte do site).
 *
 * Estrategia: assets embutidos no APK (instantaneo/offline) + atualizacao
 * silenciosa a partir do backend oficial, guardada em cache de disco.
 */
object CatalogRepository {

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    @Volatile private var cache: List<Movie>? = null
    @Volatile private var generosCache: List<String>? = null

    private const val FILMES_URL = "${AppConfig.SITE_URL}/filmes/filmes.light.json"
    private const val SERIES_URL = "${AppConfig.SITE_URL}/filmes/series.light.json"
    private const val GENEROS_URL = "${AppConfig.SITE_URL}/api/tmdb/generos?tipo=filme"
    private const val CACHE_FILE = "catalogo_v4.json"

    fun all(ctx: Context): List<Movie> {
        cache?.let { return it }
        val lista = carregar(ctx)
        cache = lista
        return lista
    }

    fun filmes(ctx: Context): List<Movie> = all(ctx).filter { !it.ehSerie }
    fun series(ctx: Context): List<Movie> = all(ctx).filter { it.ehSerie }

    fun categorias(ctx: Context): List<String> {
        val contagem = LinkedHashMap<String, Int>()
        for (m in all(ctx)) for (c in m.categorias) contagem[c] = (contagem[c] ?: 0) + 1
        return contagem.entries.sortedByDescending { it.value }.map { it.key }
    }

    fun porCategoria(ctx: Context, categoria: String): List<Movie> =
        all(ctx).filter { it.categorias.contains(categoria) }

    /** Linhas da Home derivadas do catalogo real (sem dados ficticios). */
    fun lancamentos(ctx: Context): List<Movie> = all(ctx).sortedByDescending { it.anoNumerico }.take(40)
    fun populares(ctx: Context): List<Movie> = all(ctx).sortedByDescending { it.popularity }.take(40)
    fun melhorAvaliados(ctx: Context): List<Movie> = all(ctx).filter { it.vote_average > 0 }
        .sortedByDescending { it.vote_average }.take(40)

    fun buscar(ctx: Context, termo: String): List<Movie> {
        val t = termo.trim().lowercase()
        if (t.isEmpty()) return emptyList()
        return all(ctx)
            .filter { it.title.lowercase().contains(t) || it.categorias.any { c -> c.lowercase().contains(t) } }
            .sortedByDescending { it.vote_average }
            .take(300)
    }

    fun porId(ctx: Context, id: String): Movie? = all(ctx).firstOrNull { it.id == id }

    fun porTmdb(ctx: Context, tmdbId: Long): Movie? =
        all(ctx).firstOrNull { it.tmdbIdNumerico == tmdbId }

    fun generosFilme(): List<String> {
        generosCache?.let { return it }
        val texto = baixarJson(GENEROS_URL) ?: return emptyList()
        val lista = try {
            val arr = org.json.JSONArray(texto)
            (0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.optString("name")?.takeIf { it.isNotBlank() } }
        } catch (_: Exception) { emptyList() }
        generosCache = lista
        return lista
    }

    // ---- carregamento ----

    private fun carregar(ctx: Context): List<Movie> {
        val disco = File(ctx.filesDir, CACHE_FILE)
        if (disco.exists()) lerArquivo(disco)?.let { return it }
        lerAssets(ctx)?.let { return it }
        return emptyList()
    }

    private fun lerAssets(ctx: Context): List<Movie>? = try {
        val filmes = ctx.assets.open("filmes.json").bufferedReader().use { it.readText() }
        val series = ctx.assets.open("series.json").bufferedReader().use { it.readText() }
        decodificarTolerante(filmes) + decodificarTolerante(series)
    } catch (_: Exception) { null }

    private fun lerArquivo(f: File): List<Movie>? = try {
        decodificarTolerante(f.readText())
    } catch (_: Exception) { null }

    /** Decodifica tolerante: itens invalidos sao descartados, nao derrubam tudo. */
    private fun decodificarTolerante(texto: String): List<Movie> {
        val arr = try { json.parseToJsonElement(texto).jsonArray } catch (_: Exception) { return emptyList() }
        val out = ArrayList<Movie>(arr.size)
        for (el in arr) {
            try { out.add(json.decodeFromJsonElement(Movie.serializer(), el)) } catch (_: Exception) { }
        }
        return out
    }

    /** Atualizacao silenciosa (1x por dia). */
    fun atualizarSeNecessario(ctx: Context) {
        val disco = File(ctx.filesDir, CACHE_FILE)
        if (disco.exists() && System.currentTimeMillis() - disco.lastModified() < 86_400_000L) return
        val atualizados = baixarAtual() ?: return
        try {
            disco.writeText(json.encodeToString(
                kotlinx.serialization.builtins.ListSerializer(Movie.serializer()), atualizados,
            ))
            cache = atualizados
        } catch (_: Exception) { }
    }

    private fun baixarAtual(): List<Movie>? {
        val filmes = baixarJson(FILMES_URL) ?: return null
        val series = baixarJson(SERIES_URL) ?: return null
        return decodificarTolerante(filmes) + decodificarTolerante(series)
    }

    private fun baixarJson(urlStr: String): String? {
        return try {
            val conn = URL(urlStr).openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("User-Agent", "MovieFlixTV/4.0")
            if (conn.responseCode != 200) {
                conn.disconnect()
                return null
            }
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            body
        } catch (_: Exception) { null }
    }
}
