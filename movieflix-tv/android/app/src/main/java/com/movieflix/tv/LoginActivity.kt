package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
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
 * Login/Cadastro nativo. Usa a MESMA conta Supabase do site:
 * - "ENTRAR"      → signInWithPassword (POST /auth/v1/token?grant_type=password)
 * - "CRIAR CONTA" → signUp (POST /auth/v1/signup) — entra automaticamente
 *
 * Pensado para controle remoto (Android TV):
 * - Foco D-pad determinístico: e-mail → senha → ENTRAR → CRIAR CONTA (ordem
 *   fixa no layout vertical; o foco nunca fica preso nem some).
 * - A tecla OK/Enter no campo de senha dispara o login direto.
 * - Feedback visual claro ("Entrando…" / mensagem de erro) e a UI NUNCA
 *   congela: a chamada de rede roda em IO com timeout total de 30s.
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
        val btnEntrar = findViewById<Button>(R.id.btnEntrar)
        val btnCriar = findViewById<Button>(R.id.btnCriarConta)

        // Android TV: abrir o teclado na tela ao focar o campo (não espera o 1º clique)
        email.setOnFocusChangeListener { v, hasFocus ->
            if (hasFocus) abrirTeclado(v)
        }
        senha.setOnFocusChangeListener { v, hasFocus ->
            if (hasFocus) abrirTeclado(v)
        }

        // Tecla OK/Enter dentro do campo de senha → entrar direto (padrão Android TV)
        senha.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE || actionId == EditorInfo.IME_ACTION_GO) {
                tentarLogin(email, senha, erro, btnEntrar, btnCriar)
                true
            } else {
                false
            }
        }

        btnEntrar.setOnClickListener {
            tentarLogin(email, senha, erro, btnEntrar, btnCriar)
        }

        btnCriar.setOnClickListener {
            if (trabalhando) return@setOnClickListener
            val e = email.text.toString().trim()
            val s = senha.text.toString()
            if (e.isEmpty() || s.length < 6) {
                mostrarErro(erro, "E-mail válido e senha com 6+ caracteres")
                return@setOnClickListener
            }
            trabalhando = true
            erro.isVisible = false
            btnEntrar.isEnabled = false
            btnCriar.isEnabled = false
            btnCriar.text = "Criando conta…"
            scope.launch {
                val r = withContext(Dispatchers.IO) { AuthRepository.signup(e, s) }
                trabalhando = false
                btnEntrar.isEnabled = true
                btnCriar.isEnabled = true
                btnCriar.text = "CRIAR CONTA"
                if (r.ok && !r.accessToken.isNullOrBlank()) {
                    AuthRepository.saveSession(this@LoginActivity, r.accessToken, e, r.userId)
                    abrirHome()
                } else {
                    mostrarErro(erro, r.error ?: "Falha no cadastro. Tente de novo.")
                }
            }
        }

        // Foco inicial no campo e-mail (controle remoto)
        email.requestFocus()
    }

    private fun tentarLogin(
        email: EditText,
        senha: EditText,
        erro: TextView,
        btnEntrar: Button,
        btnCriar: Button,
    ) {
        if (trabalhando) return
        val e = email.text.toString().trim()
        val s = senha.text.toString()
        if (e.isEmpty() || s.isEmpty()) {
            mostrarErro(erro, "Informe e-mail e senha")
            email.requestFocus()
            return
        }
        trabalhando = true
        erro.isVisible = false
        btnEntrar.isEnabled = false
        btnCriar.isEnabled = false
        btnEntrar.text = "Entrando…"
        scope.launch {
            val r = withContext(Dispatchers.IO) { AuthRepository.login(e, s) }
            trabalhando = false
            btnEntrar.isEnabled = true
            btnCriar.isEnabled = true
            btnEntrar.text = "ENTRAR"
            if (r.ok && !r.accessToken.isNullOrBlank()) {
                AuthRepository.saveSession(this@LoginActivity, r.accessToken, e, r.userId)
                abrirHome()
            } else {
                mostrarErro(erro, r.error ?: "Falha no login. Tente de novo.")
                email.requestFocus()
            }
        }
    }

    private fun abrirTeclado(v: View) {
        // Pequeno atraso para o campo terminar de ganhar foco antes do teclado abrir
        scope.launch {
            delay(120)
            val imm = getSystemService(INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.showSoftInput(v, InputMethodManager.SHOW_IMPLICIT)
        }
    }

    private fun abrirHome() {
        startActivity(Intent(this, MainActivity::class.java))
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
