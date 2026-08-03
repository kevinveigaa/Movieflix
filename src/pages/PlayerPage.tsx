import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth, hasActiveSubscription } from "@/context/AuthContext";
import { Plyr } from "plyr-react";
import "plyr-react/plyr.css";

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { user, subscription, loading } = useAuth();

  const [videoUrl, setVideoUrl] = useState("");

  useEffect(() => {
    async function loadMovie() {
      if (!id) return;

      const { data } = await supabase
        .from("movies")
        .select("video_url")
        .eq("id", id)
        .single();

      if (data?.video_url) {
        setVideoUrl(data.video_url);
      }
    }

    loadMovie();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
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
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-3xl font-bold mb-3">
          Conteúdo exclusivo 🔒
        </h1>

        <p className="text-gray-400 mb-6">
          Você precisa ter um plano ativo para assistir.
        </p>

        <button
          onClick={() => navigate("/minha-assinatura")}
          className="btn-primary"
        >
          Ver planos
        </button>
      </div>
    );
  }

  const videoId =
    videoUrl.match(/(?:v=|youtu\.be\/|embed\/)([^&?/]+)/)?.[1] ?? "";

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 mb-5"
      >
        <ArrowLeft size={18} />
        Voltar
      </button>

      {videoId ? (
        <div className="max-w-6xl mx-auto rounded-2xl overflow-hidden">
          <Plyr
            source={{
              type: "video",
              sources: [
                {
                  src: videoId,
                  provider: "youtube",
                },
              ],
            }}
          />
        </div>
      ) : (
        <p>Vídeo não encontrado.</p>
      )}
    </div>
  );
}
