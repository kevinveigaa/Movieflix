package com.movieflix.tv

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Assinatura e planos — MESMAS regras, MESMOS preços e MESMOS limites do site.
 *
 * Fonte: tabelas `subscriptions` e `plans` do Supabase + `PlanoRegras`
 * (cópia fiel de `src/lib/plans.ts`). A contratação acontece no site/app com a
 * mesma conta — a TV exibe o estado real e os planos disponíveis.
 */
class AccountActivity : SidebarHostActivity() {

    override val itemAtivo: String = "config"

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)

    private lateinit var lblAtual: TextView
    private lateinit var lblStatus: TextView
    private lateinit var lblLimites: TextView
    private lateinit var container: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val raiz = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(
            raiz,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        val cabecalho = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@AccountActivity, 34f),
                MfDesign.dp(this@AccountActivity, 26f),
                MfDesign.dp(this@AccountActivity, 34f),
                MfDesign.dp(this@AccountActivity, 4f),
            )
        }
        cabecalho.addView(MfDesign.tituloTela(this, "Assinatura e planos"))

        lblAtual = TextView(this).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            typeface = Typeface.DEFAULT_BOLD
        }
        cabecalho.addView(
            lblAtual,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@AccountActivity, 16f) },
        )

        lblStatus = MfDesign.texto(this, "").apply { textSize = 15f; maxLines = 3 }
        cabecalho.addView(
            lblStatus,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@AccountActivity, 6f) },
        )

        lblLimites = MfDesign.texto(this, "", 14f, MfDesign.PURPLE_LIGHT).apply { maxLines = 2 }
        cabecalho.addView(
            lblLimites,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@AccountActivity, 6f) },
        )
        raiz.addView(cabecalho)

        val scroll = ScrollView(this).apply { isFillViewport = false; clipToPadding = false }
        container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@AccountActivity, 34f), 0,
                MfDesign.dp(this@AccountActivity, 34f),
                MfDesign.dp(this@AccountActivity, 30f),
            )
        }
        scroll.addView(container)
        raiz.addView(
            scroll,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f,
            ),
        )

        carregar()
    }

    private fun carregar() {
        if (!AuthRepository.estaLogado(this)) {
            lblAtual.text = "Entre com a sua conta"
            lblStatus.text = "Use a mesma conta do site/app MovieFlix."
            return
        }

        scope.launch {
            val (assinatura, planos) = withContext(Dispatchers.IO) {
                AccountRepository.assinatura(this@AccountActivity) to
                    AccountRepository.planos(this@AccountActivity)
            }
            val ativa = AccountRepository.temAssinaturaAtiva(assinatura)
            val planoAtual = PlanoRegras.resolvePlano(assinatura, planos)
            val ent = PlanoRegras.entitlementsForSubscription(assinatura, ativa, planos)

            if (ativa && planoAtual != null) {
                lblAtual.text = "Seu plano: ${planoAtual.name}"
                val venc = PlanoRegras.formatarVencimento(assinatura?.expiresAt)
                lblStatus.text = "Assinatura ATIVA • vence em $venc\n" +
                    PlanoRegras.rotuloDiasRestantes(assinatura?.expiresAt)
                lblStatus.setTextColor(MfDesign.TEAL)
            } else if (assinatura != null) {
                lblAtual.text = "Assinatura inativa ou expirada"
                lblStatus.text = "Status: ${assinatura.status ?: "—"} • " +
                    PlanoRegras.rotuloDiasRestantes(assinatura.expiresAt)
                lblStatus.setTextColor(MfDesign.ERROR)
            } else {
                lblAtual.text = "Você ainda não tem assinatura"
                lblStatus.text = "Escolha um plano no site ou no app MovieFlix — a mesma conta vale aqui na TV."
                lblStatus.setTextColor(MfDesign.GRAY)
            }

            val downloadLabel = when {
                ent.downloads <= 0 -> "sem downloads"
                ent.downloads == PlanoRegras.UNLIMITED -> "downloads ilimitados"
                else -> "${ent.downloads} downloads/mês"
            }
            lblLimites.text = "Liberado no seu plano: até ${ent.qualityLabel} • " +
                "${PlanoRegras.telasLabel(ent.screens)} • $downloadLabel • " +
                (if (ent.maxProfiles <= 1) "1 perfil" else "até ${ent.maxProfiles} perfis")

            container.removeAllViews()
            for (p in planos) {
                container.addView(criarCartaoPlano(p, planoAtual?.id == p.id))
            }
            if (planos.isNotEmpty()) container.getChildAt(0).requestFocus()
        }
    }

    /** Cartão de plano (preço/limites vindos do banco — nada é inventado). */
    private fun criarCartaoPlano(plano: AccountRepository.Plano, atual: Boolean): View {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@AccountActivity, 30f), MfDesign.dp(this@AccountActivity, 24f),
                MfDesign.dp(this@AccountActivity, 30f), MfDesign.dp(this@AccountActivity, 24f),
            )
            isFocusable = true
            isFocusableInTouchMode = true
            background = fundoCartao(false, atual)
        }

        val topo = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        card.addView(topo)

        topo.addView(
            TextView(this).apply {
                text = "${plano.name}   •   ${PlanoRegras.precoFormatado(plano.priceCents)}/mês"
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 21f)
                typeface = Typeface.DEFAULT_BOLD
            },
        )

        if (atual) {
            topo.addView(
                TextView(this).apply {
                    text = "PLANO ATUAL"
                    setTextColor(Color.WHITE)
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                    typeface = Typeface.DEFAULT_BOLD
                    letterSpacing = 0.1f
                    setPadding(
                        MfDesign.dp(this@AccountActivity, 12f), MfDesign.dp(this@AccountActivity, 5f),
                        MfDesign.dp(this@AccountActivity, 12f), MfDesign.dp(this@AccountActivity, 5f),
                    )
                    background = MfDesign.gradienteDestaque(8f)
                },
                LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                ).apply { marginStart = MfDesign.dp(this@AccountActivity, 14f) },
            )
        }

        card.addView(
            TextView(this).apply {
                text = plano.description.ifBlank { "Acesso completo ao catálogo MovieFlix." }
                setTextColor(MfDesign.GRAY)
                textSize = 15f
            },
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@AccountActivity, 10f) },
        )

        for (destaque in PlanoRegras.destaques(plano)) {
            card.addView(
                TextView(this).apply {
                    text = "•  $destaque"
                    setTextColor(MfDesign.GRAY_LIGHT)
                    textSize = 15f
                    setPadding(0, MfDesign.dp(this@AccountActivity, 3f), 0, 0)
                },
            )
        }

        card.setOnFocusChangeListener { v, temFoco ->
            v.background = fundoCartao(temFoco, atual)
            v.animate().scaleX(if (temFoco) 1.02f else 1f)
                .scaleY(if (temFoco) 1.02f else 1f).setDuration(130).start()
        }

        card.layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = MfDesign.dp(this@AccountActivity, 16f) }

        return card
    }

    private fun fundoCartao(focado: Boolean, atual: Boolean): GradientDrawable = GradientDrawable().apply {
        cornerRadius = MfDesign.dp(this@AccountActivity, 18f).toFloat()
        setColor(if (focado) MfDesign.SURFACE_STRONG else MfDesign.SURFACE_LIGHT)
        when {
            focado -> setStroke(MfDesign.dp(this@AccountActivity, 3f), MfDesign.PURPLE)
            atual -> setStroke(MfDesign.dp(this@AccountActivity, 3f), MfDesign.MAGENTA)
            else -> setStroke(MfDesign.dp(this@AccountActivity, 1f), MfDesign.BORDER)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
