import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const { data, error } = await supabase
  .from("movies")
  .select("title, poster_url, backdrop_url, video_url")
  .order("created_at", { ascending: false });

if (error) {
  console.log("ERRO:", error);
} else {
  console.table(data);
}
