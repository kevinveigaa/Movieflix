package com.movieflix.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Conta do usuario na TV — MESMAS tabelas e MESMAS regras do site/mobile:
 *  - `subscriptions` -> plano, status e validade (vencimento e a fonte de verdade)
 *  - `plans`         -> catalogo de planos (precos/limites reais do banco)
 *  - `profiles`      -> perfil da conta (is_admin)
 */
object AccountRepository {

    data class Assinatura(
        val planCode: String?,
        val planId: String?,
        val status: String?,
        val expiresAt: String?,
        val startsAt: String?,
    )

    data class Plano(
        val id: String,
        val code: String,
        val name: String,
        val priceCents: Int,
        val description: String,
        val features: List<String>,
        val durationDays: Int,
    )

    fun assinatura(ctx: Context): Assinatura? {
        val uid = AuthRepository.loadUserId(ctx)
        if (uid.isBlank()) return null
        val q = listOf(
            "select=*",
            SupabaseRest.eq("user_id", uid),
            SupabaseRest.order("created_at", ascending = false),
            SupabaseRest.limit(1),
        ).joinToString("&")
        val arr = SupabaseRest.select(ctx, "subscriptions", q)
        val o = arr.optJSONObject(0) ?: return null
        return Assinatura(
            planCode = o.optStringOrNull("plan_code"),
            planId = o.optStringOrNull("plan_id"),
            status = o.optStringOrNull("status"),
            expiresAt = o.optStringOrNull("expires_at"),
            startsAt = o.optStringOrNull("starts_at"),
        )
    }

    /** Catalogo de planos (tabela `plans`) — mesmos precos/limites do site. */
    fun planos(ctx: Context): List<Plano> {
        val arr = SupabaseRest.select(
            ctx, "plans", "select=*&${SupabaseRest.order("price_cents", ascending = true)}",
        )
        val out = ArrayList<Plano>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val feats = ArrayList<String>()
            val f = o.optJSONArray("features")
            if (f != null) for (j in 0 until f.length()) feats.add(f.optString(j))
            out.add(
                Plano(
                    id = o.optString("id"),
                    code = o.optString("code"),
                    name = o.optString("name"),
                    priceCents = o.optInt("price_cents", 0),
                    description = o.optString("description"),
                    features = feats,
                    durationDays = o.optInt("duration_days", 30),
                ),
            )
        }
        return out
    }

    fun ehAdmin(ctx: Context): Boolean {
        val uid = AuthRepository.loadUserId(ctx)
        if (uid.isBlank()) return false
        val arr = SupabaseRest.select(ctx, "profiles", "select=is_admin&${SupabaseRest.eq("id", uid)}&limit=1")
        return arr.optJSONObject(0)?.optBoolean("is_admin", false) ?: false
    }

    /** Regra CENTRAL: status == 'active' E expires_at no futuro (src/lib/plans.ts). */
    fun temAssinaturaAtiva(a: Assinatura?): Boolean {
        if (a == null || a.status != "active") return false
        val exp = a.expiresAt ?: return false
        val ms = PlanoRegras.parseIso(exp) ?: return false
        return ms > System.currentTimeMillis()
    }

    fun diasRestantes(a: Assinatura?): Int = PlanoRegras.diasRestantes(a?.expiresAt)

    private fun JSONObject.optStringOrNull(key: String): String? {
        if (isNull(key)) return null
        return optString(key, "").ifBlank { null }
    }
}
