import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { tmdb, img } from "@/lib/tmdb";
import {
  Pencil, Trash2, Plus, Search, X, Save, RefreshCw, Layers,
  ListFilter, ChevronDown, ChevronUp, Film, Eye, EyeOff, Crown, UserCheck, UserX, SearchCheck
} from "lucide-react";
import { CATEGORIAS, categoriasDoFilme, normalizar } from "@/lib/categorias";
import { useQueryClient } from "@tanstack/react-query";
import { useSeriesHidden } from "@/hooks/useSeriesHidden";

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
  language: "Dublado (pt-BR)",
  quality: "HD",
  type: "movie",
  category: "",
};

interface Season {
  id: string;
  series_id: string;
  season_number: number;
  title: string | null;
  poster_url: string | null;
}

interface Episode {
  id: string;
  season_id: string;
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
  const { seriesHidden, isLoading: seriesLoading, setSeriesHidden, isToggling, error: seriesError } = useSeriesHidden();

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

  // === ATIVAÇÃO MANUAL DE ASSINATURA (WhatsApp) ===
  const [subEmail, setSubEmail] = useState("");
  const [subPlano, setSubPlano] = useState("simple");
  const [subPlans, setSubPlans] = useState<any[]>([]);
  const [subBusy, setSubBusy] = useState(false);
  const [subResultado, setSubResultado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [consultaEmail, setConsultaEmail] = useState("");
  const [consultaResultado, setConsultaResultado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [consultaBusy, setConsultaBusy] = useState(false);

  // === TEMPORADAS E EPISÓDIOS ===
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<Record<string, Episode[]>>({});
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);

  // Form para nova temporada
  const [newSeasonNumber, setNewSeasonNumber] = useState(1);
  const [newSeasonTitle, setNewSeasonTitle] = useState("");

  // Form para novo episódio
  const [newEpisode, setNewEpisode] = useState({
    seasonId: "",
    episodeNumber: 1,
    title: "",
    description: "",
    videoUrl: "",
    durationSeconds: 0,
    thumbnailUrl: "",
  });

  // === EDIÇÃO DE EPISÓDIO ===
  const [editingEpisode, setEditingEpisode] = useState<string | null>(null);
  const [editEpisodeForm, setEditEpisodeForm] = useState({
    title: "",
    videoUrl: "",
    thumbnailUrl: "",
  });

  const ehAdmin = user?.email === ADMIN_EMAIL;
  const ehSerie = form.type === "series" || form.type === "tv" || form.type === "anime";
  const mostrarTemporadas = editandoId && ehSerie && !form.video_url;

  async function carregarFilmes() {
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from("movies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) setMsg({ tipo: "erro", texto: error.message });
      else setFilmes(data ?? []);
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e?.message || "Erro ao carregar catálogo" });
    }
    setCarregando(false);
  }

  useEffect(() => {
    if (ehAdmin) carregarFilmes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehAdmin]);

  // Carrega os planos para o formulário de ativação manual.
  useEffect(() => {
    if (!ehAdmin) return;
    (async () => {
      const { data } = await supabase.from("plans").select("*").order("price_cents", { ascending: true });
      setSubPlans(data ?? []);
    })();
  }, [ehAdmin]);

  // === ATIVAÇÃO MANUAL (e-mail + plano) ===
  async function ativarAssinatura() {
    const email = subEmail.trim();
    if (!email) {
      setSubResultado({ tipo: "erro", texto: "Informe o e-mail do cliente." });
      return;
    }
    setSubBusy(true);
    setSubResultado(null);
    try {
      const { data, error } = await supabase.rpc("activate_subscription_by_email", {
        p_email: email,
        p_plano: subPlano,
      });
      if (error) throw error;
      const res = data as { ok?: boolean; mensagem?: string; erro?: string; plano?: string; expiracao?: string } | null;
      if (res && res.ok === false) {
        setSubResultado({ tipo: "erro", texto: res.erro ?? "Não foi possível ativar." });
      } else {
        setSubResultado({
          tipo: "ok",
          texto: `${res?.mensagem ?? "Ativação realizada"} — Plano: ${res?.plano ?? subPlano} · Expira em: ${res?.expiracao ?? "—"}`,
        });
        setSubEmail("");
      }
    } catch (e: any) {
      setSubResultado({ tipo: "erro", texto: e?.message ?? "Erro ao ativar assinatura." });
    }
    setSubBusy(false);
  }

  async function desativarAssinatura() {
    const email = subEmail.trim();
    if (!email) {
      setSubResultado({ tipo: "erro", texto: "Informe o e-mail do cliente." });
      return;
    }
    if (!window.confirm(`Desativar a assinatura de ${email}? O histórico será preservado.`)) return;
    setSubBusy(true);
    setSubResultado(null);
    try {
      const { data, error } = await supabase.rpc("deactivate_subscription_by_email", { p_email: email });
      if (error) throw error;
      const res = data as { ok?: boolean; mensagem?: string; erro?: string } | null;
      if (res && res.ok === false) {
        setSubResultado({ tipo: "erro", texto: res.erro ?? "Não foi possível desativar." });
      } else {
        setSubResultado({ tipo: "ok", texto: res?.mensagem ?? "Assinatura desativada." });
      }
    } catch (e: any) {
      setSubResultado({ tipo: "erro", texto: e?.message ?? "Erro ao desativar assinatura." });
    }
    setSubBusy(false);
  }

  async function consultarAssinatura() {
    const email = consultaEmail.trim();
    if (!email) {
      setConsultaResultado({ tipo: "erro", texto: "Informe o e-mail do cliente." });
      return;
    }
    setConsultaBusy(true);
    setConsultaResultado(null);
    try {
      const { data, error } = await supabase.rpc("get_subscription_by_email", { p_email: email });
      if (error) throw error;
      const res = data as { ok?: boolean; erro?: string; assinatura?: any } | null;
      if (res && res.ok === false) {
        setConsultaResultado({ tipo: "erro", texto: res.erro ?? "Erro ao consultar." });
      } else if (!res?.assinatura) {
        setConsultaResultado({ tipo: "erro", texto: "Este usuário não possui assinatura registrada." });
      } else {
        const a = res.assinatura;
        setConsultaResultado({
          tipo: "ok",
          texto: `E-mail: ${email} · Plano: ${a.plano ?? "—"} · Status: ${a.status ?? "—"} · Início: ${a.inicio ?? "—"} · Expira: ${a.expiracao ?? "—"}`,
        });
      }
    } catch (e: any) {
      setConsultaResultado({ tipo: "erro", texto: e?.message ?? "Erro ao consultar." });
    }
    setConsultaBusy(false);
  }

  useEffect(() => {
    if (mostrarTemporadas && editandoId) {
      loadSeasonsAndEpisodes(editandoId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarTemporadas, editandoId]);

  async function loadSeasonsAndEpisodes(seriesId: string) {
    setLoadingSeries(true);
    try {
      const { data: seasonsData } = await supabase
        .from("seasons")
        .select("*")
        .eq("series_id", seriesId)
        .order("season_number", { ascending: true });
      const seasonsList = (seasonsData ?? []) as Season[];
      setSeasons(seasonsList);
      const eps: Record<string, Episode[]> = {};
      for (const season of seasonsList) {
        const { data: epData } = await supabase
          .from("episodes")
          .select("*")
          .eq("season_id", season.id)
          .order("episode_number", { ascending: true });
        eps[season.id] = (epData ?? []) as Episode[];
      }
      setEpisodes(eps);
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e?.message || "Erro ao carregar temporadas" });
    }
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
      language: filme.language ?? "Dublado (pt-BR)",
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
    try {
      const { error } = await supabase.from("movies").delete().eq("id", filme.id);
      if (error) setMsg({ tipo: "erro", texto: error.message });
      else {
        setMsg({ tipo: "ok", texto: "Título excluído." });
        setFilmes((atual) => atual.filter((f) => f.id !== filme.id));
      }
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e?.message || "Erro ao excluir" });
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
    try {
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
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e?.message || "Erro ao salvar" });
    }
    setSalvando(false);
  }

  // ========== TEMPORADAS ==========
  async function addSeason() {
    if (!editandoId) return;
    try {
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
          if (newSeason?.id) {
            setExpandedSeason(newSeason.id);
            setNewEpisode((prev) => ({ ...prev, seasonId: newSeason.id, episodeNumber: 1 }));
          }
        }
      }
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e?.message || "Erro ao adicionar temporada" });
    }
  }

  async function deleteSeason(seasonId: string) {
    if (!window.confirm("Excluir esta temporada e todos os episódios?")) return;
    try {
      await supabase.from("episodes").delete().eq("season_id", seasonId);
      await supabase.from("seasons").delete().eq("id", seasonId);
      setMsg({ tipo: "ok", texto: "Temporada excluída!" });
      if (editandoId) await loadSeasonsAndEpisodes(editandoId);
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e?.message || "Erro ao excluir temporada" });
    }
  }

  // ========== EPISÓDIOS ==========
  async function addEpisode(targetSeasonId?: string) {
    const seasonId = targetSeasonId || newEpisode.seasonId;
    if (!seasonId || !newEpisode.videoUrl.trim()) {
      setMsg({ tipo: "erro", texto: "Informe a URL do vídeo do episódio!" });
      return;
    }
    try {
      const seasonEpisodes = episodes[seasonId] ?? [];
      const nextNumber = seasonEpisodes.length > 0
        ? Math.max(...seasonEpisodes.map((e) => e.episode_number)) + 1
        : 1;
      const { error } = await supabase.from("episodes").insert({
        season_id: seasonId,
        episode_number: nextNumber,
        title: newEpisode.title.trim() || `Episódio ${nextNumber}`,
        description: newEpisode.description || null,
        video_url: newEpisode.videoUrl.trim(),
        duration_seconds: newEpisode.durationSeconds || null,
        thumbnail_url: newEpisode.thumbnailUrl || gerarThumbnailPadrao(nextNumber),
      });
      if (error) {
        setMsg({ tipo: "erro", texto: error.message });
      } else {
        setMsg({ tipo: "ok", texto: "Episódio adicionado!" });
        setNewEpisode((prev) => ({
          ...prev,
          seasonId,
          episodeNumber: nextNumber + 1,
          title: "",
          videoUrl: "",
          description: "",
          thumbnailUrl: "",
        }));
        if (editandoId) await loadSeasonsAndEpisodes(editandoId);
      }
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e?.message || "Erro ao adicionar episódio" });
    }
  }

  async function deleteEpisode(episodeId: string) {
    if (!window.confirm("Excluir este episódio?")) return;
    try {
      await supabase.from("episodes").delete().eq("id", episodeId);
      setMsg({ tipo: "ok", texto: "Episódio excluído!" });
      if (editandoId) await loadSeasonsAndEpisodes(editandoId);
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e?.message || "Erro ao excluir episódio" });
    }
  }

  // ========== EDITAR EPISÓDIO ==========
  function startEditEpisode(ep: Episode) {
    setEditingEpisode(ep.id);
    setEditEpisodeForm({
      title: ep.title || "",
      videoUrl: ep.video_url || "",
      thumbnailUrl: ep.thumbnail_url || "",
    });
  }

  function cancelEditEpisode() {
    setEditingEpisode(null);
    setEditEpisodeForm({ title: "", videoUrl: "", thumbnailUrl: "" });
  }

  async function saveEditEpisode(episodeId: string) {
    try {
      const { error } = await supabase.from("episodes").update({
        title: editEpisodeForm.title.trim() || undefined,
        video_url: editEpisodeForm.videoUrl.trim() || undefined,
        thumbnail_url: editEpisodeForm.thumbnailUrl || undefined,
      }).eq("id", episodeId);
      if (error) {
        setMsg({ tipo: "erro", texto: error.message });
      } else {
        setMsg({ tipo: "ok", texto: "Episódio atualizado!" });
        setEditingEpisode(null);
        if (editandoId) await loadSeasonsAndEpisodes(editandoId);
      }
    } catch (e: any) {
      setMsg({ tipo: "erro", texto: e?.message || "Erro ao atualizar episódio" });
    }
  }

  // ========== UTILS ==========
  function gerarThumbnailPadrao(numero: number): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225">
      <rect width="400" height="225" fill="#0a0a0a"/>
      <rect x="20" y="20" width="360" height="185" rx="12" fill="#1a1a1a" stroke="#333" stroke-width="2"/>
      <text x="200" y="100" font-family="Arial, sans-serif" font-size="20" fill="#666" text-anchor="middle">EPISODIO</text>
      <text x="200" y="145" font-family="Arial, sans-serif" font-size="56" fill="#e50914" font-weight="bold" text-anchor="middle">${numero}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  async function buscarCapaEpisodioTMDB(seasonNum: number, epNum: number) {
    if (!form.title) {
      setMsg({ tipo: "erro", texto: "Preencha o título da série primeiro!" });
      return;
    }
    try {
      setMsg({ tipo: "ok", texto: "Buscando no TMDb..." });
      const resultado: any = await tmdb.search(form.title);
      const serie = resultado.results?.find((item: any) => item.media_type === "tv");
      if (!serie) {
        setMsg({ tipo: "erro", texto: "Série não encontrada no TMDB. Tente o nome em inglês." });
        return;
      }
      const PUBLIC_API_URL = "https://movieflix-api-udsv.onrender.com";
      const API_URL = (import.meta.env.VITE_API_URL as string) || PUBLIC_API_URL;

      const response = await fetch(
        `${API_URL}/api/tmdb/tv/${serie.id}/season/${seasonNum}/episode/${epNum}?language=pt-BR`
      );
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
      setMsg({ tipo: "erro", texto: e?.message || "Erro ao buscar capa no TMDb." });
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

      {/* Controle global: esconder/reativar séries no site (nada é removido). */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-ink-900/70 p-4">
        <div className="flex items-center gap-3">
          {seriesHidden ? (
            <EyeOff className="h-5 w-5 shrink-0 text-amber-400" />
          ) : (
            <Eye className="h-5 w-5 shrink-0 text-emerald-400" />
          )}
          <div>
            <p className="text-sm font-semibold text-white">Séries no site</p>
            <p className="text-xs text-gray-400">
              {seriesHidden
                ? "Ocultas — o cliente vê apenas filmes."
                : "Visíveis — o cliente vê filmes e séries."}
            </p>
          </div>
        </div>
        <button
          onClick={() => setSeriesHidden(!seriesHidden)}
          disabled={seriesLoading || isToggling}
          className={seriesHidden ? "btn-primary" : "btn-outline"}
        >
          {seriesHidden ? (
            <><Eye className="h-4 w-4" /> Reativar séries</>
          ) : (
            <><EyeOff className="h-4 w-4" /> Esconder séries</>
          )}
        </button>
        {seriesError && (
          <p className="w-full text-xs text-red-400">
            Não foi possível salvar a configuração: {(seriesError as Error).message}
          </p>
        )}
      </div>

      {/* Ativação manual de assinatura (WhatsApp) — e-mail + plano */}
      <div className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 shrink-0 text-emerald-400" />
          <h2 className="text-sm font-bold text-white">Ativação manual de assinatura (WhatsApp)</h2>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Informe SOMENTE o e-mail do cliente e o plano. O sistema localiza o usuário, ativa a assinatura e calcula a validade automaticamente.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[220px]">
            <span className="mb-1 block text-xs font-medium text-gray-400">E-mail do cliente</span>
            <input
              className="input"
              placeholder="cliente@email.com"
              value={subEmail}
              onChange={(e) => setSubEmail(e.target.value)}
            />
          </label>
          <label className="block w-44">
            <span className="mb-1 block text-xs font-medium text-gray-400">Plano</span>
            <select className="input" value={subPlano} onChange={(e) => setSubPlano(e.target.value)}>
              {(subPlans.length > 0 ? subPlans : [{ code: "simple", name: "Plano 1" }, { code: "standard", name: "Plano 2" }, { code: "premium", name: "Plano 3" }]).map((p) => (
                <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
              ))}
            </select>
          </label>
          <button onClick={ativarAssinatura} disabled={subBusy} className="btn-primary">
            <UserCheck className="h-4 w-4" /> {subBusy ? "Ativando…" : "Ativar assinatura"}
          </button>
          <button onClick={desativarAssinatura} disabled={subBusy} className="btn-outline border-red-500/30 text-red-300 hover:bg-red-500/10">
            <UserX className="h-4 w-4" /> Desativar
          </button>
        </div>

        {subResultado && (
          <p className={`mt-3 text-sm ${subResultado.tipo === "ok" ? "text-emerald-300" : "text-red-300"}`}>
            {subResultado.texto}
          </p>
        )}

        {/* Consulta por e-mail */}
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
          <label className="block flex-1 min-w-[220px]">
            <span className="mb-1 block text-xs font-medium text-gray-400">Consultar assinatura por e-mail</span>
            <input
              className="input"
              placeholder="cliente@email.com"
              value={consultaEmail}
              onChange={(e) => setConsultaEmail(e.target.value)}
            />
          </label>
          <button onClick={consultarAssinatura} disabled={consultaBusy} className="btn-outline">
            <SearchCheck className="h-4 w-4" /> {consultaBusy ? "Consultando…" : "Consultar"}
          </button>
        </div>
        {consultaResultado && (
          <p className={`mt-2 text-sm ${consultaResultado.tipo === "ok" ? "text-emerald-300" : "text-red-300"}`}>
            {consultaResultado.texto}
          </p>
        )}
      </div>

      {msg && (
        <div className={`mb-6 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
          msg.tipo === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"
        }`}>
          <span>{msg.texto}</span>
          <button onClick={() => setMsg(null)} aria-label="Fechar aviso"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* LISTA */}
      {aba === "lista" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <ListFilter className="h-4 w-4 text-gray-400" />
            <button onClick={() => setFiltroLista("todos")} className={`rounded-full px-3 py-1 text-xs transition ${filtroLista === "todos" ? "bg-gradient-to-r from-brand-600 to-roxo-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}>Todos</button>
            <button onClick={() => setFiltroLista("filmes")} className={`rounded-full px-3 py-1 text-xs transition ${filtroLista === "filmes" ? "bg-gradient-to-r from-brand-600 to-roxo-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}>Filmes</button>
            <button onClick={() => setFiltroLista("series")} className={`rounded-full px-3 py-1 text-xs transition ${filtroLista === "series" ? "bg-gradient-to-r from-brand-600 to-roxo-600 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"}`}>Séries</button>
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

      {/* FORMULÁRIO */}
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
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-400">Idioma (áudio)</span>
              <select
                className="input"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="Dublado (pt-BR)">Dublado (pt-BR)</option>
                <option value="Dublado">Dublado</option>
              </select>
            </label>
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
                }} className={`rounded-full border px-3 py-1 text-xs transition ${ativo ? "border-roxo-500 bg-gradient-to-r from-brand-600 to-roxo-600 text-white" : "border-white/15 bg-white/5 text-gray-300 hover:bg-white/10"}`}>{c}</button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button onClick={salvar} disabled={salvando} className="btn-primary">
              <Save className="h-4 w-4" /> {salvando ? "Salvando…" : editandoId ? "Salvar alterações" : "Cadastrar"}
            </button>
            <button onClick={() => { setAba("lista"); setEditandoId(null); setForm(FORM_VAZIO); setSeasons([]); setEpisodes({}); }} className="btn-outline">Cancelar</button>
          </div>

          {/* TEMPORADAS E EPISÓDIOS */}
          {mostrarTemporadas && (
            <div className="mt-8 space-y-6 border-t border-white/10 pt-8">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Layers className="h-5 w-5 text-roxo-400" />
                Gerenciar Temporadas e Episódios
              </h3>

              {/* Adicionar Temporada */}
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
                      {/* Header da Temporada */}
                      <div className="flex w-full items-center justify-between p-4 hover:bg-white/5">
                        <button
                          type="button"
                          onClick={() => setExpandedSeason(expandedSeason === season.id ? null : season.id)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          aria-expanded={expandedSeason === season.id}
                        >
                          {expandedSeason === season.id ? <ChevronUp className="h-5 w-5 shrink-0" /> : <ChevronDown className="h-5 w-5 shrink-0" />}
                          <span className="font-bold">Temporada {season.season_number}</span>
                          {season.title && <span className="truncate text-zinc-400">- {season.title}</span>}
                          <span className="text-xs text-zinc-500">({(episodes[season.id] ?? []).length} episódios)</span>
                        </button>
                        <button type="button" onClick={() => deleteSeason(season.id)} className="ml-2 shrink-0 rounded-full p-2 text-red-400 hover:bg-red-600/20" title="Excluir temporada"><Trash2 className="h-4 w-4" /></button>
                      </div>

                      {/* Episódios */}
                      {expandedSeason === season.id && (
                        <div className="border-t border-white/10 p-4">
                          <div className="mb-4 space-y-2">
                            {(episodes[season.id] ?? []).filter(Boolean).map((ep) => (
                              <div key={ep?.id || `ep-${Math.random()}`}>
                                {editingEpisode === ep?.id ? (
                                  <div className="rounded-lg bg-roxo-900/20 border border-roxo-500/30 p-4 space-y-3">
                                    <h6 className="text-sm font-bold text-roxo-300">Editar Episódio {ep?.episode_number ?? ""}</h6>
                                    <input className="input w-full" placeholder="Título" value={editEpisodeForm.title} onChange={(e) => setEditEpisodeForm({ ...editEpisodeForm, title: e.target.value })} />
                                    <input className="input w-full" placeholder="URL do vídeo" value={editEpisodeForm.videoUrl} onChange={(e) => setEditEpisodeForm({ ...editEpisodeForm, videoUrl: e.target.value })} />
                                    <input className="input w-full" placeholder="URL da capa (opcional)" value={editEpisodeForm.thumbnailUrl} onChange={(e) => setEditEpisodeForm({ ...editEpisodeForm, thumbnailUrl: e.target.value })} />
                                    <div className="flex gap-2">
                                      <button onClick={() => ep?.id && saveEditEpisode(ep.id)} className="btn-primary text-xs px-3 py-2"><Save className="h-3 w-3" /> Salvar</button>
                                      <button onClick={cancelEditEpisode} className="btn-outline text-xs px-3 py-2">Cancelar</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3 rounded-lg bg-black/30 p-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-600 to-roxo-600 text-sm font-bold">{ep?.episode_number ?? "-"}</div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate font-medium">{ep?.title || "Sem título"}</p>
                                      <p className="truncate text-[11px] text-zinc-600">{ep?.video_url || ""}</p>
                                    </div>
                                    <button onClick={() => ep && startEditEpisode(ep)} className="rounded-full p-2 text-roxo-400 hover:bg-roxo-600/20" title="Editar episódio"><Pencil className="h-4 w-4" /></button>
                                    <button onClick={() => ep?.id && deleteEpisode(ep.id)} className="rounded-full p-2 text-red-400 hover:bg-red-600/20" title="Excluir episódio"><Trash2 className="h-4 w-4" /></button>
                                  </div>
                                )}
                              </div>
                            ))}
                            {(episodes[season.id] ?? []).length === 0 && <p className="text-center text-sm text-zinc-500 py-4">Nenhum episódio ainda.</p>}
                          </div>

                          {/* Adicionar Episódio */}
                          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <h5 className="mb-3 text-sm font-bold text-zinc-300">Adicionar Episódio {(episodes[season.id]?.length ?? 0) + 1}</h5>

                            <input className="input w-full mb-3" placeholder="URL do vídeo do episódio *" value={newEpisode.seasonId === season.id ? newEpisode.videoUrl : ""} onChange={(e) => setNewEpisode({ ...newEpisode, seasonId: season.id, videoUrl: e.target.value })} />

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
                                <p className="mt-1 text-[11px] text-zinc-500">Busca capa do episódio no TMDb</p>
                              </div>
                            </div>

                            <button onClick={() => addEpisode(season.id)} className="btn-primary"><Plus className="h-4 w-4" /> Adicionar Episódio</button>
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
