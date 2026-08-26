package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Login/Cadastro nativo. Usa a MESMA conta Supabase do site:
 * - "ENTRAR" → signInWithPassword
 * - "CRIAR CONTA" → signUp (depois entra automaticamente)
 * Navegação 100% D-pad (campos e botões focáveis nativamente).
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

        findViewById<Button>(R.id.btnEntrar).setOnClickListener {
            if (trabalhando) return@setOnClickListener
            val e = email.text.toString().trim()
            val s = senha.text.toString()
            if (e.isEmpty() || s.isEmpty()) {
                mostrarErro(erro, "Informe e-mail e senha")
                return@setOnClickListener
            }
            trabalhando = true
            erro.isVisible = false
            scope.launch {
                val r = withContext(Dispatchers.IO) { AuthRepository.login(e, s) }
                trabalhando = false
                if (r.ok && !r.accessToken.isNullOrBlank()) {
                    AuthRepository.saveSession(this@LoginActivity, r.accessToken, e)
                    abrirHome()
                } else {
                    mostrarErro(erro, r.error ?: "Falha no login")
                }
            }
        }

        findViewById<Button>(R.id.btnCriarConta).setOnClickListener {
            if (trabalhando) return@setOnClickListener
            val e = email.text.toString().trim()
            val s = senha.text.toString()
            if (e.isEmpty() || s.length < 6) {
                mostrarErro(erro, "E-mail válido e senha com 6+ caracteres")
                return@setOnClickListener
            }
            trabalhando = true
            erro.isVisible = false
            scope.launch {
                val r = withContext(Dispatchers.IO) { AuthRepository.signup(e, s) }
                trabalhando = false
                if (r.ok && !r.accessToken.isNullOrBlank()) {
                    AuthRepository.saveSession(this@LoginActivity, r.accessToken, e)
                    abrirHome()
                } else {
                    mostrarErro(erro, r.error ?: "Falha no cadastro")
                }
            }
        }

        // Foco inicial no campo e-mail (controle remoto)
        email.requestFocus()
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
