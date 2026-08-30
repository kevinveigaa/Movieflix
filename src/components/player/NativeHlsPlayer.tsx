import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { resolverStreamBetterDireto } from '@/lib/streambetterDirect';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * NativeHlsPlayer — player nativo de vídeo do Movieflix.
 *
 * Em vez de embutir um iframe de terceiros (YapGrid/CineSrc/VidSrc), este
 * player resolve o HLS REAL do título através do backend do próprio Movieflix
 * (/api/streambetter-resolve → /api/streambetter-hls) e reproduz num <video>
 * nativo + hls.js.
 *
 * Vantagens (por construção):
 *  - ZERO anúncios: não há iframe de terceiros, não há overlay "Abrir link",
 *    não há pop-up/pop-under/nova aba/redirecionamento. O usuário permanece
 *    dentro do Movieflix.
 *  - Áudio PT-BR: o resolver do backend busca a fonte no StreamBetter com
 *    lang=pt-BR e identifica fontes dubladas (label "Dublado"). O áudio é
 *    muxado no HLS (não há faixas separadas), então a faixa dublada já vem
 *    no stream quando a fonte é dublada.
 *  - Qualidade: o hls.js seleciona automaticamente a melhor qualidade
 *    disponível (1080p+ quando existir).
 *  - Funciona em celular, PC, tablet, Android TV, Google TV e TV Box (o
 *    <video> nativo + hls.js é suportado em todos; em iOS/Safari o hls.js
 *    delega para o player nativo do Safari).
 *  - Tela cheia e responsividade nativas do <video>.
 *
 * O componente expõe o <video> com data-mf-player para o controle remoto
 * (useTvPlayerControls) e data-player-src para a guarda anti-redirect.
 */
export function NativeHlsPlayer({
  embedUrl,
  startSeconds,
  onReady,
  onError,
}: {
  /** URL do embed do StreamBetter (filme ou serie/{s}/{e}) que o resolver resolve. */
  embedUrl: string;
  /** Posição de retomada em segundos (opcional). */
  startSeconds?: number;
  onReady?: (video: HTMLVideoElement) => void;
  onError?: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<'carregando' | 'pronto' | 'erro'>('carregando');
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !embedUrl) {
      setStatus('erro');
      setErroMsg('Nenhuma fonte de vídeo encontrada para este título.');
      return;
    }

    let cancelado = false;
    setStatus('carregando');
    setErroMsg(null);

    async function iniciar() {
      try {
        // 1. Resolve o HLS real via o backend do Movieflix.
        const resolvido = await resolverStreamBetterDireto(embedUrl, startSeconds);
        if (cancelado) return;

        if (!resolvido.success || !resolvido.url) {
          setStatus('erro');
          setErroMsg(resolvido.motivo === 'sem_stream_direto'
            ? 'Não foi possível preparar o vídeo agora. Nenhuma fonte reproduzível para este título.'
            : 'Não foi possível preparar o vídeo agora. Tente novamente em instantes.');
          onError?.(resolvido.motivo || 'sem_stream');
          return;
        }

        const hlsUrl = resolvido.url; // já prefixado com API_URL pelo resolver

        // 2. Reproduz o HLS.
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            // hls.js envia Origin; o proxy do backend responde com CORS aberto.
            xhrSetup: (xhr) => {
              xhr.withCredentials = false;
            },
          });
          hlsRef.current = hls;
          hls.loadSource(hlsUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelado) return;
            setStatus('pronto');
            onReady?.(video);
            // Retomada: pula para a posição salva.
            if (startSeconds && startSeconds > 0) {
              try { video.currentTime = startSeconds; } catch { /* ignora */ }
            }
            video.play().catch(() => undefined);
          });
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (cancelado) return;
            if (data.fatal) {
              setStatus('erro');
              setErroMsg('Não foi possível preparar o vídeo agora. Tente novamente.');
              onError?.(data.type);
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari / iOS: HLS nativo.
          video.src = hlsUrl;
          video.addEventListener('loadedmetadata', () => {
            if (cancelado) return;
            setStatus('pronto');
            onReady?.(video);
            if (startSeconds && startSeconds > 0) {
              try { video.currentTime = startSeconds; } catch { /* ignora */ }
            }
            video.play().catch(() => undefined);
          });
          video.addEventListener('error', () => {
            if (cancelado) return;
            setStatus('erro');
            setErroMsg('Não foi possível reproduzir o vídeo agora. Tente novamente.');
            onError?.('native_error');
          });
        } else {
          setStatus('erro');
          setErroMsg('Seu dispositivo não suporta reprodução HLS.');
          onError?.('hls_unsupported');
        }
      } catch (e) {
        if (cancelado) return;
        console.error('[NativeHlsPlayer] falha ao iniciar:', e);
        setStatus('erro');
        setErroMsg('Não foi possível preparar o vídeo agora. Tente novamente.');
        onError?.('network');
      }
    }

    iniciar();

    return () => {
      cancelado = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedUrl, startSeconds]);

  return (
    <div className="relative w-full h-full bg-black">
      <video
        ref={videoRef}
        data-mf-player
        data-player-src={embedUrl}
        className="w-full h-full"
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-white px-6 text-center">
          <AlertTriangle className="h-12 w-12 text-zinc-600" />
          <p className="text-sm text-zinc-300">{erroMsg}</p>
        </div>
      )}
    </div>
  );
}