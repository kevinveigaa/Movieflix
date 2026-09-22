package com.movieflix.tv

import android.content.Context
import android.graphics.Typeface
import android.util.AttributeSet
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Teclado em tela COMPLETO do MovieFlix TV — 100% controle remoto.
 *
 * POR QUE EXISTE: em Android TV, Google TV e TV Box o teclado do sistema é
 * irregular — em muitos aparelhos ele simplesmente NÃO abre pelo controle
 * remoto, e o usuário ficava preso na tela de login sem conseguir digitar.
 * Este teclado é desenhado DENTRO do app e é navegável apenas com
 * UP / DOWN / LEFT / RIGHT + OK. Nada aqui depende de touchscreen nem do IME.
 *
 * O QUE ELE DIGITA (completo, como pedido):
 *  - letras minúsculas E maiúsculas;
 *  - SHIFT (próxima letra em maiúscula) e CAPS LOCK (trava em maiúsculas);
 *  - números 0–9;
 *  - símbolos: - _ . , @ # $ % & * + = ( ) [ ] { } / \ ! ? : ; " ' ~ ^ | < > § ° ª º € £ ¥ ¢ © ®
 *  - caracteres acentuados do português: á à â ã é ê í ó ô õ ú ü ç ñ (e maiúsculas)
 *  - espaço, apagar/backspace, limpar tudo e Enter;
 *  - teclas de modo ABC / 123 / SYM.
 *
 * É um componente de INTERFACE: não contém nenhuma regra de negócio. A
 * autenticação continua sendo o AuthRepository (mesma conta Supabase do site
 * e do celular).
 *
 * MODO ABC (5 linhas × 10 colunas):
 *   1 2 3 4 5 6 7 8 9 0
 *   q w e r t y u i o p
 *   a s d f g h j k l ⇧
 *   z x c v b n m . @ ⌫
 *   123   ESPAÇO   LIMPAR   ENTER
 *
 * MODO 123 (números + símbolos): a mesma grade, com a linha 5 alternando para
 *   SYM. O modo SYM traz os acentuados do português e os símbolos tipográficos.
 */
class MfKeyboard @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : LinearLayout(context, attrs) {

    /** Campo de texto que recebe o que for digitado. */
    var alvo: EditText? = null

    /** Ação da tecla de confirmação (a última da direita). */
    var aoConfirmar: (() -> Unit)? = null

    /** Rótulo da tecla de confirmação — ex.: "ENTRAR" ou "BUSCAR". */
    var rotuloConfirmar: String = "OK"
        set(valor) {
            field = valor
            teclaConfirmar?.text = valor
        }

    /**
     * View logo ACIMA do teclado: com UP na primeira linha o foco volta para
     * ela (é assim que o usuário alterna entre o campo e o teclado).
     */
    var acima: View? = null
        set(valor) {
            field = valor
            ligarBordas()
        }

    /**
     * View logo ABAIXO do teclado: com DOWN na última linha o foco sai para
     * ela (ex.: o botão ENTRAR). Assim o D-pad nunca "trava" no teclado.
     */
    var abaixo: View? = null
        set(valor) {
            field = valor
            ligarBordas()
        }

    // ── Estado dos modificadores ─────────────────────────────────────────
    private var shiftAtivo = false
    private var capsLock = false
    private var modo = Modo.ABC

    private enum class Modo { ABC, NUM, SYM }

    /** Uma tecla do teclado: rótulo visível + ação. */
    private class Tecla(
        val rotulo: String,
        val peso: Float = 1f,
        val destaque: Boolean = false,
        val acao: Modo.() -> Unit,
    )

    private val alturaTecla = (MfMetrics.altura(context) * 0.052f).toInt().coerceIn(30, 80)
    private val vaoTecla = (MfMetrics.altura(context) * 0.006f).toInt().coerceAtLeast(3)
    private val tamTexto = MfMetrics.sp(context, 0.026f).coerceIn(10f, 22f)

    private val primeiraLinha = mutableListOf<View>()
    private val ultimaLinha = mutableListOf<View>()
    private var teclaConfirmar: TextView? = null

    /** Grade de views da renderização atual, para religar a navegação. */
    private var grade: List<List<View>> = emptyList()

    init {
        orientation = VERTICAL
        // As teclas crescem ao ganhar foco: sem isto o realce ficaria cortado
        // nas bordas da primeira e da última linha.
        clipChildren = false
        clipToPadding = false
        renderizar()
    }

    // ── Definição dos modos ──────────────────────────────────────────────

    private fun teclas(modo: Modo): List<List<Tecla>> = when (modo) {
        Modo.ABC -> listOf(
            linha("1", "2", "3", "4", "5", "6", "7", "8", "9", "0"),
            linha("q", "w", "e", "r", "t", "y", "u", "i", "o", "p"),
            linha("a", "s", "d", "f", "g", "h", "j", "k", "l") + teclaShift(),
            linha("z", "x", "c", "v", "b", "n", "m", ".", "@") + teclaBackspace(),
            LINHA_ACOES,
        )

        Modo.NUM -> listOf(
            linha("1", "2", "3", "4", "5", "6", "7", "8", "9", "0"),
            linha("-", "_", ".", ",", "@", "#", "$", "%", "&", "*"),
            linha("+", "=", "(", ")", "[", "]", "{", "}", "/", "\\"),
            linha("!", "?", ":", ";", "\"", "'", "~", "^", "|") + teclaBackspace(),
            LINHA_ACOES,
        )

        Modo.SYM -> listOf(
            linha("á", "à", "â", "ã", "é", "ê", "í", "ó", "ô", "õ"),
            linha("ú", "ü", "ç", "ñ", "Á", "À", "Â", "Ã", "É", "Ê"),
            linha("Í", "Ó", "Ô", "Õ", "Ú", "Ç", "Ñ", "Ü", "§", "°"),
            linha("ª", "º", "€", "£", "¥", "¢", "©", "®", "<", ">") + teclaBackspace(),
            LINHA_ACOES,
        )
    }

    /** Converte uma lista de caracteres simples em teclas de digitação. */
    private fun linha(vararg rotulos: String): List<Tecla> =
        rotulos.map { r -> Tecla(r) { inserir(r) } }

    private fun teclaShift() = Tecla("⇧") {
        when {
            capsLock -> {
                // ⇧ com CAPS LOCK ligado desliga tudo (como num teclado real).
                capsLock = false
                shiftAtivo = false
            }
            shiftAtivo -> capsLock = true          // segundo toque = CAPS LOCK
            else -> shiftAtivo = true              // primeiro toque = SHIFT
        }
        atualizarModificadores()
    }

    private fun teclaBackspace() = Tecla("⌫") { apagar() }

    /**
     * Linha de ações: alterna o modo (ABC → 123 → SYM), espaço, limpar e o
     * botão de confirmação. Definida como propriedade para poder ser reusada
     * pelos três modos (as ações leem o estado atual do teclado).
     */
    private val LINHA_ACOES: List<Tecla>
        get() = listOf(
            Tecla(rotuloModo(), peso = 2f) { alternarModo() },
            Tecla("ESPAÇO", peso = 4f) { inserir(" ") },
            Tecla("LIMPAR", peso = 2f) {
                alvo?.text?.clear()
                alvo?.setSelection(0)
            },
            Tecla(rotuloConfirmar, peso = 2f, destaque = true) { aoConfirmar?.invoke() },
        )

    private fun rotuloModo(): String = when (modo) {
        Modo.ABC -> "123"
        Modo.NUM -> "SYM"
        Modo.SYM -> "ABC"
    }

    private fun alternarModo() {
        modo = when (modo) {
            Modo.ABC -> Modo.NUM
            Modo.NUM -> Modo.SYM
            Modo.SYM -> Modo.ABC
        }
        // Sair do modo ABC limpa os modificadores de caixa.
        if (modo != Modo.ABC) {
            shiftAtivo = false
            capsLock = false
        }
        renderizar()
        // Trocar entre ABC / 123 / SÍMBOLOS NÃO pode perder o foco: `renderizar()`
        // recria TODAS as teclas, então a tecla que estava focada é destruída e o
        // foco iria para lugar nenhum — o próximo OK cairia na tela em vez de
        // digitar (defeito relatado). Reposicionamos no botão de modo, que é
        // sempre a PRIMEIRA tecla da última linha na nova renderização.
        // O CAMPO em edição e a posição da seleção continuam intactos (o EditText
        // não é recriado) — por isso o usuário consegue completar o e-mail/senha.
        ultimaLinha.firstOrNull()?.requestFocus()
    }

    // ── Renderização ─────────────────────────────────────────────────────

    private fun renderizar() {
        removeAllViews()
        primeiraLinha.clear()
        ultimaLinha.clear()

        val definicao = teclas(modo)
        val gradeNova = mutableListOf<List<View>>()

        definicao.forEachIndexed { indiceLinha, teclasDaLinha ->
            val linhaView = LinearLayout(context).apply {
                orientation = HORIZONTAL
                weightSum = teclasDaLinha.sumOf { it.peso.toDouble() }.toFloat()
            }
            val views = mutableListOf<View>()
            teclasDaLinha.forEach { t ->
                val v = criarTecla(t)
                linhaView.addView(v, paramsColuna(t.peso))
                views.add(v)
                when (indiceLinha) {
                    0 -> primeiraLinha.add(v)
                    definicao.lastIndex -> ultimaLinha.add(v)
                }
            }
            addView(linhaView, paramsLinha())
            gradeNova.add(views)
        }

        grade = gradeNova

        // A PRIMEIRA tecla tem id fixo: é o alvo de `nextFocusDown` dos campos
        // de texto, o que garante uma ordem de foco determinística no D-pad.
        // Precisa vir ANTES de ligarNavegacao(), que referencia este id.
        primeiraLinha.firstOrNull()?.id = R.id.tecla0

        ligarNavegacao()
        atualizarModificadores()
    }

    /**
     * Liga a navegação D-pad EXPLÍCITA entre as teclas.
     *
     * Sem isto, o foco por proximidade erra o alvo quando as linhas têm pesos
     * diferentes (ESPAÇO ocupa 4 colunas, por exemplo). Aqui cada tecla sabe
     * exatamente qual é a sua vizinha em cada direção — inclusive as bordas,
     * que sobem para o campo de texto ou descem para o botão de confirmação.
     */
    private fun ligarNavegacao() {
        for (i in grade.indices) {
            for (j in grade[i].indices) {
                val v = grade[i][j]
                v.nextFocusLeftId = if (j > 0) grade[i][j - 1].id else v.id
                v.nextFocusRightId =
                    if (j < grade[i].lastIndex) grade[i][j + 1].id else v.id
                v.nextFocusUpId = if (i > 0) {
                    val linhaAcima = grade[i - 1]
                    linhaAcima[j.coerceAtMost(linhaAcima.lastIndex)].id
                } else {
                    acima?.id ?: v.id
                }
                v.nextFocusDownId = if (i < grade.lastIndex) {
                    val linhaAbaixo = grade[i + 1]
                    linhaAbaixo[j.coerceAtMost(linhaAbaixo.lastIndex)].id
                } else {
                    abaixo?.id ?: v.id
                }
            }
        }
        ligarBordas()
    }

    /** Reaplica as bordas depois que `acima`/`abaixo` forem definidos. */
    private fun ligarBordas() {
        if (grade.isEmpty()) return
        // Alvo preferencial: o CAMPO EM EDIÇÃO. Assim UP na primeira linha devolve o
        // foco exatamente ao campo que o usuário está preenchendo, sem trocar de
        // campo no meio da digitação.
        val paraCima = alvo?.id ?: acima?.id
        primeiraLinha.forEach { it.nextFocusUpId = paraCima ?: it.id }
        ultimaLinha.forEach { it.nextFocusDownId = abaixo?.id ?: it.id }
    }

    private fun paramsColuna(peso: Float): LayoutParams =
        LayoutParams(0, LayoutParams.MATCH_PARENT, peso).apply {
            marginEnd = vaoTecla
        }

    private fun paramsLinha(): LayoutParams =
        LayoutParams(LayoutParams.MATCH_PARENT, alturaTecla).apply {
            // Respiro entre linhas (a primeira não tem margem no topo).
            topMargin = if (childCount > 0) vaoTecla else 0
        }

    private fun criarTecla(t: Tecla): TextView =
        TextView(context).apply {
            text = t.rotulo
            id = View.generateViewId()
            gravity = Gravity.CENTER
            isSingleLine = true
            setTextColor(if (t.destaque) MfDesign.WHITE else MfDesign.GRAY_LIGHT)
            setTextSize(
                TypedValue.COMPLEX_UNIT_SP,
                if (t.rotulo.length > 3) tamTexto * 0.78f else tamTexto,
            )
            typeface = Typeface.DEFAULT_BOLD
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            background = resources.getDrawable(
                if (t.destaque) R.drawable.bg_key_accent else R.drawable.bg_key,
                null,
            )
            setOnClickListener { t.acao.invoke(modo) }
            setOnFocusChangeListener { v, temFoco ->
                v.animate()
                    .scaleX(if (temFoco) 1.08f else 1f)
                    .scaleY(if (temFoco) 1.08f else 1f)
                    .setDuration(110)
                    .start()
                v.elevation = if (temFoco) 12f else 0f
                (v as? TextView)?.setTextColor(
                    if (temFoco) MfDesign.WHITE
                    else if (t.destaque) MfDesign.WHITE
                    else MfDesign.GRAY_LIGHT,
                )
            }
        }

    /** Pinta SHIFT/CAPS LOCK para o usuário ver o estado atual. */
    private fun atualizarModificadores() {
        val v = grade.getOrNull(2)?.lastOrNull() as? TextView ?: return
        if (modo != Modo.ABC) return
        when {
            capsLock -> {
                v.text = "CAPS"
                v.background = resources.getDrawable(R.drawable.bg_key_accent, null)
            }
            shiftAtivo -> {
                v.text = "⇧"
                v.background = resources.getDrawable(R.drawable.bg_key_accent, null)
            }
            else -> {
                v.text = "⇧"
                v.background = resources.getDrawable(R.drawable.bg_key, null)
            }
        }
    }

    // ── API pública usada pelas telas ────────────────────────────────────

    /** Define em qual campo o teclado escreve. */
    fun definirAlvo(campo: EditText?) {
        alvo = campo
        // O "UP na primeira linha" volta para o CAMPO em edição (não para um campo
        // fixo): assim o usuário nunca é jogado para o campo errado no meio da
        // digitação — o campo fica selecionado do começo ao fim.
        ligarBordas()
    }

    /** Leva o foco para a primeira tecla (chamado ao pressionar OK no campo). */
    fun focarPrimeira() {
        primeiraLinha.firstOrNull()?.requestFocus()
    }

    /** O foco está dentro do teclado? (usado para tratar o BACK) */
    fun contem(view: View?): Boolean {
        var atual: View? = view
        while (atual != null) {
            if (atual === this) return true
            atual = atual.parent as? View
        }
        return false
    }

    // ── Edição do texto ──────────────────────────────────────────────────

    private fun inserir(textoInserido: String) {
        val campo = alvo ?: return
        var texto = textoInserido
        // SHIFT/CAPS só afetam letras minúsculas do modo ABC.
        if (modo == Modo.ABC && texto.length == 1 && texto[0] in 'a'..'z') {
            if (capsLock || shiftAtivo) texto = texto.uppercase()
        }
        // A edição é feita por TextEditor (lógica pura, testável): substitui a
        // seleção e reposiciona o cursor no FIM do que foi inserido — SEM depender
        // de onde está o foco e SEM trocar de campo. É isto que garante que
        // "@ . _ -", números e símbolos NÃO interrompam a digitação.
        val r = TextEditor.inserir(
            conteudo = campo.text,
            inicioSelecao = campo.selectionStart,
            fimSelecao = campo.selectionEnd,
            entrada = texto,
        )
        campo.setText(r.texto)
        campo.setSelection(TextEditor.posicaoFinalSelecao(r.texto, r.selecao))
        // SHIFT é de UMA letra: depois de digitar, volta ao normal.
        if (shiftAtivo && !capsLock) {
            shiftAtivo = false
            atualizarModificadores()
        }
    }

    private fun apagar() {
        val campo = alvo ?: return
        val r = TextEditor.apagar(
            conteudo = campo.text,
            inicioSelecao = campo.selectionStart,
            fimSelecao = campo.selectionEnd,
        )
        campo.setText(r.texto)
        campo.setSelection(TextEditor.posicaoFinalSelecao(r.texto, r.selecao))
    }

    // ── BACK volta para o campo em vez de sair da tela ───────────────────

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val dentro = findFocus() != null

        // BACK: encerra a EDIÇÃO (devolve o foco ao campo), nunca fecha a tela de
        // login por acidente. Com o foco fora do teclado, o BACK segue para cima
        // (comportamento normal da tela).
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (dentro) {
                alvo?.requestFocus()
                return true
            }
            return super.dispatchKeyEvent(event)
        }

        if (dentro) {
            // Teclas de CARACTERE entram DIRETO no campo em edição.
            //
            // O teclado da TV é navegado por D-pad e cada tecla é um TextView
            // focável. Um controle remoto com teclado físico (ou um aparelho que
            // envie unicodeChar) teria a tecla entregue ao elemento com foco — que
            // pode não ser o campo. Aqui, enquanto o foco está DENTRO do teclado,
            // todo caractere imprimível vai para o `alvo`, sem depender de onde
            // está o foco, sem fechar o teclado e sem trocar de campo.
            //
            // Setas, OK e ENTER têm unicodeChar 0 (ou de controle) e continuam
            // passando normalmente para a tecla focada: a navegação do D-pad e o
            // "OK abre o teclado" seguem idênticos.
            if (event.action == KeyEvent.ACTION_DOWN && event.unicodeChar != 0) {
                val c = event.unicodeChar.toChar()
                if (!c.isISOControl()) {
                    inserir(c.toString())
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }
}
