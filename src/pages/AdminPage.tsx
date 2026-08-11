import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { tmdb, img } from "@/lib/tmdb";
import {
  Pencil, Trash2, Plus, Search, X, Save, RefreshCw, Layers,
  ListFilter, ChevronDown, ChevronUp, Film
} from "lucide-react";
import { CATEGORIAS, categoriasDoFilme, normalizar } from "@/lib/categorias";
import { useQueryClient } from "@tanstack/react-query";

const ADMIN_EMAIL = "veigakevin71@gmail.com";

type Aba = "lista" | "form-filme" | "form-serie";

type Form = {
  title: string;
  description: string;
  poster_url: string;
  backdrop_url: string;
  video_url: string;
  language: string;
  quality: string;
  type: string;
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
  category: "",
};

interface Season {
  id: number;
  series_id: number;
  season_number: number;
  title: string | null;
  poster_url: string | null;
}

interface Episode {
  id: number;
  season_id: number;
  episode_number: number;
  title: string;
  description: string | null;
  video_url: string;
  duration_seconds: number | null;
  thumbnail_url: string | null;
}

export function AdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [aba, setAba] = useState<Aba>("lista");
  const [filtroLista, setFiltroLista] = useState<"todos" | "filmes" | "series">("todos");
  const [filmes, setFilmes] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [tmdbSearch, setTmdbSearch] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // === TEMPORADAS E EPISÓDIOS (inline para séries) ===
  const [seriesData, setSeriesData] = useState<any>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<Record<string, Episode[]>>({});
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);

  // Form para nova temporada
  const [newSeasonNumber, setNewSeasonNumber] = useState(1);
  const [newSeasonTitle, setNewSeasonTitle] = useState("");

  // Form para novo episódio
  const [newEpisode, setNewEpisode] = useState({
    seasonId: 0,
    episodeNumber: 1,
    title: "",
    description: "",
    videoUrl: "",
    durationSeconds: 0,
    thumbnailUrl: "",
  });

  const ehAdmin = user?.email === ADMIN_EMAIL;
  const ehSerie = form.type === "series" || form.type === "tv" || form.type === "anime";
  const mostrarTemporadas = editandoId && ehSerie && !form.video_url;

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

  useEffect(() => {
    if (mostrarTemporadas && editandoId) {
      loadSeasonsAndEpisodes(editandoId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarTemporadas, editandoId]);

  async function loadSeasonsAndEpisodes(seriesId: string) {
    setLoadingSeries(true);
    const { data: sData } = await supabase.from("movies").select("*").eq("id", seriesId).single();
    setSeriesData(sData);
    const { data: seasonsData } = await supabase
      .from("seasons")
      .select("*")
      .eq("series_id", seriesId)
      .order("season_number", { ascending: true });
    const seasonsList = seasonsData ?? [];
    setSeasons(seasonsList);
    const eps: Record<string, Episode[]> = {};
    for (const season of seasonsList) {
      const { data: epData } = await supabase
        .from("episodes")
        .select("*")
        .eq("season_id", season.id)
        .order("episode_number", { ascending: true });
      eps[season.id] = epData ?? [];
    }
    setEpisodes(eps);
    setLoadingSeries(false);
  }

  const filtrados = useMemo(() => {
    let resultado = filmes;
    if (filtroLista === "filmes") {
      resultado = resultado.filter((f) => f.type === "movie" || (f.type === "anime" && f.video_url));
    } else if (filtroLista === "series") {
      resultado = resultado.filter((f) => f.type === "series" || f.type === "tv" || (f.type === "anime" && !f.video_url));
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

  function novoFilme() {
    setEditandoId(null);
    setForm({ ...FORM_VAZIO, type: "movie" });
    setTmdbSearch("");
    setSeasons([]);
    setEpisodes({});
    setExpandedSeason(null);
    setAba("form-filme");
  }

  function novaSerie() {
    setEditandoId(null);
    setForm({ ...FORM_VAZIO, type: "series", video_url: "" });
    setTmdbSearch("");
    setSeasons([]);
    setEpisodes({});
    setExpandedSeason(null);
    setAba("form-serie");
  }

  function editar(filme: any) {
    const isSerie = filme.type === "series" || filme.type === "tv" || (filme.type === "anime" && !filme.video_url);
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
      category: filme.category ?? "",
    });
    setTmdbSearch("");
    setAba(isSerie ? "form-serie" : "form-filme");
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
      const mediaType = ehSerie ? "tv" : "movie";
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
        type: mediaType === "tv" ? (f.type === "anime" ? "anime" : "series") : "movie",
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
    const categorias = categoriasDoFilme({ category: form.category })
      .filter((c) => c !== "Outros")
      .join(", ");
    const payload = { ...form, category: categorias, required_plan: "premium" };

    if (editandoId) {
      const { data, error } = await supabase
        .from("movies")
        .update(payload)
        .eq("id", editandoId)
        .select("id, category");
      if (error) {
        setMsg({ tipo: "erro", texto: error.message });
      } else if (!data || data.length === 0) {
        setMsg({ tipo: "erro", texto: "Nada foi salvo: o banco bloqueou a atualização." });
      } else {
        setMsg({ tipo: "ok", texto: "Título atualizado com sucesso!" });
        await queryClient.invalidateQueries({ queryKey: ["movies"] });
        await carregarFilmes();
        if (!ehSerie) {
          setAba("lista");
          setEditandoId(null);
          setForm(FORM_VAZIO);
        }
      }
    } else {
      const { data, error } = await supabase.from("movies").insert(payload).select("id");
      if (error) {
        setMsg({ tipo: "erro", texto: error.message });
      } else if (!data || data.length === 0) {
        setMsg({ tipo: "erro", texto: "Nada foi salvo: o banco bloqueou o cadastro." });
      } else {
        const novoId = data[0].id;
        setMsg({ tipo: "ok", texto: "Cadastrado! Agora adicione temporadas e episódios." });
        await queryClient.invalidateQueries({ queryKey: ["movies"] });
        await carregarFilmes();
        if (ehSerie) {
          setEditandoId(novoId);
          await loadSeasonsAndEpisodes(novoId);
        } else {
          setAba("lista");
          setForm(FORM_VAZIO);
        }
      }
    }
    setSalvando(false);
  }

  async function addSeason() {
    if (!editandoId) return;
    const { data: newSeason, error } = await supabase.from("seasons").insert({
      series_id: editandoId,
      season_number: newSeasonNumber,
      title: newSeasonTitle || null,
    }).select("id").single();
    if (error) {
      setMsg({ tipo: "erro", texto: error.message });
    } else {
      setMsg({ tipo: "ok", texto: "Temporada adicionada! Agora adicione os episódios." });
      setNewSeasonNumber((prev) => prev + 1);
      setNewSeasonTitle("");
      if (editandoId) {
        await loadSeasonsAndEpisodes(editandoId);
        // Expande a nova temporada automaticamente
        if (newSeason?.id) {
          setExpandedSeason(newSeason.id);
          setNewEpisode((prev) => ({ ...prev, seasonId: newSeason.id, episodeNumber: 1 }));
        }
      }
    }
  }

  async function deleteSeason(seasonId: string) {
    if (!window.confirm("Excluir esta temporada e todos os episódios?")) return;
    await supabase.from("episodes").delete().eq("season_id", seasonId);
    await supabase.from("seasons").delete().eq("id", seasonId);
    setMsg({ tipo: "ok", texto: "Temporada excluída!" });
    if (editandoId) await loadSeasonsAndEpisodes(editandoId);
  }

  async function addEpisode() {
    if (!newEpisode.seasonId || !newEpisode.videoUrl) {
      setMsg({ tipo: "erro", texto: "Informe a URL do vídeo do episódio!" });
      return;
    }
    // Calcula o próximo número de episódio automaticamente
    const seasonEpisodes = episodes[newEpisode.seasonId] ?? [];
    const nextNumber = seasonEpisodes.length > 0 
      ? Math.max(...seasonEpisodes.map(e => e.episode_number)) + 1 
      : 1;
    const { error } = await supabase.from("episodes").insert({
      season_id: newEpisode.seasonId,
      episode_number: nextNumber,
      title: newEpisode.title || `Episódio ${nextNumber}`,
      description: newEpisode.description || null,
      video_url: newEpisode.videoUrl,
      duration_seconds: newEpisode.durationSeconds || null,
      thumbnail_url: newEpisode.thumbnailUrl || gerarThumbnailPadrao(nextNumber),
    });
    if (error) {
      setMsg({ tipo: "erro", texto: error.message });
    } else {
      setMsg({ tipo: "ok", texto: "Episódio adicionado!" });
      setNewEpisode((prev) => ({
        ...prev,
        episodeNumber: (episodes[prev.seasonId]?.length ?? 0) + 2,
        title: "",
        videoUrl: "",
        description: "",
        thumbnailUrl: "",
      }));
      if (editandoId) await loadSeasonsAndEpisodes(editandoId);
    }
  }

  async function deleteEpisode(episodeId: string) {
    if (!window.confirm("Excluir este episódio?")) return;
    await supabase.from("episodes").delete().eq("id", episodeId);
    setMsg({ tipo: "ok", texto: "Episódio excluído!" });
    if (editandoId) await loadSeasonsAndEpisodes(editandoId);
  }

  // Gerar thumbnail padrão com número do episódio
  function gerarThumbnailPadrao(numero: number): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225">
      <rect width="400" height="225" fill="#0a0a0a"/>
      <rect x="20" y="20" width="360" height="185" rx="12" fill="#1a1a1a" stroke="#333" stroke-width="2"/>
      <text x="200" y="100" font-family="Arial, sans-serif" font-size="20" fill="#666" text-anchor="middle">EPISÓDIO</text>
      <text x="200" y="145" font-family="Arial, sans-serif" font-size="56" fill="#e50914" font-weight="bold" text-anchor="middle">${numero}</text>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  }

  async function buscarCapaEpisodioTMDB(seasonNum: number, epNum: number) {
    if (!form.title) {
      setMsg({ tipo: "erro", texto: "Preencha o título da série primeiro!" });
      return;
    }
    try {
      setMsg({ tipo: "ok", texto: "Buscando no TMDb..." });

      // Buscar série pelo nome (usando o proxy do backend)
      const resultado: any = await tmdb.search(form.title);
      const serie = resultado.results?.find((item: any) => item.media_type === "tv");
      if (!serie) {
        setMsg({ tipo: "erro", texto: "Série não encontrada no TMDB. Tente o nome em inglês." });
        return;
      }

      // Buscar detalhes do episódio usando o proxy
      const PUBLIC_API_URL = 'https://movieflix-api-udsv.onrender.com';
      const API_URL = (import.meta.env.VITE_API_URL as string) || PUBLIC_API_URL;

      // Tentativa 1: Buscar episódio em português
      let response = await fetch(
        `${API_URL}/api/tmdb/tv/${serie.id}/season/${seasonNum}/episode/${epNum}?language=pt-BR`
      );

      // Tentativa 2: Se falhou, tentar em inglês
      if (!response.ok) {
        response = await fetch(
          `${API_URL}/api/tmdb/tv/${serie.id}/season/${seasonNum}/episode/${epNum}?language=en-US`
        );
      }

      // Tentativa 3: Buscar temporada inteira e pegar o episódio
      if (!response.ok) {
        const seasonResponse = await fetch(
          `${API_URL}/api/tmdb/tv/${serie.id}/season/${seasonNum}?language=pt-BR`
        );
        if (seasonResponse.ok) {
          const seasonData = await seasonResponse.json();
          const ep = seasonData.episodes?.find((e: any) => e.episode_number === epNum);
          if (ep?.still_path) {
            const url = img(ep.still_path, "w400");
            setNewEpisode((prev) => ({ ...prev, thumbnailUrl: url || "" }));
            setMsg({ tipo: "ok", texto: "Capa do episódio encontrada!" });
            return;
          }
        }
        throw new Error("Episódio não encontrado no TMDb.");
      }

      const epData = await response.json();
      if (epData.still_path) {
        const url = img(epData.still_path, "w400");
        setNewEpisode((prev) => ({ ...prev, thumbnailUrl: url || "" }));
        setMsg({ tipo: "ok", texto: "Capa do episódio encontrada no TMDb!" });
      } else {
        setMsg({ tipo: "erro", texto: "Episódio encontrado, mas sem imagem. Usando padrão." });
      }
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e?.message || "Erro ao buscar capa no TMDb. Tente o nome em inglês." });
    }
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

  const formAtivo = aba === "form-filme" || aba === "form-serie";
  const tituloForm = editandoId
    ? ehSerie ? "Editar Série" : "Editar Filme"
    : aba === "form-serie" ? "Adicionar Série" : "Adicionar Filme";

  return (
    <div className="container-app min-h-screen py-10 text-white">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Painel Admin MovieFlix</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setAba("lista")} className={aba === "lista" ? "btn-primary" : "btn-outline"}>
            Catálogo ({filmes.length})
          </button>
          <button onClick={novoFilme} className={aba === "form-filme" ? "btn-primary" : "btn-outline"}>
            <Plus className="h-4 w-4" /> Filme
          </button>
          <button onClick={novaSerie} className={aba === "form-serie" ? "btn-primary" : "btn-outline"}>
            <Layers className="h-4 w-4" /> Série
          </button>
        </div>
      </div>

      {msg && (
        <div className={`mb-6 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
          msg.tipo === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"
        }`}>
          <span>{msg.texto}</span>
          <button onClick={() => setMsg(null)} aria-label="Fechar aviso"><X className="h-4 w-4" /></button>
        </div>
      )}

      {aba === "lista" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <ListFilter className="h-4 w-4 text-gray-400" />
            <button onClick={() => setFiltroLista("todos")} className={`rounded-full px-3 py-1 text-xs transition ${filtroLista === "todos" ? "bg-brand-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}>Todos</button>
            <button onClick={() => setFiltroLista("filmes")} className={`rounded-full px-3 py-1 text-xs transition ${filtroLista === "filmes" ? "bg-brand-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}>Filmes</button>
            <button onClick={() => setFiltroLista("series")} className={`rounded-full px-3 py-1 text-xs transition ${filtroLista === "series" ? "bg-brand-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}>Séries</button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input className="input pl-10" placeholder="Buscar por título ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <button onClick={carregarFilmes} className="btn-outline">
              <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>

          {carregando && <p className="text-gray-400">Carregando títulos…</p>}
          {!carregando && filtrados.length === 0 && <p className="text-gray-400">Nenhum título encontrado.</p>}

          <div className="grid gap-3">
            {filtrados.map((filme) => (
              <div key={filme.id} className="card-surface flex items-center gap-4 p-3">
                <img src={filme.poster_url} alt={filme.title} className="h-24 w-16 shrink-0 rounded-lg bg-ink-800 object-cover" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{filme.title}</h3>
                  <p className="truncate text-xs text-gray-400">{filme.category || "Sem categoria"}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="chip">{filme.type === "series" || filme.type === "tv" ? "📺 Série" : filme.type === "anime" ? (filme.video_url ? "🍥 Anime (Filme)" : "🍥 Anime (Série)") : "🎬 Filme"}</span>
                    <span className="chip">{filme.quality ?? "HD"}</span>
                    <span className="chip">{filme.language ?? "—"}</span>
                    {!filme.video_url && filme.type !== "series" && filme.type !== "tv" && filme.type !== "anime" && <span className="chip border-amber-500/40 text-amber-300">sem link</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => editar(filme)} className="btn-outline px-3 py-2" aria-label={`Editar ${filme.title}`}><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => excluir(filme)} className="btn px-3 py-2 bg-red-600/80 text-white hover:bg-red-600" aria-label={`Excluir ${filme.title}`}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {formAtivo && (
        <div className="max-w-3xl space-y-6">
          <h2 className="text-xl font-bold">{tituloForm}</h2>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block flex-1 min-w-[220px]">
              <span className="mb-1 block text-xs font-medium text-gray-400">Preencher pelo TMDB ({ehSerie ? "Série" : "Filme"})</span>
              <input className="input" placeholder="Buscar título no TMDB" value={tmdbSearch} onChange={(e) => setTmdbSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscarTMDB()} />
            </label>
            <button onClick={buscarTMDB} className="btn-outline"><Search className="h-4 w-4" /> Buscar</button>
          </div>

          {campo("title", "Título")}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-400">Descrição</span>
            <textarea className="input min-h-[110px]" placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            {campo("poster_url", "URL da capa")}
            {campo("backdrop_url", "URL do banner")}
          </div>

          {aba === "form-filme" && campo("video_url", "URL do vídeo")}

          <div className="grid gap-4 sm:grid-cols-3">
            {campo("language", "Idioma")}
            {campo("quality", "Qualidade")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-400">Tipo</span>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="movie">🎬 Filme</option>
                <option value="series">📺 Série</option>
                <option value="anime">🍥 Anime</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-400">Categorias (separe por vírgula)</span>
              <input className="input" placeholder="Ex.: Ação, Aventura" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORIAS.map((c) => {
              const atuais = form.category.split(",").map((x) => x.trim()).filter(Boolean);
              const ativo = atuais.some((x) => normalizar(x) === normalizar(c));
              return (
                <button key={c} type="button" onClick={() => {
                  const novas = ativo ? atuais.filter((x) => normalizar(x) !== normalizar(c)) : [...atuais, c];
                  setForm({ ...form, category: novas.join(", ") });
                }} className={`rounded-full border px-3 py-1 text-xs transition ${ativo ? "border-brand-500 bg-brand-600 text-white" : "border-white/15 bg-white/5 text-gray-300 hover:bg-white/10"}`}>{c}</button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button onClick={salvar} disabled={salvando} className="btn-primary">
              <Save className="h-4 w-4" /> {salvando ? "Salvando…" : editandoId ? "Salvar alterações" : "Cadastrar"}
            </button>
            <button onClick={() => { setAba("lista"); setEditandoId(null); setForm(FORM_VAZIO); setSeasons([]); setEpisodes({}); }} className="btn-outline">Cancelar</button>
          </div>

          {mostrarTemporadas && (
            <div className="mt-8 space-y-6 border-t border-white/10 pt-8">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Layers className="h-5 w-5 text-brand-400" />
                Gerenciar Temporadas e Episódios
              </h3>

              <div className="rounded-2xl border border-white/10 bg-ink-900 p-5">
                <h4 className="mb-3 text-sm font-bold text-zinc-300">Adicionar Temporada</h4>
                <div className="flex flex-wrap gap-3">
                  <input type="number" className="input w-24" placeholder="Nº" value={newSeasonNumber} onChange={(e) => setNewSeasonNumber(parseInt(e.target.value) || 1)} />
                  <input className="input flex-1 min-w-[200px]" placeholder="Título da temporada (opcional)" value={newSeasonTitle} onChange={(e) => setNewSeasonTitle(e.target.value)} />
                  <button onClick={addSeason} className="btn-primary"><Plus className="h-4 w-4" /> Adicionar</button>
                </div>
              </div>

              {loadingSeries ? (
                <p className="text-zinc-400">Carregando temporadas…</p>
              ) : seasons.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <Film className="mx-auto h-10 w-10 mb-2" />
                  <p>Nenhuma temporada ainda. Adicione a primeira acima!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {seasons.map((season) => (
                    <div key={season.id} className="rounded-2xl border border-white/10 bg-ink-900 overflow-hidden">
                      <button onClick={() => setExpandedSeason(expandedSeason === season.id ? null : season.id)} className="flex w-full items-center justify-between p-4 hover:bg-white/5">
                        <div className="flex items-center gap-3">
                          {expandedSeason === season.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          <span className="font-bold">Temporada {season.season_number}</span>
                          {season.title && <span className="text-zinc-400">- {season.title}</span>}
                          <span className="text-xs text-zinc-500">({episodes[season.id]?.length ?? 0} episódios)</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); deleteSeason(season.id); }} className="rounded-full p-2 text-red-400 hover:bg-red-600/20"><Trash2 className="h-4 w-4" /></button>
                      </button>

                      {expandedSeason === season.id && (
                        <div className="border-t border-white/10 p-4">
                          <div className="mb-4 space-y-2">
                            {(episodes[season.id] ?? []).map((ep) => (
                              <div key={ep.id}>
                                {editingEpisode === ep.id ? (
                                  <div className="rounded-lg bg-brand-900/20 border border-brand-500/30 p-4 space-y-3">
                                    <h6 className="text-sm font-bold text-brand-300">Editar Episódio {ep.episode_number}</h6>
                                    <input className="input w-full" placeholder="Título" value={editEpisodeForm.title} onChange={(e) => setEditEpisodeForm({ ...editEpisodeForm, title: e.target.value })} />
                                    <input className="input w-full" placeholder="URL do vídeo" value={editEpisodeForm.videoUrl} onChange={(e) => setEditEpisodeForm({ ...editEpisodeForm, videoUrl: e.target.value })} />
                                    <input className="input w-full" placeholder="URL da capa (opcional)" value={editEpisodeForm.thumbnailUrl} onChange={(e) => setEditEpisodeForm({ ...editEpisodeForm, thumbnailUrl: e.target.value })} />
                                    <div className="flex gap-2">
                                      <button onClick={() => saveEditEpisode(ep.id)} className="btn-primary text-xs px-3 py-2"><Save className="h-3 w-3" /> Salvar</button>
                                      <button onClick={cancelEditEpisode} className="btn-outline text-xs px-3 py-2">Cancelar</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3 rounded-lg bg-black/30 p-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold">{ep.episode_number}</div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-medium">{ep.title}</p>
                                      <p className="truncate text-[11px] text-zinc-600">{ep.video_url}</p>
                                    </div>
                                    <button onClick={() => startEditEpisode(ep)} className="rounded-full p-2 text-brand-400 hover:bg-brand-600/20" title="Editar episódio"><Pencil className="h-4 w-4" /></button>
                                    <button onClick={() => deleteEpisode(ep.id)} className="rounded-full p-2 text-red-400 hover:bg-red-600/20" title="Excluir episódio"><Trash2 className="h-4 w-4" /></button>
                                  </div>
                                )}
                              </div>
                            ))}
                            {(episodes[season.id] ?? []).length === 0 && <p className="text-center text-sm text-zinc-500 py-4">Nenhum episódio ainda.</p>}
                          </div>

                          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <h5 className="mb-3 text-sm font-bold text-zinc-300">Adicionar Episódio {(episodes[season.id]?.length ?? 0) + 1}</h5>

                            {/* URL do vídeo - único campo obrigatório */}
                            <input className="input w-full mb-3" placeholder="URL do vídeo do episódio *" value={newEpisode.seasonId === season.id ? newEpisode.videoUrl : ""} onChange={(e) => setNewEpisode({ ...newEpisode, seasonId: season.id, videoUrl: e.target.value })} />

                            {/* Preview da capa + botão buscar */}
                            <div className="flex items-center gap-3 mb-3">
                              <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                                <img
                                  src={newEpisode.seasonId === season.id && newEpisode.thumbnailUrl ? newEpisode.thumbnailUrl : gerarThumbnailPadrao((episodes[season.id]?.length ?? 0) + 1)}
                                  alt="Preview"
                                  className="h-full w-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).src = gerarThumbnailPadrao((episodes[season.id]?.length ?? 0) + 1); }}
                                />
                              </div>
                              <div className="flex-1">
                                <button
                                  onClick={() => buscarCapaEpisodioTMDB(season.season_number, (episodes[season.id]?.length ?? 0) + 1)}
                                  className="btn-outline text-xs px-3 py-2"
                                >
                                  <Search className="h-3 w-3" /> Buscar capa no TMDb
                                </button>
                                <p className="mt-1 text-[11px] text-zinc-500">
                                  Busca capa do episódio no TMDb
                                </p>
                              </div>
                            </div>

                            <button onClick={() => { setNewEpisode({ ...newEpisode, seasonId: season.id }); setTimeout(addEpisode, 0); }} className="btn-primary"><Plus className="h-4 w-4" /> Adicionar Episódio</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
