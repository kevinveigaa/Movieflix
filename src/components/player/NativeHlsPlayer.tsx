import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Loader2, AlertTriangle, RefreshCw, Maximize, Minimize, ArrowLeft } from 'lucide-react';
import { resolverStreamBetterDireto } from '@/lib/streambetterDirect';

/**
 * Player do MovieFlix — NATIVO (HLS via backend, SEM iframe/embed).
 *
 * Estratégia (a mesma que o app nativo usa para tocar direto, sem Cloudflare):
 *
 *   O backend do MovieFlix resolve o HLS REAL do título via
 *   /api/streambetter-resolve (que consulta a API oficial de link direto
 *   /api/v1/stream do StreamBetter com a chave SECRETA sb_sk_* do plano API) e
 *   devolve a URL do m3u8 através do proxy /api/streambetter-hls (CORS aberto).
 *   O vídeo é tocado num <video> nativo + hls.js — SEM iframe, SEM embed, SEM
 *   verificação Cloudflare, SEM anúncios, SEM popup, SEM redirecionamento.
 *
 *   IMPORTANTE — NÃO há fallback automático para o embed oficial
 *   (streambetter.shop/filme/...). O embed passou a exigir verificação
 *   anti-bot Cloudflare Turnstile que NUNCA completa em navegadores modernos /
 *   WebView (cookies de terceiros bloqueados), deixando o usuário preso em
 *   "Verificando..." para sempre. Por isso o player usa EXCLUSIVAMENTE a rota
 *   oficial de API (que evita o desafio por design). Se o backend não conseguir
 *   resolver (ex.: chave secreta sb_sk_* não configurada), o player mostra um
 *   erro claro com o motivo real + "Tentar novamente" + "Voltar" — nunca cai
 *   no embed quebrado.
 *
 * Estados do player (nunca misturados):
 *   - 'carregando'  : resolvendo a fonte via backend (com timeout).
 *   - 'nativo'      : <video> + hls.js reproduzindo.
 *   - 'erro'        : erro amigável com motivo + retry + voltar.
 *
 * - FULLSCREEN: botão do MovieFlix chama a Fullscreen API real (com fallback
 *   CSS para WebView/Android que não expõem a API nativa).
 * - Sem bypass de proteção, sem pop-ups, sem redirecionamento externo.
 */

export function NativeHlsPlayer({
  embedUrl,
  startSeconds,
  onReady,
  onError,
  onBack,
}: {
  embedUrl: string;
  startSeconds?: number;
  onReady?: (video: HTMLVideoElement) => void;
  onError?: (msg: string) => void;
  onBack?: () => void;
}) {
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onBackRef = useRef(onBack);
  const [status, setStatus] = useState<'carregando' | 'nativo' | 'erro'>('carregando');
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onBackRef.current = onBack;
  }, [onReady, onError, onBack]);

  // Resolve a fonte via backend (rota oficial de API — sem iframe, sem Cloudflare).
  useEffect(() => {
    if (!embedUrl) {
      setStatus('erro');
      setErroMsg('Nenhuma fonte de vídeo encontrada para este título.');
      return;
    }

    let cancelado = false;

    async function carregar() {
      setStatus('carregando');
      setHlsUrl(null);

      const resultado = await resolverStreamBetterDireto(embedUrl, startSeconds);
      if (cancelado) return;

      if (resultado.success && resultado.url) {
        setHlsUrl(resultado.url);
        setStatus('nativo');
        return;
      }

      // Falha na resolução: mostra o motivo real (nunca cai no embed quebrado).
      const motivo = resultado.motivo || 'sem_stream_direto';
      const detalhe = resultado.detalhe || '';

      let msg: string;
      if (motivo === 'secret_key_required') {
        msg =
          'O provedor de vídeo não está configurado no servidor (falta a chave de API). ' +
          'Entre em contato com o administrador.';
      } else if (motivo === 'plan_api_ausente') {
        msg =
          'O plano de API do provedor de vídeo não está ativo. Entre em contato com o administrador.';
      } else if (motivo === 'http_404' || motivo === 'sem_stream_direto') {
        msg = 'Este título não está disponível no momento. Tente outro.';
      } else if (motivo === 'network') {
        msg = 'Falha de conexão ao carregar o vídeo. Verifique sua internet e tente novamente.';
      } else {
        msg = detalhe || 'Não foi possível carregar o vídeo. Tente novamente.';
      }

      setErroMsg(msg);
      setStatus('erro');
      onErrorRef.current?.(msg);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [embedUrl, startSeconds]);

  // Timeout de resolução: se o backend não responder em tempo razoável, sai do
  // estado 'carregando' e mostra erro — o usuário nunca fica preso indefinidamente.
  useEffect(() => {
    if (status !== 'carregando') return;
    const t = setTimeout(() => {
      setErroMsg(
        'O provedor de vídeo demorou para responder. Verifique sua conexão e tente novamente.',
      );
      setStatus('erro');
      onErrorRef.current?.('timeout');
    }, 20000);
    return () => clearTimeout(t);
  }, [status]);

  // Inicializa o hls.js no <video> nativo quando a URL HLS chega.
  useEffect(() => {
    if (status !== 'nativo' || !hlsUrl) return;
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let destroyed = false;
    // Handler do Safari/iOS: guardado para remover no cleanup (evita listener
    // duplicado / vazamento de memória ao remontar o player).
    let onLoadedMetadata: (() => void) | null = null;

    const tentarPlay = () => {
      const p = video.play();
      if (p) {
        p.catch(() => {
          // Autoplay bloqueado → muted fallback (sempre permitido).
          video.muted = true;
          video.play().catch(() => undefined);
        });
      }
    };

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (destroyed) return;
        if (startSeconds && startSeconds > 0) {
          try {
            video.currentTime = startSeconds;
          } catch {
            /* ignora */
          }
        }
        tentarPlay();
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (destroyed) return;
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              onErrorRef.current?.('Falha na reprodução do vídeo. Tente novamente.');
              setStatus('erro');
              setErroMsg('Falha na reprodução do vídeo. Tente novamente.');
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS: HLS nativo.
      video.src = hlsUrl;
      onLoadedMetadata = () => {
        if (destroyed) return;
        if (startSeconds && startSeconds > 0) {
          try {
            video.currentTime = startSeconds;
          } catch {
            /* ignora */
          }
        }
        tentarPlay();
      };
      video.addEventListener('loadedmetadata', onLoadedMetadata);
    } else {
      onErrorRef.current?.('Seu navegador não suporta reprodução de vídeo HLS.');
      setStatus('erro');
      setErroMsg('Seu navegador não suporta reprodução de vídeo HLS.');
      return;
    }

    onReadyRef.current?.(video);

    return () => {
      destroyed = true;
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
      if (onLoadedMetadata) {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        onLoadedMetadata = null;
      }
    };
  }, [status, hlsUrl, startSeconds]);

  // Acompanha o estado de tela cheia (Fullscreen API) para trocar o ícone.
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Alterna a tela cheia do CONTÊINER do player (funciona no browser e no
  // WebView do app via WebChromeClient.onShowCustomView). Fallback CSS quando
  // a Fullscreen API nativa não existe no ambiente.
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const elAny = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

    const emFullscreen = Boolean(document.fullscreenElement || doc.webkitFullscreenElement);

    try {
      if (emFullscreen) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      } else {
        if (el.requestFullscreen) {
          el.requestFullscreen();
        } else if (elAny.webkitRequestFullscreen) {
          elAny.webkitRequestFullscreen();
        } else {
          // Fallback CSS: sem Fullscreen API nativa, cobre a tela.
          el.classList.toggle('mf-fs-fallback');
          setIsFullscreen(el.classList.contains('mf-fs-fallback'));
        }
      }
    } catch {
      // Se a API falhar (ex.: permissão), tenta o fallback CSS.
      el.classList.toggle('mf-fs-fallback');
      setIsFullscreen(el.classList.contains('mf-fs-fallback'));
    }
  }, []);

  // Estado NATIVO: <video> + hls.js (sem iframe, sem Cloudflare, sem anúncios).
  if (status === 'nativo' && hlsUrl) {
    return (
      <div
        ref={containerRef}
        className="relative h-full w-full bg-black mf-player-container"
      >
        <video
          ref={videoRef}
          data-mf-player
          className="h-full w-full"
          controls
          playsInline
          autoPlay
          muted
          preload="auto"
        />
        {/* Botão de tela cheia do MovieFlix — Fullscreen API real com fallback. */}
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white opacity-80 transition hover:bg-black/70 hover:opacity-100"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      {status === 'carregando' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-white">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
          <p className="text-sm text-zinc-400">Preparando o vídeo…</p>
        </div>
      )}

      {status === 'erro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
          <AlertTriangle className="h-10 w-10 text-roxo-400" />
          <p className="text-sm text-zinc-300">{erroMsg}</p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                // Re-tenta a resolução completa (rota oficial de API).
                setStatus('carregando');
                setHlsUrl(null);
                requestAnimationFrame(() => {
                  resolverStreamBetterDireto(embedUrl, startSeconds)
                    .then((r) => {
                      if (r.success && r.url) {
                        setHlsUrl(r.url);
                        setStatus('nativo');
                      } else {
                        setErroMsg(
                          r.detalhe || 'Não foi possível carregar o vídeo. Tente novamente.',
                        );
                        setStatus('erro');
                      }
                    })
                    .catch(() => {
                      // Falha de rede/erro inesperado: volta ao estado de erro.
                      setStatus('erro');
                      setErroMsg('Não foi possível carregar o vídeo. Tente novamente.');
                    });
              });
            }}
            className="btn-primary text-xs"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
          {onBack && (
            <button
              type="button"
              onClick={() => onBackRef.current?.()}
              className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white transition hover:bg-white/20"
            >
              <ArrowLeft className="mr-1 inline h-4 w-4" /> Voltar
            </button>
          )}
        </div>
      </div>
      )}
    </div>
  );
}