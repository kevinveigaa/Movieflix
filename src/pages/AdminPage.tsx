import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { tmdb, img } from "@/lib/tmdb";
import { Pencil, Trash2, Plus, Search, X, Save, RefreshCw, Layers, ListFilter } from "lucide-react";
import { CATEGORIAS, categoriasDoFilme, normalizar } from "@/lib/categorias";
import { useQueryClient } from "@tanstack/react-query";

const ADMIN_EMAIL = "veigakevin71@gmail.com";


type Form = {
  title: string;
  description: string;
  poster_url: string;
  backdrop_url: string;
  video_url: string;
  language: string;
  quality: string;
  type: string;
  required_plan: string;
  category: string;
};

const FORM_VAZIO: Form = {
  title: "",
  description: "",
  poster_url: "",
  backdrop_url: "",
  video_url: "",
  language: "Dublado",
  quality: "HD",
  type: "movie",
  required_plan: "premium",
  category: "",
};

export function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [aba, setAba] = useState<"lista" | "form">("lista");
  const [filtroLista, setFiltroLista] = useState<"todos" | "filmes" | "series">("todos");
  const [filmes, setFilmes] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [tmdbSearch, setTmdbSearch] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const ehAdmin = user?.email === ADMIN_EMAIL;

  async function carregarFilmes() {
    setCarregando(true);
    const { data, error } = await supabase
      .from("movies")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) setMsg({ tipo: "erro", texto: error.message });
    else setFilmes(data ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    if (ehAdmin) carregarFilmes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehAdmin]);

  const filtrados = useMemo(() => {
    let resultado = filmes;

    // Filtro por aba: Filmes vs Séries
    if (filtroLista === "filmes") {
      resultado = resultado.filter((f) => 
        f.type === "movie" || (f.type === "anime" && f.video_url)
      );
    } else if (filtroLista === "series") {
      resultado = resultado.filter((f) => 
        f.type === "series" || f.type === "tv" || (f.type === "anime" && !f.video_url)
      );
    }

    const termo = busca.trim().toLowerCase();
    if (!termo) return resultado;
    return resultado.filter(
      (f) =>
        String(f.title ?? "").toLowerCase().includes(termo) ||
        String(f.category ?? "").toLowerCase().includes(termo)
    );
  }, [filmes, busca, filtroLista]);

  if (!ehAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <h1 className="text-3xl font-bold">Acesso negado</h1>
      </div>
    );
  }

  function novo() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setTmdbSearch("");
    setAba("form");
  }

  function editar(filme: any) {
    setEditandoId(filme.id);
    setForm({
      title: filme.title ?? "",
      description: filme.description ?? "",
      poster_url: filme.poster_url ?? "",
      backdrop_url: filme.backdrop_url ?? "",
      video_url: filme.video_url ?? "",
      language: filme.language ?? "Dublado",
      quality: filme.quality ?? "HD",
      type: filme.type ?? "movie",
      required_plan: filme.required_plan ?? "premium",
      category: filme.category ?? "",
    });
    setTmdbSearch("");
    setAba("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function excluir(filme: any) {
    if (!window.confirm(`Excluir "${filme.title}"? Essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("movies").delete().eq("id", filme.id);
    if (error) setMsg({ tipo: "erro", texto: error.message });
    else {
      setMsg({ tipo: "ok", texto: "Título excluído." });
      setFilmes((atual) => atual.filter((f) => f.id !== filme.id));
    }
  }

  async function buscarTMDB() {
    if (!tmdbSearch.trim()) return;
    try {
      // Determina se busca filme ou série baseado no tipo selecionado
      const mediaType = form.type === "series" || form.type === "tv" ? "tv" : "movie";
      const resultado: any = await tmdb.search(tmdbSearch);
      const obra = resultado.results?.find((item: any) => item.media_type === mediaType);
      if (!obra) {
        setMsg({ tipo: "erro", texto: `Nenhum${mediaType === "tv" ? "a série" : " filme"} encontrado no TMDB.` });
        return;
      }
      const detalhes: any = await tmdb.details(mediaType, obra.id);
      setForm((f) => ({
        ...f,
        title: (detalhes.title ?? detalhes.name) ?? f.title,
        description: detalhes.overview ?? f.description,
        poster_url: img(detalhes.poster_path, "w500") ?? f.poster_url,
        backdrop_url: img(detalhes.backdrop_path, "w1280") ?? f.backdrop_url,
        category: detalhes.genres?.map((g: any) => g.name).join(", ") ?? f.category,
        type: mediaType,
      }));
      setMsg({ tipo: "ok", texto: `Dados carregados do TMDB (${mediaType === "tv" ? "Série" : "Filme"}).` });
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e?.message ?? "Erro ao consultar o TMDB." });
    }
  }

  async function salvar() {
    if (!form.title.trim()) {
      setMsg({ tipo: "erro", texto: "Informe o título." });
      return;
    }
    setSalvando(true);

    // Normaliza as categorias escolhidas: sem espaços sobrando, sem repetidas.
    const categorias = categoriasDoFilme({ category: form.category })
      .filter((c) => c !== "Outros")
      .join(", ");
    const payload = { ...form, category: categorias };

    if (editandoId) {
      const { data, error } = await supabase
        .from("movies")
        .update(payload)
        .eq("id", editandoId)
        .select("id, category");

      if (error) {
        setMsg({ tipo: "erro", texto: error.message });
      } else if (!data || data.length === 0) {
        // UPDATE aceito porém sem linhas alteradas = falta a policy de update no banco.
        setMsg({
          tipo: "erro",
          texto:
            "Nada foi salvo: o banco bloqueou a atualização. Rode a migration \"liberar update movies\" no Supabase e tente de novo.",
        });
      } else {
        setMsg({ tipo: "ok", texto: "Título atualizado com sucesso!" });
        await queryClient.invalidateQueries({ queryKey: ["movies"] });
        await carregarFilmes();
        setAba("lista");
        setEditandoId(null);
        setForm(FORM_VAZIO);
      }
    } else {
      const { data, error } = await supabase.from("movies").insert(payload).select("id");
      if (error) {
        setMsg({ tipo: "erro", texto: error.message });
      } else if (!data || data.length === 0) {
        setMsg({ tipo: "erro", texto: "Nada foi salvo: o banco bloqueou o cadastro." });
      } else {
        setMsg({ tipo: "ok", texto: "Filme cadastrado com sucesso!" });
        await queryClient.invalidateQueries({ queryKey: ["movies"] });
        await carregarFilmes();
        setAba("lista");
        setForm(FORM_VAZIO);
      }
    }

    setSalvando(false);
  }

  function campo(name: keyof Form, placeholder: string) {
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-400">{placeholder}</span>
        <input
          className="input"
          placeholder={placeholder}
          value={form[name]}
          onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        />
      </label>
    );
  }

  return (
    <div className="container-app min-h-screen py-10 text-white">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Painel Admin MovieFlix</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAba("lista")}
            className={aba === "lista" ? "btn-primary" : "btn-outline"}
          >
            Catálogo ({filmes.length})
          </button>
          <button onClick={novo} className={aba === "form" ? "btn-primary" : "btn-outline"}>
            <Plus className="h-4 w-4" />
            {editandoId ? "Editando" : "Adicionar"}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`mb-6 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            msg.tipo === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/30 bg-red-500/10 text-red-200"
          }`}
        >
          <span>{msg.texto}</span>
          <button onClick={() => setMsg(null)} aria-label="Fechar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {aba === "lista" && (
        <div className="space-y-4">
          {/* Filtros Filmes / Séries */}
          <div className="flex flex-wrap items-center gap-2">
            <ListFilter className="h-4 w-4 text-gray-400" />
            <button
              onClick={() => setFiltroLista("todos")}
              className={`rounded-full px-3 py-1 text-xs transition ${filtroLista === "todos" ? "bg-brand-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}
            >
              Todos
            </button>
            <button
              onClick={() => setFiltroLista("filmes")}
              className={`rounded-full px-3 py-1 text-xs transition ${filtroLista === "filmes" ? "bg-brand-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}
            >
              Filmes
            </button>
            <button
              onClick={() => setFiltroLista("series")}
              className={`rounded-full px-3 py-1 text-xs transition ${filtroLista === "series" ? "bg-brand-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}
            >
              Séries
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                className="input pl-10"
                placeholder="Buscar por título ou categoria"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <button onClick={carregarFilmes} className="btn-outline">
              <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>

          {carregando && <p className="text-gray-400">Carregando títulos…</p>}
          {!carregando && filtrados.length === 0 && (
            <p className="text-gray-400">Nenhum título encontrado.</p>
          )}

          <div className="grid gap-3">
            {filtrados.map((filme) => (
              <div
                key={filme.id}
                className="card-surface flex items-center gap-4 p-3"
              >
                <img
                  src={filme.poster_url}
                  alt={filme.title}
                  className="h-24 w-16 shrink-0 rounded-lg bg-ink-800 object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{filme.title}</h3>
                  <p className="truncate text-xs text-gray-400">{filme.category || "Sem categoria"}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="chip">{filme.type === "series" || filme.type === "tv" ? "📺 Série" : filme.type === "anime" ? "🍥 Anime" : "🎬 Filme"}</span>
                    <span className="chip">{filme.quality ?? "HD"}</span>
                    <span className="chip">{filme.language ?? "—"}</span>
                    <span className="chip">{filme.required_plan ?? "—"}</span>
                    {!filme.video_url && (
                      <span className="chip border-amber-500/40 text-amber-300">sem link</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {(filme.type === "series" || filme.type === "tv" || (filme.type === "anime" && !filme.video_url)) && (
                    <button
                      onClick={() => navigate(`/admin/series/${filme.id}`)}
                      className="btn-outline px-3 py-2 text-brand-300 border-brand-500/30 hover:bg-brand-500/10"
                      aria-label={`Gerenciar temporadas ${filme.title}`}
                      title="Gerenciar temporadas e episódios"
                    >
                      <Layers className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => editar(filme)}
                    className="btn-outline px-3 py-2"
                    aria-label={`Editar ${filme.title}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => excluir(filme)}
                    className="btn px-3 py-2 bg-red-600/80 text-white hover:bg-red-600"
                    aria-label={`Excluir ${filme.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aba === "form" && (
        <div className="max-w-3xl space-y-4">
          <h2 className="text-xl font-bold">
            {editandoId ? (form.type === "series" ? "Editar série" : form.type === "anime" ? "Editar anime" : "Editar título") : (form.type === "series" ? "Adicionar série" : form.type === "anime" ? "Adicionar anime" : "Adicionar título")}
          </h2>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block flex-1 min-w-[220px]">
              <span className="mb-1 block text-xs font-medium text-gray-400">
                Preencher automaticamente pelo TMDB (busca filme ou série conforme o Tipo selecionado)
              </span>
              <input
                className="input"
                placeholder="Buscar título no TMDB"
                value={tmdbSearch}
                onChange={(e) => setTmdbSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscarTMDB()}
              />
            </label>
            <button onClick={buscarTMDB} className="btn-outline">
              <Search className="h-4 w-4" />
              Buscar
            </button>
          </div>

          {campo("title", "Título")}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-400">Descrição</span>
            <textarea
              className="input min-h-[110px]"
              placeholder="Descrição"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            {campo("poster_url", "URL da capa")}
            {campo("backdrop_url", "URL do banner")}
          </div>

          {campo("video_url", "URL do vídeo")}

          <div className="grid gap-4 sm:grid-cols-3">
            {campo("language", "Idioma")}
            {campo("quality", "Qualidade")}
            {campo("required_plan", "Plano necessário")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-400">Tipo</span>
              <select
                className="input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="movie">🎬 Filme</option>
                <option value="series">📺 Série</option>
                <option value="anime">🍥 Anime</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-400">
                Categorias (separe por vírgula)
              </span>
              <input
                className="input"
                placeholder="Ex.: Ação, Aventura"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORIAS.map((c) => {
              const atuais = form.category.split(",").map((x) => x.trim()).filter(Boolean);
              const ativo = atuais.some((x) => normalizar(x) === normalizar(c));
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    const novas = ativo
                      ? atuais.filter((x) => normalizar(x) !== normalizar(c))
                      : [...atuais, c];
                    setForm({ ...form, category: novas.join(", ") });
                  }}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    ativo
                      ? "border-brand-500 bg-brand-600 text-white"
                      : "border-white/15 bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button onClick={salvar} disabled={salvando} className="btn-primary">
              <Save className="h-4 w-4" />
              {salvando ? "Salvando…" : editandoId ? "Salvar alterações" : form.type === "series" ? "Cadastrar série" : form.type === "anime" ? "Cadastrar anime" : "Cadastrar título"}
            </button>
            <button
              onClick={() => {
                setAba("lista");
                setEditandoId(null);
                setForm(FORM_VAZIO);
              }}
              className="btn-outline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
