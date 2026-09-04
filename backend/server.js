require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");

const app = express();

app.use(cors());
app.use(compression());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const STARTED_AT = new Date().toISOString();

// Chave da TMDb fica no servidor (nunca no bundle do frontend).
// Defina TMDB_API_KEY (ou VITE_TMDB_TOKEN) no ambiente do backend.
const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_TOKEN;
const TMDB_API_BASE = "https://api.themoviedb.org/3";

// Supabase (admin) — usado SOMENTE no servidor para listar clientes e
// alterar senha. A service_role NUNCA vai para o frontend.
const { createClient } = require("@supabase/supabase-js");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminSupabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// ============================================================
// ADMIN — GESTÃO DE CLIENTES E PLANOS (service_role)
// ============================================================
// Endpoints protegidos: exigem que o chamador seja o admin autenticado.
// O frontend envia o access_token do usuário logado; o servidor valida que
// o e-mail do token é o admin antes de usar a service_role.
const ADMIN_EMAIL = "veigakevin71@gmail.com";

function extrairEmailDoToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    return json.email || null;
  } catch {
    return null;
  }
}

function ehAdmin(authHeader) {
  return extrairEmailDoToken(authHeader) === ADMIN_EMAIL;
}

// Lista todos os clientes (e-mail + id + data de criação) via service_role.
app.get("/api/admin/clientes", async (req, res) => {
  if (!adminSupabase) return res.status(500).json({ erro: "Service role não configurada no servidor." });
  if (!ehAdmin(req.headers.authorization)) return res.status(403).json({ erro: "Acesso negado." });
  try {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return res.status(500).json({ erro: error.message });
    const clientes = (data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email,
      nome: u.user_metadata?.name || u.user_metadata?.full_name || null,
      criado_em: u.created_at,
    }));
    res.json({ clientes });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// Altera a senha de um cliente via service_role (updateUserById).
app.post("/api/admin/alterar-senha", async (req, res) => {
  if (!adminSupabase) return res.status(503).json({ error: "Supabase não configurada no servidor." });
  if (!ehAdmin(req.headers.authorization)) return res.status(403).json({ erro: "Acesso negado." });
  const { user_id, nova_senha } = req.body || {};
  if (!user_id || !nova_senha || nova_senha.length < 6) {
    return res.status(400).json({ erro: "Informe o usuário e uma senha com pelo menos 6 caracteres." });
  }
  try {
    const { data, error } = await adminSupabase.auth.admin.updateUserById(user_id, { password: nova_senha });
    if (error) return res.status(500).json({ erro: error.message });
    res.json({ ok: true, email: data?.user?.email ?? null });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

// ============================================================
// ASSINATURA — ATIVAÇÃO MANUAL VIA WHATSAPP
// ============================================================
// O MovieFlix NÃO usa mais o fluxo automático do Mercado Pago. A ativação é
// feita manualmente pelo admin (e-mail + plano) através da função SQL
// `activate_subscription_by_email` (SECURITY DEFINER) no Supabase. O endpoint
// /assinatura abaixo foi DESATIVADO (early-return) — mantido apenas para não
// quebrar referências antigas; não é chamado pelo fluxo atual.
app.post("/assinatura", async (req, res) => {
  return res.status(410).json({
    erro: "Pagamento automático desativado. A assinatura é ativada manualmente via WhatsApp.",
  });
});


// Diagnóstico de deploy: informa qual commit/bundle está realmente publicado.
app.get("/api/version", (req, res) => {
  let bundle = null;
  try {
    const html = fs.readFileSync(path.join(__dirname, "..", "dist", "index.html"), "utf-8");
    const m = html.match(/assets\/(index-[^"']+\.js)/);
    bundle = m ? m[1] : null;
  } catch { /* dist ainda não construído */ }
  res.json({
    commit: process.env.RENDER_GIT_COMMIT || null,
    branch: process.env.RENDER_GIT_BRANCH || null,
    bundle,
    startedAt: STARTED_AT,
  });
});

// Serve o build estático do frontend (SPA) na mesma porta do backend.
const DIST_DIR = path.join(__dirname, "..", "dist");
app.use(express.static(DIST_DIR));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

app.listen(PORT,()=>{
 console.log("Backend MovieFlix rodando na porta " + PORT);
});