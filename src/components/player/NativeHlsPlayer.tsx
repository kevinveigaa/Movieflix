import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { resolverStreamBetterDireto } from '@/lib/streambetterDirect';
import { Loader2, AlertTriangle, RefreshCw, KeyRound, Play } from 'lucide-react';

/**
 * Player nativo do MovieFlix.
 *
 * Estratégia em duas camadas (plano Creator do StreamBetter = chave pública):
 *
 * 1) STREAM DIRETO (primeira opção): pede ao backend o m3u8 via a API oficial
 *    de link direto (/api/v1/stream, chave SECRETA sb_sk_*). Quando a chave
 *    secreta está configurada no backend, o vídeo toca num <video> nativo +
 *    hls.js, SEM iframe e SEM Cloudflare.
 *
 * 2) EMBED OFICIAL (fallback ÚNICO): quando o stream direto não está
 *    disponível (plano Creator / sem chave secreta / plan_missing_feature),
 *    monta o embed oficial do StreamBetter com a chave pública (sb_pk_*), que
 *    é o que o plano Creator oferece (remove anúncios e libera download).
 *
 *    O embed oficial exibe a verificação anti-bot Cloudflare Turnstile
 *    ("Confirmando que você é uma pessoa de verdade..."). Isso é o
 *    comportamento LEGÍTIMO do provedor e NÃO deve ser contornado. Para o
 *    Turnstile completar naturalmente e o vídeo tocar, o iframe é montado UMA
 *    ÚNICA vez por sessão de reprodução:
 *      - SEM atributo `sandbox` (a documentação do StreamBetter bloqueia o
 *        conteúdo se detectar sandbox, deixando preso na verificação);
 *      - SEM force-close (fechar o embed durante a verificação legítima cria
 *        o loop percebido embed → verificação → erro → retry → embed);
 *      - SEM re-trigger / re-mount (o iframe não é recriado nem recarregado
 *        pelo nosso código — o `src` é estável e montado uma vez).
 *    O embed roda DENTRO do MovieFlix (iframe), sem pop-up e sem
 *    redirecionamento externo.
 *
 * - Autoplay com fallback muted (política de autoplay do navegador).
 * - Tema vermelho/roxo nos estados de carregamento/erro e no fallback.
 * - Sem bypass de proteção, sem pop-ups, sem redirecionamento externo.
 */

// Chave PÚBLICA do StreamBetter (plano Creator) — não é segredo, pode ir no
// bundle. Usada no embed oficial (fallback). Vem do render.yaml.
const STREAMBETTER_PUBLIC_KEY =
  (import.meta.env.VITE_STREAMBETTER_PUBLIC_KEY as string) ||
  'sb_pk_19fe7c75a49585cd84ced96806703a2176768fa4f77a7ea4';

/** Anexa a chave pública e o idioma pt-BR a uma URL de embed do StreamBetter. */
function embedComChave(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('key', STREAMBETTER_PUBLIC_KEY);
    u.searchParams.set('lang', 'pt-BR');
    return u.toString();
  } catch {
    return url;
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
  // Guarda o fallback do embed: só monta UMA vez por sessão de reprodução.
  // Resetada quando embedUrl/startSeconds mudam (novo título/episódio).
  const fallbackTentadoRef = useRef(false);
  const [status, setStatus] = useState<'carregando' | 'pronto' | 'erro' | 'embed'>('carregando');
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [erroTipo, setErroTipo] = useState<string | null>(null);
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
    setErroTipo(null);
    setEmbedSrc(null);

    const marcarErro = (mensagem: string, codigo: string) => {
      if (cancelado) return;
      setStatus('erro');
      setErroMsg(mensagem);
      setErroTipo(codigo);
      onErrorRef.current?.(codigo);
    };

    // Monta o embed oficial do StreamBetter (fallback único, 1x por sessão).
    const abrirEmbed = () => {
      if (cancelado || fallbackTentadoRef.current) return;
      fallbackTentadoRef.current = true;
      setEmbedSrc(embedComChave(embedUrl));
      setStatus('embed');
    };

    async function iniciar() {
      try {
        const resolvido = await resolverStreamBetterDireto(embedUrl, startSeconds);
        if (cancelado) return;

        if (!resolvido.success || !resolvido.url) {
          // Sem stream direto (plano Creator / sem chave secreta). Abre o embed
          // oficial UMA vez — a via legítima do plano Creator.
          abrirEmbed();
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
          // AUTOPLAY ROBUSTO: tenta com som; se o navegador bloquear, tenta
          // muted autoplay (sempre permitido) e restaura o som no 1º play.
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
              // Erro fatal no HLS direto → cai no embed oficial (1x).
              abrirEmbed();
            }
          });
        } else if (currentVideo.canPlayType('application/vnd.apple.mpegurl')) {
          currentVideo.src = hlsUrl;
          currentVideo.addEventListener('loadedmetadata', prepararVideo, { once: true });
          currentVideo.addEventListener(
            'error',
            () => abrirEmbed(),
            { once: true },
          );
        } else {
          abrirEmbed();
        }
      } catch (error) {
        if (cancelado) return;
        console.error('[NativeHlsPlayer] falha ao iniciar:', error);
        abrirEmbed();
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

  // Estado EMBED: o iframe oficial do StreamBetter (fallback único).
  if (status === 'embed' && embedSrc) {
    return (
      <div className="relative h-full w-full bg-black">
        <iframe
          key={embedSrc}
          src={embedSrc}
          title="StreamBetter"
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="origin"
          loading="eager"
        />
        {/* Badge discreto do fallback (tema vermelho/roxo) */}
        <div className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-roxo-500/40 bg-roxo-950/70 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-roxo-200 backdrop-blur">
          <Play className="mr-1 inline h-3 w-3" fill="currentColor" />
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
          {erroTipo === 'secret_key_required' || erroTipo === 'plan_api_ausente' ? (
            <KeyRound className="h-12 w-12 text-roxo-400" />
          ) : (
            <AlertTriangle className="h-12 w-12 text-roxo-400" />
          )}
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