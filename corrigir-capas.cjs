require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const TMDB_TOKEN = process.env.VITE_TMDB_TOKEN;

async function corrigirCapas() {

  const ids = [
    3560,
    3651,
    3518,
    3628
  ];

  for (const id of ids) {

    const { data: filme } = await supabase
      .from("movies")
      .select("*")
      .eq("id", id)
      .single();

    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${filme.tmdb_id}?language=pt-BR`,
      {
        headers: {
          Authorization: `Bearer ${TMDB_TOKEN}`
        }
      }
    );

    const tmdb = await res.json();

    if (!tmdb.poster_path) {
      console.log("Sem capa:", filme.title);
      continue;
    }

    const poster =
      `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`;

    await supabase
      .from("movies")
      .update({
        poster_url: poster
      })
      .eq("id", id);

    console.log("OK:", filme.title);
  }
}

corrigirCapas();
