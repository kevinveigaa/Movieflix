package com.movieflix.tv

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.util.TypedValue
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Busca — mesma lógica do mobile (busca local no catálogo embutido pelo título)
 * com interface de TV: campo grande, teclado em tela e grade de cards.
 *
 * ── CORREÇÃO v2.0.1 ───────────────────────────────────────────────────────────
 * Antes a digitação dependia do teclado virtual do Android (`showSoftInput`) —
 * que em Android TV / Google TV / TV Box frequentemente não abre pelo controle
 * remoto. Agora a busca usa o mesmo teclado em tela do login (MfKeyboard),
 * navegável apenas com UP/DOWN/LEFT/RIGHT + OK. Sem IME, sem touchscreen.
 *
 * Ordem de foco: campo → teclado (OK abre) → BUSCAR → grade de resultados.
 */
class SearchActivity : SidebarHostActivity() {

    override val itemAtivo: String = "busca"

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private lateinit var input: EditText
    private lateinit var grade: RecyclerView
    private lateinit var lblInfo: TextView
    private lateinit var teclado: MfKeyboard

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@SearchActivity, 34f),
                MfDesign.dp(this@SearchActivity, 20f),
                MfDesign.dp(this@SearchActivity, 34f),
                0,
            )
        }
        content.addView(
            raiz,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        raiz.addView(MfDesign.tituloTela(this, "Pesquisar"))
        raiz.addView(
            MfDesign.texto(this, "Busque por título, filme ou série — o mesmo catálogo do app e do site."),
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@SearchActivity, 4f) },
        )

        // ── Linha do campo de busca + botão ──
        val linhaBusca = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, MfDesign.dp(this@SearchActivity, 14f), 0, 0)
        }

        input = EditText(this).apply {
            hint = "Título do filme ou série"
            inputType = android.text.InputType.TYPE_CLASS_TEXT
            isSingleLine = true
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            // O teclado é o do app: o IME do sistema nunca é chamado.
            showSoftInputOnFocus = false
            background = resources.getDrawable(R.drawable.bg_input, null)
            setTextColor(Color.WHITE)
            setHintTextColor(MfDesign.GRAY)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(
                MfDesign.dp(this@SearchActivity, 20f), 0,
                MfDesign.dp(this@SearchActivity, 20f), 0,
            )
        }
        linhaBusca.addView(
            input,
            LinearLayout.LayoutParams(0, MfDesign.dp(this@SearchActivity, 56f), 1f),
        )

        val btnBuscar = TextView(this).apply {
            text = "Buscar"
            background = resources.getDrawable(R.drawable.bg_pill_primary, null)
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            setPadding(
                MfDesign.dp(this@SearchActivity, 28f), 0,
                MfDesign.dp(this@SearchActivity, 28f), 0,
            )
            MfDesign.focoBotao(this)
            setOnClickListener { buscar() }
        }
        linhaBusca.addView(
            btnBuscar,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                MfDesign.dp(this@SearchActivity, 56f),
            ).apply { marginStart = MfDesign.dp(this@SearchActivity, 12f) },
        )
        raiz.addView(linhaBusca)

        lblInfo = MfDesign.texto(this, "").apply { textSize = 14f }
        raiz.addView(
            lblInfo,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@SearchActivity, 8f) },
        )

        // ── Grade de resultados (mesmo card do resto do app) ──
        grade = MfRowsView.criarGrade(this, 6) { m ->
            startActivity(Intent(this, DetailsActivity::class.java).putExtra("movie_id", m.id))
        }

        // ── Teclado em tela (substitui o teclado do sistema) ──
        teclado = MfKeyboard(this).apply {
            rotuloConfirmar = "BUSCAR"
            definirAlvo(input)
            aoConfirmar = { buscar() }
            acima = input
            abaixo = grade
        }
        raiz.addView(
            teclado,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@SearchActivity, 10f) },
        )

        raiz.addView(
            grade,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f,
            ),
        )

        // OK no campo abre o teclado em tela (que já está visível).
        input.setOnClickListener {
            teclado.definirAlvo(input)
            input.setSelection(input.text.length)
            teclado.focarPrimeira()
        }
        input.setOnKeyListener { _, code, event ->
            val ok = code == KeyEvent.KEYCODE_DPAD_CENTER ||
                code == KeyEvent.KEYCODE_ENTER ||
                code == KeyEvent.KEYCODE_NUMPAD_ENTER
            if (ok && event.action == KeyEvent.ACTION_UP) {
                teclado.definirAlvo(input)
                teclado.focarPrimeira()
                true
            } else {
                false
            }
        }

        input.requestFocus()
    }

    private fun buscar() {
        val termo = input.text.toString().trim()
        if (termo.isBlank()) {
            lblInfo.text = "Digite um título para pesquisar."
            return
        }
        lblInfo.text = "Buscando…"
        scope.launch {
            val res = withContext(Dispatchers.IO) { CatalogRepository.buscar(this@SearchActivity, termo) }
            if (res.isEmpty()) {
                MfRowsView.publicarNaGrade(grade, emptyList())
                lblInfo.text = "Nenhum resultado para \"$termo\"."
            } else {
                MfRowsView.publicarNaGrade(grade, res) { m ->
                    startActivity(
                        Intent(this@SearchActivity, DetailsActivity::class.java).putExtra("movie_id", m.id),
                    )
                }
                lblInfo.text = "${res.size} resultado(s) para \"$termo\"."
                grade.requestFocus()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
