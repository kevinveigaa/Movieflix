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
}
