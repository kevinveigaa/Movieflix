package com.movieflix.tv

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.ImageView
import android.widget.LinearLayout
import androidx.core.content.ContextCompat
import com.bumptech.glide.Glide
import java.util.concurrent.Executors

/**
 * Splash: valida a sessao salva e decide o destino (Perfis ou Login).
 * Enquanto decide, ja aquece o catalogo em background.
 */
class SplashActivity : BaseTvActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#050505"))
        }

        val logo = ImageView(this)
        val lp = LinearLayout.LayoutParams(TvUi.dp(this, 320), TvUi.dp(this, 96))
        logo.layoutParams = lp
        Glide.with(this).load(R.drawable.mf_logo).into(logo)
        layout.addView(logo)

        val sub = TvUi.texto(this, "Android TV  •  Google TV  •  TV Box", 14f, ContextCompat.getColor(this, R.color.mf_gray))
        val lpSub = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        lpSub.topMargin = TvUi.dp(this, 18)
        sub.layoutParams = lpSub
        layout.addView(sub)

        conteudo(layout)

        val executor = Executors.newSingleThreadExecutor()
        executor.execute {
            if (AuthRepository.estaLogado(this)) {
                AuthRepository.validToken(this)
                CatalogRepository.atualizarSeNecessario(this)
            }
            Handler(Looper.getMainLooper()).post {
                val destino = if (AuthRepository.estaLogado(this)) {
                    if (ProfilesRepository.perfilAtivo(this) != null) HomeActivity::class.java else ProfilesActivity::class.java
                } else LoginActivity::class.java
                startActivity(Intent(this, destino))
                finish()
            }
        }
    }
}
