package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

/**
 * BUSCA no catalogo real. No Android TV o campo abre o teclado virtual do
 * sistema quando focado — a busca roda enquanto se digita.
 */
class SearchActivity : BaseTvActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var campo: EditText
    private lateinit var grade: GridLayout
    private lateinit var vazio: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        montarTela()
    }

    private fun montarTela() {
        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(resources.getDimensionPixelSize(R.dimen.content_pad), TvUi.dp(this@SearchActivity, 24), resources.getDimensionPixelSize(R.dimen.content_pad), 0)
        }

        val titulo = TvUi.texto(this, "BUSCAR", 26f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        raiz.addView(titulo)

        campo = EditText(this)
        campo.hint = "Digite o nome do filme ou serie"
        campo.setTextSize(15f)
        campo.inputType = android.text.InputType.TYPE_CLASS_TEXT
        campo.setHintTextColor(ContextCompat.getColor(this, R.color.mf_gray))
        campo.setTextColor(ContextCompat.getColor(this, R.color.mf_white))
        campo.background = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface_light), 10, this, ContextCompat.getColor(this, R.color.mf_border), 1)
        campo.setPadding(TvUi.dp(this, 18), TvUi.dp(this, 14), TvUi.dp(this, 18), TvUi.dp(this, 14))
        campo.isFocusable = true
        campo.isFocusableInTouchMode = true
        campo.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@SearchActivity, 12) }
        campo.setOnFocusChangeListener { v, temFoco ->
            v.background = TvUi.fundo(
                ContextCompat.getColor(this, if (temFoco) R.color.mf_surface_strong else R.color.mf_surface_light),
                10, this, ContextCompat.getColor(this, if (temFoco) R.color.mf_red else R.color.mf_border), if (temFoco) 2 else 1,
            )
        }
        campo.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) { buscar(s?.toString() ?: "") }
            override fun afterTextChanged(s: Editable?) {}
        })
        raiz.addView(campo)

        vazio = TvUi.texto(this, "Digite para buscar no catalogo MovieFlix.", 14f, ContextCompat.getColor(this, R.color.mf_gray))
        vazio.gravity = Gravity.CENTER
        vazio.setPadding(0, TvUi.dp(this, 40), 0, 0)
        raiz.addView(vazio)

        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        grade = GridLayout(this).apply {
            columnCount = 6
            setPadding(0, TvUi.dp(this@SearchActivity, 20), 0, TvUi.dp(this@SearchActivity, 30))
        }
        scroll.addView(grade)
        raiz.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        conteudo(raiz)
        garantirFocoAposLayout(raiz, campo)
    }

    private fun buscar(termo: String) {
        if (termo.trim().length < 2) {
            grade.removeAllViews()
            vazio.visibility = View.VISIBLE
            vazio.text = "Digite para buscar no catalogo MovieFlix."
            return
        }
        executor.execute {
            val achados = CatalogRepository.buscar(this, termo)
            runOnUiThread {
                grade.removeAllViews()
                if (achados.isEmpty()) {
                    vazio.visibility = View.VISIBLE
                    vazio.text = "Nenhum resultado para \"$termo\"."
                    return@runOnUiThread
                }
                vazio.visibility = View.GONE
                for (m in achados) {
                    val card = TvUi.card(this, m.poster_url.ifBlank { m.backdrop_url }, m.title, m.qualidade()) {
                        startActivity(Intent(this, DetailsActivity::class.java).putExtra("movie_id", m.id))
                    }
                    grade.addView(card)
                }
            }
        }
    }

    override fun focoPadrao(): View? = campo
}
