package com.movieflix.tv

/**
 * Edição de texto PURA do teclado em tela (MfKeyboard).
 *
 * ── O defeito relatado ──
 *
 * No login, digitar `@`, `.`, `_`, `-`, números ou símbolos tirava o foco do campo,
 * fechava o teclado ou trocava de campo — impedindo completar `usuario@gmail.com`
 * ou `Senha@123!`.
 *
 * A causa não era o desenho das teclas: era o CAMINHO DAS TECLAS. O teclado é um
 * `LinearLayout` com `TextView`s focáveis. As teclas de letra/número/símbolo eram
 * `TextView`s comuns, então o foco do D-pad podia sair delas por navegação por
 * proximidade — e, principalmente, um `KEYCODE_ENTER`/`DPAD_CENTER` em QUALQUER
 * ponto da árvore podia ser entregue ao `EditText` (que tem `nextFocusDown` para o
 * teclado) em vez da tecla focada, apagando/reposicionando a seleção do campo.
 *
 * A edição agora é feita por funções puras que NUNCA dependem de onde está o foco:
 * elas recebem o conteúdo, o intervalo de seleção e o texto a inserir, e devolvem o
 * resultado. Testável em JVM (TextEditorTest).
 */
object TextEditor {

    data class Resultado(val texto: String, val selecao: Int)

    /**
     * Insere [entrada] na posição da seleção, substituindo o que estiver
     * selecionado, e devolve o texto + a nova posição do cursor (sempre no FIM do
     * que foi inserido, para o usuário continuar digitando no mesmo campo).
     *
     * Aceita qualquer caractere — letras, maiúsculas, minúsculas, dígitos e
     * símbolos (`@ . _ - # $ % & * + = ( ) [ ] { } / \ ! ? : ; ~ ^ | < >`), além
     * dos acentuados do português. Nada é filtrado.
     */
    fun inserir(
        conteudo: CharSequence,
        inicioSelecao: Int,
        fimSelecao: Int,
        entrada: String,
    ): Resultado {
        val texto = conteudo.toString()
        val ini = inicioSelecao.coerceIn(0, texto.length)
        val fim = fimSelecao.coerceIn(0, texto.length)
        val de = minOf(ini, fim)
        val ate = maxOf(ini, fim)
        val novo = texto.substring(0, de) + entrada + texto.substring(ate)
        return Resultado(novo, de + entrada.length)
    }

    /**
     * Backspace: apaga a seleção (se houver) ou o caractere anterior ao cursor.
     * Nunca apaga além do começo do campo e nunca mexe no foco.
     */
    fun apagar(
        conteudo: CharSequence,
        inicioSelecao: Int,
        fimSelecao: Int,
    ): Resultado {
        val texto = conteudo.toString()
        val ini = inicioSelecao.coerceIn(0, texto.length)
        val fim = fimSelecao.coerceIn(0, texto.length)
        val de = minOf(ini, fim)
        val ate = maxOf(ini, fim)
        if (ate > de) {
            return Resultado(texto.substring(0, de) + texto.substring(ate), de)
        }
        if (ate == 0) return Resultado(texto, 0)
        return Resultado(texto.substring(0, ate - 1) + texto.substring(ate), ate - 1)
    }

    /**
     * Aplica SHIFT/CAPS LOCK. Só afeta letras minúsculas do modo ABC — exatamente
     * como o teclado já fazia — e o SHIFT é de UMA letra (quem controla isso é o
     * `MfKeyboard`, que devolve `shiftConsumido`).
     */
    fun aplicarCaixa(entrada: String, shiftAtivo: Boolean, capsLock: Boolean): String {
        if (entrada.length != 1) return entrada
        val c = entrada[0]
        if (c !in 'a'..'z') return entrada
        return if (shiftAtivo || capsLock) c.uppercase() else entrada
    }

    /**
     * O campo deve PERMANECER com o texto e a seleção depois da digitação. Esta
     * função devolve a posição final do cursor, garantindo que nunca fique negativa
     * nem além do tamanho — o `EditText` recebe `setSelection` com este valor e o
     * usuário continua no MESMO campo, digitando o endereço inteiro.
     */
    fun posicaoFinalSelecao(texto: String, posicao: Int): Int =
        posicao.coerceIn(0, texto.length)
}
