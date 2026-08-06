import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const supabase = createClient(
  "https://mntyanfhxiqspdedmddb.supabase.co",
  "sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const filmes = JSON.parse(
  fs.readFileSync("./filmes/filmes.json","utf8")
);

async function importar(){

 const {error} = await supabase
 .from("movies")
 .insert(filmes);

 if(error){
   console.log(error);
 }else{
   console.log("Filmes adicionados!");
 }

}

importar();
