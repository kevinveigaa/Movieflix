const { createClient } = require("@supabase/supabase-js");

const s = createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const filmes = {
3315: null,
3366: null,
3367: null,
3368: null,
3379: null,
3415: null,

238: "70785",
240: "438396",
247: "500840",
249: "522783",
264: "397243",
665: "14057",
709: null,
712: null,
1077: null,
1108: null,

1292: null,
1364: "22820",
1379: null,
1381: "181886",
1389: "187017",
1395: "313369",
1398: "395446",
1432: "396535",
1449: "458423",
1466: null,
1520: "491418",
1523: "460555",
1525: null,

1687: "15370",
1697: null,
1707: null,
1716: null,
1759: "460458",
1825: "307081",
1848: "13673",
1915: null,
1942: "353070",
1952: null,
1954: null,
1968: null,
1971: null,
1979: null,
1983: null,

2030: null,
2031: null,
2056: "257692",
2067: null,
2142: "340611",
2143: "68726",
2146: "369300",
2285: "32275",
2299: "361459",
2416: "466282",
2467: "489925",
2500: "320288",
2505: "292523",
2530: "530385",
2606: "32274",
2630: "259316",
2632: "324668",
2668: "238615",
2866: null,
2976: "371265",
3482: null
};

async function start(){
 for(const id in filmes){
   if(filmes[id]){
    await s.from("movies")
    .update({tmdb_id:Number(filmes[id])})
    .eq("id",id);

    console.log("OK",id);
   }
 }

 console.log("FINALIZADO");
}

start();
