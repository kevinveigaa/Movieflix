package com.movieflix.tv

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.appcompat.app.AppCompatActivity

/** Splash: decide login vs Home (se já existe sessão salva). */
class SplashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        // ── Pré-aquecimento do catálogo (desempenho) ──────────────────
        //
        // O splash fica ~0,9 s na tela de qualquer forma. Antes, a Home só
        // COMEÇAVA a ler o catálogo depois desse tempo — ou seja, o usuário
        // pagava duas esperas em sequência (splash + leitura do JSON de ~4 MB).
        // Aqui a leitura acontece EM PARALELO com o splash, e quando a Home
        // abre o catálogo já está em memória/cache: a abertura fica
        // perceptivelmente mais rápida sem remover nenhum recurso.
        //
        // A thread é descartável: se o app fechar antes, nada quebra.
        Thread {
            try {
                // atualizarSeNecessario é `suspend` (e internamente já salta para
                // IO); runBlocking aqui é seguro porque esta thread é descartável
                // e não bloqueia a thread principal nem a UI.
                kotlinx.coroutines.runBlocking { CatalogRepository.atualizarSeNecessario(this@SplashActivity) }
                CatalogRepository.filmes(this)
                CatalogRepository.series(this)
            } catch (_: Throwable) {
                // Falha de rede aqui é silenciosa de propósito: a Home tem o
                // próprio estado de erro com "TENTAR NOVAMENTE".
            }
        }.start()

        Handler(Looper.getMainLooper()).postDelayed({
            val token = AuthRepository.loadToken(this)
            val destino = if (!token.isNullOrBlank()) {
                Intent(this, ProfilesActivity::class.java)
            } else {
                Intent(this, LoginActivity::class.java)
            }
            startActivity(destino)
            finish()
        }, 900)
    }
}
