package com.movieflix.tv

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Resultado da autenticação. */
data class AuthResult(
    val ok: Boolean,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val expiresIn: Long = 0L,
    val userId: String? = null,
    val email: String? = null,
    val error: String? = null,
)

/**
 * Autenticação via Supabase Auth REST (GoTrue) — MESMA conta do site e do app
 * mobile. Nenhuma conta paralela é criada: e-mail/senha são os mesmos.
 *
 * - login:    POST {SUPABASE_URL}/auth/v1/token?grant_type=password
 * - signup:   POST {SUPABASE_URL}/auth/v1/signup
 * - refresh:  POST {SUPABASE_URL}/auth/v1/token?grant_type=refresh_token
 *
 * A sessão (access_token + refresh_token + expiração) é persistida em
 * SharedPreferences e renovada automaticamente — equivalente ao
 * `persistSession` + `autoRefreshToken` do supabase-js usado no site.
 */
object AuthRepository {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        // Timeout TOTAL: em TVs com rede lenta o app NUNCA fica preso esperando.
        .callTimeout(30, TimeUnit.SECONDS)
        .build()

    private val JSON = "application/json; charset=utf-8".toMediaType()

    private const val PREFS = "mf_session"
    private const val K_TOKEN = "access_token"
    private const val K_REFRESH = "refresh_token"
    private const val K_EXPIRES_AT = "expires_at"
    private const val K_EMAIL = "email"
    private const val K_USER_ID = "user_id"

    fun login(email: String, password: String): AuthResult =
        request(
            path = "/auth/v1/token?grant_type=password",
            body = JSONObject()
                .put("email", email.trim())
                .put("password", password)
                .toString(),
        )

    fun signup(email: String, password: String): AuthResult =
        request(
            path = "/auth/v1/signup",
            body = JSONObject()
                .put("email", email.trim())
                .put("password", password)
                .toString(),
        )

    /** Renova o access token usando o refresh_token salvo. */
    fun refresh(refreshToken: String): AuthResult =
        request(
            path = "/auth/v1/token?grant_type=refresh_token",
            body = JSONObject().put("refresh_token", refreshToken).toString(),
        )

    private fun request(path: String, body: String): AuthResult {
        val req = Request.Builder()
            .url(AppConfig.SUPABASE_URL + path)
            .header("apikey", AppConfig.SUPABASE_ANON_KEY)
            .header("Authorization", "Bearer ${AppConfig.SUPABASE_ANON_KEY}")
            .header("Content-Type", "application/json")
            .post(body.toRequestBody(JSON))
            .build()
        return try {
            client.newCall(req).execute().use { resp ->
                val text = resp.body?.string() ?: ""
                if (resp.isSuccessful) {
                    // Sucesso: {"access_token":..., "refresh_token":..., "expires_in":3600, "user":{...}}
                    val obj = JSONObject(text)
                    val token = obj.optString("access_token", "")
                    val refresh = obj.optString("refresh_token", "")
                    val expiresIn = obj.optLong("expires_in", 3600L)
                    val user = obj.optJSONObject("user")
                    AuthResult(
                        ok = true,
                        accessToken = token,
                        refreshToken = refresh,
                        expiresIn = expiresIn,
                        userId = user?.optString("id"),
                        email = user?.optString("email"),
                    )
                } else {
                    AuthResult(ok = false, error = extrairErro(text, resp.code))
                }
            }
        } catch (e: IOException) {
            AuthResult(ok = false, error = "Sem conexão. Verifique a internet da TV.")
        } catch (e: Exception) {
            AuthResult(ok = false, error = "Erro inesperado: ${e.message}")
        }
    }

    /**
     * Extrai a mensagem de erro de respostas não-2xx do Supabase Auth.
     * Formatos reais observados:
     *   {"code":"400","error_code":"invalid_credentials","msg":"Invalid login credentials"}
     *   {"error":"invalid_grant","error_description":"Invalid login credentials"}
     *   {"message":"...","hint":"...","request_id":"..."}   (gateway/erros internos)
     * Falha ao parsear (HTML/gateway/proxy) → mensagem amigável com o código HTTP.
     */
    private fun extrairErro(text: String, code: Int): String {
        val amigavel = when (code) {
            400 -> "E-mail ou senha inválidos. Confira e tente de novo."
            401 -> "Sessão expirada ou e-mail não confirmado. Verifique seu e-mail."
            403 -> "Acesso negado. Verifique se o e-mail foi confirmado."
            422 -> "E-mail inválido ou senha muito curta (mínimo 6 caracteres)."
            429 -> "Muitas tentativas. Aguarde um minuto e tente de novo."
            else -> "Erro do servidor ($code). Tente novamente em instantes."
        }
        return try {
            val obj = JSONObject(text)
            obj.optString("msg").takeIf { it.isNotBlank() }
                ?: obj.optString("error_description").takeIf { it.isNotBlank() }
                ?: obj.optString("error").takeIf { it.isNotBlank() && it != "invalid_grant" }
                ?: obj.optString("message").takeIf { it.isNotBlank() }
                ?: amigavel
        } catch (_: Exception) {
            // Corpo não é JSON (HTML/erro de proxy/gateway) → nunca quebra o app.
            amigavel
        }
    }

    // ─────────────────────────── Sessão persistida ───────────────────────────

    /** Salva a sessão completa (access + refresh + expiração). */
    fun saveSession(
        context: Context,
        token: String,
        email: String,
        userId: String? = null,
        refreshToken: String? = null,
        expiresInSeconds: Long = 3600L,
    ) {
        val expiresAt = System.currentTimeMillis() + (expiresInSeconds * 1000L)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(K_TOKEN, token)
            .putString(K_EMAIL, email)
            .putString(K_USER_ID, userId ?: "")
            .putString(K_REFRESH, refreshToken ?: "")
            .putLong(K_EXPIRES_AT, expiresAt)
            .apply()
    }

    /** Salva a sessão a partir de um AuthResult (login/signup/refresh). */
    fun saveSession(context: Context, r: AuthResult): Boolean {
        val t = r.accessToken
        if (t.isNullOrBlank()) return false
        saveSession(
            context = context,
            token = t,
            email = r.email ?: loadEmail(context) ?: "",
            userId = r.userId ?: loadUserId(context),
            refreshToken = r.refreshToken ?: loadRefreshToken(context),
            expiresInSeconds = if (r.expiresIn > 0) r.expiresIn else 3600L,
        )
        return true
    }

    fun loadToken(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(K_TOKEN, null)

    fun loadRefreshToken(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(K_REFRESH, null)

    fun loadEmail(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(K_EMAIL, null)

    fun loadUserId(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(K_USER_ID, "") ?: ""

    fun loadExpiresAt(context: Context): Long =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getLong(K_EXPIRES_AT, 0L)

    fun estaLogado(context: Context): Boolean = !loadToken(context).isNullOrBlank()

    /**
     * Token VÁLIDO para usar em requisições: renova proativamente quando está
     * perto de expirar (margem de 90s), como o supabase-js faz.
     * Devolve null apenas quando não há sessão (ou o refresh falhou de vez).
     */
    fun validToken(context: Context): String? {
        val token = loadToken(context) ?: return null
        val expiresAt = loadExpiresAt(context)
        if (expiresAt == 0L) {
            // Sessão antiga sem expiração gravada: tenta renovar; se não houver
            // refresh_token, segue com o token atual.
            if (loadRefreshToken(context) != null) return forcarRefresh(context) ?: token
            return token
        }
        if (System.currentTimeMillis() > expiresAt - 90_000L) {
            return forcarRefresh(context) ?: token
        }
        return token
    }

    /** Força a renovação do access token. Devolve o novo token (ou null). */
    fun forcarRefresh(context: Context): String? {
        val refreshToken = loadRefreshToken(context) ?: return null
        val r = refresh(refreshToken)
        if (r.ok && !r.accessToken.isNullOrBlank()) {
            saveSession(context, r)
            return r.accessToken
        }
        return null
    }

    fun clearSession(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
}
