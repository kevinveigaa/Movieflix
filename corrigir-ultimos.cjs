const { createClient } = require("@supabase/supabase-js");

const s = createClient(
  "https://mntyanfhxiqspdedmddb.supabase.co",
  "sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const filmes = {
  1077: 46198,
  1466: 3902,
  1697: 353081,
  1952: 11116,
  1971: 40016,
  2030: 193687,
  2031: 193687
};

async function run(){
  for (const id in filmes){
    await s
      .from("movies")
      .update({
        tmdb_id: filmes[id]
      })
      .eq("id", id);

    console.log("OK", id);
  }

  console.log("FINALIZADO");
}

run();
