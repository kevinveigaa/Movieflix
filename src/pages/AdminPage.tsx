import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { tmdb, img } from "@/lib/tmdb";

export function AdminPage(){

const {user}=useAuth();
const [tmdbSearch,setTmdbSearch]=useState("");

const ADMIN_EMAIL="veigakevin71@gmail.com";

const [form,setForm]=useState({
title:"",
description:"",
poster_url:"",
backdrop_url:"",
video_url:"",
language:"Dublado",
quality:"HD",
type:"movie",
required_plan:"premium",
  category:""
});


if(user?.email !== ADMIN_EMAIL){
return(
<div className="min-h-screen bg-black text-white flex items-center justify-center">
<h1 className="text-3xl font-bold">
Acesso negado ??
</h1>
</div>
)
}



async function buscarTMDB(){

const resultado = await tmdb.search(tmdbSearch);

const filme = resultado.results?.find(
(item:any)=>item.media_type==="movie"
);

if(!filme){
alert("Filme não encontrado");
return;
}

const detalhes:any = await tmdb.details(
"movie",
filme.id
);

setForm({
...form,
title: detalhes.title,
description: detalhes.overview,
poster_url: img(detalhes.poster_path,"w500"),
backdrop_url: img(detalhes.backdrop_path,"w1280"),
category: detalhes.genres?.map((g:any)=>g.name).join(","),
quality:"HD",
type:"movie"
});

}
async function save(){

const {error}=await supabase
.from("movies")
.insert(form);


if(error){

alert(error.message);

}else{

alert("Filme cadastrado ??");

setForm({
title:"",
description:"",
poster_url:"",
backdrop_url:"",
video_url:"",
language:"Dublado",
quality:"HD",
type:"movie",
required_plan:"premium",
  category:""
});

}

}


function input(name:keyof typeof form, placeholder:string){

return(
<input
className="input mb-3 w-full"
placeholder={placeholder}
value={form[name]}
onChange={e=>setForm({...form,[name]:e.target.value})}
/>
)

}


return(

<div className="min-h-screen bg-black text-white p-10">


<input
className="input mb-3"
placeholder="Buscar filme no TMDB"
value={tmdbSearch}
onChange={e=>setTmdbSearch(e.target.value)}
/>

<button
onClick={buscarTMDB}
className="bg-purple-600 px-6 py-3 rounded-lg mb-5"
>
Buscar no TMDB ??
</button>
<h1 className="text-3xl font-bold mb-8">
Painel Admin MovieFlix ??
</h1>


{input("title","Título")}

<textarea
className="input mb-3 w-full"
placeholder="Descrição"
value={form.description}
onChange={e=>setForm({...form,description:e.target.value})}
/>


{input("poster_url","URL da capa")}

{input("backdrop_url","URL do banner")}

{input("video_url","URL do vídeo")}

{input("language","Idioma")}

{input("quality","Qualidade")}

{input("required_plan","Plano necessário")}


<select
className="input mb-3 w-full"
value={form.type}
onChange={e=>setForm({...form,type:e.target.value})}
>

<option value="movie">
Filme
</option>

<option value="series">
Série
</option>

</select>

<select
className="input mb-3 w-full"
value={form.category}
onChange={e=>setForm({...form,category:e.target.value})}
>
<option value="">Categoria</option>
<option value="Ação">Ação</option>
<option value="Aventura">Aventura</option>
<option value="Comédia">Comédia</option>
<option value="Terror">Terror</option>
<option value="Ficção Científica">Ficção Científica</option>
<option value="Drama">Drama</option>
<option value="Romance">Romance</option>
<option value="Infantil">Infantil</option>
<option value="Documentário">Documentário</option>
<option value="Anime">Anime</option>
</select>

<button
onClick={save}
className="bg-purple-600 px-6 py-3 rounded-lg"
>
Salvar Filme
</button>


</div>

)

}



























