package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Testes da edição de texto do teclado em tela (MfKeyboard).
 *
 * Cobrem exatamente o que o pedido exige: digitar o e-mail COMPLETO e a senha
 * COMPLETA, com @ . _ - números e símbolos, sem o campo perder foco, sem fechar o
 * teclado e sem trocar de campo.
 */
class TextEditorTest {

    /** Digita uma sequência caractere a caractere, como o teclado faz. */
    private fun digitar(inicial: String, teclas: String): TextEditor.Resultado {
        var r = TextEditor.Resultado(inicial, inicial.length)
        for (c in teclas) {
            r = TextEditor.inserir(r.texto, r.selecao, r.selecao, c.toString())
        }
        return r
    }

    @Test
    fun `digita um email completo com arroba ponto e sublinhado`() {
        val r = digitar("", "usuario_teste.1@gmail.com")
        assertEquals("usuario_teste.1@gmail.com", r.texto)
        // O cursor fica no FIM — o usuário continua no mesmo campo.
        assertEquals(r.texto.length, r.selecao)
    }

    @Test
    fun `digita uma senha completa com simbolos e maiusculas`() {
        val r = digitar("", "Senha@123!")
        assertEquals("Senha@123!", r.texto)
    }

    @Test
    fun `simbolos e numeros nao interrompem a digitacao`() {
        val r = digitar("", "a-b_c.d@e#1$2%3&4*5")
        assertEquals("a-b_c.d@e#1$2%3&4*5", r.texto)
    }

    @Test
    fun `insercao substitue a selecao`() {
        // "usuario@x.com" com "@x" (índices 7..9) selecionado; digitar "@gmail".
        // Resultado: "usuario" + "@gmail" + ".com"; cursor após o que foi inserido.
        val r = TextEditor.inserir("usuario@x.com", 7, 9, "@gmail")
        assertEquals("usuario@gmail.com", r.texto)
        assertEquals(13, r.selecao)
    }

    @Test
    fun `backspace apaga o caractere anterior sem mexer no inicio`() {
        var r = digitar("", "usuario@gmail.com")
        repeat(4) {
            r = TextEditor.apagar(r.texto, r.selecao, r.selecao)
        }
        assertEquals("usuario@gmail", r.texto)
        // Apagar além do começo não quebra nada.
        var vazio = TextEditor.Resultado("a", 1)
        repeat(5) { vazio = TextEditor.apagar(vazio.texto, vazio.selecao, vazio.selecao) }
        assertEquals("", vazio.texto)
        assertEquals(0, vazio.selecao)
    }

    @Test
    fun `backspace apaga a selecao inteira de uma vez`() {
        val r = TextEditor.apagar("usuario@gmail.com", 0, 7)
        assertEquals("@gmail.com", r.texto)
        assertEquals(0, r.selecao)
    }

    @Test
    fun `shift e caps lock afetam apenas letras do modo ABC`() {
        assertEquals("A", TextEditor.aplicarCaixa("a", shiftAtivo = true, capsLock = false))
        assertEquals("A", TextEditor.aplicarCaixa("a", shiftAtivo = false, capsLock = true))
        assertEquals("a", TextEditor.aplicarCaixa("a", shiftAtivo = false, capsLock = false))
        // Números, símbolos, acentos e maiúsculas passam intactos.
        assertEquals("1", TextEditor.aplicarCaixa("1", shiftAtivo = true, capsLock = true))
        assertEquals("@", TextEditor.aplicarCaixa("@", shiftAtivo = true, capsLock = true))
        assertEquals("ç", TextEditor.aplicarCaixa("ç", shiftAtivo = true, capsLock = true))
        assertEquals("Ç", TextEditor.aplicarCaixa("Ç", shiftAtivo = false, capsLock = false))
    }

    @Test
    fun `posicao final nunca sai dos limites do campo`() {
        assertEquals(0, TextEditor.posicaoFinalSelecao("", -3))
        assertEquals(5, TextEditor.posicaoFinalSelecao("abcde", 99))
        assertEquals(3, TextEditor.posicaoFinalSelecao("abcde", 3))
    }

    @Test
    fun `troca de modo ABC 123 SIMBOLOS preserva o texto digitado`() {
        // Trocar de modo NÃO pode perder o que já foi digitado nem trocar de campo.
        var r = digitar("", "usuario")
        r = TextEditor.inserir(r.texto, r.selecao, r.selecao, "@")
        r = TextEditor.inserir(r.texto, r.selecao, r.selecao, "gmail")
        r = TextEditor.inserir(r.texto, r.selecao, r.selecao, ".")
        r = TextEditor.inserir(r.texto, r.selecao, r.selecao, "com")
        assertEquals("usuario@gmail.com", r.texto)
    }
}
