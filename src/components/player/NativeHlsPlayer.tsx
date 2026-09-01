import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { resolverStreamBetterDireto } from '@/lib/streambetterDirect';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Player nativo do MovieFlix.
 *
 * Reproduz APENAS o HLS resolvido pela API oficial de link direto do
 * StreamBetter (backend → /api/v1/stream com a chave secreta sb_sk_*) em um
 * <video> HTML5 + hls.js. NENHUM iframe/embed do StreamBetter é montado:
 * o embed oficial passou a exigir verificação anti-bot (Cloudflare Turnstile)
 * para todos os títulos e ficava preso na verificação — removido por completo.
 *
 * - Player nativo HLS é a ÚNICA opção de reprodução.
 * - Autoplay com fallback muted (política de autoplay do navegador).
 * - Tema vermelho/roxo nos estados de carregamento/erro.
 * - Sem pop-ups, sem redirecionamento externo, sem bypass de proteção.
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
  const [tentativa, setTentativa] = useState(0);

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
          // Sem fonte direta: o embed oficial NÃO é mais usado como fallback
          // (ele exige verificação Cloudflare anti-bot e fica preso em loop).
          // Mostra uma mensagem clara e estável — sem iframe, sem re-tentativa
          // automática, sem redirecionamento.
          if (resolvido.motivo === 'secret_key_required') {
            marcarErro(
              'Streaming direto indisponível: a chave de API do StreamBetter (sb_sk_*) não está configurada no servidor. Configure STREAMBETTER_API_KEY no Render para ativar a reprodução.',
              resolvido.motivo,
            );
          } else if (resolvido.motivo === 'plan_api_ausente') {
            marcarErro(
              'Streaming direto indisponível: o plano atual do StreamBetter não inclui a API de link direto (plano API necessário).',
              resolvido.motivo,
            );
          } else if (resolvido.motivo === 'sem_stream_direto') {
            marcarErro(
              'Não há uma fonte dublada em PT-BR reproduzível para este título.',
              resolvido.motivo,
            );
          } else {
            marcarErro(
              'Não foi possível preparar o vídeo agora. Tente novamente em instantes.',
              resolvido.motivo || 'sem_stream',
            );
          }
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
          // AUTOPLAY ROBUSTO: tenta reproduzir com som; se o navegador bloquear
          // (política de autoplay), tenta muted autoplay — que é sempre
          // permitido — e restaura o som no primeiro toque/play do usuário.
          const tentarAutoplay = () => {
            const p = currentVideo.play();
            if (p) {
              p.catch(() => {
                currentVideo.muted = true;
                currentVideo.play().catch(() => undefined);
              });
            }
          };
          tentarAutoplay();
          // Se o autoplay foi forçado mudo, restaura o som quando o usuário
          // interagir com o player (play manual / clique).
          const restaurarSom = () => {
            if (currentVideo.muted) {
              currentVideo.muted = false;
            }
          };
          currentVideo.addEventListener('play', restaurarSom, { once: true });
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
            if (data.fatal) {
              marcarErro(
                'Não foi possível reproduzir o vídeo agora. Tente novamente.',
                `hls_${data.type}`,
              );
            }
          });
        } else if (currentVideo.canPlayType('application/vnd.apple.mpegurl')) {
          currentVideo.src = hlsUrl;
          currentVideo.addEventListener('loadedmetadata', prepararVideo, { once: true });
          currentVideo.addEventListener(
            'error',
            () => marcarErro('Não foi possível reproduzir o vídeo agora. Tente novamente.', 'native_error'),
            { once: true },
          );
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
  }, [embedUrl, startSeconds, tentativa]);

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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-ink-950/80 via-roxo-950/60 to-ink-950/80 text-white">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
          <p className="text-sm text-zinc-300">Preparando o vídeo…</p>
        </div>
      )}

      {status === 'erro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-ink-950/90 via-roxo-950/70 to-ink-950/90 px-6 text-center text-white">
          <AlertTriangle className="h-12 w-12 text-roxo-400" />
          <p className="text-sm text-zinc-300">{erroMsg}</p>
          <button
            type="button"
            onClick={() => setTentativa((t) => t + 1)}
            className="btn-primary text-xs"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
