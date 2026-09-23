package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

/**
 * CONTA — plano atual, validade REAL (expires_at), beneficios e atalhos.
 * Espelha a pagina /minha-assinatura do site, sem alterar nenhuma regra.
 */
class AccountActivity : BaseTvActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var coluna: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        montarTela()
        carregar()
    }

    private fun montarTela() {
        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        coluna = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(TvUi.dp(this@AccountActivity, 44), TvUi.dp(this@AccountActivity, 26), TvUi.dp(this@AccountActivity, 44), TvUi.dp(this@AccountActivity, 34))
        }
        val titulo = TvUi.texto(this, "MINHA CONTA", 26f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        coluna.addView(titulo)
        scroll.addView(coluna)
        conteudo(scroll)
    }

    private fun carregar() {
        executor.execute {
            val email = AuthRepository.loadEmail(this) ?: "(nao disponivel)"
            val assinatura = AccountRepository.assinatura(this)
            val ativa = AccountRepository.temAssinaturaAtiva(assinatura)
            val planos = AccountRepository.planos(this)
            val plano = PlanoRegras.resolvePlano(assinatura, planos)
            val ent = PlanoRegras.entitlementsForSubscription(assinatura, ativa, planos)
            val perfil = ProfilesRepository.perfilAtivo(this)
            runOnUiThread { render(email, assinatura, ativa, plano, ent, perfil) }
        }
    }

    private fun render(
        email: String,
        assinatura: AccountRepository.Assinatura?,
        ativa: Boolean,
        plano: AccountRepository.Plano?,
        ent: PlanoRegras.PlanEntitlements,
        perfil: ProfilesRepository.Perfil?,
    ) {
        while (coluna.childCount > 1) coluna.removeViewAt(1)

        coluna.addView(cartao("Conta", listOf("E-mail: $email", "Perfil ativo: ${perfil?.name ?: "nenhum"}")))

        if (ativa && plano != null) {
            coluna.addView(
                cartao(
                    "Assinatura ativa — ${plano.name}",
                    listOf(
                        "Valor: ${PlanoRegras.precoFormatado(plano.priceCents)}",
                        "Vencimento: ${PlanoRegras.formatarVencimento(assinatura?.expiresAt)}",
                        PlanoRegras.rotuloDiasRestantes(assinatura?.expiresAt),
                    ) + PlanoRegras.destaques(plano),
                ),
            )
        } else if (ativa) {
            coluna.addView(
                cartao(
                    "Assinatura ativa",
                    listOf(
                        "Plano: ${assinatura?.planCode ?: assinatura?.planId ?: "—"}",
                        "Vencimento: ${PlanoRegras.formatarVencimento(assinatura?.expiresAt)}",
                        PlanoRegras.rotuloDiasRestantes(assinatura?.expiresAt),
                        "Qualidade ate ${ent.qualityLabel}",
                        PlanoRegras.telasLabel(ent.screens),
                    ),
                ),
            )
        } else {
            coluna.addView(
                cartao(
                    "Sem assinatura ativa",
                    listOf(
                        "Voce esta no plano gratuito: catalogo e trailers.",
                        "Assine para liberar filmes e series completos.",
                        "Qualidade, telas simultaneas e downloads conforme o plano.",
                    ),
                ),
            )
        }

        val botaoPlano = TvUi.botao(
            this,
            if (ativa) "Trocar plano" else "Assinar plano",
            primario = true,
        )
        botaoPlano.setOnClickListener { startActivity(Intent(this, PaywallActivity::class.java)) }
        coluna.addView(botaoPlano, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@AccountActivity, 18) })

        val linha2 = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        linha2.setPadding(0, TvUi.dp(this, 12), 0, 0)
        val botaoSenha = TvUi.botao(this, "Alterar senha")
        botaoSenha.setOnClickListener { trocarSenha() }
        linha2.addView(botaoSenha)

        val botaoConfig = TvUi.botao(this, "Configuracoes")
        botaoConfig.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = TvUi.dp(this@AccountActivity, 12) }
        botaoConfig.setOnClickListener { startActivity(Intent(this, SettingsActivity::class.java)) }
        linha2.addView(botaoConfig)

        val botaoSair = TvUi.botao(this, "Sair da conta")
        botaoSair.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = TvUi.dp(this@AccountActivity, 12) }
        botaoSair.setOnClickListener {
            AuthRepository.clearSession(this)
            ProfilesRepository.setPerfilAtivo(this, null)
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
        linha2.addView(botaoSair)
        coluna.addView(linha2)
    }

    private fun cartao(titulo: String, linhas: List<String>): View {
        val c = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(TvUi.dp(this@AccountActivity, 22), TvUi.dp(this@AccountActivity, 18), TvUi.dp(this@AccountActivity, 22), TvUi.dp(this@AccountActivity, 18))
            background = TvUi.fundo(ContextCompat.getColor(this@AccountActivity, R.color.mf_surface), 12, this@AccountActivity, ContextCompat.getColor(this@AccountActivity, R.color.mf_border), 1)
        }
        c.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@AccountActivity, 16) }
        c.addView(TvUi.texto(this, titulo, 18f, ContextCompat.getColor(this, R.color.mf_white), negrito = true))
        for (l in linhas) {
            val t = TvUi.texto(this, "•  $l", 14f, ContextCompat.getColor(this, R.color.mf_gray_light), maxLinhas = 2)
            t.setPadding(0, TvUi.dp(this, 6), 0, 0)
            c.addView(t)
        }
        return c
    }

    private fun trocarSenha() {
        val campo = android.widget.EditText(this).apply {
            hint = "Nova senha (min. 6 caracteres)"
            inputType = android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setPadding(TvUi.dp(this@AccountActivity, 16), TvUi.dp(this@AccountActivity, 12), TvUi.dp(this@AccountActivity, 16), TvUi.dp(this@AccountActivity, 12))
        }
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Alterar senha")
            .setView(campo)
            .setPositiveButton("Salvar") { _, _ ->
                val nova = campo.text.toString()
                if (nova.length < 6) { TvUi.aviso(this, "A senha precisa de pelo menos 6 caracteres."); return@setPositiveButton }
                executor.execute {
                    val r = AuthRepository.trocarSenha(this, nova)
                    runOnUiThread {
                        TvUi.aviso(this, if (r.ok) "Senha alterada com sucesso" else (r.error ?: "Nao foi possivel alterar"))
                    }
                }
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    override fun onResume() { super.onResume(); carregar() }

    override fun focoPadrao(): View? = if (::coluna.isInitialized && coluna.childCount > 1) coluna.getChildAt(coluna.childCount - 1) else null
}
