import { createClient } from '@supabase/supabase-js';

// Fallback público do projeto MovieFlix. A chave anon do Supabase é pública
// por design (role "anon") e já vive no repositório; usá-la como padrão evita
// que o app quebre com "supabaseUrl is required" quando as variáveis de
// ambiente não estão definidas (ex.: clone local / preview sem .env). As
// variáveis VITE_SUPABASE_* continuam tendo prioridade quando existirem.
const DEFAULT_SUPABASE_URL = 'https://mntyanfhxiqspdedmddb.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udHlhbmZoeGlxc3BkZWRtZGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NTA5MzEsImV4cCI6MjEwMTAyNjkzMX0.FxGmpM7-PIwj-XP-l6KC2G0L425X7e2zANGS03xrbr0';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || DEFAULT_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;
