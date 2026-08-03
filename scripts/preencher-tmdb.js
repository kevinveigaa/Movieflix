import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://mntyanfhxiqspdedmddb.supabase.co",
  "sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const TMDB_TOKEN = process.env.TMDB_TOKEN;

const headers = {
  Authorization: `Bearer ${TMDB_TOKEN}`,
  accept: "application/json"
};

let total = 0;

while (true) {

  const { data: filmes, error } = await supabase
    .from("movies")
    .select("*")
    .is("tmdb_id", null)
    .limit(100);

  if (error) {
    console.log(error);
    break;
  }

  if (!filmes.length) {
    console.log("Todos os filmes foram preenchidos!");
    break;
  }

  console.log("Lote:", filmes.length);

  for (const filme of filmes) {

    const nome = filme.title
      .replace(" HD", "")
      .replace(" LEG", "")
      .trim();

    try {

      const resposta = await fetch(
        `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(nome)}&language=pt-BR`,
        { headers }
      );

      const dados = await resposta.json();
      const encontrado = dados.results?.[0];

      if (!encontrado) {
        console.log("Não achou:", filme.title);
        continue;
      }

      await supabase
        .from("movies")
        .update({
          tmdb_id: encontrado.id,
          description: encontrado.overview,
          poster_url: encontrado.poster_path
            ? `https://image.tmdb.org/t/p/w500${encontrado.poster_path}`
            : null,
          backdrop_url: encontrado.backdrop_path
            ? `https://image.tmdb.org/t/p/original${encontrado.backdrop_path}`
            : null
        })
        .eq("id", filme.id);

      total++;

      console.log("Atualizado:", total, filme.title);

    } catch (err) {
      console.log("Erro:", filme.title);
    }

    await new Promise(r => setTimeout(r, 250));
  }
}

console.log("Finalizado:", total);
