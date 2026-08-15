import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, Plus, Trash2, Save, Film, ChevronDown, ChevronUp } from 'lucide-react';

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

export function AdminSeriesPage() {
  const { seriesId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [series, setSeries] = useState<any>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<Record<string, Episode[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Form para nova temporada
  const [newSeasonNumber, setNewSeasonNumber] = useState(1);
  const [newSeasonTitle, setNewSeasonTitle] = useState('');

  // Form para novo episódio
  const [newEpisode, setNewEpisode] = useState({
    seasonId: '',
    episodeNumber: 1,
    title: '',
    description: '',
    videoUrl: '',
    durationSeconds: 0,
    thumbnailUrl: '',
  });

  const ehAdmin = user?.email === 'veigakevin71@gmail.com';

  useEffect(() => {
    if (!ehAdmin || !seriesId) return;
    loadSeries();
  }, [ehAdmin, seriesId]);

  async function loadSeries() {
    setLoading(true);
    // Carrega série
    const { data: seriesData } = await supabase.from('movies').select('*').eq('id', seriesId).single();
    setSeries(seriesData);

    // Carrega temporadas
    const { data: seasonsData } = await supabase
      .from('seasons')
      .select('*')
      .eq('series_id', seriesId)
      .order('season_number', { ascending: true });
    setSeasons(seasonsData ?? []);

    // Carrega episódios de cada temporada
    const eps: Record<string, Episode[]> = {};
    for (const season of (seasonsData ?? [])) {
      const { data: epData } = await supabase
        .from('episodes')
        .select('*')
        .eq('season_id', season.id)
        .order('episode_number', { ascending: true });
      eps[season.id] = epData ?? [];
    }
    setEpisodes(eps);
    setLoading(false);
  }

  // Calcula o próximo número de temporada disponível
  function getNextSeasonNumber(): number {
    if (seasons.length === 0) return 1;
    const maxNum = Math.max(...seasons.map((s) => s.season_number));
    return maxNum + 1;
  }

  async function addSeason() {
    if (!seriesId) return;

    // Validação: não permite número repetido
    const exists = seasons.some((s) => s.season_number === newSeasonNumber);
    if (exists) {
      setMsg({ tipo: 'erro', texto: `Já existe a Temporada ${newSeasonNumber}! Escolha outro número.` });
      return;
    }

    const { error } = await supabase.from('seasons').insert({
      series_id: seriesId,
      season_number: newSeasonNumber,
      title: newSeasonTitle || null,
    });
    if (error) {
      setMsg({ tipo: 'erro', texto: error.message });
    } else {
      setMsg({ tipo: 'ok', texto: 'Temporada adicionada!' });
      // Sugere o próximo número disponível após adicionar
      const nextNum = getNextSeasonNumber();
      setNewSeasonNumber(nextNum);
      setNewSeasonTitle('');
      await loadSeries();
    }
  }

  async function deleteSeason(seasonId: string) {
    if (!window.confirm('Excluir esta temporada e todos os episódios?')) return;
    await supabase.from('episodes').delete().eq('season_id', seasonId);
    await supabase.from('seasons').delete().eq('id', seasonId);
    setMsg({ tipo: 'ok', texto: 'Temporada excluída!' });
    await loadSeries();
  }

  async function addEpisode(seasonId?: string) {
    const targetSeasonId = seasonId || newEpisode.seasonId;
    const targetEpisode = seasonId
      ? newEpisode
      : newEpisode;

    if (!targetSeasonId || !newEpisode.title || !newEpisode.videoUrl) {
      setMsg({ tipo: 'erro', texto: 'Preencha título e URL do vídeo!' });
      return;
    }
    try {
      const { error } = await supabase.from('episodes').insert({
        season_id: targetSeasonId,
        episode_number: newEpisode.episodeNumber,
        title: newEpisode.title,
        description: newEpisode.description || null,
        video_url: newEpisode.videoUrl,
        duration_seconds: newEpisode.durationSeconds || null,
        thumbnail_url: newEpisode.thumbnailUrl || null,
      });
      if (error) {
        setMsg({ tipo: 'erro', texto: error.message });
      } else {
        setMsg({ tipo: 'ok', texto: 'Episódio adicionado!' });
        setNewEpisode((prev) => ({ 
          ...prev, 
          seasonId: targetSeasonId,
          episodeNumber: prev.episodeNumber + 1, 
          title: '', 
          videoUrl: '', 
          description: '' 
        }));
        await loadSeries();
      }
    } catch (err: any) {
      setMsg({ tipo: 'erro', texto: err?.message || 'Erro ao adicionar episódio' });
    }
  }

  async function addEpisodeToSeason(seasonId: string) {
    if (!newEpisode.title || !newEpisode.videoUrl) {
      setMsg({ tipo: 'erro', texto: 'Preencha título e URL do vídeo!' });
      return;
    }
    try {
      const { error } = await supabase.from('episodes').insert({
        season_id: seasonId,
        episode_number: newEpisode.episodeNumber,
        title: newEpisode.title,
        description: newEpisode.description || null,
        video_url: newEpisode.videoUrl,
        duration_seconds: newEpisode.durationSeconds || null,
        thumbnail_url: newEpisode.thumbnailUrl || null,
      });
      if (error) {
        setMsg({ tipo: 'erro', texto: error.message });
      } else {
        setMsg({ tipo: 'ok', texto: 'Episódio adicionado!' });
        setNewEpisode((prev) => ({ 
          ...prev, 
          seasonId,
          episodeNumber: prev.episodeNumber + 1, 
          title: '', 
          videoUrl: '', 
          description: '' 
        }));
        await loadSeries();
      }
    } catch (err: any) {
      setMsg({ tipo: 'erro', texto: err?.message || 'Erro ao adicionar episódio' });
    }
  }

  async function deleteEpisode(episodeId: string, seasonId: string) {
    if (!window.confirm('Excluir este episódio?')) return;
    await supabase.from('episodes').delete().eq('id', episodeId);
    setMsg({ tipo: 'ok', texto: 'Episódio excluído!' });
    await loadSeries();
  }

  if (!ehAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <h1 className="text-3xl font-bold">Acesso negado</h1>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="container-app min-h-screen py-10 text-white">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <button onClick={() => navigate('/admin')} className="rounded-full bg-white/10 p-3 hover:bg-white/20">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">Gerenciar Série</h1>
          <p className="text-zinc-400">{series?.title}</p>
        </div>
      </div>

      {msg && (
        <div className={`mb-6 flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
          msg.tipo === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-red-500/30 bg-red-500/10 text-red-200'
        }`}>
          <span>{msg.texto}</span>
          <button onClick={() => setMsg(null)}>✕</button>
        </div>
      )}

      {/* Adicionar Temporada */}
      <div className="mb-8 rounded-2xl border border-white/10 bg-ink-900 p-6">
        <h2 className="mb-4 text-lg font-bold">Adicionar Temporada</h2>
        <div className="flex flex-wrap gap-3">
          <input
            type="number"
            className="input w-24"
            placeholder="Nº"
            value={newSeasonNumber}
            onChange={(e) => setNewSeasonNumber(parseInt(e.target.value) || 1)}
          />
          <input
            className="input flex-1 min-w-[200px]"
            placeholder="Título da temporada (opcional)"
            value={newSeasonTitle}
            onChange={(e) => setNewSeasonTitle(e.target.value)}
          />
          <button onClick={addSeason} className="btn-primary">
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>
      </div>

      {/* Temporadas e Episódios */}
      <div className="space-y-4">
        {[...seasons].sort((a, b) => a.season_number - b.season_number).map((season) => (
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
                <span className="text-xs text-zinc-500">({episodes[season.id]?.length ?? 0} episódios)</span>
              </button>
              <button
                type="button"
                onClick={() => deleteSeason(season.id)}
                className="ml-2 shrink-0 rounded-full p-2 text-red-400 hover:bg-red-600/20"
                title="Excluir temporada"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* Episódios */}
            {expandedSeason === season.id && (
              <div className="border-t border-white/10 p-4">
                {/* Lista de episódios */}
                <div className="mb-4 space-y-2">
                  {(episodes[season.id] ?? []).filter(Boolean).map((ep, idx) => (
                    <div key={ep?.id || `ep-${idx}`} className="flex items-center gap-3 rounded-lg bg-black/30 p-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold">
                        {ep?.episode_number ?? '-'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{ep?.title || 'Sem título'}</p>
                        <p className="truncate text-xs text-zinc-500">{ep?.video_url || ''}</p>
                      </div>
                      <button
                        onClick={() => ep?.id && deleteEpisode(ep.id, season.id)}
                        className="rounded-full p-2 text-red-400 hover:bg-red-600/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {(episodes[season.id] ?? []).length === 0 && (
                    <p className="text-center text-sm text-zinc-500 py-4">Nenhum episódio ainda.</p>
                  )}
                </div>

                {/* Adicionar Episódio */}
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <h3 className="mb-3 text-sm font-bold text-zinc-300">Adicionar Episódio</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="number"
                      className="input"
                      placeholder="Nº do episódio"
                      value={newEpisode.seasonId === season.id ? newEpisode.episodeNumber : 1}
                      onChange={(e) => setNewEpisode({ ...newEpisode, seasonId: season.id, episodeNumber: parseInt(e.target.value) || 1 })}
                    />
                    <input
                      className="input"
                      placeholder="Título do episódio"
                      value={newEpisode.seasonId === season.id ? newEpisode.title : ''}
                      onChange={(e) => setNewEpisode({ ...newEpisode, seasonId: season.id, title: e.target.value })}
                    />
                    <input
                      className="input sm:col-span-2"
                      placeholder="URL do vídeo"
                      value={newEpisode.seasonId === season.id ? newEpisode.videoUrl : ''}
                      onChange={(e) => setNewEpisode({ ...newEpisode, seasonId: season.id, videoUrl: e.target.value })}
                    />
                    <input
                      className="input sm:col-span-2"
                      placeholder="Descrição (opcional)"
                      value={newEpisode.seasonId === season.id ? newEpisode.description : ''}
                      onChange={(e) => setNewEpisode({ ...newEpisode, seasonId: season.id, description: e.target.value })}
                    />
                    <input
                      type="number"
                      className="input"
                      placeholder="Duração em segundos (opcional)"
                      value={newEpisode.seasonId === season.id ? newEpisode.durationSeconds : 0}
                      onChange={(e) => setNewEpisode({ ...newEpisode, seasonId: season.id, durationSeconds: parseInt(e.target.value) || 0 })}
                    />
                    <input
                      className="input"
                      placeholder="URL da thumbnail (opcional)"
                      value={newEpisode.seasonId === season.id ? newEpisode.thumbnailUrl : ''}
                      onChange={(e) => setNewEpisode({ ...newEpisode, seasonId: season.id, thumbnailUrl: e.target.value })}
                    />
                  </div>
                  <button
                    onClick={() => addEpisodeToSeason(season.id)}
                    className="btn-primary mt-3"
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar Episódio
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {seasons.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <Film className="mx-auto h-12 w-12 mb-3" />
            <p>Nenhuma temporada ainda. Adicione a primeira acima!</p>
          </div>
        )}
      </div>
    </div>
  );
}

