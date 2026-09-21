package com.movieflix.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Limite de telas simultâneas (`playback_sessions`) — MESMA tabela e MESMAS
 * regras do site (`src/hooks/usePlaybackSession.ts`).
 *
 * - Cada aparelho tem um `device_id` estável (persistido local).
 * - A cada 20s faz-se um upsert { user_id, device_id, last_seen } (heartbeat).
 * - Contam-se os aparelhos vistos nos últimos 60s (incluindo o próprio).
 * - Se o total passar do limite do plano → reprodução bloqueada.
 * - Fail-open: se a tabela não existir ou der erro de rede, NÃO bloqueia.
 */
object PlaybackSessionRepository {

    private const val HEARTBEAT_MS = 20_000L
    private const val STALE_SECONDS = 60L
    private const val PREFS = "mf_device"
    private const val K_DEVICE = "device_id"

    data class Estado(val blocked: Boolean, val telasAtivas: Int)

    /** Identificador estável deste aparelho. */
    fun deviceId(context: Context): String {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        var id = p.getString(K_DEVICE, null)
        if (id.isNullOrBlank()) {
            id = "${System.currentTimeMillis().toString(36)}-${(1000..9999).random()}"
            p.edit().putString(K_DEVICE, id).apply()
        }
        return id
    }

    /**
     * Um "batimento": registra a sessão deste aparelho e mede quantas telas
     * estão ativas. Devolve o estado (bloqueado ou não).
     */
    fun beat(context: Context, maxScreens: Int): Estado {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank() || maxScreens <= 0) return Estado(blocked = false, telasAtivas = 1)
        val device = deviceId(context)

        val row = JSONObject()
            .put("user_id", uid)
            .put("device_id", device)
            .put("last_seen", isoAgora())
        val upOk = SupabaseRest.upsert(context, "playback_sessions", row, "user_id,device_id")
        // Tabela ausente / sem permissão → não bloqueia (fail-open, igual ao mobile).
        if (!upOk) return Estado(blocked = false, telasAtivas = 1)

        val desde = isoMenosSegundos(STALE_SECONDS)
        val q = listOf(
            "select=device_id",
            SupabaseRest.eq("user_id", uid),
            SupabaseRest.greaterThan("last_seen", desde),
        ).joinToString("&")
        val arr = SupabaseRest.select(context, "playback_sessions", q)
        val devices = HashSet<String>()
        for (i in 0 until arr.length()) {
            val d = arr.optJSONObject(i)?.optString("device_id")
            if (!d.isNullOrBlank()) devices.add(d)
        }
        devices.add(device)
        return Estado(blocked = devices.size > maxScreens, telasAtivas = devices.size)
    }

    /** Remove a sessão deste aparelho (ao sair do player). */
    fun encerrar(context: Context) {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return
        val filtros = listOf(
            SupabaseRest.eq("user_id", uid),
            SupabaseRest.eq("device_id", deviceId(context)),
        ).joinToString("&")
        SupabaseRest.delete(context, "playback_sessions", filtros)
    }

    fun heartbeatMs(): Long = HEARTBEAT_MS

    private fun isoAgora(): String {
        if (android.os.Build.VERSION.SDK_INT >= 26) return java.time.Instant.now().toString()
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return fmt.format(java.util.Date())
    }

    private fun isoMenosSegundos(segundos: Long): String {
        val ms = System.currentTimeMillis() - segundos * 1000L
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            return java.time.Instant.ofEpochMilli(ms).toString()
        }
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return fmt.format(java.util.Date(ms))
    }

    /** Utilitário interno: converte um JSONArray de device_id em conjunto. */
    private fun devicesOf(arr: JSONArray): Set<String> {
        val s = HashSet<String>()
        for (i in 0 until arr.length()) {
            val d = arr.optJSONObject(i)?.optString("device_id")
            if (!d.isNullOrBlank()) s.add(d)
        }
        return s
    }
}
