package com.movieflix.tv

import android.view.KeyEvent
import android.view.View

/**
 * Mapeamento das teclas do CONTROLE REMOTO (Android TV / Google TV / TV Box).
 *
 * O Android ja entrega DPAD_CENTER/ENTER como clique na view focada; aqui ficam
 * as teclas de MIDIA, que nao tem tratamento padrao, alem do roteamento de foco.
 *
 *  DPAD_UP/DOWN/LEFT/RIGHT -> foco (padrao do sistema)
 *  DPAD_CENTER / ENTER     -> acionar (padrao do sistema)
 *  BACK                    -> voltar (tratado por Activity)
 *  MEDIA_PLAY_PAUSE        -> play/pause no player
 *  MEDIA_NEXT              -> proximo episodio
 *  MEDIA_STOP              -> parar/sair
 */
object Remoto {

    fun ehEnter(keyCode: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER ||
            keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER

    fun ehPlayPause(keyCode: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY ||
            keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE

    fun ehProximo(keyCode: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_MEDIA_NEXT || keyCode == KeyEvent.KEYCODE_CHANNEL_UP ||
            keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD

    fun ehAnterior(keyCode: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_MEDIA_PREVIOUS || keyCode == KeyEvent.KEYCODE_CHANNEL_DOWN ||
            keyCode == KeyEvent.KEYCODE_MEDIA_REWIND

    fun ehParar(keyCode: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_MEDIA_STOP

    fun ehVolume(keyCode: Int): Boolean =
        keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN ||
            keyCode == KeyEvent.KEYCODE_VOLUME_MUTE

    fun ehNavegacao(keyCode: Int): Boolean = keyCode == KeyEvent.KEYCODE_DPAD_UP ||
        keyCode == KeyEvent.KEYCODE_DPAD_DOWN || keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
        keyCode == KeyEvent.KEYCODE_DPAD_RIGHT

    interface ConsumidorDeMidia {
        fun aoPlayPause(): Boolean = false
        fun aoProximo(): Boolean = false
        fun aoAnterior(): Boolean = false
        fun aoParar(): Boolean = false
    }

    /**
     * Garante que exista um elemento focado: se o foco sumiu da tela, joga para o
     * primeiro foco descendente encontrado. E o que impede o usuario de "perder"
     * o controle remoto no meio de uma tela.
     */
    fun garantirFoco(raiz: View?, padrao: View? = null) {
        if (raiz == null) return
        val atual = raiz.findFocus()
        if (atual != null && atual.isShown) return
        val alvo = padrao ?: primeiroFocavel(raiz)
        alvo?.requestFocus()
    }

    private fun primeiroFocavel(v: View): View? {
        if (v.isFocusable && v.isShown && v.isEnabled) return v
        if (v is android.view.ViewGroup) {
            for (i in 0 until v.childCount) {
                primeiroFocavel(v.getChildAt(i))?.let { return it }
            }
        }
        return null
    }
}
