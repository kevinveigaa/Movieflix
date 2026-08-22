import dotenv from "dotenv";
dotenv.config({ path: ".env.importador" });

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const tmdbToken = process.env.TMDB_TOKEN?.trim(); console.log("TMDB NO SCRIPT:", tmdbToken?.substring(0,40));

async function buscarTMDB(titulo) {
  try {

    const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(titulo)}&language=pt-BR`;

    const res = await fetch(url,{
      headers:{
        Authorization:`Bearer ${tmdbToken}`,
        accept:"application/json"
      }
    });

    const data = await res.json();

    if(data.status_code){
      console.log("TMDB ERRO:", data.status_message);
      return null;
    }

    return data.results?.[0] || null;

  } catch(e){
    console.log("TMDB FALHOU:", e.message);
    return null;
  }
}
);

    const data = await res.json(); console.log("RESPOSTA TMDB:", JSON.stringify(data).substring(0,300));

    return data.results?.[0] || null;

  } catch {
    return null;
  }
}


async function importar(){

const linhas = fs.readFileSync("videos.json","utf8").replace(/^\uFEFF/, "")
.trim()
.split("\n");


console.log("Vídeos encontrados:", linhas.length);


for(const linha of linhas){

const video = JSON.parse(linha);

const titulo = video.title.replace(/\|.*$/,"").replace(/Full Movie/gi,"").replace(/Filme Completo/gi,"").replace(/Em Português/gi,"").replace(/Português/gi,"").replace(/Dublado/gi,"").trim();
const id = video.id;


console.log("Analisando:",titulo);


const tmdb = await buscarTMDB(titulo);


const filme={

title:titulo,

description:
tmdb?.overview || "Filme disponível no MovieFlix",

poster_url:
tmdb?.poster_path
?
`https://image.tmdb.org/t/p/w500${tmdb.poster_path}`
:
video.thumbnails?.[0]?.url,


backdrop_url:
tmdb?.backdrop_path
?
`https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
:
null,


video_url:
`https://www.youtube.com/watch?v=${id}`,


language:"Dublado (pt-BR)",

quality:"1080p",

type:"movie",

required_plan:"premium",

tmdb_id:tmdb?.id || null

};


const {error}=await supabase
.from("movies")
.insert(filme);


if(error)

console.log("Erro:",error.message);

else

console.log("Salvo:",titulo);


}

}


importar();







