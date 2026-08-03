import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "SUA_URL_SUPABASE",
  "SUA_CHAVE_ANON"
);

const { error } = await supabase
  .from("movies")
  .update({ video_url: null })
  .not("id", "is", null);

if (error) {
  console.log(error);
} else {
  console.log("Videos limpos");
}
