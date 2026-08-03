require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const TMDB_TOKEN = process.env.VITE_TMDB_TOKEN;

function limparNome(nome) {
  return nome
    .replace(/[🔥❌]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function buscarTMDB(nome) {

  const tentativas = [
    nome,
    limparNome(nome)
  ];

  for (const busca of tentativas) {

    const url =
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(busca)}&language=pt-BR`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TMDB_TOKEN}`
      }
    });

    const data = await res.json();

    if (data.results && data.results.length > 0) {
      return data.results[0];
    }

  }

  return null;
}


async function iniciar() {

  const { data: filmes, error } = await supabase
    .from("movies")
    .select("*")
    .is("tmdb_id", null);


  if(error){
    console.log(error);
    return;
  }


  console.log("Sem TMDB:", filmes.length);


  for(const filme of filmes){

    console.log("\nProcurando:", filme.title);


    const tmdb = await buscarTMDB(filme.title);


    if(!tmdb){

      console.log("NÃO ACHOU:", filme.title);
      continue;

    }


    const atualizar = {

      tmdb_id: tmdb.id,

      poster_url:
      tmdb.poster_path
      ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
      : filme.poster_url,


      backdrop_url:
      tmdb.backdrop_path
      ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
      : filme.backdrop_url,


      description:
      tmdb.overview || filme.description

    };


    await supabase
    .from("movies")
    .update(atualizar)
    .eq("id", filme.id);


    console.log(
      "CORRIGIDO:",
      filme.title,
      "TMDB:",
      tmdb.id
    );


    await new Promise(r=>setTimeout(r,400));

  }


}


iniciar();
