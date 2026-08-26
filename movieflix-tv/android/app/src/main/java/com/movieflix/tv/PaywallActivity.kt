package com.movieflix.tv

import android.os.Bundle
import android.widget.Button
import androidx.appcompat.app.AppCompatActivity

/** Tela de bloqueio por assinatura (mostra os 3 planos e volta). */
class PaywallActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_paywall)
        findViewById<Button>(R.id.btnVoltarPaywall).setOnClickListener { finish() }
    }
}
