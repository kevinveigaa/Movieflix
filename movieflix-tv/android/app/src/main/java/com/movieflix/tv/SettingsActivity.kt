package com.movieflix.tv

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.os.Bundle
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
 * Configurações da TV — paridade com as opções aplicáveis do app mobile:
 * qualidade preferida, próximo episódio automático, limites do plano, perfil
 * ativo, conta e SAIR (logout). Somente preferências de uso: nenhuma regra de
 * negócio nova é criada aqui.
 */
class SettingsActivity : SidebarHostActivity() {

    override val itemAtivo: String = "config"

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)
    private lateinit var container: LinearLayout
    private var primeiroItem: View? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val scroll = ScrollView(this).apply { isFillViewport = false; clipToPadding = false }
        container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@SettingsActivity, 34f),
                MfDesign.dp(this@SettingsActivity, 26f),
                MfDesign.dp(this@SettingsActivity, 34f),
                MfDesign.dp(this@SettingsActivity, 30f),
            )
        }
        scroll.addView(container)
        content.addView(
            scroll,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        montar()
    }

    private fun montar() {
        container.removeAllViews()
        primeiroItem = null

        adicionarSecao("Conta")
        adicionarLinha("E-mail", AuthRepository.loadEmail(this) ?: "—") { }
        adicionarLinha("Perfil ativo", ProfilesRepository.perfilAtivo(this)?.name ?: "Nenhum") {
            startActivity(Intent(this, ProfilesActivity::class.java))
        }
        adicionarLinha("Assinatura e planos", "Ver planos, vencimento e limites") {
            startActivity(Intent(this, AccountActivity::class.java))
        }
        // Troca de senha com o usuário logado — mesma operação do site/mobile
        // (supabase.auth.updateUser({ password })).
        adicionarLinha("Trocar senha", "Altera a senha desta conta (igual ao app do celular)") {
            trocarSenha()
        }

        adicionarSecao("Reprodução")
        adicionarLinha("Qualidade preferida", AppPrefs.qualidadeLabel(AppPrefs.qualidadePreferida(this))) {
            escolherQualidade()
        }
        adicionarToggle(
            "Próximo episódio automático",
            AppPrefs.autoplayProximoEpisodio(this),
        ) { ativo -> AppPrefs.setAutoplayProximoEpisodio(this, ativo) }

        adicionarSecao("Seu plano")
        val lblPlano = adicionarLinha("Carregando limites…", "") { }
        scope.launch {
            val (assinatura, planos) = withContext(Dispatchers.IO) {
                AccountRepository.assinatura(this@SettingsActivity) to
                    AccountRepository.planos(this@SettingsActivity)
            }
            val ativa = AccountRepository.temAssinaturaAtiva(assinatura)
            val ent = PlanoRegras.entitlementsForSubscription(assinatura, ativa, planos)
            val downloadLabel = when {
                ent.downloads <= 0 -> "sem downloads offline"
                ent.downloads == PlanoRegras.UNLIMITED -> "downloads ilimitados por mês"
                else -> "${ent.downloads} downloads por mês"
            }
            val venc = if (ativa) {
                " • vence em ${PlanoRegras.formatarVencimento(assinatura?.expiresAt)}"
            } else {
                " • sem assinatura ativa"
            }
            lblPlano.text = "Qualidade até ${ent.qualityLabel} • ${PlanoRegras.telasLabel(ent.screens)} • " +
                "$downloadLabel$venc\n(Os downloads offline são feitos no app do celular, com esta mesma conta.)"
        }

        adicionarSecao("Idioma")
        adicionarLinha("Áudio e legendas", "Português (pt-BR) — padrão do catálogo") { }

        adicionarSecao("Sessão")
        adicionarLinha("Sair da conta", "Encerra a sessão nesta TV") { confirmarLogout() }

        primeiroItem?.requestFocus()
    }

    private fun adicionarSecao(titulo: String) {
        container.addView(
            TextView(this).apply {
                text = titulo.uppercase()
                setTextColor(MfDesign.PURPLE_LIGHT)
                textSize = 13f
                typeface = Typeface.DEFAULT_BOLD
                letterSpacing = 0.12f
                setPadding(
                    0, MfDesign.dp(this@SettingsActivity, 22f), 0,
                    MfDesign.dp(this@SettingsActivity, 8f),
                )
            },
        )
    }

    private fun adicionarLinha(rotulo: String, valor: String, acao: () -> Unit): TextView {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@SettingsActivity, 26f), MfDesign.dp(this@SettingsActivity, 16f),
                MfDesign.dp(this@SettingsActivity, 26f), MfDesign.dp(this@SettingsActivity, 16f),
            )
            isFocusable = true
            isFocusableInTouchMode = true
            isClickable = true
            background = fundoRow(false)
        }

        row.addView(
            TextView(this).apply {
                text = rotulo
                setTextColor(MfDesign.WHITE)
                textSize = 18f
                typeface = Typeface.DEFAULT_BOLD
            },
        )

        val valTv = TextView(this).apply {
            text = valor
            setTextColor(MfDesign.GRAY)
            textSize = 14f
            setPadding(0, MfDesign.dp(this@SettingsActivity, 4f), 0, 0)
        }
        row.addView(valTv)

        row.setOnClickListener { acao() }
        row.setOnFocusChangeListener { v, temFoco ->
            v.background = fundoRow(temFoco)
            v.animate().scaleX(if (temFoco) 1.012f else 1f)
                .scaleY(if (temFoco) 1.012f else 1f).setDuration(120).start()
        }

        container.addView(
            row,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { bottomMargin = MfDesign.dp(this@SettingsActivity, 10f) },
        )
        if (primeiroItem == null) primeiroItem = row
        return valTv
    }

    private fun adicionarToggle(rotulo: String, inicial: Boolean, onChange: (Boolean) -> Unit) {
        var estado = inicial
        val valor = adicionarLinha(rotulo, if (estado) "Ligado" else "Desligado") { }
        (valor.parent as? LinearLayout)?.setOnClickListener {
            estado = !estado
            valor.text = if (estado) "Ligado" else "Desligado"
            valor.setTextColor(if (estado) MfDesign.TEAL else MfDesign.GRAY)
            onChange(estado)
        }
    }

    private fun escolherQualidade() {
        val opcoes = listOf("Automática", "4K (2160p)", "Full HD (1080p)", "HD (720p)")
        val valores = listOf("auto", "2160", "1080", "720")
        val atual = valores.indexOf(AppPrefs.qualidadePreferida(this)).coerceAtLeast(0)
        // Diálogo próprio do app: a lista do AlertDialog do sistema não recebe
        // foco do D-pad em boa parte dos TV Box.
        MfDialog.escolher(this, "Qualidade preferida", opcoes, atual) { which ->
            AppPrefs.setQualidadePreferida(this, valores[which])
            montar()
        }
    }

    /**
     * TROCA DE SENHA logado — o mesmo fluxo do mobile/site.
     * Pede a nova senha duas vezes (com o teclado em tela) e chama
     * `AuthRepository.trocarSenha` (PUT /auth/v1/user).
     */
    private fun trocarSenha() {
        MfDialog.entrarTexto(
            this,
            titulo = "Trocar senha",
            dica = "Nova senha (mínimo 6 caracteres)",
            rotuloConfirmar = "CONTINUAR",
            senha = true,
            validar = { v ->
                if (v.length < 6) "A senha precisa de pelo menos 6 caracteres." else null
            },
        ) { nova ->
            MfDialog.entrarTexto(
                this,
                titulo = "Confirme a nova senha",
                dica = "Repita a nova senha",
                rotuloConfirmar = "SALVAR",
                senha = true,
                validar = { v -> if (v != nova) "As senhas não conferem." else null },
            ) {
                scope.launch {
                    val r = withContext(Dispatchers.IO) {
                        AuthRepository.trocarSenha(this@SettingsActivity, nova)
                    }
                    avisar(
                        if (r.ok) {
                            "Senha alterada com sucesso. Use a nova senha no site, no celular e nesta TV."
                        } else {
                            r.error ?: "Não foi possível alterar a senha agora."
                        },
                    )
                }
            }
        }
    }

    /** Aviso simples navegável pelo controle. */
    private fun avisar(mensagem: String) {
        MfDialog.escolher(this, mensagem, listOf("OK")) { }
    }

    private fun confirmarLogout() {
        MfDialog.escolher(
            this,
            "Sair da conta? Você precisará entrar de novo com a mesma conta do MovieFlix.",
            listOf("SAIR", "CANCELAR"),
        ) { which ->
            if (which != 0) return@escolher
            scope.launch {
                withContext(Dispatchers.IO) {
                    PlaybackSessionRepository.encerrar(this@SettingsActivity)
                    AuthRepository.clearSession(this@SettingsActivity)
                    ProfilesRepository.setPerfilAtivo(this@SettingsActivity, null)
                }
                startActivity(Intent(this@SettingsActivity, LoginActivity::class.java))
                finishAffinity()
            }
        }
    }

    private fun fundoRow(focado: Boolean): GradientDrawable = GradientDrawable().apply {
        cornerRadius = MfDesign.dp(this@SettingsActivity, 14f).toFloat()
        setColor(if (focado) MfDesign.SURFACE_STRONG else MfDesign.SURFACE_LIGHT)
        setStroke(
            MfDesign.dp(this@SettingsActivity, if (focado) 3f else 1f),
            if (focado) MfDesign.PURPLE else MfDesign.BORDER,
        )
    }

    /** BACK fecha o diálogo aberto antes de sair da tela. */
    override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent?): Boolean {
        if (keyCode == android.view.KeyEvent.KEYCODE_BACK && MfDialog.estaAberto()) {
            MfDialog.fechar()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
