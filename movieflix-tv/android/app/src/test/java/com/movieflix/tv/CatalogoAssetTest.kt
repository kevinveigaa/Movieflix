package com.movieflix.tv

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * REPRODUCAO DO BUG DE CATALOGO (Fase 2).
 *
 * Decodifica os MESMOS assets embutidos no APK, com a MESMA configuracao de
 * `Json` usada por CatalogRepository, e conta quantos itens sobrevivem.
 *
 * Se o total decodificado for menor que o total no arquivo, o catalogo chega
 * INCOMPLETO na Home/Filmes/Series — que e exatamente o sintoma relatado.
 *
 * Estes testes NAO usam dados ficticios: leem os assets reais do APK.
 */
class CatalogoAssetTest {

    /** Mesma configuracao de CatalogRepository. */
    private val jsonProducao = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    /** Configuracao apenas descritiva (sem coerção) para medir o impacto. */
    private val jsonEstrito = Json { ignoreUnknownKeys = true }

    private fun achar(nome: String): File {
        var d = File(".").absoluteFile
        while (true) {
            val c1 = File(d, "src/main/assets/$nome")
            if (c1.exists()) return c1
            val c2 = File(d, "app/src/main/assets/$nome")
            if (c2.exists()) return c2
            d = d.parentFile ?: break
        }
        error("asset $nome nao encontrado a partir de ${File(".").absolutePath}")
    }

    /** Conta itens do array raiz (fonte da verdade = o proprio arquivo). */
    private fun totalNoArquivo(nome: String): Int =
        jsonProducao.parseToJsonElement(achar(nome).readText()).jsonArray.size

    /** Decodifica TUDO de uma vez: um campo invalido derruba o arquivo inteiro. */
    private fun decodificarTudo(nome: String, json: Json): Int =
        try {
            json.decodeFromString(ListSerializer(Movie.serializer()), achar(nome).readText()).size
        } catch (_: Exception) {
            -1
        }

    /** Mesma estrategia de CatalogRepository.decodificarTolerante (item a item). */
    private fun decodificarTolerante(nome: String, json: Json): Int {
        val arr = json.parseToJsonElement(achar(nome).readText()).jsonArray
        var ok = 0
        for (el in arr) {
            try {
                json.decodeFromJsonElement(Movie.serializer(), el)
                ok++
            } catch (_: Exception) { }
        }
        return ok
    }

    private fun assets() = listOf("filmes.json", "series.json")

    @Test
    fun `todo o catalogo do asset decodifica com a configuracao de producao`() {
        for (nome in assets()) {
            val total = totalNoArquivo(nome)
            val decodificados = decodificarTolerante(nome, jsonProducao)
            println("[CatalogoAssetTest] $nome total=$total decodificados=$decodificados")
            assertTrue("$nome: arquivo vazio", total > 0)
            assertEquals("$nome: itens perdidos na decodificacao (coercao)", total, decodificados)
        }
    }

    @Test
    fun `decodificar o arquivo inteiro de uma vez nao pode falhar`() {
        for (nome in assets()) {
            val total = totalNoArquivo(nome)
            val decodificados = decodificarTudo(nome, jsonProducao)
            println("[CatalogoAssetTest] $nome (tudo de uma vez) = $decodificados")
            assertEquals("$nome: decode em bloco falhou", total, decodificados)
        }
    }

    @Test
    fun `o catalogo tem filmes e series de verdade`() {
        val filmes = totalNoArquivo("filmes.json")
        val series = totalNoArquivo("series.json")
        println("[CatalogoAssetTest] filmes=$filmes series=$series")
        assertTrue("sem filmes no asset", filmes > 1000)
        assertTrue("sem series no asset", series > 500)
    }

    @Test
    fun `a coercao recupera itens que seriam descartados`() {
        // Mede o papel real da coercao: sem ela, itens com tipo divergente
        // (null em campo nao-anulavel) seriam DESCARTADOS silenciosamente.
        val com = decodificarTolerante("filmes.json", jsonProducao)
        val sem = decodificarTolerante("filmes.json", jsonEstrito)
        println("[CatalogoAssetTest] filmes com coercao=$com sem coercao=$sem")
        assertTrue("a coercao nao pode descartar itens reais", com >= sem)
        assertEquals(
            "com coercao, TODO o catalogo precisa decodificar",
            totalNoArquivo("filmes.json"),
            com,
        )
    }
}
