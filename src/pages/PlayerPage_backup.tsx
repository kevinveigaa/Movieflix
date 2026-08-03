import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    async function loadMovie() {
      if (!id) return;

      const { data, error } = await supabase
        .from("movies")
        .select("video_url")
        .eq("id", id)
        .single();

      console.log("PLAYER BUSCA:", data, error);

      if (!error && data?.video_url) {
        setVideoUrl(data.video_url);
      }
    }

    loadMovie();
  }, [id]);

  const embed = videoUrl?.replace("watch?v=", "embed/");

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2">
        <ArrowLeft size={18} /> Voltar
      </button>

      {embed ? (
        <iframe
          src={embed}
          className="w-full aspect-video mt-5 rounded-xl"
          allowFullScreen
          loading="lazy"
        />
      ) : (
        <p className="mt-5 text-gray-400">
          Vídeo não encontrado.
        </p>
      )}
    </div>
  );
}




