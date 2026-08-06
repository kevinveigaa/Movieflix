import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth, hasActiveSubscription } from "@/context/AuthContext";

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, subscription, loading } = useAuth();

  const [videoUrl, setVideoUrl] = useState("");

  useEffect(() => {
    async function loadMovie() {
      if (!id) return;

      const { data, error } = await supabase
        .from("movies")
        .select("video_url")
        .eq("id", id)
        .single();

      console.log("VIDEO:", data, error);

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
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <h1 className="text-3xl font-bold">
          Conteúdo exclusivo 🔒
        </h1>

        <button
          onClick={() => navigate("/minha-assinatura")}
          className="mt-5 px-5 py-3 bg-purple-600 rounded-lg"
        >
          Ver planos
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-5">

      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 mb-5"
      >
        <ArrowLeft size={18}/>
        Voltar
      </button>

      {videoUrl ? (
        <video
          controls
          autoPlay
          className="w-full max-w-6xl mx-auto rounded-xl"
        >
          <source src={videoUrl} type="video/mp4" />
        </video>
      ) : (
        <p>Vídeo não encontrado.</p>
      )}

    </div>
  );
}
