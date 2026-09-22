package com.movieflix.tv

/**
 * Credenciais publicas do backend MovieFlix.
 *
 * A URL e a chave ANON do Supabase sao publicas por design (role "anon",
 * protegida por RLS no banco) e ja vivem no repositorio do site
 * (src/lib/supabase.ts). NENHUMA chave secreta (service_role, tokens, senhas)
 * esta neste arquivo.
 */
object AppConfig {
    const val SUPABASE_URL = "https://mntyanfhxiqspdedmddb.supabase.co"
    const val SUPABASE_ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udHlhbmZoeGlxc3BkZWRtZGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NTA5MzEsImV4cCI6MjEwMTAyNjkzMX0.FxGmpM7-PIwj-XP-l6KC2G0L425X7e2zANGS03xrbr0"

    /** Site/backend oficial — mesma origem do catalogo JSON e das rotas da API. */
    const val SITE_URL = "https://movieflix-bszf.onrender.com"

    // ── STREAMBETTER (embed oficial, chave PUBLICA do plano Creator) ──
    // A chave `sb_pk_*` e publica por design (vai no embed do navegador) e ja
    // esta versionada no repositorio do site. Nao e segredo.
    const val STREAMBETTER_BASE = "https://streambetter.shop"
    const val STREAMBETTER_PUBLIC_KEY =
        "sb_pk_19fe7c75a49585cd84ced96806703a2176768fa4f77a7ea4"

    /** WhatsApp oficial (ativacao manual de assinatura). */
    const val WHATSAPP_NUMBER = "5511943750307"

    /**
     * Anexa a chave publica a URL do embed — MESMA regra de `comChave()` em
     * src/lib/streamEmbed.ts (idempotente).
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
