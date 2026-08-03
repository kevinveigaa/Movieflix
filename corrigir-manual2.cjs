const {createClient}=require("@supabase/supabase-js");

const s=createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const dados={

2328: {tmdb:404058},
2661: {tmdb:330483},
2664: {tmdb:335988},
2706: {tmdb:842675},
2733: {tmdb:399566},
2784: {tmdb:105903},
2934: {tmdb:396371},
2993: {tmdb:27800},
3006: {tmdb:254473},
3040: {tmdb:388090},
3076: {tmdb:426249},
3081: {tmdb:522016},
3286: {tmdb:258489},
3290: {tmdb:258528},
634: {tmdb:15189},
638: {tmdb:14411},
679: {tmdb:14836},
713: {tmdb:10530},
865: {tmdb:13186},
1342: {tmdb:318041}

};

async function run(){

for(const id in dados){

await s.from("movies")
.update({
tmdb_id:dados[id].tmdb
})
.eq("id",id);

console.log("OK",id);

}

console.log("FINALIZADO");

}

run();
