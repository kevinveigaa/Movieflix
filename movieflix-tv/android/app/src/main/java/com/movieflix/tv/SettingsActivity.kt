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
import androidx.appcompat.app.AlertDialog
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
        adicionarLinha("Trocar senha", "Altera a senha da sua conta MovieFlix") {
            dialogoTrocarSenha()
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
        val opcoes = arrayOf("Automática", "4K (2160p)", "Full HD (1080p)", "HD (720p)")
        val valores = arrayOf("auto", "2160", "1080", "720")
        AlertDialog.Builder(this)
            .setTitle("Qualidade preferida")
            .setItems(opcoes) { _, which ->
                AppPrefs.setQualidadePreferida(this, valores[which])
                montar()
            }
            .show()
    }

    /**
     * TROCA DE SENHA logado — MESMO endpoint do supabase-js (`updateUser`).
     * A senha nova passa a valer no site, no celular e na TV (mesma conta).
     */
    private fun dialogoTrocarSenha() {
        val coluna = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(
                MfDesign.dp(this@SettingsActivity, 18f), MfDesign.dp(this@SettingsActivity, 10f),
                MfDesign.dp(this@SettingsActivity, 18f), MfDesign.dp(this@SettingsActivity, 12f),
            )
        }
        val campo = android.widget.EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            hint = "Nova senha (mínimo 6 caracteres)"
            setTextColor(android.graphics.Color.WHITE)
            setHintTextColor(MfDesign.GRAY)
            showSoftInputOnFocus = false
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            background = resources.getDrawable(R.drawable.bg_input, null)
            setPadding(
                MfDesign.dp(this@SettingsActivity, 20f), 0,
                MfDesign.dp(this@SettingsActivity, 20f), 0,
            )
        }
        coluna.addView(
            campo,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                MfDesign.dp(this, 56f),
            ),
        )
        val aviso = TextView(this).apply {
            text = "Use no mínimo 6 caracteres."
            setTextColor(MfDesign.GRAY)
            textSize = 13f
            setPadding(0, MfDesign.dp(this@SettingsActivity, 10f), 0, 0)
        }
        coluna.addView(aviso)
        val teclado = MfKeyboard(this).apply {
            rotuloConfirmar = "SALVAR"
            definirAlvo(campo)
            acima = campo
        }
        coluna.addView(
            teclado,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = MfDesign.dp(this@SettingsActivity, 12f) },
        )

        val dialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Trocar senha")
            .setView(coluna)
            .setPositiveButton("FECHAR", null)
            .create()

        fun salvar() {
            val senha = campo.text.toString()
            if (senha.length < 6) {
                aviso.text = "A senha precisa de pelo menos 6 caracteres."
                aviso.setTextColor(MfDesign.ERROR)
                return
            }
            val token = AuthRepository.loadToken(this)
            if (token.isNullOrBlank()) {
                aviso.text = "Sessão expirada. Entre novamente."
                aviso.setTextColor(MfDesign.ERROR)
                return
            }
            aviso.text = "Salvando…"
            aviso.setTextColor(MfDesign.GRAY)
            scope.launch {
                val ok = withContext(Dispatchers.IO) { AuthRepository.atualizarSenha(senha, token) }
                aviso.text = if (ok) "Senha alterada! Vale no site, no celular e aqui."
                else "Não foi possível alterar. Tente novamente."
                aviso.setTextColor(if (ok) MfDesign.TEAL else MfDesign.ERROR)
            }
        }

        teclado.aoConfirmar = { salvar() }
        campo.setOnClickListener { teclado.definirAlvo(campo); teclado.focarPrimeira() }
        dialog.setOnShowListener {
            dialog.getButton(android.content.DialogInterface.BUTTON_POSITIVE)
                .setOnClickListener { dialog.dismiss() }
        }
        dialog.show()
        dialog.window?.setLayout(
            MfDesign.dp(this, 820f),
            android.view.ViewGroup.LayoutParams.WRAP_CONTENT,
        )
    }

    private fun confirmarLogout() {
        AlertDialog.Builder(this)
            .setTitle("Sair da conta?")
            .setMessage("Você precisará entrar de novo com a mesma conta do MovieFlix.")
            .setPositiveButton("SAIR") { _, _ ->
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
            .setNegativeButton("CANCELAR", null)
            .show()
    }

    private fun fundoRow(focado: Boolean): GradientDrawable = GradientDrawable().apply {
        cornerRadius = MfDesign.dp(this@SettingsActivity, 14f).toFloat()
        setColor(if (focado) MfDesign.SURFACE_STRONG else MfDesign.SURFACE_LIGHT)
        setStroke(
            MfDesign.dp(this@SettingsActivity, if (focado) 3f else 1f),
            if (focado) MfDesign.PURPLE else MfDesign.BORDER,
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
