package com.movieflix.tv

/**
 * Credenciais públicas do backend MovieFlix.
 *
 * A URL e a chave ANON do Supabase são públicas por design (role "anon",
 * protegida por RLS no banco) e já vivem no repositório do site
 * (src/lib/supabase.ts). O backend Express do MovieFlix roda em
 * https://movieflix-bszf.onrender.com e resolve os streams HLS.
 *
 * NENHUMA chave secreta (service_role, tokens, senhas) está neste arquivo.
 */
object AppConfig {
    const val SUPABASE_URL = "https://mntyanfhxiqspdedmddb.supabase.co"
    const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udHlhbmZoeGlxc3BkZWRtZGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NTA5MzEsImV4cCI6MjEwMTAyNjkzMX0.FxGmpM7-PIwj-XP-l6KC2G0L425X7e2zANGS03xrbr0"
    const val BACKEND_URL = "https://movieflix-bszf.onrender.com"

    // ─────────────────────────────────────────────────────────────────────
    // STREAMBETTER — EMBED OFICIAL (plano Creator, chave PÚBLICA sb_pk_*)
    // ─────────────────────────────────────────────────────────────────────
    // O site e o app mobile usam o EMBED OFICIAL do StreamBetter e SEMPRE
    // anexam a chave pública `key=sb_pk_*` na URL (src/lib/streamEmbed.ts →
    // `comChave()`). Sem essa chave o provedor não reconhece a conta Creator e
    // o HTML do embed volta SEM `sources` — era exatamente por isso que a TV
    // mostrava "este título ainda não possui fonte de vídeo disponível"
    // enquanto o mesmo título abria normalmente no celular.
    //
    // A chave é PÚBLICA por design (é feita para ficar no embed do navegador)
    // e já está versionada no repositório do site. NÃO é segredo, não é
    // service_role e não dá acesso administrativo a nada.
    //
    // Fonte de verdade: src/lib/streamEmbed.ts (STREAMBETTER_PUBLIC_KEY_FALLBACK).
    const val STREAMBETTER_BASE = "https://streambetter.shop"
    const val STREAMBETTER_PUBLIC_KEY =
        "sb_pk_19fe7c75a49585cd84ced96806703a2176768fa4f77a7ea4"

    /**
     * Anexa a chave pública à URL do embed — MESMA regra de `comChave()` em
     * `src/lib/streamEmbed.ts` (usa `&` quando a URL já tem query, `?` quando não).
     * Idempotente: se a URL já traz a chave, nada é duplicado.
     */
    fun comChaveStreamBetter(url: String): String {
        if (url.isBlank()) return url
        if (!url.contains("streambetter.shop")) return url
        if (url.contains("key=")) return url
        if (STREAMBETTER_PUBLIC_KEY.isBlank()) return url
        val separador = if (url.contains("?")) "&" else "?"
        return "$url$separador" + "key=" + STREAMBETTER_PUBLIC_KEY
    }
}
