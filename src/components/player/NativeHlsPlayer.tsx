import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { resolverStreamBetterDireto } from '@/lib/streambetterDirect';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * Player nativo do MovieFlix.
 *
 * O componente resolve o embed do StreamBetter no backend e reproduz apenas
 * o HLS resultante em um vídeo HTML5. Nenhum documento externo é montado,
 * portanto o player fica dentro do MovieFlix em celular, PC e Android TV.
 */
export function NativeHlsPlayer({
  embedUrl,
  startSeconds,
  onReady,
  onError,
}: {
  embedUrl: string;
  startSeconds?: number;
  onReady?: (video: HTMLVideoElement) => void;
  onError?: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const [status, setStatus] = useState<'carregando' | 'pronto' | 'erro'>('carregando');
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onReady, onError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !embedUrl) {
      setStatus('erro');
      setErroMsg('Nenhuma fonte de vídeo encontrada para este título.');
      return;
    }
    const currentVideo = video;

    let cancelado = false;
    setStatus('carregando');
    setErroMsg(null);

    const marcarErro = (mensagem: string, codigo: string) => {
      if (cancelado) return;
      setStatus('erro');
      setErroMsg(mensagem);
      onErrorRef.current?.(codigo);
    };

    async function iniciar() {
      try {
        const resolvido = await resolverStreamBetterDireto(embedUrl, startSeconds);
        if (cancelado) return;

        if (!resolvido.success || !resolvido.url) {
          marcarErro(
            resolvido.motivo === 'sem_stream_direto'
              ? 'Não há uma fonte dublada em PT-BR reproduzível para este título.'
              : resolvido.motivo === 'provedor_bloqueado'
                ? 'O provedor de vídeo está exigindo verificação e bloqueou o acesso do MovieFlix. Estamos restabelecendo o acesso — tente novamente mais tarde.'
                : 'Não foi possível preparar o vídeo agora. Tente novamente em instantes.',
            resolvido.motivo || 'sem_stream',
          );
          return;
        }

        const hlsUrl = resolvido.url;
        const prepararVideo = () => {
          if (cancelado) return;
          setStatus('pronto');
          onReadyRef.current?.(currentVideo);
          if (startSeconds && startSeconds > 0) {
            try {
              currentVideo.currentTime = startSeconds;
            } catch {
              // O navegador pode ainda não aceitar currentTime neste evento.
            }
          }
          // O autoplay pode ser bloqueado pelo dispositivo; os controles
          // nativos continuam disponíveis para iniciar manualmente.
          currentVideo.play().catch(() => undefined);
        };

        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            xhrSetup: (xhr) => {
              xhr.withCredentials = false;
            },
          });
          hlsRef.current = hls;
          hls.loadSource(hlsUrl);
          hls.attachMedia(currentVideo);
          hls.on(Hls.Events.MANIFEST_PARSED, prepararVideo);
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) marcarErro('Não foi possível reproduzir o vídeo agora. Tente novamente.', data.type);
          });
        } else if (currentVideo.canPlayType('application/vnd.apple.mpegurl')) {
          currentVideo.src = hlsUrl;
          currentVideo.addEventListener('loadedmetadata', prepararVideo, { once: true });
          currentVideo.addEventListener('error', () => marcarErro('Não foi possível reproduzir o vídeo agora. Tente novamente.', 'native_error'), { once: true });
        } else {
          marcarErro('Seu dispositivo não suporta reprodução HLS.', 'hls_unsupported');
        }
      } catch (error) {
        if (cancelado) return;
        console.error('[NativeHlsPlayer] falha ao iniciar:', error);
        marcarErro('Não foi possível preparar o vídeo agora. Tente novamente.', 'network');
      }
    }

    iniciar();

    return () => {
      cancelado = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      currentVideo.pause();
      currentVideo.removeAttribute('src');
      currentVideo.load();
    };
  }, [embedUrl, startSeconds]);

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        data-mf-player
        data-player-src={embedUrl}
        data-tv-focusable
        className="h-full w-full"
        controls
        playsInline
        autoPlay
        preload="auto"
      />

      {status === 'carregando' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
          <Loader2 className="h-10 w-10 animate-spin text-red-600" />
          <p className="text-sm text-zinc-300">Preparando o vídeo…</p>
        </div>
      )}

      {status === 'erro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center text-white">
          <AlertTriangle className="h-12 w-12 text-zinc-600" />
          <p className="text-sm text-zinc-300">{erroMsg}</p>
        </div>
      )}
    </div>
  );
}
