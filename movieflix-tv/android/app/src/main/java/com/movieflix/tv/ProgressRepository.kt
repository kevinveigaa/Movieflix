package com.movieflix.tv

import android.content.Context

/**
 * Retomada local de reprodução ("Continuar assistindo").
 * Guarda a última posição por título em SharedPreferences — leve, sem
 * processos em background, sem dependência do banco.
 */
object ProgressRepository {

    private const val PREFS = "mf_progress"

    fun salvar(context: Context, movieId: String, posicaoMs: Long) {
        if (posicaoMs <= 0) return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong("pos_$movieId", posicaoMs)
            .apply()
    }

    fun carregar(context: Context, movieId: String): Long =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getLong("pos_$movieId", 0L)

    fun limpar(context: Context, movieId: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove("pos_$movieId")
            .apply()
    }
}
