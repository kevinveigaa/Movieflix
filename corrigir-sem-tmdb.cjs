require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const TMDB_TOKEN = process.env.VITE_TMDB_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function buscarTMDB(nome) {
  const clean = nome.replace(/[❌🔥]/g, "").trim();

  const res = await fetch(
    `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(clean)}&language=pt-BR`,
    {
      headers: {
        Authorization: `Bearer ${TMDB_TOKEN}`,
        accept: "application/json"
      }
    }
  );

  const data = await res.json();

  return data.results?.[0] || null;
}

async function corrigir() {

  const { data: filmes, error } = await supabase
    .from("movies")
    .select("*")
    .is("tmdb_id", null);

  if (error) {
    console.log(error);
    return;
  }

  console.log("Encontrados:", filmes.length);

  for (const filme of filmes) {

    const tmdb = await buscarTMDB(filme.title);

    if (!tmdb) {
      console.log("NÃO ENCONTRADO:", filme.title);
      continue;
    }

    await supabase
      .from("movies")
      .update({
        tmdb_id: tmdb.id,
        poster_url: tmdb.poster_path
          ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
          : filme.poster_url,
        backdrop_url: tmdb.backdrop_path
          ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
          : filme.backdrop_url,
        description: tmdb.overview || filme.description
      })
      .eq("id", filme.id);

    console.log("OK:", filme.title, "->", tmdb.id);

    await new Promise(r => setTimeout(r, 300));
  }
}

corrigir();
