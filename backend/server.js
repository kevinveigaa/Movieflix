require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const { MercadoPagoConfig, Preference } = require("mercadopago");
const { registrarPlayerProxy } = require("./player-proxy");

const app = express();

app.use(cors());
app.use(compression());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// Chave da TMDb fica no servidor (nunca no bundle do frontend).
// Defina TMDB_API_KEY (ou VITE_TMDB_TOKEN) no ambiente do backend.
const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_TOKEN;
const TMDB_API_BASE = "https://api.themoviedb.org/3";

// Reprodução sempre dentro do site (remove bloqueios de exibição em iframe).
registrarPlayerProxy(app);

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

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const preference = new Preference(client);

app.get("/", (req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

app.post("/assinatura", async (req,res)=>{

  try {

    const { plano } = req.body;

    let valor = 19.90;

    if(plano === "standard") valor = 29.90;
    if(plano === "premium") valor = 39.90;

    const pagamento = await preference.create({
      body:{
        items:[
          {
            title:"MovieFlix Plano " + plano,
            quantity:1,
            currency_id:"BRL",
            unit_price:valor
          }
        ],
        back_urls:{
          success:"https://www.google.com",
          failure:"https://www.google.com",
          pending:"https://www.google.com"
        },
        auto_return:"approved"
      }
    });

    res.json({
      link: pagamento.init_point
    });

  } catch(error){

    console.log("ERRO MP:", error);
    console.log(error);

    res.status(500).json({
      erro:error.message,
      detalhe:error.cause || error
    });

  }

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
