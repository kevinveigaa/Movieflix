package com.movieflix.tv

import android.content.Context
import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Cliente REST do Supabase — a MESMA infraestrutura usada pelo site e pelo app
 * mobile (PostgREST + GoTrue). O MovieFlix TV nunca fala com um banco paralelo:
 * usa a chave anon + o JWT da sessão do usuário, exatamente como o supabase-js
 * faz no site (`src/lib/supabase.ts`).
 *
 * Toda chamada autenticada renova o token automaticamente em HTTP 401
 * (POST /auth/v1/token?grant_type=refresh_token), mantendo a sessão viva — do
 * mesmo jeito que `autoRefreshToken: true` no cliente do site.
 *
 * A chave anon é PÚBLICA por design (role "anon", protegida por RLS no banco)
 * e já vive no repositório; nenhuma chave secreta (service_role) é usada aqui.
 */
object SupabaseRest {

    private const val TAG = "MovieFlixTvRest"
    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .callTimeout(40, TimeUnit.SECONDS)
        .build()

    // ─────────────────────────── Helpers de query (PostgREST) ───────────────────────────

    private fun enc(v: String): String = URLEncoder.encode(v, "UTF-8")

    /**
     * Filtro de igualdade para colunas de texto/UUID.
     * Atenção: o PostgREST NÃO aceita o valor entre aspas (`code=eq."simple"` →
     * conjunto vazio). Enviamos o valor cru, apenas URL-encoded — validado
     * contra o Supabase real do MovieFlix.
     */
    fun eq(column: String, value: String): String = "$column=eq.${enc(value)}"

    /** Filtro de igualdade para colunas numéricas (sem aspas). */
    fun eqNum(column: String, value: Long): String = "$column=eq.$value"

    /** Filtro "é nulo". */
    fun isNull(column: String): String = "$column=is.null"

    /** Filtro "não é nulo". */
    fun notNull(column: String): String = "$column=not.is.null"

    /** Maior/menor que (valores ISO de data). */
    fun greaterThan(column: String, value: String): String = "$column=gt.${enc(value)}"

    /** Ordenação. */
    fun order(column: String, ascending: Boolean = true): String =
        "order=$column.${if (ascending) "asc" else "desc"}"

    fun limit(n: Int): String = "limit=$n"

    // ─────────────────────────── Núcleo HTTP ───────────────────────────

    private data class Resp(val code: Int, val body: String?) {
        val ok: Boolean get() = code in 200..299
    }

    private fun exec(
        method: String,
        path: String,
        body: String?,
        token: String,
        prefer: String?,
    ): Resp {
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
            client.newCall(rb.build()).execute().use { r ->
                Resp(r.code, r.body?.string())
            }
        } catch (e: Exception) {
            Log.w(TAG, "falha $method $path: ${e.message}")
            Resp(-1, null)
        }
    }

    /**
     * Requisição autenticada com renovação automática do JWT.
     * Em 401/403 renova o access token (refresh_token) UMA vez e repete.
     */
    private fun authed(
        context: Context,
        method: String,
        path: String,
        body: String?,
        prefer: String?,
    ): Resp? {
        val token = AuthRepository.validToken(context) ?: return null
        var resp = exec(method, path, body, token, prefer)
        if (resp.code == 401 || resp.code == 403) {
            val novo = AuthRepository.forcarRefresh(context) ?: return resp
            resp = exec(method, path, body, novo, prefer)
        }
        return resp
    }

    // ─────────────────────────── Operações de tabela ───────────────────────────

    /** SELECT — devolve a lista (ou vazia em qualquer falha). */
    fun select(context: Context, table: String, query: String): JSONArray {
        val r = authed(context, "GET", "/rest/v1/$table?$query", null, null) ?: return JSONArray()
        if (!r.ok || r.body.isNullOrBlank()) return JSONArray()
        return try {
            JSONArray(r.body)
        } catch (e: Exception) {
            JSONArray()
        }
    }

    /** SELECT que também informa se a tabela/coluna existe (para probes de schema). */
    fun selectDetectando(context: Context, table: String, query: String): Pair<JSONArray, Boolean> {
        val r = authed(context, "GET", "/rest/v1/$table?$query", null, null)
            ?: return JSONArray() to false
        if (!r.ok) return JSONArray() to false
        return try {
            JSONArray(r.body) to true
        } catch (e: Exception) {
            JSONArray() to false
        }
    }

    /** INSERT — devolve a linha criada (ou null). */
    fun insert(context: Context, table: String, row: JSONObject): JSONObject? {
        val r = authed(
            context, "POST", "/rest/v1/$table", row.toString(), "return=representation",
        ) ?: return null
        if (!r.ok) return null
        val body = r.body
        if (body.isNullOrBlank()) return JSONObject()
        return try {
            val arr = JSONArray(body)
            if (arr.length() > 0) arr.getJSONObject(0) else JSONObject()
        } catch (e: Exception) {
            JSONObject()
        }
    }

    /** UPSERT (resolve duplicados pela chave informada em `onConflict`). */
    fun upsert(
        context: Context,
        table: String,
        row: JSONObject,
        onConflict: String,
    ): Boolean {
        val r = authed(
            context,
            "POST",
            "/rest/v1/$table?on_conflict=$onConflict",
            row.toString(),
            "resolution=merge-duplicates,return=minimal",
        ) ?: return false
        return r.ok
    }

    /** UPDATE por filtro. */
    fun update(context: Context, table: String, filter: String, patch: JSONObject): Boolean {
        val r = authed(
            context, "PATCH", "/rest/v1/$table?$filter", patch.toString(), "return=minimal",
        ) ?: return false
        return r.ok
    }

    /** DELETE por filtro. */
    fun delete(context: Context, table: String, filter: String): Boolean {
        val r = authed(context, "DELETE", "/rest/v1/$table?$filter", null, "return=minimal")
            ?: return false
        return r.ok
    }
}
