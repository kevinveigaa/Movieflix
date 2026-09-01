import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, RefreshCw, Maximize, Minimize, ArrowLeft } from 'lucide-react';
import { ehEmbedStreamBetter } from '@/lib/streamEmbed';

/**
 * StreamBetterEmbed — player do MovieFlix via EMBED OFICIAL do StreamBetter
 * (plano Creator, chave pública sb_pk_*).
 *
 * O MovieFlix NÃO resolve HLS via backend (isso exigiria o plano API / chave
 * secreta sb_sk_*). Em vez disso, monta o iframe oficial do provedor com a
 * chave pública na URL. O StreamBetter controla player, fontes, legendas,
 * qualidade, fallback e reprodução — o MovieFlix apenas hospeda o iframe.
 *
 * Estados (nunca misturados):
 *   - 'carregando' : iframe iniciando (loading discreto por trás).
 *   - 'player'     : iframe visível (o provedor controla a reprodução).
 *   - 'erro'       : o iframe não pôde ser montado (URL inválida) — erro
 *                    amigável + "Tentar novamente" + "Voltar".
 *
 * IMPORTANTE — NÃO há timeout que mate o iframe: o embed pode levar tempo
 * para inicializar (o provedor resolve fontes/legendas). O timeout só existiria
 * para uma operação do PRÓPRIO MovieFlix que pudesse travar — aqui não há
 * nenhuma. O iframe fica no ar até o provedor responder ou o usuário sair.
 *
 * FULLSCREEN: o iframe tem allowfullscreen + allow="autoplay; encrypted-media;
 * picture-in-picture; fullscreen". O botão do MovieFlix também chama a
 * Fullscreen API real (com fallback CSS para WebView/Android).
 *
 * NÃO usamos sandbox: o embed oficial do StreamBetter precisa de recursos
 * (cookies, storage, mídia) que o sandbox bloquearia. A proteção contra
 * navegação externa/anúncios é feita pelo antiAds global (src/lib/antiAds.ts).
 */

export function StreamBetterEmbed({
  embedUrl,
  onBack,
}: {
  embedUrl: string;
  onBack?: () => void;
}) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const [status, setStatus] = useState<'carregando' | 'player' | 'erro'>('carregando');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Valida a URL: só monta o iframe para embeds oficiais do StreamBetter.
  useEffect(() => {
    if (!embedUrl || !ehEmbedStreamBetter(embedUrl)) {
      setStatus('erro');
      return;
    }
    setStatus('carregando');
  }, [embedUrl]);

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

  // Estado ERRO: URL inválida / embed não reconhecido.
  if (status === 'erro') {
    return (
      <div className="relative h-full w-full bg-black">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white">
          <AlertTriangle className="h-10 w-10 text-roxo-400" />
          <p className="text-sm text-zinc-300">
            Não foi possível carregar o player. Verifique sua conexão e tente novamente.
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                // Re-tenta montar o iframe (recria o estado de carregamento).
                setStatus('carregando');
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
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-black mf-player-container"
    >
      {/* Loading discreto por trás do iframe (some quando o embed carrega). */}
      {status === 'carregando' && (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-3 bg-black text-white">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
          <p className="text-sm text-zinc-400">Carregando o player…</p>
        </div>
      )}

      {/* Embed oficial do StreamBetter (plano Creator). */}
      <iframe
        ref={iframeRef}
        key={embedUrl}
        src={embedUrl}
        title="Player de vídeo"
        className="relative z-10 h-full w-full border-0"
        frameBorder={0}
        allowFullScreen
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        onLoad={() => setStatus('player')}
      />

      {/* Botão de tela cheia do MovieFlix — Fullscreen API real com fallback. */}
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white opacity-80 transition hover:bg-black/70 hover:opacity-100"
      >
        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
      </button>
    </div>
  );
}