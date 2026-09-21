package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Login/Cadastro nativo — MESMA conta Supabase do site e do celular:
 * - "ENTRAR"      → signInWithPassword (POST /auth/v1/token?grant_type=password)
 * - "CRIAR CONTA" → signUp (POST /auth/v1/signup) — entra automaticamente
 *
 * Identidade visual nova (fundo preto premium, botões-pílula em gradiente).
 * Controle remoto: ordem de foco fixa (e-mail → senha → ENTRAR → CRIAR CONTA),
 * teclado em tela ao focar e OK no campo de senha dispara o login.
 */
class LoginActivity : AppCompatActivity() {

    private val job = Job()
    private val scope = CoroutineScope(Dispatchers.Main + job)
    private var trabalhando = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        val email = findViewById<EditText>(R.id.inputEmail)
        val senha = findViewById<EditText>(R.id.inputSenha)
        val erro = findViewById<TextView>(R.id.lblErro)
        val btnEntrar = findViewById<TextView>(R.id.btnEntrar)
        val btnCriar = findViewById<TextView>(R.id.btnCriarConta)

        // Foco D-pad visível nos botões (mesmo realce do app todo)
        MfDesign.focoBotao(btnEntrar)
        MfDesign.focoBotao(btnCriar)

        // Android TV: abre o teclado em tela ao focar o campo
        email.setOnFocusChangeListener { v, temFoco -> if (temFoco) abrirTeclado(v) }
        senha.setOnFocusChangeListener { v, temFoco -> if (temFoco) abrirTeclado(v) }

        // OK/Enter dentro do campo de senha → entrar direto (padrão Android TV)
        senha.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE || actionId == EditorInfo.IME_ACTION_GO) {
                tentarLogin(email, senha, erro, btnEntrar, btnCriar)
                true
            } else {
                false
            }
        }

        btnEntrar.setOnClickListener { tentarLogin(email, senha, erro, btnEntrar, btnCriar) }

        btnCriar.setOnClickListener {
            if (trabalhando) return@setOnClickListener
            val e = email.text.toString().trim()
            val s = senha.text.toString()
            if (e.isEmpty() || s.length < 6) {
                mostrarErro(erro, "Informe um e-mail válido e uma senha com 6+ caracteres.")
                return@setOnClickListener
            }
            trabalhando = true
            erro.isVisible = false
            travarBotoes(btnEntrar, btnCriar, true)
            btnCriar.text = "Criando conta…"
            scope.launch {
                val r = withContext(Dispatchers.IO) { AuthRepository.signup(e, s) }
                trabalhando = false
                travarBotoes(btnEntrar, btnCriar, false)
                btnCriar.text = "CRIAR CONTA"
                if (r.ok && !r.accessToken.isNullOrBlank()) {
                    AuthRepository.saveSession(this@LoginActivity, r)
                    abrirPerfis()
                } else {
                    mostrarErro(erro, r.error ?: "Não foi possível criar a conta. Tente de novo.")
                }
            }
        }

        email.requestFocus()
    }

    private fun tentarLogin(
        email: EditText,
        senha: EditText,
        erro: TextView,
        btnEntrar: TextView,
        btnCriar: TextView,
    ) {
        if (trabalhando) return
        val e = email.text.toString().trim()
        val s = senha.text.toString()
        if (e.isEmpty() || s.isEmpty()) {
            mostrarErro(erro, "Informe e-mail e senha.")
            email.requestFocus()
            return
        }
        trabalhando = true
        erro.isVisible = false
        travarBotoes(btnEntrar, btnCriar, true)
        btnEntrar.text = "Entrando…"
        scope.launch {
            val r = withContext(Dispatchers.IO) { AuthRepository.login(e, s) }
            trabalhando = false
            travarBotoes(btnEntrar, btnCriar, false)
            btnEntrar.text = "ENTRAR"
            if (r.ok && !r.accessToken.isNullOrBlank()) {
                AuthRepository.saveSession(this@LoginActivity, r)
                abrirPerfis()
            } else {
                mostrarErro(erro, r.error ?: "Não foi possível entrar. Tente de novo.")
                email.requestFocus()
            }
        }
    }

    private fun travarBotoes(a: TextView, b: TextView, travar: Boolean) {
        a.isEnabled = !travar
        b.isEnabled = !travar
        a.alpha = if (travar) 0.5f else 1f
        b.alpha = if (travar) 0.5f else 1f
    }

    private fun abrirTeclado(v: View) {
        scope.launch {
            delay(120)
            val imm = getSystemService(INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.showSoftInput(v, InputMethodManager.SHOW_IMPLICIT)
        }
    }

    /** Paridade com o site/mobile: depois do login escolhe-se o perfil. */
    private fun abrirPerfis() {
        startActivity(Intent(this, ProfilesActivity::class.java))
        finish()
    }

    private fun mostrarErro(tv: TextView, msg: String) {
        tv.text = msg
        tv.isVisible = true
    }

    // BACK na tela de login (sem sessão) sai do app
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            finishAffinity()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
