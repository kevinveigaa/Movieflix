const {createClient}=require("@supabase/supabase-js");

const s=createClient(
"https://mntyanfhxiqspdedmddb.supabase.co",
"sb_publishable_ThRVBb6BsxMN6YaJf7ui1g_VIoa02Sn"
);

async function run(){

const {data,error}=await s
.from("movies")
.select("id,title")
.is("poster_url",null);

if(error){
console.log(error);
return;
}

console.log("Removendo:",data.length);

for(const m of data){

await s
.from("movies")
.delete()
.eq("id",m.id);

console.log("Removido:",m.title);

}

console.log("LIMPEZA FINALIZADA");

}

run();
