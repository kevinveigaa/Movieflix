package com.movieflix.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Perfis de exibicao (`viewer_profiles`) — MESMA tabela e MESMAS regras do site.
 * O limite de perfis por plano (1 sem assinatura; 2/3/5 conforme o plano) e
 * aplicado na UI (PlanoRegras). O perfil ativo e persistido localmente.
 */
object ProfilesRepository {

    private const val PREFS = "mf_active_profile"
    private const val K_ID = "id"
    private const val K_NAME = "name"
    private const val K_AVATAR = "avatar_url"
    private const val K_KID = "is_kid"

    /**
     * AVATARES — mesmo servico/seeds/cores do site (`src/lib/avatars.ts`).
     * O site usa SVG; aqui a mesma API do DiceBear e pedida em PNG (o Glide/Android
     * nao decodifica SVG nativamente). Mesmo desenho, mesmo seed.
     */
    val AVATARES: List<String> = listOf(
        "https://api.dicebear.com/7.x/thumbs/png?seed=1&backgroundColor=9d38ff",
        "https://api.dicebear.com/7.x/thumbs/png?seed=2&backgroundColor=171717",
        "https://api.dicebear.com/7.x/thumbs/png?seed=3&backgroundColor=0ea5e9",
        "https://api.dicebear.com/7.x/thumbs/png?seed=4&backgroundColor=16a34a",
        "https://api.dicebear.com/7.x/thumbs/png?seed=5&backgroundColor=f59e0b",
        "https://api.dicebear.com/7.x/thumbs/png?seed=6&backgroundColor=a855f7",
        "https://api.dicebear.com/7.x/thumbs/png?seed=7&backgroundColor=ec4899",
        "https://api.dicebear.com/7.x/thumbs/png?seed=8&backgroundColor=14b8a6",
    )

    /** Deixa a URL do avatar renderizavel no Android (svg -> png). */
    fun avatarRenderizavel(url: String): String = url
        .replace("/thumbs/svg", "/thumbs/png")
        .replace(".svg", ".png")

    data class Perfil(val id: String, val name: String, val avatarUrl: String, val isKid: Boolean)

    fun listar(ctx: Context): List<Perfil> {
        val uid = AuthRepository.loadUserId(ctx)
        if (uid.isBlank()) return emptyList()
        val q = listOf(
            "select=*",
            SupabaseRest.eq("owner_id", uid),
            SupabaseRest.order("created_at", ascending = true),
        ).joinToString("&")
        return parse(SupabaseRest.select(ctx, "viewer_profiles", q))
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

    fun criar(ctx: Context, nome: String, avatar: String, isKid: Boolean): Perfil? {
        val uid = AuthRepository.loadUserId(ctx)
        if (uid.isBlank()) return null
        val row = JSONObject()
            .put("owner_id", uid)
            .put("name", nome.trim())
            .put("avatar_url", avatar)
            .put("is_kid", isKid)
        val criado = SupabaseRest.insert(ctx, "viewer_profiles", row) ?: return null
        return Perfil(
            id = criado.optString("id"),
            name = criado.optString("name", nome),
            avatarUrl = criado.optString("avatar_url", avatar),
            isKid = criado.optBoolean("is_kid", isKid),
        )
    }

    fun atualizar(ctx: Context, id: String, nome: String, avatar: String, isKid: Boolean): Boolean {
        val patch = JSONObject()
            .put("name", nome.trim())
            .put("avatar_url", avatar)
            .put("is_kid", isKid)
        return SupabaseRest.update(ctx, "viewer_profiles", SupabaseRest.eq("id", id), patch)
    }

    fun remover(ctx: Context, id: String): Boolean =
        SupabaseRest.delete(ctx, "viewer_profiles", SupabaseRest.eq("id", id))

    // ── Perfil ativo (persistido local) ──

    fun perfilAtivo(ctx: Context): Perfil? {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val id = p.getString(K_ID, null) ?: return null
        if (id.isBlank()) return null
        return Perfil(
            id = id,
            name = p.getString(K_NAME, "") ?: "",
            avatarUrl = p.getString(K_AVATAR, "") ?: "",
            isKid = p.getBoolean(K_KID, false),
        )
    }

    fun perfilAtivoId(ctx: Context): String? = perfilAtivo(ctx)?.id?.takeIf { it.isNotBlank() }

    fun setPerfilAtivo(ctx: Context, perfil: Perfil?) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
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
