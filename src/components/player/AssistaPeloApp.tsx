import { useNavigate } from 'react-router-dom';
import { Smartphone, Download, ArrowLeft, Clapperboard, MonitorSmartphone } from 'lucide-react';
import { montarDeepLink, abrirAppLink } from '@/lib/deepLink';
import { DOWNLOAD_PAGE_URL } from '@/lib/appInfo';

/**
 * AssistaPeloApp — tela EXCLUSIVA do SITE.
 *
 * Quando o usuário usa o MovieFlix pelo navegador e clica em "Assistir"
 * (filme ou série), o site NÃO cria iframe de player, NÃO carrega fonte de
 * vídeo, NÃO inicia Cloudflare nem embed. Em vez disso, mostra este convite:
 *
 *   🎬 ASSISTA PELO APLICATIVO
 *   Para uma melhor experiência e reprodução mais rápida, assista pelo
 *   aplicativo MovieFlix.
 *
 *   [📱 ABRIR APLICATIVO]   [⬇️ BAIXAR APLICATIVO]
 *
 * - "ABRIR APLICATIVO" tenta abrir o app via deep link (preservando o título
 *   escolhido). Se o app não estiver instalado, cai para a página de download.
 * - "BAIXAR APLICATIVO" leva à página oficial de download.
 *
 * DENTRO do app esta tela NUNCA aparece (o app reproduz normalmente).
 */
export function AssistaPeloApp({
  titulo,
  id,
  season,
  episode,
}: {
  titulo?: string | null;
  id: string;
  season?: number | string | null;
  episode?: number | string | null;
}) {
  const navigate = useNavigate();

  const abrirApp = () => {
    const link = montarDeepLink({ id, season, episode, tipo: 'assistir' });
    abrirAppLink(link);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center text-white">
      <div className="w-full max-w-md">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-600 to-roxo-600 shadow-2xl shadow-roxo-900/40">
          <Clapperboard className="h-10 w-10 text-white" />
        </div>

        <h1 className="mt-6 font-display text-2xl font-bold tracking-wide sm:text-3xl">
          🎬 ASSISTA PELO APLICATIVO
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">
          Para uma melhor experiência e reprodução mais rápida, assista pelo
          aplicativo <span className="font-semibold text-white">MovieFlix</span>.
        </p>

        {titulo && (
          <p className="mt-2 text-xs text-zinc-500">
            <MonitorSmartphone className="mr-1 inline h-3.5 w-3.5" />
            {titulo}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={abrirApp}
            data-tv-focusable
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-roxo-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-roxo-900/40 transition hover:from-brand-500 hover:to-roxo-500 active:scale-[0.98]"
          >
            <Smartphone className="h-5 w-5" />
            📱 ABRIR APLICATIVO
          </button>

          <a
            href={DOWNLOAD_PAGE_URL}
            data-tv-focusable
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-4 text-base font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
          >
            <Download className="h-5 w-5" />
            ⬇️ BAIXAR APLICATIVO
          </a>
        </div>

        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-zinc-500">
          <MonitorSmartphone className="h-4 w-4" />
          Disponível para Android, Android TV, Google TV e TV Box.
        </p>

        <button
          type="button"
          onClick={() => navigate(-1)}
          data-tv-focusable
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/20"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>
    </div>
  );
}