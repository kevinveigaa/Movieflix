package com.movieflix.tv

import android.app.Activity
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Diálogos de TV do MovieFlix — navegáveis SÓ com o controle remoto.
 *
 * POR QUE EXISTE: os `AlertDialog` do Android não são confiáveis em TV. Em
 * vários aparelhos a lista de opções não recebe foco do D-pad, o `EditText`
 * nunca abre o teclado e o usuário fica preso. Aqui o diálogo é desenhado
 * dentro da própria tela, com linhas grandes e foco explícito, e o campo de
 * texto usa o MfKeyboard em tela — exatamente como o login.
 *
 * É um componente de INTERFACE: não contém nenhuma regra de negócio.
 */
object MfDialog {

    private var overlayAtual: View? = null
    private var dialogoAberto = false

    /** Há um diálogo do app aberto em cima da tela? (tratamento do BACK) */
    fun estaAberto(): Boolean = dialogoAberto

    /** Fecha o diálogo aberto (se houver). */
    fun fechar() {
        val o = overlayAtual ?: return
        (o.parent as? ViewGroup)?.removeView(o)
        overlayAtual = null
        dialogoAberto = false
    }

    private fun dp(activity: Activity, v: Float): Int = MfDesign.dp(activity, v)

    private fun painelBg(activity: Activity): GradientDrawable = GradientDrawable().apply {
        cornerRadius = dp(activity, 18f).toFloat()
        setColor(MfDesign.SURFACE)
        setStroke(dp(activity, 2f), MfDesign.BORDER)
    }

    private fun tituloView(activity: Activity, texto: String): TextView = TextView(activity).apply {
        text = texto
        setTextColor(MfDesign.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
        typeface = Typeface.DEFAULT_BOLD
        setPadding(0, 0, 0, dp(activity, 6f))
    }

    private fun abrir(activity: Activity, painel: View, foco: View?) {
        fechar()
        val overlay = FrameLayout(activity).apply {
            setBackgroundColor(0xE605050A.toInt())
            isClickable = true
            isFocusable = true
            isFocusableInTouchMode = true
            addView(
                painel,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER,
                ),
            )
            // BACK fecha o diálogo em vez de sair da tela.
            setOnKeyListener { _, code, ev ->
                if (code == KeyEvent.KEYCODE_BACK && ev.action == KeyEvent.ACTION_UP) {
                    fechar(); true
                } else {
                    false
                }
            }
        }
        activity.findViewById<ViewGroup>(android.R.id.content).addView(
            overlay,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        overlayAtual = overlay
        dialogoAberto = true
        if (foco != null) foco.post { foco.requestFocus() } else overlay.requestFocus()
    }

    // ── Lista de opções (qualidade, etc.) ────────────────────────────────

    /**
     * Mostra uma lista de opções navegável pelo D-pad.
     * `atual` marca a opção em uso (fica destacada).
     */
    fun escolher(
        activity: Activity,
        titulo: String,
        opcoes: List<String>,
        atual: Int = -1,
        onSelect: (Int) -> Unit,
    ) {
        val painel = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            background = painelBg(activity)
            setPadding(dp(activity, 30f), dp(activity, 26f), dp(activity, 30f), dp(activity, 26f))
            minimumWidth = (MfMetrics.largura(activity) * 0.36f).toInt()
        }
        painel.addView(tituloView(activity, titulo))

        var primeiro: View? = null
        opcoes.forEachIndexed { indice, opcao ->
            val rotulo = if (indice == atual) "•  $opcao" else "   $opcao"
            val linha = TextView(activity).apply {
                text = rotulo
                setTextColor(if (indice == atual) MfDesign.PURPLE_LIGHT else MfDesign.GRAY_LIGHT)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
                typeface = Typeface.DEFAULT_BOLD
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(activity, 20f), dp(activity, 16f), dp(activity, 20f), dp(activity, 16f))
                isFocusable = true
                isFocusableInTouchMode = true
                isClickable = true
                background = linhaBg(activity, indice == atual)
                setOnClickListener { fechar(); onSelect(indice) }
                setOnFocusChangeListener { v, temFoco ->
                    v.background = linhaBg(activity, temFoco || indice == atual)
                    v.animate().scaleX(if (temFoco) 1.02f else 1f)
                        .scaleY(if (temFoco) 1.02f else 1f).setDuration(120).start()
                }
            }
            painel.addView(
                linha,
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = dp(activity, 8f) },
            )
            if (primeiro == null) primeiro = linha
        }

        abrir(activity, painel, primeiro ?: painel)
    }

    private fun linhaBg(activity: Activity, destaque: Boolean): GradientDrawable =
        GradientDrawable().apply {
            cornerRadius = dp(activity, 12f).toFloat()
            setColor(if (destaque) MfDesign.SURFACE_STRONG else MfDesign.SURFACE_LIGHT)
            setStroke(
                dp(activity, if (destaque) 3f else 1f),
                if (destaque) MfDesign.PURPLE else MfDesign.BORDER,
            )
        }

    // ── Entrada de texto (troca de senha) ────────────────────────────────

    /**
     * Pede um texto ao usuário usando o MfKeyboard em tela.
     * `validar` devolve a mensagem de erro (ou null quando está tudo certo).
     */
    fun entrarTexto(
        activity: Activity,
        titulo: String,
        dica: String,
        rotuloConfirmar: String = "SALVAR",
        senha: Boolean = true,
        validar: (String) -> String? = { null },
        onConfirm: (String) -> Unit,
    ) {
        val painel = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            background = painelBg(activity)
            setPadding(dp(activity, 30f), dp(activity, 26f), dp(activity, 30f), dp(activity, 26f))
            minimumWidth = (MfMetrics.largura(activity) * 0.52f).toInt()
        }
        painel.addView(tituloView(activity, titulo))

        val erro = TextView(activity).apply {
            setTextColor(MfDesign.ERROR)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            visibility = View.GONE
        }

        val campo = EditText(activity).apply {
            hint = dica
            setTextColor(MfDesign.WHITE)
            setHintTextColor(MfDesign.GRAY)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            setSingleLine(true)
            background = resources.getDrawable(R.drawable.bg_input, null)
            setPadding(dp(activity, 18f), 0, dp(activity, 18f), 0)
            inputType = if (senha) {
                InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            } else {
                InputType.TYPE_CLASS_TEXT
            }
            // O teclado do app substitui o IME do sistema.
            showSoftInputOnFocus = false
            isFocusable = true
            isFocusableInTouchMode = true
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(activity, 56f),
            ).apply { topMargin = dp(activity, 12f) }
        }
        painel.addView(campo)

        val btnOk = TextView(activity).apply {
            text = rotuloConfirmar
            setTextColor(MfDesign.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            background = resources.getDrawable(R.drawable.bg_pill_primary, null)
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(activity, 52f),
            ).apply { topMargin = dp(activity, 12f) }
            MfDesign.focoBotao(this)
        }

        fun confirmar() {
            val valor = campo.text.toString()
            val problema = validar(valor)
            if (problema != null) {
                erro.text = problema
                erro.visibility = View.VISIBLE
                campo.requestFocus()
                return
            }
            fechar()
            onConfirm(valor)
        }
        btnOk.setOnClickListener { confirmar() }
        painel.addView(btnOk)
        painel.addView(
            erro,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(activity, 10f) },
        )

        val teclado = MfKeyboard(activity).apply {
            definirAlvo(campo)
            this.rotuloConfirmar = rotuloConfirmar
            acima = campo
            abaixo = btnOk
            aoConfirmar = { confirmar() }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(activity, 14f) }
        }
        campo.setOnClickListener { teclado.focarPrimeira() }
        campo.setOnKeyListener { _, code, ev ->
            val ok = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER
            if (ok && ev.action == KeyEvent.ACTION_UP) {
                campo.showSoftInputOnFocus = false
                teclado.focarPrimeira()
                true
            } else {
                false
            }
        }
        painel.addView(teclado)

        // Em telas baixas (720p) o conjunto campo + teclado pode passar da
        // altura útil: o ScrollView garante que nada fique inalcançável.
        val scroll = ScrollView(activity).apply {
            isFillViewport = false
            clipToPadding = false
            addView(painel)
        }
        abrir(activity, scroll, campo)
    }
}
