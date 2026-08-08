import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth, hasActiveSubscription } from "@/context/AuthContext";
import { UniversalVideoPlayer } from "@/components/player/UniversalVideoPlayer";

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { user, subscription, loading } = useAuth();

  const [videoUrl, setVideoUrl] = useState("");
  const [loadingVideo, setLoadingVideo] = useState(true);

  useEffect(() => {
    async function loadMovie() {
      if (!id) {
        setLoadingVideo(false);
        return;
      }

      setLoadingVideo(true);

      const { data, error } = await supabase
        .from("movies")
        .select("video_url")
        .eq("id", id)
        .single();

      console.log("VIDEO:", data, error);

      if (data?.video_url) {
        setVideoUrl(data.video_url);
      }

      setLoadingVideo(false);
    }

    loadMovie();
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        Carregando...
      </div>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  if (!hasActiveSubscription(subscription)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            Conteúdo exclusivo 🔒
          </h1>

          <p className="mt-2 text-zinc-400">
            Você precisa de uma assinatura ativa para assistir.
          </p>

          <button
            onClick={() => navigate("/minha-assinatura")}
            className="mt-5 rounded-lg bg-purple-600 px-5 py-3 font-semibold transition hover:bg-purple-700"
          >
            Ver planos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-black">
      <button
        onClick={() => navigate(-1)}
        className="absolute left-4 top-4 z-30 flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-white backdrop-blur transition hover:bg-black/90 sm:left-6 sm:top-6"
      >
        <ArrowLeft size={18} />
        Voltar
      </button>

      <div className="w-full">
        {loadingVideo ? (
          <div className="flex aspect-video w-full items-center justify-center text-white">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-zinc-700 border-t-purple-500" />

              <p className="mt-3 text-sm text-zinc-400">
                Carregando vídeo...
              </p>
            </div>
          </div>
        ) : videoUrl ? (
          <UniversalVideoPlayer
            src={videoUrl}
            autoPlay
            controls
            className="mx-auto max-w-[1600px]"
          />
        ) : (
          <div className="flex aspect-video items-center justify-center text-center text-white">
            <div>
              <h2 className="text-xl font-semibold">
                Vídeo não encontrado
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                Este filme ainda não possui uma URL de vídeo cadastrada.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
