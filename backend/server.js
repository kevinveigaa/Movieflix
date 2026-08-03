require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Preference } = require("mercadopago");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 5000;

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const preference = new Preference(client);

app.get("/", (req,res)=>{
  res.send("MovieFlix Backend funcionando");
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

app.listen(PORT,()=>{
 console.log("Backend MovieFlix rodando na porta " + PORT);
});
