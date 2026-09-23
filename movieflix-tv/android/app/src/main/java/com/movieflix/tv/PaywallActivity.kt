package com.movieflix.tv

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
 * PAYWALL / PLANOS — le os planos REAIS da tabela `plans` (precos e duracao do
 * banco) e abre o WhatsApp oficial com a mensagem pronta.
 *
 * Nenhum preco e escrito no codigo: tudo vem do backend, igual ao site.
 */
class PaywallActivity : BaseTvActivity() {

    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var colunaPlanos: LinearLayout
    private lateinit var aviso: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        montarTela()
        carregar()
    }

    private fun montarTela() {
        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(TvUi.dp(this@PaywallActivity, 44), TvUi.dp(this@PaywallActivity, 26), TvUi.dp(this@PaywallActivity, 44), TvUi.dp(this@PaywallActivity, 34))
        }

        val titulo = TvUi.texto(this, "ASSINE O MOVIEFLIX", 26f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        raiz.addView(titulo)

        val sub = TvUi.texto(
            this,
            "Escolha o plano e envie a mensagem pelo WhatsApp. A ativacao e feita na hora pelo nosso atendimento.",
            13f, ContextCompat.getColor(this, R.color.mf_gray), maxLinhas = 2,
        )
        sub.setPadding(0, TvUi.dp(this, 8), 0, TvUi.dp(this, 8))
        raiz.addView(sub)

        aviso = TvUi.texto(this, "", 13f, ContextCompat.getColor(this, R.color.mf_error), maxLinhas = 2)
        raiz.addView(aviso)

        val scrollH = android.widget.HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
        colunaPlanos = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, TvUi.dp(this@PaywallActivity, 20), 0, TvUi.dp(this@PaywallActivity, 10))
        }
        scrollH.addView(colunaPlanos)
        raiz.addView(scrollH)

        val rodape = TvUi.botao(this, "Falar no WhatsApp")
        rodape.setOnClickListener { contratar(null) }
        raiz.addView(rodape, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@PaywallActivity, 14) })

        val voltar = TvUi.botao(this, "← Voltar")
        voltar.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@PaywallActivity, 12) }
        voltar.setOnClickListener { finish() }
        raiz.addView(voltar)

        scroll.addView(raiz)
        conteudo(scroll)
    }

    private fun carregar() {
        executor.execute {
            val planos = AccountRepository.planos(this)
            val ativa = AccountRepository.temAssinaturaAtiva(AccountRepository.assinatura(this))
            runOnUiThread {
                colunaPlanos.removeAllViews()
                if (planos.isEmpty()) {
                    aviso.text = "Nao foi possivel carregar os planos agora. Use o botao WhatsApp para falar com o atendimento."
                    return@runOnUiThread
                }
                for (p in planos) {
                    colunaPlanos.addView(cartaoPlano(p, ativa))
                }
                colunaPlanos.post { if (colunaPlanos.childCount > 0) colunaPlanos.getChildAt(0).requestFocus() }
            }
        }
    }

    private fun cartaoPlano(p: AccountRepository.Plano, ativa: Boolean): View {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(TvUi.dp(this@PaywallActivity, 24), TvUi.dp(this@PaywallActivity, 20), TvUi.dp(this@PaywallActivity, 24), TvUi.dp(this@PaywallActivity, 20))
        }
        val lp = LinearLayout.LayoutParams(TvUi.dp(this, 330), ViewGroup.LayoutParams.WRAP_CONTENT)
        lp.marginEnd = TvUi.dp(this, 20)
        card.layoutParams = lp
        val normal = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface), 14, this, ContextCompat.getColor(this, R.color.mf_border), 1)
        val foco = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface_strong), 14, this, ContextCompat.getColor(this, R.color.mf_red), 3)
        card.background = normal

        card.addView(TvUi.texto(this, p.name.ifBlank { p.code.uppercase() }, 20f, ContextCompat.getColor(this, R.color.mf_white), negrito = true))

        val preco = TvUi.texto(this, PlanoRegras.precoFormatado(p.priceCents), 26f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        preco.setPadding(0, TvUi.dp(this, 8), 0, TvUi.dp(this, 2))
        card.addView(preco)

        val duracao = TvUi.texto(
            this,
            "${p.durationDays} dias" + (p.description.takeIf { it.isNotBlank() }?.let { "  •  $it" } ?: ""),
            12f, ContextCompat.getColor(this, R.color.mf_gray),
        )
        card.addView(duracao)

        for (d in PlanoRegras.destaques(p)) {
            val t = TvUi.texto(this, "✓  $d", 13f, ContextCompat.getColor(this, R.color.mf_gray_light), maxLinhas = 2)
            t.setPadding(0, TvUi.dp(this, 7), 0, 0)
            card.addView(t)
        }

        val botao = TvUi.botao(this, if (ativa) "Trocar para este" else "Contratar", primario = true)
        botao.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = TvUi.dp(this@PaywallActivity, 18) }
        botao.setOnClickListener { contratar(p) }
        card.addView(botao)

        card.isFocusable = true
        card.setOnFocusChangeListener { v, temFoco -> v.background = if (temFoco) foco else normal }
        card.setOnClickListener { contratar(p) }
        return card
    }

    /**
     * Abre o WhatsApp FORA do app (deep link + fallback wa.me) com a mensagem
     * preenchida: e-mail logado + plano + valor + duracao.
     */
    private fun contratar(plano: AccountRepository.Plano?) {
        val email = AuthRepository.loadEmail(this)
        val msg = WhatsAppHelper.mensagem(
            email = email,
            planoNome = plano?.name?.takeIf { it.isNotBlank() } ?: plano?.code,
            valorFormatado = plano?.let { PlanoRegras.precoFormatado(it.priceCents) },
            duracaoDias = plano?.durationDays,
        )
        val abriu = WhatsAppHelper.abrir(this, msg)
        if (!abriu) {
            aviso.text = "Nao foi possivel abrir o WhatsApp nesta TV. Fale com o atendimento pelo numero ${AppConfig.WHATSAPP_NUMBER}."
        }
    }

    override fun focoPadrao(): View? = if (::colunaPlanos.isInitialized && colunaPlanos.childCount > 0) colunaPlanos.getChildAt(0) else null
}
