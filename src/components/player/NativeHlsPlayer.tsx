import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { resolverStreamBetterDireto } from '@/lib/streambetterDirect';
import { comChavePublica, ehEmbedStreamBetter } from '@/lib/strembetter';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

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
  // TRAVA ANTI-LOOP: o fallback do embed oficial do StreamBetter só pode ser
  // tentado UMA vez por sessão de reprodução. Sem essa trava, um erro fatal do
  // HLS (ou uma falha do resolver) re-disparava o fallback em ciclo infinito
  // (nativo → embed → erro → nativo → ...), travando o player em recarregamentos.
  const fallbackTentadoRef = useRef(false);
  const [status, setStatus] = useState<'carregando' | 'pronto' | 'erro' | 'oficial'>('carregando');
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  // Embed OFICIAL do StreamBetter (com a chave pública), aberto DENTRO do
  // MovieFlix quando o resolver do backend não consegue a fonte direta.
  const [embedOficial, setEmbedOficial] = useState<string | null>(null);
  const [verificacaoPendente, setVerificacaoPendente] = useState(false);
  const [tentativaEmbed, setTentativaEmbed] = useState(0);

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
    let embedAtivo = false;
    setStatus('carregando');
    setErroMsg(null);
    setEmbedOficial(null);
    setVerificacaoPendente(false);
    // Nova sessão de reprodução: libera a trava para que o fallback possa ser
    // tentado UMA vez neste ciclo (e apenas uma).
    fallbackTentadoRef.current = false;

    // Caminho oficial de integração: o embed do provedor com a chave pública,
    // carregado pelo navegador do usuário no domínio autorizado. Não é bypass —
    // é o formato documentado pelo StreamBetter, e a verificação anti-bot é
    // resolvida normalmente pelo navegador real.
    const usarEmbedOficial = (codigo: string) => {
      if (cancelado) return false;
      if (!ehEmbedStreamBetter(embedUrl)) return false;
      // TRAVA ANTI-LOOP: se o fallback já foi tentado nesta sessão, NÃO tenta
      // de novo — cai no estado de erro estável (sem re-triggerar o embed).
      if (fallbackTentadoRef.current) return false;
      fallbackTentadoRef.current = true;
      setEmbedOficial(comChavePublica(embedUrl, startSeconds));
      embedAtivo = true;
      // O iframe executa a verificação legítima do provedor no navegador.
      // Não tentamos automatizar nem contornar esse processo.
      setVerificacaoPendente(true);
      setStatus('oficial');
      onErrorRef.current?.(`fallback_embed_oficial:${codigo}`);
      return true;
    };

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
          // Uma requisição servidor→servidor nunca resolve a verificação
          // humana do provedor; nesse caso usamos o embed oficial com a chave
          // pública, que roda no navegador do usuário.
          if (usarEmbedOficial(resolvido.motivo || 'sem_stream')) return;
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
            if (data.fatal && !usarEmbedOficial(`hls_${data.type}`)) {
              marcarErro('Não foi possível reproduzir o vídeo agora. Tente novamente.', data.type);
            }
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
        if (!usarEmbedOficial('network')) {
          marcarErro('Não foi possível preparar o vídeo agora. Tente novamente.', 'network');
        }
      }
    }

    iniciar();

    // Não é possível inspecionar a página do provedor dentro de um iframe de
    // outro domínio. Para não deixar a pessoa presa em recarregamentos do
    // desafio do provedor, interrompemos apenas a apresentação após 25s.
    // A nova tentativa é sempre manual, sem automatizar a verificação.
    const limiteVerificacao = window.setTimeout(() => {
      if (!cancelado && embedAtivo) {
        setStatus('erro');
        setEmbedOficial(null);
        setVerificacaoPendente(false);
        setErroMsg('A verificação do StreamBetter não foi concluída. Tente novamente ou use outra fonte quando disponível.');
      }
    }, 25_000);

    return () => {
      window.clearTimeout(limiteVerificacao);
      cancelado = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      currentVideo.pause();
      currentVideo.removeAttribute('src');
      currentVideo.load();
    };
  }, [embedUrl, startSeconds, tentativaEmbed]);

  if (status === 'oficial' && embedOficial) {
    return (
      <div className="relative h-full w-full bg-black">
        {/* Embed OFICIAL do StreamBetter com a chave pública do MovieFlix.
            Fica dentro do MovieFlix (sem allow-popups e sem
            allow-top-navigation → o provedor não redireciona o usuário). */}
        <iframe
          title="Player StreamBetter"
          src={embedOficial}
          data-mf-player
          data-player-src={embedOficial}
          className="h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
        />
        {verificacaoPendente && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-center text-xs text-zinc-300">
            O StreamBetter pode solicitar uma verificação de segurança no próprio player.
          </div>
        )}
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white">
          <Loader2 className="h-10 w-10 animate-spin text-red-600" />
          <p className="text-sm text-zinc-300">Preparando o vídeo…</p>
        </div>
      )}

      {status === 'erro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center text-white">
          <AlertTriangle className="h-12 w-12 text-zinc-600" />
          <p className="text-sm text-zinc-300">{erroMsg}</p>
          <button
            type="button"
            onClick={() => setTentativaEmbed((tentativa) => tentativa + 1)}
            className="btn-primary text-xs"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}