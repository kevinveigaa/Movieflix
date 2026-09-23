package com.movieflix.tv

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

/**
 * Login / Cadastro / Recuperacao de senha — MESMA conta do site (Supabase Auth).
 *
 * Uma unica tela em 3 modos (LOGIN, CADASTRO, RECUPERAR). O formulario e
 * navegavel apenas pelo controle remoto: os campos sao EditText (o teclado da TV
 * aparece ao focar) e os botoes tem anel de foco visivel.
 */
class LoginActivity : BaseTvActivity() {

    private enum class Modo { LOGIN, CADASTRO, RECUPERAR }

    private var modo = Modo.LOGIN
    private lateinit var campoTitulo: TextView
    private lateinit var campoSubtitulo: TextView
    private lateinit var campoEmail: EditText
    private lateinit var campoSenha: EditText
    private lateinit var campoConfirmar: EditText
    private lateinit var botaoPrincipal: TextView
    private lateinit var botaoAlternar: TextView
    private lateinit var botaoRecuperar: TextView
    private lateinit var campoMensagem: TextView
    private lateinit var coluna: LinearLayout
    private val executor = Executors.newSingleThreadExecutor()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        montarTela()
    }

    private fun montarTela() {
        val scroll = ScrollView(this).apply { isVerticalScrollBarEnabled = false }
        coluna = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(TvUi.dp(this@LoginActivity, 120), TvUi.dp(this@LoginActivity, 40), TvUi.dp(this@LoginActivity, 120), TvUi.dp(this@LoginActivity, 40))
        }

        val marca = TvUi.texto(this, "MOVIEFLIX", 40f, ContextCompat.getColor(this, R.color.mf_purple), negrito = true)
        coluna.addView(marca, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { bottomMargin = TvUi.dp(this@LoginActivity, 6) })

        campoTitulo = TvUi.texto(this, "", 24f, ContextCompat.getColor(this, R.color.mf_white), negrito = true)
        coluna.addView(campoTitulo)

        campoSubtitulo = TvUi.texto(this, "", 13f, ContextCompat.getColor(this, R.color.mf_gray), maxLinhas = 2)
        campoSubtitulo.gravity = Gravity.CENTER
        coluna.addView(campoSubtitulo, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = TvUi.dp(this@LoginActivity, 6); bottomMargin = TvUi.dp(this@LoginActivity, 22)
        })

        campoEmail = criarCampo("E-mail", InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        campoSenha = criarCampo("Senha", InputType.TYPE_TEXT_VARIATION_PASSWORD)
        campoConfirmar = criarCampo("Confirmar senha", InputType.TYPE_TEXT_VARIATION_PASSWORD)

        coluna.addView(campoEmail)
        coluna.addView(campoSenha)
        coluna.addView(campoConfirmar)

        botaoPrincipal = TvUi.botao(this, "Entrar", primario = true)
        botaoPrincipal.setTextSize(16f)
        botaoPrincipal.layoutParams = LinearLayout.LayoutParams(TvUi.dp(this, 260), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = TvUi.dp(this@LoginActivity, 22); gravity = Gravity.CENTER_HORIZONTAL
        }
        botaoPrincipal.setOnClickListener { executar() }
        coluna.addView(botaoPrincipal)

        botaoRecuperar = TvUi.botao(this, "Esqueci a senha")
        val lpRec = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = TvUi.dp(this@LoginActivity, 14); gravity = Gravity.CENTER_HORIZONTAL
        }
        botaoRecuperar.layoutParams = lpRec
        botaoRecuperar.setOnClickListener { if (modo == Modo.RECUPERAR) setModo(Modo.LOGIN) else setModo(Modo.RECUPERAR) }
        coluna.addView(botaoRecuperar)

        botaoAlternar = TvUi.botao(this, "Criar conta")
        botaoAlternar.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = TvUi.dp(this@LoginActivity, 10); gravity = Gravity.CENTER_HORIZONTAL
        }
        botaoAlternar.setOnClickListener { if (modo == Modo.CADASTRO) setModo(Modo.LOGIN) else setModo(Modo.CADASTRO) }
        coluna.addView(botaoAlternar)

        campoMensagem = TvUi.texto(this, "", 13f, ContextCompat.getColor(this, R.color.mf_error), maxLinhas = 3)
        campoMensagem.gravity = Gravity.CENTER
        coluna.addView(campoMensagem, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = TvUi.dp(this@LoginActivity, 16)
        })

        scroll.addView(coluna)
        conteudo(scroll)
        setModo(Modo.LOGIN)
        garantirFocoAposLayout(scroll, campoEmail)
    }

    private fun criarCampo(dica: String, tipo: Int): EditText {
        val e = EditText(this)
        e.hint = dica
        e.inputType = tipo
        e.setTextSize(14f)
        e.setHintTextColor(ContextCompat.getColor(this, R.color.mf_gray))
        e.setTextColor(ContextCompat.getColor(this, R.color.mf_white))
        e.background = TvUi.fundo(ContextCompat.getColor(this, R.color.mf_surface_light), 10, this, ContextCompat.getColor(this, R.color.mf_border), 1)
        e.setPadding(TvUi.dp(this, 18), TvUi.dp(this, 14), TvUi.dp(this, 18), TvUi.dp(this, 14))
        e.isFocusable = true
        e.isFocusableInTouchMode = true
        e.layoutParams = LinearLayout.LayoutParams(TvUi.dp(this, 460), ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = TvUi.dp(this@LoginActivity, 12); gravity = Gravity.CENTER_HORIZONTAL
        }
        e.setOnFocusChangeListener { v, temFoco ->
            v.background = TvUi.fundo(
                ContextCompat.getColor(this, if (temFoco) R.color.mf_surface_strong else R.color.mf_surface_light),
                10, this, ContextCompat.getColor(this, if (temFoco) R.color.mf_purple else R.color.mf_border), if (temFoco) 2 else 1,
            )
        }
        return e
    }

    private fun setModo(novo: Modo) {
        modo = novo
        campoMensagem.text = ""
        campoSenha.setText("")
        campoConfirmar.setText("")
        when (novo) {
            Modo.LOGIN -> {
                campoTitulo.text = "Entrar na sua conta"
                campoSubtitulo.text = "Use o mesmo e-mail e senha do site MovieFlix"
                botaoPrincipal.text = "Entrar"
                botaoAlternar.text = "Criar conta"
                campoConfirmar.visibility = View.GONE
                botaoRecuperar.visibility = View.VISIBLE
            }
            Modo.CADASTRO -> {
                campoTitulo.text = "Criar conta"
                campoSubtitulo.text = "A mesma conta funciona no site, no celular e na TV"
                botaoPrincipal.text = "Criar conta"
                botaoAlternar.text = "Ja tenho conta"
                campoConfirmar.visibility = View.VISIBLE
                botaoRecuperar.visibility = View.VISIBLE
            }
            Modo.RECUPERAR -> {
                campoTitulo.text = "Recuperar senha"
                campoSubtitulo.text = "Enviaremos um link de redefinicao para o seu e-mail"
                botaoPrincipal.text = "Enviar link"
                botaoAlternar.text = "Voltar"
                campoConfirmar.visibility = View.GONE
                botaoRecuperar.visibility = View.GONE
            }
        }
        campoEmail.requestFocus()
    }

    private fun executar() {
        val email = campoEmail.text.toString().trim()
        val senha = campoSenha.text.toString()
        if (email.isBlank() || !email.contains("@")) {
            erro("Informe um e-mail valido."); return
        }
        if (modo != Modo.RECUPERAR && senha.length < 6) {
            erro("A senha precisa de pelo menos 6 caracteres."); return
        }
        if (modo == Modo.CADASTRO && senha != campoConfirmar.text.toString()) {
            erro("As senhas nao conferem."); return
        }

        ocupado(true)
        executor.execute {
            val r = when (modo) {
                Modo.LOGIN -> AuthRepository.login(email, senha)
                Modo.CADASTRO -> AuthRepository.signup(email, senha)
                Modo.RECUPERAR -> AuthRepository.recuperarSenha(email)
            }
            runOnUiThread {
                ocupado(false)
                if (!r.ok) { erro(r.error ?: "Nao foi possivel concluir."); return@runOnUiThread }
                when (modo) {
                    Modo.LOGIN -> {
                        AuthRepository.saveSession(this, r)
                        ProfilesRepository.setPerfilAtivo(this, null)
                        startActivity(Intent(this, ProfilesActivity::class.java)); finish()
                    }
                    Modo.CADASTRO -> {
                        val salvou = AuthRepository.saveSession(this, r)
                        if (salvou) {
                            ProfilesRepository.setPerfilAtivo(this, null)
                            startActivity(Intent(this, ProfilesActivity::class.java)); finish()
                        } else {
                            ok("Conta criada! Verifique seu e-mail para confirmar e depois entre.")
                            setModo(Modo.LOGIN)
                        }
                    }
                    Modo.RECUPERAR -> {
                        ok("Link enviado para $email. Confira a caixa de entrada e o spam.")
                        setModo(Modo.LOGIN)
                    }
                }
            }
        }
    }

    private fun ocupado(v: Boolean) {
        botaoPrincipal.isEnabled = !v
        botaoPrincipal.text = if (v) "Aguarde..." else when (modo) {
            Modo.LOGIN -> "Entrar"
            Modo.CADASTRO -> "Criar conta"
            Modo.RECUPERAR -> "Enviar link"
        }
    }

    private fun erro(msg: String) {
        campoMensagem.setTextColor(ContextCompat.getColor(this, R.color.mf_error))
        campoMensagem.text = msg
    }

    private fun ok(msg: String) {
        campoMensagem.setTextColor(ContextCompat.getColor(this, R.color.mf_green))
        campoMensagem.text = msg
    }
}
