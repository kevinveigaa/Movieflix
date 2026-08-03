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

async function atualizar(filme) {

  const nome = filme.title
    .replace(/HD|LEG|4K|3D|OP\d+|SRV\d+/gi, "")
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
      return;
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

    console.log("OK:", filme.title);

  } catch(e) {
    console.log("Erro:", filme.title);
  }
}


const { data: filmes } = await supabase
  .from("movies")
  .select("*")
  .is("tmdb_id", null)
  .limit(500);

console.log("Lote:", filmes.length);


const tamanho = 10;

for(let i = 0; i < filmes.length; i += tamanho){

  const lote = filmes.slice(i, i+tamanho);

  await Promise.all(
    lote.map(atualizar)
  );

}


console.log("Lote terminado!");
