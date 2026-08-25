import { useEffect, useState } from 'react';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import { APP_INFO, haVersaoNova, marcarVersaoVista } from '@/lib/appInfo';

/**
 * Aviso "Nova versão disponível" (pedido do dono).
 *
 * - Aparece UMA vez quando o usuário volta ao site/app depois de uma
 *   atualização importante (a versão atual é mais nova que a última vista).
 * - Não incomoda em primeira visita (só mostra quando já havia uma versão
 *   anterior registrada e a atual subiu).
 * - Botão "ATUALIZAR" recarrega a página (no WebView do APK isso já pega o
 *   site novo; o service worker também força update a cada 30min).
 * - O "X" dispensa e marca a versão como vista (não volta a mostrar até a
 *   próxima atualização).
 */
export function UpdateChecker() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    // Só avalia depois do primeiro render (localStorage disponível).
    const t = window.setTimeout(() => {
      if (haVersaoNova()) setVisivel(true);
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);

  if (!visivel) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[calc(100vw-2rem)] max-w-sm animate-fade-in-fast rounded-2xl border border-brand-500/40 bg-ink-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/20 text-brand-400">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">
            Nova versão disponível
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {APP_INFO.name} v{APP_INFO.version} já está no ar com novidades.
            Atualize para aproveitar.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                marcarVersaoVista();
                window.location.reload();
              }}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-brand-500"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              ATUALIZAR
            </button>
            <button
              onClick={() => {
                marcarVersaoVista();
                setVisivel(false);
              }}
              className="rounded-lg px-3 py-2 text-xs font-medium text-ink-300 transition hover:bg-white/10 hover:text-white"
            >
              Agora não
            </button>
          </div>
        </div>
        <button
          onClick={() => {
            marcarVersaoVista();
            setVisivel(false);
          }}
          aria-label="Fechar aviso"
          className="shrink-0 rounded-full p-1 text-ink-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
