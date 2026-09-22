package com.movieflix.tv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Testes do fluxo de login pedido pelo dono:
 *
 *   E-MAIL → ENTER → foco vai para SENHA
 *   SENHA  → ENTER → foco vai para ENTRAR
 *
 * O e-mail e a senha são digitados com caracteres especiais (validados em
 * TextEditorTest; aqui o foco é a ORDEM do fluxo).
 */
class LoginFlowTest {

    @Test
    fun `ENTER no email avanca para o campo de senha`() {
        assertEquals(LoginFlow.Passo.SENHA, LoginFlow.proximoPasso(CampoLogin.EMAIL))
        assertEquals(CampoLogin.SENHA, LoginFlow.proximoCampo(CampoLogin.EMAIL))
    }

    @Test
    fun `ENTER na senha avanca para o botao ENTRAR`() {
        assertEquals(LoginFlow.Passo.ENTRAR, LoginFlow.proximoPasso(CampoLogin.SENHA))
        // Da senha não existe "próximo campo": o destino é o BOTÃO ENTRAR.
        assertNull(LoginFlow.proximoCampo(CampoLogin.SENHA))
    }

    @Test
    fun `o fluxo completo percorre email senha entrar e termina`() {
        val percurso = mutableListOf<String>()
        var campo: CampoLogin? = CampoLogin.EMAIL
        var guarda = 0
        while (campo != null && guarda++ < 5) {
            percurso.add(campo.name)
            campo = LoginFlow.proximoCampo(campo)
        }
        assertEquals(listOf("EMAIL", "SENHA"), percurso)
        // Saindo da senha, o passo é o botão ENTRAR — o fim da linha.
        assertEquals(LoginFlow.Passo.ENTRAR, LoginFlow.proximoPasso(CampoLogin.SENHA))
    }

    @Test
    fun `sem campo em edicao o ENTER nao tem destino`() {
        assertEquals(LoginFlow.Passo.NENHUM, LoginFlow.proximoPasso(null))
        assertFalse(LoginFlow.podeAvancar(null))
    }

    @Test
    fun `ambos os campos permitem avancar com ENTER`() {
        assertTrue(LoginFlow.podeAvancar(CampoLogin.EMAIL))
        assertTrue(LoginFlow.podeAvancar(CampoLogin.SENHA))
    }

    @Test
    fun `o passo nunca e ambiguo entre os dois campos`() {
        // Garante que a decisão depende SÓ do campo atual (determinística).
        repeat(3) {
            assertEquals(LoginFlow.Passo.SENHA, LoginFlow.proximoPasso(CampoLogin.EMAIL))
            assertEquals(LoginFlow.Passo.ENTRAR, LoginFlow.proximoPasso(CampoLogin.SENHA))
        }
    }
}
