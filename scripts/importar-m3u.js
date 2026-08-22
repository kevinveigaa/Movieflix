import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://mntyanfhxiqspdedmddb.supabase.co",
  "sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const arquivo = "./listas/marvel.m3u";

const conteudo = fs.readFileSync(arquivo, "utf8");

const linhas = conteudo.split("\n");

let filmes = [];

for (let i = 0; i < linhas.length; i++) {

  if (linhas[i].startsWith("#EXTINF")) {

    const title = linhas[i]
      .split(",")
      .pop()
      .trim();

    const video_url = linhas[i + 1]?.trim();

    if (
      video_url &&
      video_url.includes(".mp4") &&
      !title.includes("AVISO") &&
      !title.includes("LISTA") &&
      title.length > 2
    ) {

      filmes.push({
        title,
        video_url,
        language: "Dublado (pt-BR)",
        quality: "1080p",
        type: "movie",
        required_plan: "premium"
      });

    }
  }
}


console.log("Filmes encontrados:", filmes.length);


const tamanhoLote = 100;

for (let i = 0; i < filmes.length; i += tamanhoLote) {

  const lote = filmes.slice(i, i + tamanhoLote);

  const { error } = await supabase
    .from("movies")
    .insert(lote);

  if (error) {
    console.log("Erro no lote:", i);
    console.log(error);
    break;
  }

  console.log(
    `Importados ${Math.min(i + tamanhoLote, filmes.length)} / ${filmes.length}`
  );

}


console.log("Importação finalizada!");
