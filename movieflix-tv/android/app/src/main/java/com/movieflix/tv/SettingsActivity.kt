package com.movieflix.tv

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

/**
 * CONFIGURACOES — preferencias locais do app de TV.
 * Nada aqui altera dados do site: sao apenas opcoes de reproducao.
 */
class SettingsActivity : BaseTvActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private val prefs by lazy { getSharedPreferences("mf_settings", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        montarTela()
    }

    private fun montarTela() {
        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(TvUi.dp(this@SettingsActivity, 44), TvUi.dp(this@SettingsActivity, 26), TvUi.dp(this@SettingsActivity, 44), TvUi.dp(this@SettingsActivity, 34))
        }

        raiz.addView(TvUi.texto(this, "CONFIGURACOES", 26f, ContextCompat.getColor(this, R.color.mf_white), negrito = true))

        // Auto-proximo episodio
        raiz.addView(interruptor(
            "Reproduzir proximo episodio automaticamente",
            prefs.getBoolean(CHAVE_AUTO_NEXT, true),
        ) { v -> prefs.edit().putBoolean(CHAVE_AUTO_NEXT, v).apply() })

        raiz.addView(interruptor(
            "Iniciar em tela cheia no player",
            prefs.getBoolean(CHAVE_FULLSCREEN, true),
        ) { v -> prefs.edit().putBoolean(CHAVE_FULLSCREEN, v).apply() })

        raiz.addView(interruptor(
            "Preferir player nativo (se falhar, usa o modo web)",
            prefs.getBoolean(CHAVE_PREFERIR_NATIVO, true),
        ) { v -> prefs.edit().putBoolean(CHAVE_PREFERIR_NATIVO, v).apply() })

        // Trocar de perfil
        val botaoPerfil = TvUi.botao(this, "Trocar de perfil")
        botaoPerfil.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@SettingsActivity, 20) }
        botaoPerfil.setOnClickListener { startActivity(android.content.Intent(this, ProfilesActivity::class.java)); finish() }
        raiz.addView(botaoPerfil)

        // Limpar cache do catalogo
        val botaoCache = TvUi.botao(this, "Atualizar catalogo")
        botaoCache.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@SettingsActivity, 12) }
        botaoCache.setOnClickListener {
            executor.execute {
                java.io.File(filesDir, "catalogo_v4.json").delete()
                CatalogRepository.atualizarSeNecessario(this)
                runOnUiThread { TvUi.aviso(this, "Catalogo atualizado") }
            }
        }
        raiz.addView(botaoCache)

        // Sobre
        raiz.addView(
            TvUi.texto(
                this,
                "MovieFlix TV  4.0.1\nAndroid TV  •  Google TV  •  TV Box\nSuporte: WhatsApp ${AppConfig.WHATSAPP_NUMBER}",
                13f, ContextCompat.getColor(this, R.color.mf_gray), maxLinhas = 4,
            ).apply { setPadding(0, TvUi.dp(this@SettingsActivity, 24), 0, 0) },
        )

        // Sair
        val sair = TvUi.botao(this, "Sair da conta")
        sair.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@SettingsActivity, 18) }
        sair.setOnClickListener {
            AuthRepository.clearSession(this)
            ProfilesRepository.setPerfilAtivo(this, null)
            val i = android.content.Intent(this, LoginActivity::class.java)
            i.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(i)
            finish()
        }
        raiz.addView(sair)

        scroll.addView(raiz)
        conteudo(scroll)
        garantirFocoAposLayout(raiz)
    }

    private fun interruptor(rotulo: String, valorInicial: Boolean, aoMudar: (Boolean) -> Unit): View {
        val linha = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            isFocusable = true
            setPadding(TvUi.dp(this@SettingsActivity, 20), TvUi.dp(this@SettingsActivity, 16), TvUi.dp(this@SettingsActivity, 20), TvUi.dp(this@SettingsActivity, 16))
        }
        linha.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@SettingsActivity, 12) }
        val normal = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface), 10, this, ContextCompat.getColor(this, R.color.mf_border), 1)
        val foco = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface_strong), 10, this, ContextCompat.getColor(this, R.color.mf_red), 3)
        linha.background = normal
        linha.setOnFocusChangeListener { v, temFoco -> v.background = if (temFoco) foco else normal }

        val texto = TvUi.texto(this, rotulo, 15f, ContextCompat.getColor(this, R.color.mf_white), maxLinhas = 2)
        linha.addView(texto, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

        val estado = TvUi.texto(
            this,
            if (valorInicial) "LIGADO" else "DESLIGADO",
            14f,
            ContextCompat.getColor(this, if (valorInicial) R.color.mf_green else R.color.mf_gray),
            negrito = true,
        )
        linha.addView(estado)

        linha.setOnClickListener {
            val novo = !valorInicialCorrente(rotulo)
            atualizarEstado(rotulo, novo)
            aoMudar(novo)
            estado.text = if (novo) "LIGADO" else "DESLIGADO"
            estado.setTextColor(ContextCompat.getColor(this, if (novo) R.color.mf_green else R.color.mf_gray))
        }
        estados[rotulo] = valorInicial
        return linha
    }

    private val estados = HashMap<String, Boolean>()
    private fun valorInicialCorrente(rotulo: String): Boolean = estados[rotulo] ?: false
    private fun atualizarEstado(rotulo: String, v: Boolean) { estados[rotulo] = v }

    override fun focoPadrao(): View? = raizView().findFocus()

    companion object {
        const val CHAVE_AUTO_NEXT = "auto_next"
        const val CHAVE_FULLSCREEN = "fullscreen"
        const val CHAVE_PREFERIR_NATIVO = "preferir_nativo"
    }
}
