package com.movieflix.tv

import android.view.KeyEvent
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mapeamento das teclas do controle remoto (Android TV / TV Box). */
class RemotoTest {

    @Test
    fun enterAceitaDpadCenterEEnter() {
        assertTrue(Remoto.ehEnter(KeyEvent.KEYCODE_DPAD_CENTER))
        assertTrue(Remoto.ehEnter(KeyEvent.KEYCODE_ENTER))
        assertTrue(Remoto.ehEnter(KeyEvent.KEYCODE_NUMPAD_ENTER))
        assertFalse(Remoto.ehEnter(KeyEvent.KEYCODE_BACK))
    }

    @Test
    fun playPause() {
        assertTrue(Remoto.ehPlayPause(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
        assertTrue(Remoto.ehPlayPause(KeyEvent.KEYCODE_MEDIA_PLAY))
        assertTrue(Remoto.ehPlayPause(KeyEvent.KEYCODE_MEDIA_PAUSE))
        assertFalse(Remoto.ehPlayPause(KeyEvent.KEYCODE_DPAD_CENTER))
    }

    @Test
    fun proximoEAnterior() {
        assertTrue(Remoto.ehProximo(KeyEvent.KEYCODE_MEDIA_NEXT))
        assertTrue(Remoto.ehAnterior(KeyEvent.KEYCODE_MEDIA_PREVIOUS))
        assertFalse(Remoto.ehProximo(KeyEvent.KEYCODE_MEDIA_PREVIOUS))
    }

    @Test
    fun pararEVolume() {
        assertTrue(Remoto.ehParar(KeyEvent.KEYCODE_MEDIA_STOP))
        assertTrue(Remoto.ehVolume(KeyEvent.KEYCODE_VOLUME_UP))
        assertTrue(Remoto.ehVolume(KeyEvent.KEYCODE_VOLUME_DOWN))
        assertFalse(Remoto.ehVolume(KeyEvent.KEYCODE_MEDIA_STOP))
    }

    @Test
    fun navegacaoDpad() {
        assertTrue(Remoto.ehNavegacao(KeyEvent.KEYCODE_DPAD_UP))
        assertTrue(Remoto.ehNavegacao(KeyEvent.KEYCODE_DPAD_DOWN))
        assertTrue(Remoto.ehNavegacao(KeyEvent.KEYCODE_DPAD_LEFT))
        assertTrue(Remoto.ehNavegacao(KeyEvent.KEYCODE_DPAD_RIGHT))
        assertFalse(Remoto.ehNavegacao(KeyEvent.KEYCODE_DPAD_CENTER))
    }
}
