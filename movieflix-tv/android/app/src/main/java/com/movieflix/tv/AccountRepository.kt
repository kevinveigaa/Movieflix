package com.movieflix.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Conta do usuário na TV — MESMAS tabelas e MESMAS regras do site/mobile:
 *
 *  - `subscriptions`  → plano, status e validade (vencimento é a fonte de verdade)
 *  - `plans`          → catálogo de planos (preços/limites reais do banco)
 *  - `profiles`       → perfil da conta (is_admin etc.)
 *
 * Nenhuma regra de preço/limite é inventada aqui: os limites vêm de
 * `plans.js` do mobile (`entitlementsForPlan`), replicados em [PlanEntitlements].
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

    // ─────────────────────── Assinatura ───────────────────────

    /** Assinatura mais recente do usuário (mesma consulta do AuthContext mobile). */
    fun assinatura(context: Context): Assinatura? {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return null
        val q = listOf(
            "select=*",
            SupabaseRest.eq("user_id", uid),
            SupabaseRest.order("created_at", ascending = false),
            SupabaseRest.limit(1),
        ).joinToString("&")
        val arr = SupabaseRest.select(context, "subscriptions", q)
        if (arr.length() == 0) return null
        val o = arr.optJSONObject(0) ?: return null
        return Assinatura(
            planCode = o.optStringOrNull("plan_code"),
            planId = o.optStringOrNull("plan_id"),
            status = o.optStringOrNull("status"),
            expiresAt = o.optStringOrNull("expires_at"),
            startsAt = o.optStringOrNull("starts_at"),
        )
    }

    /** Catálogo de planos (tabela `plans`) — mesmos preços/limites do site. */
    fun planos(context: Context): List<Plano> {
        val arr = SupabaseRest.select(
            context, "plans", "select=*&${SupabaseRest.order("price_cents", ascending = true)}",
        )
        return parsePlanos(arr)
    }

    private fun parsePlanos(arr: JSONArray): List<Plano> {
        val out = ArrayList<Plano>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val feats = ArrayList<String>()
            val f = o.optJSONArray("features")
            if (f != null) for (j in 0 until f.length()) out.let { feats.add(f.optString(j)) }
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

    /** Perfil da conta (is_admin). */
    fun ehAdmin(context: Context): Boolean {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return false
        val arr = SupabaseRest.select(
            context, "profiles", "select=is_admin&${SupabaseRest.eq("id", uid)}&limit=1",
        )
        return arr.optJSONObject(0)?.optBoolean("is_admin", false) ?: false
    }

    /**
     * Regra CENTRAL de assinatura ativa — idêntica a `temAssinaturaAtiva`
     * (src/lib/plans.ts): status == 'active' E expires_at no futuro.
     */
    fun temAssinaturaAtiva(a: Assinatura?): Boolean {
        if (a == null) return false
        if (a.status != "active") return false
        val exp = a.expiresAt ?: return false
        val ms = PlanoRegras.parseIso(exp) ?: return false
        return ms > System.currentTimeMillis()
    }

    /** Dias restantes (arredondado para cima), como `diasRestantes` do mobile. */
    fun diasRestantes(a: Assinatura?): Int = PlanoRegras.diasRestantes(a?.expiresAt)

    // ─────────────────────── Utilidades JSON ───────────────────────

    private fun JSONObject.optStringOrNull(key: String): String? {
        if (isNull(key)) return null
        val v = optString(key, "")
        return v.ifBlank { null }
    }
}
