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
    val userId: String? = null,
    val email: String? = null,
    val error: String? = null,
)

/**
 * Autenticação via Supabase Auth REST (mesma conta do site — integração total).
 * - login:  POST {SUPABASE_URL}/auth/v1/token?grant_type=password
 * - signup: POST {SUPABASE_URL}/auth/v1/signup
 * O access token (JWT) é usado depois no backend para validar assinatura
 * (mesmo fluxo do site: /api/streambetter-resolve com Authorization Bearer).
 */
object AuthRepository {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        // Timeout TOTAL: em TVs com rede lenta o app NUNCA fica preso esperando.
        .callTimeout(30, TimeUnit.SECONDS)
        .build()

    private val JSON = "application/json; charset=utf-8".toMediaType()

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
                    // Sucesso: {"access_token":..., "refresh_token":..., "user":{...}}
                    val obj = JSONObject(text)
                    val token = obj.optString("access_token", "")
                    val user = obj.optJSONObject("user")
                    AuthResult(
                        ok = true,
                        accessToken = token,
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

    /** Token persistido localmente (sessão do usuário). */
    fun saveSession(context: Context, token: String, email: String, userId: String? = null) {
        context.getSharedPreferences("mf_session", Context.MODE_PRIVATE).edit()
            .putString("access_token", token)
            .putString("email", email)
            .putString("user_id", userId ?: "")
            .apply()
    }

    fun loadToken(context: Context): String? =
        context.getSharedPreferences("mf_session", Context.MODE_PRIVATE)
            .getString("access_token", null)

    fun loadEmail(context: Context): String? =
        context.getSharedPreferences("mf_session", Context.MODE_PRIVATE)
            .getString("email", null)

    /** UUID do usuário no Supabase (necessário para Minha Lista). */
    fun loadUserId(context: Context): String =
        context.getSharedPreferences("mf_session", Context.MODE_PRIVATE)
            .getString("user_id", "") ?: ""

    fun clearSession(context: Context) {
        context.getSharedPreferences("mf_session", Context.MODE_PRIVATE).edit().clear().apply()
    }
}
