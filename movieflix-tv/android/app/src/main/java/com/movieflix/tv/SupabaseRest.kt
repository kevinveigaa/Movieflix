package com.movieflix.tv

import android.content.Context
import com.movieflix.tv.TvApp
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Cliente REST do Supabase — a MESMA infraestrutura do site e do app mobile
 * (PostgREST + GoTrue). O MovieFlix TV nunca fala com um banco paralelo: usa a
 * chave anon + o JWT da sessao do usuario, exatamente como o supabase-js faz
 * no site. Em HTTP 401/403 renova o token automaticamente.
 */
object SupabaseRest {

    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .callTimeout(40, TimeUnit.SECONDS)
        .build()

    // ── Helpers de query (PostgREST) ──

    fun enc(v: String): String = URLEncoder.encode(v, "UTF-8")
    fun eq(column: String, value: String): String = "$column=eq.${enc(value)}"
    fun eqNum(column: String, value: Long): String = "$column=eq.$value"
    fun isNull(column: String): String = "$column=is.null"
    fun order(column: String, ascending: Boolean = true): String =
        "order=$column.${if (ascending) "asc" else "desc"}"
    fun limit(n: Int): String = "limit=$n"

    // ── Nucleo HTTP ──

    data class Resp(val code: Int, val body: String?) {
        val ok: Boolean get() = code in 200..299
    }

    private fun exec(method: String, path: String, body: String?, token: String, prefer: String?): Resp {
        val b = Request.Builder()
            .url(AppConfig.SUPABASE_URL + path)
            .header("apikey", AppConfig.SUPABASE_ANON_KEY)
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
        if (body != null) b.header("Content-Type", "application/json")
        if (prefer != null) b.header("Prefer", prefer)
        val rb = when (method) {
            "POST" -> b.post((body ?: "{}").toRequestBody(JSON_MEDIA))
            "PATCH" -> b.patch((body ?: "{}").toRequestBody(JSON_MEDIA))
            "DELETE" -> b.delete()
            else -> b.get()
        }
        return try {
            client.newCall(rb.build()).execute().use { r -> Resp(r.code, r.body?.string()) }
        } catch (e: Exception) {
            Resp(-1, null)
        }
    }

    /** Requisicao autenticada com renovacao automatica do JWT (401/403). */
    private fun authed(ctx: Context, method: String, path: String, body: String?, prefer: String?): Resp? {
        val token = AuthRepository.validToken(ctx) ?: return null
        var resp = exec(method, path, body, token, prefer)
        if (resp.code == 401 || resp.code == 403) {
            val novo = AuthRepository.forcarRefresh(ctx) ?: return resp
            resp = exec(method, path, body, novo, prefer)
        }
        return resp
    }

    // ── Operacoes de tabela ──

    fun select(ctx: Context, table: String, query: String): JSONArray {
        val r = authed(ctx, "GET", "/rest/v1/$table?$query", null, null) ?: return JSONArray()
        if (!r.ok || r.body.isNullOrBlank()) return JSONArray()
        return try { JSONArray(r.body) } catch (e: Exception) { JSONArray() }
    }

    /** SELECT que tambem informa se a tabela/coluna existe (probes de schema). */
    fun selectDetectando(ctx: Context, table: String, query: String): Pair<JSONArray, Boolean> {
        val r = authed(ctx, "GET", "/rest/v1/$table?$query", null, null) ?: return JSONArray() to false
        if (!r.ok) return JSONArray() to false
        return try { JSONArray(r.body) to true } catch (e: Exception) { JSONArray() to false }
    }

    fun insert(ctx: Context, table: String, row: JSONObject): JSONObject? {
        val r = authed(ctx, "POST", "/rest/v1/$table", row.toString(), "return=representation") ?: return null
        if (!r.ok) return null
        val body = r.body
        if (body.isNullOrBlank()) return JSONObject()
        return try {
            val arr = JSONArray(body)
            if (arr.length() > 0) arr.getJSONObject(0) else JSONObject()
        } catch (e: Exception) { JSONObject() }
    }

    fun update(ctx: Context, table: String, filter: String, patch: JSONObject): Boolean {
        val r = authed(ctx, "PATCH", "/rest/v1/$table?$filter", patch.toString(), "return=minimal") ?: return false
        return r.ok
    }

    fun delete(ctx: Context, table: String, filter: String): Boolean {
        val r = authed(ctx, "DELETE", "/rest/v1/$table?$filter", null, "return=minimal") ?: return false
        return r.ok
    }
}
