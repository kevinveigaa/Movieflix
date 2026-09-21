package com.movieflix.tv

import android.content.Context

/**
 * Preferências locais da TV (aplicáveis à experiência de TV).
 * Nada aqui altera regras de negócio: são preferências de exibição/uso,
 * equivalentes às opções de configuração do app mobile.
 */
object AppPrefs {

    private const val PREFS = "mf_tv_prefs"
    private const val K_AUTOPLAY = "autoplay_next"
    private const val K_QUALIDADE = "qualidade_preferida"

    fun autoplayProximoEpisodio(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(K_AUTOPLAY, true)

    fun setAutoplayProximoEpisodio(context: Context, on: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(K_AUTOPLAY, on).apply()
    }

    /** "auto" | "2160" | "1080" | "720" — a qualidade real continua limitada pelo plano. */
    fun qualidadePreferida(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(K_QUALIDADE, "auto") ?: "auto"

    fun setQualidadePreferida(context: Context, valor: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(K_QUALIDADE, valor).apply()
    }

    fun qualidadeLabel(valor: String): String = when (valor) {
        "2160" -> "4K (2160p)"
        "1080" -> "Full HD (1080p)"
        "720" -> "HD (720p)"
        else -> "Automática"
    }
}
