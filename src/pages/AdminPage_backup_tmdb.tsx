import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export function AdminPage(){

const {user}=useAuth();

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
required_plan:"premium"
});


if(user?.email !== ADMIN_EMAIL){
return(
<div className="min-h-screen bg-black text-white flex items-center justify-center">
<h1 className="text-3xl font-bold">
Acesso negado 🔒
</h1>
</div>
)
}


async function save(){

const {error}=await supabase
.from("movies")
.insert(form);


if(error){

alert(error.message);

}else{

alert("Filme cadastrado 🎬");

setForm({
title:"",
description:"",
poster_url:"",
backdrop_url:"",
video_url:"",
language:"Dublado",
quality:"HD",
type:"movie",
required_plan:"premium"
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

<h1 className="text-3xl font-bold mb-8">
Painel Admin MovieFlix 🎬
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


<button
onClick={save}
className="bg-purple-600 px-6 py-3 rounded-lg"
>
Salvar Filme
</button>


</div>

)

}
