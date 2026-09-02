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

// Reprodução sempre dentro do site (remove bloqueios de exibição em iframe).
// NOTA: o player usa o EMBED OFICIAL do StreamBetter (plano Creator, chave
// pública sb_pk_*), então não há mais proxy de player nem resolver HLS via
// backend. O trial-gate foi removido junto com a arquitetura do plano API.

// Proxy da API TMDb: o frontend chama /api/tmdb/* e o servidor repassa a
// chamada com a chave de acesso, mantendo-a fora do navegador.
app.use("/api/tmdb", async (req, res) => {
  try {
    if (!TMDB_API_KEY) {
      return res.status(500).json({ erro: "Chave da TMDb (TMDB_API_KEY) não configurada no servidor." });
    }

    const path = req.url.replace(/^\/+/, "");
    if (!path) {
      return res.status(400).json({ erro: "Caminho da API TMDb ausente." });
    }

    const url = new URL(`${TMDB_API_BASE}/${path}`);
    if (!req.query.language) url.searchParams.set("language", "pt-BR");
    Object.entries(req.query).forEach(([k, v]) => {
      url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
    });

    const upstream = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${TMDB_API_KEY}`, accept: "application/json" },
    });

    const body = await upstream.text();
    res.status(upstream.status);
    res.set("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(body);
  } catch (error) {
    console.log("ERRO TMDB PROXY:", error);
    res.status(502).json({ erro: "Falha ao consultar a TMDb.", detalhe: error.message });
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
