import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const ytdlp = "K:\\downlods kewvin\\yt-dlp.exe";

const ffmpeg =
"K:\\downlods kewvin\\ffmpeg-8.1.2-essentials_build\\ffmpeg-8.1.2-essentials_build\\bin";

async function baixar() {

  const { data, error } = await supabase
    .from("movies")
    .select("id,title,video_url")
    .not("video_url", "is", null)
    .limit(1);

  if (error) {
    console.log(error);
    return;
  }

  const filme = data[0];

  console.log("FILME:", filme.title);
  console.log("URL:", filme.video_url);

  const processo = spawn(ytdlp, [
    "-f",
    "bv*+ba/b",
    "--ffmpeg-location",
    ffmpeg,
    "--merge-output-format",
    "mp4",
    "-o",
    `K:\\downlods kewvin\\filmes\\${filme.title}.mp4`,
    filme.video_url
  ]);

  processo.stdout.on("data", texto => {
    console.log(texto.toString());
  });

  processo.stderr.on("data", texto => {
    console.log(texto.toString());
  });

  processo.on("close", codigo => {
    console.log("FINALIZOU:", codigo);
  });

}

baixar();
