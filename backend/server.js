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

// ============================================================
// ADMIN — GESTÃO DE ASSINATURA (adicionar/remover dias, trocar plano)
// ============================================================
// Todas as operações usam a service_role e são validadas no backend:
//  - usuário é admin (Bearer token com e-mail do admin);
//  - o cliente existe (auth.users);
//  - o plano existe e tem price_cents válido (para trocar plano);
//  - dias é um inteiro positivo.
// NUNCA duplica assinatura: atualiza a linha ativa mais recente (ou cria se
// não existir, apenas para adicionar dias/ativar). A lógica de datas:
//  - ADICIONAR DIAS: nova_expiração = max(expiração_atual, hoje) + dias
//    (se ativa, soma sobre o vencimento atual; se expirada/inexistente, sobre hoje).
//  - REMOVER DIAS: nova_expiração = max(expiração_atual - dias, hoje);
//    se resultado <= hoje, marca status='cancelled' (inativa/expirada).
//  - TROCAR PLANO: atualiza plan_code/plan_id, MANTÉM a expiração atual.
// ============================================================

/** Busca a assinatura ativa mais recente de um usuário (ou a mais recente). */
async function buscarAssinatura(userId) {
  const { data, error } = await adminSupabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Resolve o plano por código (1/2/3 ou simple/standard/premium) via service_role. */
async function buscarPlano(plano) {
  let codigo = String(plano || "").trim().toLowerCase();
  if (codigo === "1") codigo = "simple";
  else if (codigo === "2") codigo = "standard";
  else if (codigo === "3") codigo = "premium";
  const { data, error } = await adminSupabase
    .from("plans")
    .select("*")
    .eq("code", codigo)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Valida que o chamador é admin e retorna o user_id do cliente (ou erro). */
async function validarCliente(req, res, email) {
  if (!adminSupabase) {
    res.status(503).json({ erro: "Supabase não configurada no servidor." });
    return null;
  }
  if (!ehAdmin(req.headers.authorization)) {
    res.status(403).json({ erro: "Acesso negado." });
    return null;
  }
  const e = String(email || "").trim().toLowerCase();
  if (!e) {
    res.status(400).json({ erro: "Informe o e-mail do cliente." });
    return null;
  }
  const { data: user, error } = await adminSupabase.auth.admin.listUsers();
  if (error) {
    res.status(500).json({ erro: error.message });
    return null;
  }
  const alvo = (user?.users ?? []).find((u) => String(u.email || "").toLowerCase() === e);
  if (!alvo) {
    res.status(404).json({ erro: "Nenhum usuário encontrado com o e-mail informado." });
    return null;
  }
  return alvo;
}

// ADICIONAR DIAS: soma dias ao vencimento (não substitui, não reinicia).
app.post("/api/admin/adicionar-dias", async (req, res) => {
  const { email, dias } = req.body || {};
  const alvo = await validarCliente(req, res, email);
  if (!alvo) return;
  const n = Number(dias);
  if (!Number.isInteger(n) || n <= 0) {
    return res.status(400).json({ erro: "Informe um número de dias válido (inteiro positivo)." });
  }
  try {
    const sub = await buscarAssinatura(alvo.id);
    const agora = new Date();
    // Base: se a assinatura está ativa e ainda não expirou, usa o vencimento atual;
    // senão, usa hoje (não perde dias, não reinicia).
    const base = sub && sub.status === "active" && sub.expires_at && new Date(sub.expires_at).getTime() > agora.getTime()
      ? new Date(sub.expires_at)
      : agora;
    const novaExp = new Date(base.getTime());
    novaExp.setDate(novaExp.getDate() + n);
    const payload = {
      status: "active",
      expires_at: novaExp.toISOString(),
      starts_at: sub?.starts_at || agora.toISOString(),
      updated_at: agora.toISOString(),
    };
    if (sub) {
      const { error } = await adminSupabase.from("subscriptions").update(payload).eq("id", sub.id);
      if (error) return res.status(500).json({ erro: error.message });
    } else {
      const { error } = await adminSupabase.from("subscriptions").insert({
        user_id: alvo.id,
        plan_code: "simple",
        status: "active",
        starts_at: agora.toISOString(),
        expires_at: novaExp.toISOString(),
        created_at: agora.toISOString(),
        updated_at: agora.toISOString(),
      });
      if (error) return res.status(500).json({ erro: error.message });
    }
    res.json({ ok: true, mensagem: `${n} dia(s) adicionado(s).`, expiracao: novaExp.toISOString() });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// REMOVER DIAS: subtrai; nunca negativo; se chegar a zero, inativa.
app.post("/api/admin/remover-dias", async (req, res) => {
  const { email, dias } = req.body || {};
  const alvo = await validarCliente(req, res, email);
  if (!alvo) return;
  const n = Number(dias);
  if (!Number.isInteger(n) || n <= 0) {
    return res.status(400).json({ erro: "Informe um número de dias válido (inteiro positivo)." });
  }
  try {
    const sub = await buscarAssinatura(alvo.id);
    if (!sub || !sub.expires_at) {
      return res.status(404).json({ erro: "Este usuário não possui assinatura ativa." });
    }
    const agora = new Date();
    const atual = new Date(sub.expires_at);
    const novaExp = new Date(atual.getTime());
    novaExp.setDate(novaExp.getDate() - n);
    // Nunca negativo: se a nova expiração <= hoje, inativa (status cancelled).
    if (novaExp.getTime() <= agora.getTime()) {
      const { error } = await adminSupabase.from("subscriptions").update({
        status: "cancelled",
        cancelled_at: agora.toISOString(),
        updated_at: agora.toISOString(),
      }).eq("id", sub.id);
      if (error) return res.status(500).json({ erro: error.message });
      return res.json({ ok: true, mensagem: "Dias removidos. A assinatura foi inativada (saldo zerado).", expiracao: null });
    }
    const { error } = await adminSupabase.from("subscriptions").update({
      expires_at: novaExp.toISOString(),
      updated_at: agora.toISOString(),
    }).eq("id", sub.id);
    if (error) return res.status(500).json({ erro: error.message });
    res.json({ ok: true, mensagem: `${n} dia(s) removido(s).`, expiracao: novaExp.toISOString() });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// TROCAR PLANO: atualiza plan_code/plan_id, mantém a expiração (não duplica).
app.post("/api/admin/trocar-plano", async (req, res) => {
  const { email, plano } = req.body || {};
  const alvo = await validarCliente(req, res, email);
  if (!alvo) return;
  try {
    const planoResolvido = await buscarPlano(plano);
    if (!planoResolvido) {
      return res.status(400).json({ erro: "Plano inválido. Use 1, 2, 3 ou simple/standard/premium." });
    }
    const sub = await buscarAssinatura(alvo.id);
    const agora = new Date();
    if (sub) {
      const { error } = await adminSupabase.from("subscriptions").update({
        plan_code: planoResolvido.code,
        plan_id: planoResolvido.id,
        status: "active",
        updated_at: agora.toISOString(),
      }).eq("id", sub.id);
      if (error) return res.status(500).json({ erro: error.message });
      return res.json({ ok: true, mensagem: `Plano trocado para ${planoResolvido.name}.`, plano: planoResolvido.code });
    }
    // Sem assinatura: cria uma nova com o plano e 30 dias (padrão).
    const novaExp = new Date(agora.getTime());
    novaExp.setDate(novaExp.getDate() + (planoResolvido.duration_days || 30));
    const { error } = await adminSupabase.from("subscriptions").insert({
      user_id: alvo.id,
      plan_code: planoResolvido.code,
      plan_id: planoResolvido.id,
      status: "active",
      starts_at: agora.toISOString(),
      expires_at: novaExp.toISOString(),
      created_at: agora.toISOString(),
      updated_at: agora.toISOString(),
    });
    if (error) return res.status(500).json({ erro: error.message });
    res.json({ ok: true, mensagem: `Plano ${planoResolvido.name} ativado.`, plano: planoResolvido.code, expiracao: novaExp.toISOString() });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// DESATIVAR: realmente desativa no banco (status != active corta o acesso).
app.post("/api/admin/desativar", async (req, res) => {
  const { email } = req.body || {};
  const alvo = await validarCliente(req, res, email);
  if (!alvo) return;
  try {
    const sub = await buscarAssinatura(alvo.id);
    if (!sub || sub.status !== "active") {
      return res.status(404).json({ erro: "Este usuário não possui assinatura ativa." });
    }
    const { error } = await adminSupabase.from("subscriptions").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", sub.id);
    if (error) return res.status(500).json({ erro: error.message });
    res.json({ ok: true, mensagem: "Assinatura desativada com sucesso." });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

// CONSULTAR assinatura de um cliente (para o painel mostrar status/datas).
app.get("/api/admin/assinatura", async (req, res) => {
  const email = req.query.email;
  const alvo = await validarCliente(req, res, email);
  if (!alvo) return;
  try {
    const sub = await buscarAssinatura(alvo.id);
    if (!sub) return res.json({ ok: true, assinatura: null });
    const plano = sub.plan_id
      ? (await adminSupabase.from("plans").select("*").eq("id", sub.plan_id).maybeSingle()).data
      : null;
    const agora = new Date();
    const ativa = sub.status === "active" && sub.expires_at && new Date(sub.expires_at).getTime() > agora.getTime();
    const diasRestantes = ativa ? Math.ceil((new Date(sub.expires_at).getTime() - agora.getTime()) / 86400000) : 0;
    res.json({
      ok: true,
      assinatura: {
        status: sub.status,
        ativa,
        plano: plano?.name || sub.plan_code,
        plan_code: sub.plan_code,
        inicio: sub.starts_at,
        expiracao: sub.expires_at,
        dias_restantes: diasRestantes,
      },
    });
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