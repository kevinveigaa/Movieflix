import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { resolverStreamBetterDireto } from '@/lib/streambetterDirect';
import { Loader2, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';

/**
 * Player nativo do MovieFlix.
 *
 * Reproduz o HLS resolvido pela API oficial de link direto do StreamBetter
 * (backend → /api/v1/stream com a chave secreta sb_sk_*) em um <video> HTML5 +
 * hls.js. Quando a API direta não está disponível (ex.: o plano atual não
 * inclui a API de link direto, retornando plan_missing_feature), o player abre
 * o embed OFICIAL do StreamBetter como fallback ÚNICO — carregado UMA vez por
 * sessão, sem loop, sem force-close que interrompa a verificação legítima.
 *
 * - Player nativo HLS é a PRIMEIRA opção.
 * - Embed oficial do StreamBetter é o fallback (1x por sessão).
 * - Autoplay com fallback muted (política de autoplay do navegador).
 * - Tema vermelho/roxo nos estados de carregamento/erro e no fallback.
 * - Sem pop-ups, sem redirecionamento externo, sem bypass de proteção.
 */

// Chave PÚBLICA do StreamBetter (sb_pk_*) — usada SOMENTE no embed oficial que
// roda no navegador. Nunca é uma chave secreta; não vai para o backend.
const STREAMBETTER_PUBLIC_KEY =
  (import.meta.env.VITE_STREAMBETTER_PUBLIC_KEY as string) ||
  'sb_pk_331739a18c650ce0f4c56ebcc34c39630485ffa7366a1ed5';

/** Monta a URL do embed oficial do StreamBetter com a chave pública e pt-BR. */
function embedOficialComChave(embedUrl: string): string {
  try {
    const u = new URL(embedUrl);
    u.searchParams.set('key', STREAMBETTER_PUBLIC_KEY);
    u.searchParams.set('lang', 'pt-BR');
    return u.toString();
  } catch {
    return embedUrl;
  }
}

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
  // Trava anti-loop: o fallback do embed oficial só é tentado UMA vez por
  // sessão de reprodução. Resetada quando o embedUrl/startSeconds muda.
  const fallbackTentadoRef = useRef(false);
  const [status, setStatus] = useState<'carregando' | 'pronto' | 'erro' | 'embed'>('carregando');
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);

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
    setEmbedSrc(null);

    const marcarErro = (mensagem: string, codigo: string) => {
      if (cancelado) return;
      setStatus('erro');
      setErroMsg(mensagem);
      onErrorRef.current?.(codigo);
    };

    // Abre o embed oficial do StreamBetter como fallback ÚNICO (1x por sessão).
    // O embed roda dentro do MovieFlix (iframe), sem pop-up e sem redirecionar
    // para fora. Não há force-close: a verificação legítima pode terminar.
    const abrirEmbedOficial = (motivo: string) => {
      if (cancelado) return;
      if (fallbackTentadoRef.current) {
        // Já tentamos o embed nesta sessão — não re-trigger (evita loop).
        marcarErro(
          'Não foi possível reproduzir o vídeo agora. Tente novamente.',
          motivo,
        );
        return;
      }
      fallbackTentadoRef.current = true;
      setEmbedSrc(embedOficialComChave(embedUrl));
      setStatus('embed');
      onErrorRef.current?.(motivo);
    };

    async function iniciar() {
      try {
        const resolvido = await resolverStreamBetterDireto(embedUrl, startSeconds);
        if (cancelado) return;

        if (!resolvido.success || !resolvido.url) {
          // Sem fonte direta: abre o embed oficial como fallback único.
          // Motivos de configuração (chave secreta ausente / plano sem API)
          // também caem no embed — é a única via legítima com a chave pública.
          abrirEmbedOficial(resolvido.motivo || 'sem_stream_direto');
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
              // Erro fatal do HLS → fallback único do embed oficial.
              abrirEmbedOficial(`hls_${data.type}`);
            }
          });
        } else if (currentVideo.canPlayType('application/vnd.apple.mpegurl')) {
          currentVideo.src = hlsUrl;
          currentVideo.addEventListener('loadedmetadata', prepararVideo, { once: true });
          currentVideo.addEventListener(
            'error',
            () => abrirEmbedOficial('native_error'),
            { once: true },
          );
        } else {
          abrirEmbedOficial('hls_unsupported');
        }
      } catch (error) {
        if (cancelado) return;
        console.error('[NativeHlsPlayer] falha ao iniciar:', error);
        abrirEmbedOficial('network');
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

  // Fallback do embed oficial do StreamBetter (dentro do MovieFlix).
  if (status === 'embed' && embedSrc) {
    return (
      <div className="relative h-full w-full bg-black">
        <iframe
          src={embedSrc}
          title="StreamBetter"
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="origin"
        />
        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-roxo-950/80 px-3 py-1 text-[10px] font-semibold text-roxo-200 ring-1 ring-roxo-500/40">
          <ExternalLink className="h-3 w-3" />
          Reproduzindo via StreamBetter
        </div>
      </div>
    );
  }

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