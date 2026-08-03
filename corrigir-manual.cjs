const {createClient}=require("@supabase/supabase-js");

const s=createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

const dados={

288:{tmdb:48318},
603:{tmdb:267192},
983:{tmdb:323939},
2349:{tmdb:318041},
3111:{tmdb:452001},
3403:{tmdb:38234},
612:{tmdb:13532},
717:{tmdb:10428},
754:{tmdb:602},
859:{tmdb:935},
1060:{tmdb:297222},
1061:{tmdb:362765}

};


async function run(){

for(const id in dados){

const tmdb=dados[id].tmdb;

await s.from("movies")
.update({
tmdb_id:tmdb
})
.eq("id",id);

console.log("OK id:",id,"TMDB:",tmdb);

}

console.log("FINALIZADO");

}

run();
