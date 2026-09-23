package com.movieflix.tv

import android.content.Context
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Resultado da autenticacao. */
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
 * Autenticacao via Supabase Auth REST (GoTrue) — MESMA conta do site e do app
 * mobile. Nenhuma conta paralela e criada: e-mail/senha sao os mesmos.
 *
 *  login:   POST /auth/v1/token?grant_type=password
 *  signup:  POST /auth/v1/signup
 *  refresh: POST /auth/v1/token?grant_type=refresh_token
 *  recover: POST /auth/v1/recover
 */
object AuthRepository {

    private val client = SupabaseRest.client.newBuilder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
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
            "/auth/v1/token?grant_type=password",
            JSONObject().put("email", email.trim()).put("password", password).toString(),
        )

    fun signup(email: String, password: String): AuthResult =
        request(
            "/auth/v1/signup",
            JSONObject().put("email", email.trim()).put("password", password).toString(),
        )

    fun refresh(refreshToken: String): AuthResult =
        request(
            "/auth/v1/token?grant_type=refresh_token",
            JSONObject().put("refresh_token", refreshToken).toString(),
        )

    /** ESQUECI A SENHA — dispara o e-mail de recuperacao (POST /auth/v1/recover). */
    fun recuperarSenha(email: String): AuthResult {
        val req = Request.Builder()
            .url(AppConfig.SUPABASE_URL + "/auth/v1/recover")
            .header("apikey", AppConfig.SUPABASE_ANON_KEY)
            .header("Authorization", "Bearer ${AppConfig.SUPABASE_ANON_KEY}")
            .header("Content-Type", "application/json")
            .post(JSONObject().put("email", email.trim()).toString().toRequestBody(JSON))
            .build()
        return try {
            client.newCall(req).execute().use { resp ->
                if (resp.isSuccessful) AuthResult(ok = true, email = email.trim())
                else AuthResult(ok = false, error = extrairErro(resp.body?.string() ?: "", resp.code))
            }
        } catch (e: IOException) {
            AuthResult(ok = false, error = "Sem conexao. Verifique a internet da TV.")
        } catch (e: Exception) {
            AuthResult(ok = false, error = "Erro inesperado: ${e.message}")
        }
    }

    /** TROCA DE SENHA logado (PUT /auth/v1/user). */
    fun trocarSenha(ctx: Context, novaSenha: String): AuthResult {
        val token = validToken(ctx) ?: return AuthResult(ok = false, error = "Sessao expirada. Entre de novo.")
        val req = Request.Builder()
            .url(AppConfig.SUPABASE_URL + "/auth/v1/user")
            .header("apikey", AppConfig.SUPABASE_ANON_KEY)
            .header("Authorization", "Bearer $token")
            .header("Content-Type", "application/json")
            .put(JSONObject().put("password", novaSenha).toString().toRequestBody(JSON))
            .build()
        return try {
            client.newCall(req).execute().use { resp ->
                if (resp.isSuccessful) AuthResult(ok = true, email = loadEmail(ctx))
                else AuthResult(ok = false, error = extrairErro(resp.body?.string() ?: "", resp.code))
            }
        } catch (e: Exception) {
            AuthResult(ok = false, error = "Erro inesperado: ${e.message}")
        }
    }

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
                    val obj = JSONObject(text)
                    val user = obj.optJSONObject("user")
                    AuthResult(
                        ok = true,
                        accessToken = obj.optString("access_token", ""),
                        refreshToken = obj.optString("refresh_token", ""),
                        expiresIn = obj.optLong("expires_in", 3600L),
                        userId = user?.optString("id"),
                        email = user?.optString("email"),
                    )
                } else {
                    AuthResult(ok = false, error = extrairErro(text, resp.code))
                }
            }
        } catch (e: IOException) {
            AuthResult(ok = false, error = "Sem conexao. Verifique a internet da TV.")
        } catch (e: Exception) {
            AuthResult(ok = false, error = "Erro inesperado: ${e.message}")
        }
    }

    private fun extrairErro(text: String, code: Int): String {
        val amigavel = when (code) {
            400 -> "E-mail ou senha invalidos. Confira e tente de novo."
            401 -> "Sessao expirada ou e-mail nao confirmado. Verifique seu e-mail."
            403 -> "Acesso negado. Verifique se o e-mail foi confirmado."
            422 -> "E-mail invalido ou senha muito curta (minimo 6 caracteres)."
            429 -> "Muitas tentativas. Aguarde um minuto e tente de novo."
            else -> "Erro do servidor ($code). Tente novamente em instantes."
        }
        return try {
            val obj = JSONObject(text)
            obj.optString("msg").takeIf { it.isNotBlank() }
                ?: obj.optString("error_description").takeIf { it.isNotBlank() }
                ?: obj.optString("message").takeIf { it.isNotBlank() }
                ?: amigavel
        } catch (_: Exception) { amigavel }
    }

    // ── Sessao persistida ──

    fun saveSession(ctx: Context, r: AuthResult): Boolean {
        val t = r.accessToken
        if (t.isNullOrBlank()) return false
        val expiresAt = System.currentTimeMillis() + (r.expiresIn.coerceAtLeast(60L) * 1000L)
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(K_TOKEN, t)
            .putString(K_REFRESH, r.refreshToken ?: loadRefreshToken(ctx) ?: "")
            .putLong(K_EXPIRES_AT, expiresAt)
            .putString(K_EMAIL, r.email ?: loadEmail(ctx) ?: "")
            .putString(K_USER_ID, r.userId ?: loadUserId(ctx))
            .apply()
        return true
    }

    fun loadToken(ctx: Context): String? = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(K_TOKEN, null)
    fun loadRefreshToken(ctx: Context): String? = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(K_REFRESH, null)
    fun loadEmail(ctx: Context): String? = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(K_EMAIL, null)
    fun loadUserId(ctx: Context): String = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(K_USER_ID, "") ?: ""
    private fun loadExpiresAt(ctx: Context): Long = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(K_EXPIRES_AT, 0L)

    fun estaLogado(ctx: Context): Boolean = !loadToken(ctx).isNullOrBlank()

    /** Token VALIDO: renova proativamente 90s antes de expirar (como supabase-js). */
    fun validToken(ctx: Context): String? {
        val token = loadToken(ctx) ?: return null
        val expiresAt = loadExpiresAt(ctx)
        if (expiresAt == 0L) {
            if (loadRefreshToken(ctx) != null) return forcarRefresh(ctx) ?: token
            return token
        }
        if (System.currentTimeMillis() > expiresAt - 90_000L) return forcarRefresh(ctx) ?: token
        return token
    }

    fun forcarRefresh(ctx: Context): String? {
        val refreshToken = loadRefreshToken(ctx) ?: return null
        val r = refresh(refreshToken)
        return if (r.ok && !r.accessToken.isNullOrBlank()) {
            saveSession(ctx, r)
            r.accessToken
        } else null
    }

    fun clearSession(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
}
