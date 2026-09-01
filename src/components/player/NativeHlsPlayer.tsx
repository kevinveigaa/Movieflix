import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Player do MovieFlix — EMBED OFICIAL do StreamBetter (plano Creator).
 *
 * Estratégia: 100% embed oficial do StreamBetter com a chave PÚBLICA (sb_pk_*).
 * O plano Creator do StreamBetter funciona assim: a chave pública usada no
 * embed oficial remove anúncios e libera download. NÃO há stream direto, NÃO
 * há API de link m3u8, NÃO há chave secreta (sb_sk_*) — o embed é a via única
 * e correta para o plano Creator.
 *
 *   Filmes : https://streambetter.shop/filme/{tmdbId}?key=sb_pk_...
 *   Séries : https://streambetter.shop/serie/{tmdbId}/{temporada}/{episodio}?key=sb_pk_...
 *
 * O embed oficial exibe a verificação anti-bot Cloudflare Turnstile
 * ("Confirmando que você é uma pessoa de verdade..."). Isso é o comportamento
 * LEGÍTIMO do provedor e NÃO deve ser contornado. Para o Turnstile completar
 * naturalmente e o vídeo tocar e PERMANECER tocando, o iframe é montado UMA
 * ÚNICA vez por sessão de reprodução:
 *   - SEM atributo `sandbox` (a documentação do StreamBetter bloqueia o
 *     conteúdo se detectar sandbox, deixando preso na verificação);
 *   - SEM force-close (fechar o embed durante a verificação legítima cria o
 *     loop percebido embed → verificação → erro → retry → embed);
 *   - SEM re-trigger / re-mount (o iframe NÃO é recriado nem recarregado pelo
 *     nosso código — o `src` é estável e montado uma vez);
 *   - O `key` do iframe é estável (não muda), então o React não re-monta.
 *
 * O embed roda DENTRO do MovieFlix (iframe), sem pop-up e sem redirecionamento
 * externo. O botão de download (benefício do plano Creator) aparece no player
 * do provedor quando disponível.
 *
 * - SEM overlay próprio do MovieFlix sobre o vídeo: o vídeo ocupa toda a área
 *   do player. Nenhum badge/etiqueta "Reproduzindo via StreamBetter" é criado.
 * - FULLSCREEN: o iframe mantém `allow="fullscreen"` e `allowFullScreen`, então
 *   o botão de tela cheia NATIVO do player do StreamBetter funciona de verdade
 *   (Fullscreen API do embed). NÃO criamos botão próprio do MovieFlix sobre o
 *   iframe — o usuário quer apenas o botão do player original.
 * - Tema vermelho/roxo apenas nos estados de carregamento/erro do MovieFlix.
 *   O embed em si é o padrão do StreamBetter (sem personalização accent/brand).
 * - Sem bypass de proteção, sem pop-ups, sem redirecionamento externo.
 */

// Chave PÚBLICA do StreamBetter (plano Creator) — não é segredo, pode ir no
// bundle. Usada no embed oficial. Vem do render.yaml.
const STREAMBETTER_PUBLIC_KEY =
  (import.meta.env.VITE_STREAMBETTER_PUBLIC_KEY as string) ||
  'sb_pk_19fe7c75a49585cd84ced96806703a2176768fa4f77a7ea4';

/**
 * Anexa a chave pública e o idioma pt-BR a uma URL de embed do StreamBetter.
 * NÃO adiciona personalização (accent/surface/brand) — o embed é o padrão do
 * provedor, como o usuário pediu.
 */
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
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  // Guarda o embed: só monta UMA vez por sessão de reprodução. Resetada quando
  // embedUrl/startSeconds mudam (novo título/episódio).
  const embedMontadoRef = useRef(false);
  const [status, setStatus] = useState<'carregando' | 'embed' | 'erro'>('carregando');
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onReady, onError]);

  useEffect(() => {
    if (!embedUrl) {
      setStatus('erro');
      setErroMsg('Nenhuma fonte de vídeo encontrada para este título.');
      return;
    }

    // Monta o embed oficial do StreamBetter UMA única vez por sessão.
    // O `src` é estável e o iframe não é recriado nem recarregado pelo nosso
    // código — o Turnstile completa naturalmente e o vídeo toca e permanece.
    if (!embedMontadoRef.current) {
      embedMontadoRef.current = true;
      setEmbedSrc(embedComChave(embedUrl));
      setStatus('embed');
    }
  }, [embedUrl, startSeconds]);

  // Estado EMBED: o iframe oficial do StreamBetter (via única de reprodução).
  // O iframe tem `allowFullScreen` + `allow="...fullscreen..."` para que o
  // botão de tela cheia NATIVO do player do embed funcione de verdade. Nenhum
  // overlay/botão do MovieFlix é colocado sobre o iframe.
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
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      {status === 'carregando' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-ink-950/80 via-roxo-950/60 to-ink-950/80 text-white">
          <Loader2 className="h-10 w-10 animate-spin text-brand-500" />
          <p className="text-sm text-zinc-300">Preparando o vídeo…</p>
        </div>
      )}

      {status === 'erro' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-ink-950/90 via-roxo-950/70 to-ink-950/90 px-6 text-center text-white">
          <AlertTriangle className="h-10 w-10 text-roxo-400" />
          <p className="text-sm text-zinc-300">{erroMsg}</p>
          <button
            type="button"
            onClick={() => {
              embedMontadoRef.current = false;
              setStatus('carregando');
              setEmbedSrc(null);
              requestAnimationFrame(() => {
                embedMontadoRef.current = true;
                setEmbedSrc(embedComChave(embedUrl));
                setStatus('embed');
              });
            }}
            className="btn-primary text-xs"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}