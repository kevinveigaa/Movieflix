package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Tela de bloqueio por assinatura: leva aos planos REAIS (tabela `plans`).
 * Mesma mensagem do site/mobile — nenhum preço ou limite é inventado aqui.
 */
class PaywallActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_paywall)

        val btn = findViewById<TextView>(R.id.btnVoltarPaywall)
        MfDesign.focoBotao(btn)
        btn.setOnClickListener {
            startActivity(Intent(this, AccountActivity::class.java))
            finish()
        }
        btn.requestFocus()
    }
}
