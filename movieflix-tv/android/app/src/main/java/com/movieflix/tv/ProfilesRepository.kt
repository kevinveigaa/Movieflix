package com.movieflix.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Perfis de exibição (`viewer_profiles`) — MESMA tabela e MESMAS regras do site.
 *
 * O limite de perfis por plano (1 sem assinatura; 2/3/5 conforme o plano) é
 * aplicado na UI, exatamente como `ProfileSelectPage` faz no mobile.
 * O perfil ativo é persistido localmente (equivalente à chave
 * `movieflix_active_profile` usada no localStorage do site).
 */
object ProfilesRepository {

    private const val PREFS = "mf_active_profile"
    private const val K_ID = "id"
    private const val K_NAME = "name"
    private const val K_AVATAR = "avatar_url"
    private const val K_KID = "is_kid"

    data class Perfil(
        val id: String,
        val name: String,
        val avatarUrl: String,
        val isKid: Boolean,
    )

    // ─────────────────────── CRUD (Supabase, RLS por usuário) ───────────────────────

    fun listar(context: Context): List<Perfil> {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return emptyList()
        val q = listOf(
            "select=*",
            SupabaseRest.eq("owner_id", uid),
            SupabaseRest.order("created_at", ascending = true),
        ).joinToString("&")
        val arr = SupabaseRest.select(context, "viewer_profiles", q)
        return parse(arr)
    }

    private fun parse(arr: JSONArray): List<Perfil> {
        val out = ArrayList<Perfil>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.add(
                Perfil(
                    id = o.optString("id"),
                    name = o.optString("name"),
                    avatarUrl = o.optString("avatar_url"),
                    isKid = o.optBoolean("is_kid", false),
                ),
            )
        }
        return out
    }

    fun criar(context: Context, nome: String, avatar: String, isKid: Boolean): Perfil? {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return null
        val row = JSONObject()
            .put("owner_id", uid)
            .put("name", nome.trim())
            .put("avatar_url", avatar)
            .put("is_kid", isKid)
        val criado = SupabaseRest.insert(context, "viewer_profiles", row) ?: return null
        return Perfil(
            id = criado.optString("id"),
            name = criado.optString("name", nome),
            avatarUrl = criado.optString("avatar_url", avatar),
            isKid = criado.optBoolean("is_kid", isKid),
        )
    }

    fun atualizar(context: Context, id: String, nome: String, avatar: String, isKid: Boolean): Boolean {
        val patch = JSONObject()
            .put("name", nome.trim())
            .put("avatar_url", avatar)
            .put("is_kid", isKid)
        return SupabaseRest.update(
            context, "viewer_profiles", SupabaseRest.eq("id", id), patch,
        )
    }

    fun remover(context: Context, id: String): Boolean =
        SupabaseRest.delete(context, "viewer_profiles", SupabaseRest.eq("id", id))

    // ─────────────────────── Perfil ativo (persistido local) ───────────────────────

    fun perfilAtivo(context: Context): Perfil? {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val id = p.getString(K_ID, null) ?: return null
        if (id.isBlank()) return null
        return Perfil(
            id = id,
            name = p.getString(K_NAME, "") ?: "",
            avatarUrl = p.getString(K_AVATAR, "") ?: "",
            isKid = p.getBoolean(K_KID, false),
        )
    }

    /** Id do perfil ativo — usado para filtrar favoritos/histórico (ou null). */
    fun perfilAtivoId(context: Context): String? =
        perfilAtivo(context)?.id?.takeIf { it.isNotBlank() }

    fun setPerfilAtivo(context: Context, perfil: Perfil?) {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        if (perfil == null) {
            p.clear()
        } else {
            p.putString(K_ID, perfil.id)
                .putString(K_NAME, perfil.name)
                .putString(K_AVATAR, perfil.avatarUrl)
                .putBoolean(K_KID, perfil.isKid)
        }
        p.apply()
    }
}
