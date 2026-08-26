import { Link } from 'react-router-dom';
import { Crown, Lock, Timer } from 'lucide-react';

/**
 * Overlay do teste grátis de 20 segundos (usuários SEM assinatura).
 *
 * - mode="countdown": contagem regressiva discreta no canto do player.
 * - mode="blocked":  bloqueio NÃO-dispensável cobrindo o player inteiro.
 *   A única saída é assinar ou voltar — recarregar a página, trocar de rota
 *   ou abrir em outro aparelho NÃO libera, porque a autorização do stream é
 *   validada NO SERVIDOR (/api/trial-gate) contra trial_sessions (por conta).
 */
export function TrialOverlay({
  mode,
  remaining,
  total = 20,
}: {
  mode: 'countdown' | 'blocked';
  remaining?: number;
  total?: number;
}) {
  if (mode === 'countdown') {
    const secs = Math.max(0, Math.ceil(remaining ?? 0));
    return (
      <div
        className="pointer-events-none fixed top-24 right-4 z-40 flex items-center gap-2 rounded-full border border-amber-500/40 bg-black/80 px-4 py-2 text-xs font-semibold text-amber-300 backdrop-blur"
        data-trial-countdown
      >
        <Timer className="h-4 w-4 animate-pulse" />
        Teste grátis: {secs}s restantes
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      data-playback-blocked
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-6 text-center shadow-2xl">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-600/15 ring-1 ring-red-500/40">
          <Lock className="h-7 w-7 text-red-400" />
        </span>
        <h3 className="mt-4 text-lg font-bold text-white">Fim do teste grátis</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Você testou os primeiros 20 segundos. Assine o MovieFlix para continuar
          assistindo de onde parou — sem anúncios e com todos os benefícios do seu plano.
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          <Link
            to="/minha-assinatura"
            data-tv-focusable
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-brand-600 to-roxo-600 px-4 py-3 text-sm font-semibold text-white transition hover:from-brand-500 hover:to-roxo-500"
          >
            <Crown className="h-4 w-4" />
            Assinar agora
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-white/20"
          >
            <Timer className="h-3.5 w-3.5" />
            Já assinei — verificar
          </button>
        </div>
      </div>
    </div>
  );
}
