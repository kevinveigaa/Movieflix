const { createClient } = require("@supabase/supabase-js");

const s = createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const filmes = {
3450: 44982,   // Um Tradutor
3457: 11527,   // Um Reporter em Apuros
709: 8439,     // Tudo que voce precisa saber sobre Sexo
712: 10555,    // Uma Beleza de Salao
1108: 11170,   // Casa das Trevas 2
1258: 353081,  // Inimigo Desconhecido
1292: 6434,    // Marvel Vs Capcom
1379: 13684,   // O Cla das Adagas
1525: 43074,   // Servico Secreto Americano
1707: 12120,   // Assassins Creed
1716: 39957,   // A dama de cinza
1915: 347375,  // Lembrancas do colegial
1954: 303857,  // No ritmo da paixao
1968: 14115,   // O Guardiao invisivel
1979: 295693,  // O Mestre das Mentiras
1983: 299564,  // O Garoto Submarino
2067: 325385,  // Sob custodia
2866: 251979   // Fantasmas a Solta
};

async function run(){

for(const id in filmes){

 await s
 .from("movies")
 .update({
   tmdb_id: filmes[id]
 })
 .eq("id", id);

 console.log("OK",id);
}

console.log("FINALIZADO");

}

run();
