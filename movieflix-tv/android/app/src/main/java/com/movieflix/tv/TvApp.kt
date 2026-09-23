package com.movieflix.tv

import android.app.Application
import android.content.Context

/**
 * Application do MovieFlix TV: guarda um Context de aplicacao para os
 * repositorios (que sao `object`/singletons) sem vazar Activity.
 */
class TvApp : Application() {

    override fun onCreate() {
        super.onCreate()
        appContext = applicationContext
    }

    companion object {
        @Volatile
        private var appContext: Context? = null

        /** Context de aplicacao (nunca null em runtime; os repositorios usam isto). */
        val ctx: Context
            get() = requireNotNull(appContext) { "TvApp.onCreate ainda nao executou" }
    }
}
