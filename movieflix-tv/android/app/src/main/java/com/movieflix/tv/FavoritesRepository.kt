package com.movieflix.tv

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Minha Lista / Favoritos — MESMA tabela `favorites` do site (Supabase).
 *
 * A tabela guarda { user_id, tmdb_id, media_type, created_at } e, quando as
 * migrations estão aplicadas, também viewer_profile_id e movie_id. O app
 * detecta as colunas (como `favoritesColumns.ts` faz) e grava conforme o
 * schema disponível — nunca quebra antes/depois da migration.
 *
 * O token da sessão (JWT) é enviado como Authorization Bearer, exatamente o
 * que o site faz; a RLS garante que cada usuário só lê/escreve a própria lista.
 */
object FavoritesRepository {

    data class Colunas(
        val viewerProfileId: Boolean,
        val movieId: Boolean,
    )

    @Volatile
    private var colunasCache: Colunas? = null

    private fun colunas(context: Context): Colunas {
        colunasCache?.let { return it }
        val vp = SupabaseRest.selectDetectando(context, "favorites", "select=viewer_profile_id&limit=0").second
        val mi = SupabaseRest.selectDetectando(context, "favorites", "select=movie_id&limit=0").second
        val c = Colunas(vp, mi)
        colunasCache = c
        return c
    }

    /** Lista de favoritos do perfil ativo: pares (tmdb_id, media_type). */
    fun listar(context: Context): List<Pair<Long, String>> = listarObjetos(context).map { it.tmdbId to it.mediaType }

    /**
     * Linha da tabela `favorites`.
     *
     * O `id` é essencial: o site REMOVE o favorito por ele
     * (`supabase.from('favorites').delete().eq('id', row.id)`), e é esse o
     * fluxo que replicamos aqui.
     */
    data class Favorito(
        val id: String?,
        val tmdbId: Long,
        val mediaType: String,
        val movieId: String?,
    )

    /**
     * Resultado da listagem com o motivo real de uma eventual falha.
     *
     * `semTmdb` conta os registros salvos cujo `tmdb_id` não é numérico (título
     * do catálogo sem TMDb). A TV casa favoritos por `tmdb_id`, então esses não
     * são utilizáveis aqui — em vez de sumirem em silêncio numa lista vazia, o
     * número é devolvido para a tela poder avisar.
     */
    data class ResultadoLista(val itens: List<Favorito>, val semTmdb: Int, val erro: String?)

    /** Lista completa dos favoritos do perfil ativo, COM o status real. */
    fun listarResultado(context: Context): ResultadoLista {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) {
            return ResultadoLista(emptyList(), 0, "Sessão não encontrada. Entre de novo com a conta do site.")
        }
        val c = colunas(context)
        val (codigo, arr, corpoErro) = SupabaseRest.selectComStatus(
            context, "favorites", filtrosLista(context, uid, c),
        )
        if (codigo !in 200..299) {
            return ResultadoLista(emptyList(), 0, "Favoritos: erro $codigo ${corpoErro ?: ""}".trim())
        }
        val itens = ArrayList<Favorito>(arr.length())
        var semTmdb = 0
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val t = o.optLong("tmdb_id", 0L)
            if (t <= 0L) {
                semTmdb++
                continue
            }
            itens.add(
                Favorito(
                    id = if (o.isNull("id")) null else o.optString("id"),
                    tmdbId = t,
                    mediaType = o.optString("media_type", "movie"),
                    movieId = if (o.isNull("movie_id")) null else o.optString("movie_id"),
                ),
            )
        }
        // ── DEDUPLICAÇÃO (correção do bug "o mesmo título aparece várias vezes") ──
        //
        // O banco pode já conter duplicatas antigas (criadas por cliques repetidos
        // no controle remoto antes desta correção). A listagem passa a devolver UMA
        // única linha por título, preservando a mais recente — assim a tela
        // Favoritos nunca mostra o mesmo conteúdo duas vezes. A regra vive em
        // FavoritesLogic (coberta por FavoritesLogicTest).
        val unicos = FavoritesLogic.deduplicar(
            itens.map { FavoritesLogic.Linha(it.id, it.tmdbId, it.mediaType) },
        )
        val porChave = itens.associateBy { FavoritesLogic.chave(it.mediaType, it.tmdbId) }
        val finais = unicos.mapNotNull { porChave[FavoritesLogic.chave(it.mediaType, it.tmdbId)] }
        return ResultadoLista(finais, semTmdb, null)
    }

    /** Só os pares (tmdb_id, media_type) — usado pelas telas de catálogo. */
    fun listarObjetos(context: Context): List<Favorito> = listarResultado(context).itens

    /** Filtros da consulta — MESMOS do site (`src/hooks/useFavorite.ts`). */
    private fun filtrosLista(context: Context, uid: String, c: Colunas): String {
        val filtros = ArrayList<String>()
        filtros.add("select=id,tmdb_id,media_type" + if (c.movieId) ",movie_id" else "")
        filtros.add(SupabaseRest.eq("user_id", uid))
        if (c.viewerProfileId) {
            val perfil = ProfilesRepository.perfilAtivoId(context)
            filtros.add(
                if (perfil != null) SupabaseRest.eq("viewer_profile_id", perfil)
                else SupabaseRest.isNull("viewer_profile_id"),
            )
        }
        filtros.add(SupabaseRest.order("created_at", ascending = false))
        return filtros.joinToString("&")
    }

    fun ehFavorito(context: Context, tmdbId: Long): Boolean =
        listarResultado(context).itens.any { it.tmdbId == tmdbId }

    /**
     * O título ESTÁ nos favoritos? — pergunta ao SERVIDOR, não à tela.
     *
     * É esta a base da decisão de adicionar/remover (ver FavoritesLogic.decidir):
     * perguntar ao servidor elimina a janela em que um segundo toque no controle
     * remoto ainda enxergava o estado antigo da tela e inseria de novo.
     */
    fun contem(context: Context, tmdbId: Long, mediaType: String? = null): Boolean =
        listarResultado(context).itens.any {
            it.tmdbId == tmdbId && (mediaType == null || it.mediaType == mediaType)
        }

    /** A linha exata do favorito (para remover pelo `id`, igual ao site). */
    fun linha(context: Context, tmdbId: Long): Favorito? =
        listarResultado(context).itens.firstOrNull { it.tmdbId == tmdbId }

    /**
     * ADICIONA aos favoritos — MESMO fluxo do site (insert simples).
     *
     * ── CORREÇÃO DO BUG ───────────────────────────────────────────────────
     * Antes esta função fazia:
     *     POST /favorites?on_conflict=user_id,tmdb_id,media_type
     *     Prefer: resolution=merge-duplicates      (upsert)
     *
     * A tabela `favorites` do MovieFlix NÃO tem UNIQUE em
     * (user_id, tmdb_id, media_type) — e nenhuma migration cria esse índice
     * (`20260823120000_favorites_profile_columns.sql` e
     * `20260823130000_favorites_movie_id.sql` só adicionam colunas).
     * O Postgres então responde sempre:
     *     42P10 — "there is no unique or exclusion constraint matching the
     *     ON CONFLICT specification"
     * ou seja, o upsert falhava SEMPRE. Como a UI só olhava o resultado e
     * trocava a cor DEPOIS, e como a lista recarregada continuava vazia, o
     * sintoma era exatamente "o botão fica destacado mas o título não entra na
     * lista".
     *
     * O site nunca usou upsert: ele faz INSERT puro. Aqui replicamos isso.
     * ──────────────────────────────────────────────────────────────────────
     */
    fun adicionar(
        context: Context,
        tmdbId: Long,
        mediaType: String,
        movieId: String? = null,
        titulo: String = "",
        posterPath: String = "",
        backdropPath: String = "",
        voteAverage: Double = 0.0,
    ): Boolean {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return false
        // ── IDEMPOTÊNCIA REAL (correção do bug das duplicatas) ──
        //
        // Antes esta função INSERIA DIRETO, sem conferir nada. Com o controle
        // remoto, dois OKs rápidos viravam duas linhas idênticas na mesma tabela
        // `favorites`. O site (src/hooks/useFavorite.ts) sempre confere a linha
        // antes de decidir — a TV não conferia.
        //
        // Agora: se o título JÁ ESTÁ salvo, não inserimos de novo (devolvemos
        // verdadeiro, pois o estado desejado — "favoritado" — já vale). A regra de
        // decisão é única e vive em FavoritesLogic (coberta por FavoritesLogicTest).
        if (contem(context, tmdbId, mediaType)) return true
        val c = colunas(context)
        val row = JSONObject()
            .put("user_id", uid)
            .put("tmdb_id", tmdbId)
            .put("media_type", mediaType)
            .put("title", titulo)
            .put("poster_path", posterPath)
            .put("backdrop_path", backdropPath)
            .put("vote_average", voteAverage)
        if (c.movieId && !movieId.isNullOrBlank()) row.put("movie_id", movieId)
        if (c.viewerProfileId) {
            row.put("viewer_profile_id", ProfilesRepository.perfilAtivoId(context) ?: JSONObject.NULL)
        }
        val criado = SupabaseRest.insert(context, "favorites", row) ?: return false
        // O PostgREST devolve a linha criada (return=representation). Sem id =
        // o INSERT não aconteceu de fato — nunca dizemos "salvou" nesse caso.
        return criado.length() > 0
    }

    /**
     * REMOVE dos favoritos — MESMO fluxo do site (DELETE pelo `id` da linha), agora
     * apagando TODAS as linhas do título.
     *
     * ── POR QUE TODAS ──
     * Se o banco já tem duplicatas antigas e apagássemos só a primeira, o título
     * continuaria aparecendo nos Favoritos e o botão voltaria para "favoritado"
     * logo depois de remover — o usuário veria o 2º clique como se nada tivesse
     * acontecido. Apagar todas as linhas deixa o servidor exatamente no estado
     * pedido: "não favoritado".
     */
    fun remover(context: Context, tmdbId: Long): Boolean {
        val uid = AuthRepository.loadUserId(context)
        if (uid.isBlank()) return false
        val locais = listarResultado(context).itens.filter { it.tmdbId == tmdbId }
        val filtro = if (locais.isNotEmpty() && locais.all { !it.id.isNullOrBlank() }) {
            val ids = locais.mapNotNull { it.id }
            "id=in.(" + ids.joinToString(",") + ")"
        } else {
            listOf(
                SupabaseRest.eq("user_id", uid),
                SupabaseRest.eqNum("tmdb_id", tmdbId),
            ).joinToString("&")
        }
        return SupabaseRest.delete(context, "favorites", filtro)
    }
}
