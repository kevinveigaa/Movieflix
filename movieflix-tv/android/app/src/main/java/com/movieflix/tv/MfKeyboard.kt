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
 * Teclado em tela NATIVO do MovieFlix TV — 100% controle remoto.
 *
 * POR QUE EXISTE: em Android TV, Google TV e TV Box o teclado do sistema é
 * irregular — em muitos aparelhos ele simplesmente NÃO abre pelo controle
 * remoto, e o usuário ficava preso na tela de login sem conseguir digitar.
 * Este teclado é desenhado DENTRO do app, sempre visível, e é navegável apenas
 * com UP / DOWN / LEFT / RIGHT + OK. Nada aqui depende de touchscreen nem do
 * IME do sistema.
 *
 * É um componente de INTERFACE: não contém nenhuma regra de negócio. A
 * autenticação continua sendo o AuthRepository (mesma conta Supabase do
 * site e do celular).
 *
 * Layout (5 linhas de 10 colunas, todas com o mesmo alinhamento):
 *   1 2 3 4 5 6 7 8 9 0
 *   Q W E R T Y U I O P
 *   A S D F G H J K L ⌫
 *   Z X C V B N M . @ -
 *   ESPAÇO   APAGAR TUDO   OK
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
            teclaOk?.text = valor
        }

    /**
     * View logo ACIMA do teclado: com UP na primeira linha o foco volta para
     * ela (é assim que o usuário alterna entre o campo e o teclado).
     */
    var acima: View? = null
        set(valor) {
            field = valor
            primeiraLinha.forEach { it.nextFocusUpId = valor?.id ?: NO_ID }
        }

    /**
     * View logo ABAIXO do teclado: com DOWN na última linha o foco sai para
     * ela (ex.: o botão ENTRAR). Assim o D-pad nunca "trava" no teclado.
     */
    var abaixo: View? = null
        set(valor) {
            field = valor
            ultimaLinha.forEach { it.nextFocusDownId = valor?.id ?: NO_ID }
        }

    private val primeiraLinha = mutableListOf<View>()
    private val ultimaLinha = mutableListOf<View>()
    private var teclaOk: TextView? = null

    private val alturaTecla = MfDesign.dp(context, 38f)
    private val vaoTecla = MfDesign.dp(context, 6f)

    private val linhas = listOf(
        listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0"),
        listOf("Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"),
        listOf("A", "S", "D", "F", "G", "H", "J", "K", "L", "⌫"),
        listOf("Z", "X", "C", "V", "B", "N", "M", ".", "@", "-"),
    )

    init {
        orientation = VERTICAL
        // As teclas crescem ao ganhar foco: sem isto o realce ficaria cortado
        // nas bordas da primeira e da última linha.
        clipChildren = false
        clipToPadding = false

        // ── Linhas de caracteres ──
        linhas.forEachIndexed { indice, chaves ->
            val linha = novaLinha()
            chaves.forEach { rotulo ->
                val acao: () -> Unit = if (rotulo == "⌫") ({ apagar() }) else ({ inserir(rotulo) })
                val tecla = criarTecla(rotulo, destaque = false, acao = acao)
                linha.addView(tecla, peso(1f))
                if (indice == 0) primeiraLinha.add(tecla)
            }
            addView(linha, paramsLinha())
        }

        // ── Linha de ações ──
        val acoes = novaLinha()
        val espaco = criarTecla("ESPAÇO", destaque = false, acao = { inserir(" ") })
        val limpar = criarTecla("APAGAR TUDO", destaque = false, acao = { alvo?.text?.clear() })
        val ok = criarTecla(rotuloConfirmar, destaque = true, acao = { aoConfirmar?.invoke() })
        teclaOk = ok
        acoes.addView(espaco, peso(4f))
        acoes.addView(limpar, peso(3f))
        acoes.addView(ok, peso(3f))
        addView(acoes, paramsLinha())
        ultimaLinha.addAll(listOf(espaco, limpar, ok))

        // A PRIMEIRA tecla tem id fixo: é o alvo de `nextFocusDown` dos campos
        // de texto, o que garante uma ordem de foco determinística no D-pad.
        primeiraLinha.firstOrNull()?.id = R.id.tecla0
    }

    // ── API pública usada pelas telas ──────────────────────────────────────────

    /** Define em qual campo o teclado escreve. */
    fun definirAlvo(campo: EditText?) {
        alvo = campo
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

    // ── Construção ─────────────────────────────────────────────────────────────

    private fun novaLinha(): LinearLayout = LinearLayout(context).apply {
        orientation = HORIZONTAL
        weightSum = 10f
    }

    private fun peso(pesoColuna: Float): LayoutParams =
        LayoutParams(0, LayoutParams.MATCH_PARENT, pesoColuna).apply {
            marginEnd = vaoTecla
        }

    private fun paramsLinha(): LayoutParams =
        LayoutParams(LayoutParams.MATCH_PARENT, alturaTecla).apply {
            // Respiro entre linhas (a primeira não tem margem no topo).
            topMargin = if (childCount > 0) vaoTecla else 0
        }

    private fun criarTecla(rotulo: String, destaque: Boolean, acao: () -> Unit): TextView =
        TextView(context).apply {
            text = rotulo
            gravity = Gravity.CENTER
            isSingleLine = true
            setTextColor(if (destaque) MfDesign.WHITE else MfDesign.GRAY_LIGHT)
            // Rótulos longos ("APAGAR TUDO", "ESPAÇO") precisam de corpo menor.
            setTextSize(TypedValue.COMPLEX_UNIT_SP, if (rotulo.length > 3) 12f else 16f)
            typeface = Typeface.DEFAULT_BOLD
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            background = resources.getDrawable(
                if (destaque) R.drawable.bg_key_accent else R.drawable.bg_key,
                null,
            )
            setOnClickListener { acao() }
            setOnFocusChangeListener { v, temFoco ->
                v.animate()
                    .scaleX(if (temFoco) 1.10f else 1f)
                    .scaleY(if (temFoco) 1.10f else 1f)
                    .setDuration(110)
                    .start()
                v.elevation = if (temFoco) 12f else 0f
                (v as? TextView)?.setTextColor(
                    if (temFoco) MfDesign.WHITE
                    else if (destaque) MfDesign.WHITE
                    else MfDesign.GRAY_LIGHT,
                )
            }
        }

    // ── Edição do texto ────────────────────────────────────────────────────────

    private fun inserir(texto: String) {
        val campo = alvo ?: return
        val conteudo = campo.text
        val ini = campo.selectionStart.coerceAtLeast(0).coerceAtMost(conteudo.length)
        val fim = campo.selectionEnd.coerceAtLeast(0).coerceAtMost(conteudo.length)
        conteudo.replace(minOf(ini, fim), maxOf(ini, fim), texto)
    }

    private fun apagar() {
        val campo = alvo ?: return
        val conteudo = campo.text
        val ini = campo.selectionStart.coerceAtLeast(0)
        val fim = campo.selectionEnd.coerceAtLeast(0)
        if (fim > ini) {
            conteudo.delete(ini, fim)
        } else if (fim > 0) {
            conteudo.delete(fim - 1, fim)
        }
    }

    // ── BACK volta para o campo em vez de sair da tela ─────────────────────────

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK && findFocus() != null) {
            alvo?.requestFocus()
            return true
        }
        return super.dispatchKeyEvent(event)
    }
}
