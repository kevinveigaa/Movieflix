package com.movieflix.tv

import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity

/**
 * Base das telas de TV.
 *
 * Centraliza:
 *  - tratamento das teclas de MIDIA do controle (play/pause, proximo, parar),
 *    que subclasses sobrescrevem se fizer sentido;
 *  - garantia de FOCO nunca desaparecer (o requisito mais importante da TV);
 *  - relayout (o app e landscape fixo).
 */
abstract class BaseTvActivity : AppCompatActivity(), Remoto.ConsumidorDeMidia {

    private lateinit var raiz: FrameLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        raiz = FrameLayout(this)
        raiz.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
        )
        raiz.setBackgroundColor(TvUi.cor(this, R.color.mf_black))
        super.setContentView(raiz)
    }

    /** As subclasses definem o conteudo real aqui. */
    protected fun conteudo(view: View) {
        raiz.removeAllViews()
        raiz.addView(view)
    }

    /** Rebuild declarativo: cada tela sobrescreve e repovoa o conteudo. */
    protected open fun recarregar() {}

    /** Qual view deve receber o foco caso nada esteja focado. */
    protected open fun focoPadrao(): View? = null

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (Remoto.ehPlayPause(keyCode) && aoPlayPause()) return true
        if (Remoto.ehProximo(keyCode) && aoProximo()) return true
        if (Remoto.ehAnterior(keyCode) && aoAnterior()) return true
        if (Remoto.ehParar(keyCode) && aoParar()) return true
        return super.onKeyDown(keyCode, event)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) raiz.post { Remoto.garantirFoco(raiz, focoPadrao()) }
    }

    protected fun garantirFocoAposLayout(view: View, padrao: View? = null) {
        view.post { Remoto.garantirFoco(raiz, padrao ?: focoPadrao()) }
    }

    protected fun raizView(): View = raiz
}
