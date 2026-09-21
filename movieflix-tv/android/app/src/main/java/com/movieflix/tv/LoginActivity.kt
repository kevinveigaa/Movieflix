package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.widget.EditText
import android.widget.ScrollView
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
 * Login/Cadastro nativo — MESMA conta Supabase do site e do celular:
 * - "ENTRAR"      → signInWithPassword (POST /auth/v1/token?grant_type=password)
 * - "CRIAR CONTA" → signUp (POST /auth/v1/signup) — entra automaticamente
 *
 * ── CORREÇÃO v2.0.1 (bug "trava na tela de login") ────────────────────────────
 * Duas causas foram encontradas e corrigidas:
 *
 *  1) LAYOUT ESTOURANDO O 16:9. A tela empilhava tudo verticalmente; em TV Box
 *     com altura útil de ~540dp o campo de SENHA e o botão ENTRAR saíam pela
 *     borda inferior. Sem rolagem, o usuário via apenas o e-mail (exatamente o
 *     print do problema) e não tinha como alcançar o resto pelo D-pad.
 *     → Agora: colunas formulário + teclado, dentro de ScrollView.
 *
 *  2) DEPENDÊNCIA DO TECLADO DO SISTEMA. `showSoftInput` + inputType deixavam a
 *     digitação nas mãos do IME do aparelho. Em Android TV / Google TV / TV Box
 *     o IME costuma não abrir pelo controle remoto, então não havia como
 *     escrever a senha.
 *     → Agora: teclado em tela próprio (MfKeyboard), sempre visível e navegável
 *     só com UP/DOWN/LEFT/RIGHT + OK. Zero dependência do IME e do touchscreen.
 *
 * A ordem de foco é fixa e determinística:
 *   e-mail → senha → (OK abre o teclado) → teclado → ENTRAR / CRIAR CONTA.
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
        val btnEsqueci = findViewById<TextView>(R.id.btnEsqueciSenha)
        val sucesso = findViewById<TextView>(R.id.lblSucesso)
        val teclado = findViewById<MfKeyboard>(R.id.teclado)
        val scroll = findViewById<ScrollView>(R.id.scrollLogin)

        // Foco D-pad visível nos botões (mesmo realce do app todo)
        MfDesign.focoBotao(btnEntrar)
        MfDesign.focoBotao(btnCriar)
        MfDesign.focoBotao(btnEsqueci)

        // O teclado do app substitui o IME do sistema. `showSoftInputOnFocus`
        // não existe como atributo de XML (só em código), por isso é desligado
        // aqui: em vários TV Box o IME do sistema abria por cima do formulário
        // e "engolia" as setas do controle. Agora o teclado em tela é a única
        // via de digitação — determinística em qualquer aparelho.
        email.showSoftInputOnFocus = false
        senha.showSoftInputOnFocus = false

        // ── Cada campo aponta o teclado para si e abre o teclado com OK ──
        // Nenhum passo depende do IME do sistema.
        fun ligarCampo(campo: EditText) {
            campo.setOnFocusChangeListener { _, temFoco ->
                if (temFoco) {
                    teclado.definirAlvo(campo)
                    campo.setSelection(campo.text.length)
                    scroll.smoothScrollTo(0, 0)
                }
            }
            campo.setOnClickListener {
                teclado.definirAlvo(campo)
                teclado.focarPrimeira()
            }
            // KEYCODE_DPAD_CENTER é o "OK" do controle remoto.
            campo.setOnKeyListener { _, code, event ->
                val ok = code == KeyEvent.KEYCODE_DPAD_CENTER ||
                    code == KeyEvent.KEYCODE_ENTER ||
                    code == KeyEvent.KEYCODE_NUMPAD_ENTER
                if (ok && event.action == KeyEvent.ACTION_UP) {
                    teclado.definirAlvo(campo)
                    teclado.focarPrimeira()
                    true
                } else {
                    false
                }
            }
        }
        ligarCampo(email)
        ligarCampo(senha)

        // ── Teclado em tela ──
        teclado.rotuloConfirmar = "ENTRAR"
        teclado.aoConfirmar = { tentarLogin(email, senha, erro, btnEntrar, btnCriar) }
        // UP na 1ª linha volta ao campo de senha; DOWN na última vai ao ENTRAR.
        teclado.acima = senha
        teclado.abaixo = btnEntrar

        btnEntrar.setOnClickListener { tentarLogin(email, senha, erro, btnEntrar, btnCriar) }

        // ── ESQUECI A SENHA — fluxo REAL de recuperação do MovieFlix ──
        // Dispara o e-mail de redefinição (supabase resetPasswordForEmail) para
        // a MESMA conta do site/celular. Nenhuma senha é criada aqui.
        btnEsqueci.setOnClickListener {
            if (trabalhando) return@setOnClickListener
            val e = email.text.toString().trim()
            if (e.isEmpty() || !e.contains("@")) {
                sucesso.isVisible = false
                mostrarErro(erro, "Digite o e-mail da sua conta para receber o link de recuperação.")
                email.requestFocus()
                return@setOnClickListener
            }
            trabalhando = true
            erro.isVisible = false
            sucesso.isVisible = false
            btnEsqueci.text = "Enviando…"
            scope.launch {
                val r = withContext(Dispatchers.IO) { AuthRepository.recuperarSenha(e) }
                trabalhando = false
                btnEsqueci.text = "ESQUECI A SENHA"
                if (r.ok) {
                    sucesso.text =
                        "Se existir uma conta com $e, enviamos o link para redefinir a senha. " +
                            "Abra o e-mail no celular ou no navegador e crie a nova senha."
                    sucesso.isVisible = true
                } else {
                    mostrarErro(erro, r.error ?: "Não foi possível enviar o e-mail agora.")
                }
            }
        }

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
