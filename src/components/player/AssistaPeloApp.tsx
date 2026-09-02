import { useNavigate } from 'react-router-dom';
import { Smartphone, Download, ArrowLeft, Clapperboard, MonitorSmartphone, ShieldCheck, Zap } from 'lucide-react';
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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-6 py-12 text-center text-white">
      {/* Fundo decorativo sutil (identidade MovieFlix) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 15% 10%, rgba(124,58,237,0.22), transparent 40%), radial-gradient(circle at 85% 20%, rgba(220,38,38,0.18), transparent 38%), radial-gradient(circle at 50% 100%, rgba(124,58,237,0.12), transparent 45%)',
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Logo / ícone */}
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-brand-600 via-roxo-600 to-roxo-700 shadow-2xl shadow-roxo-900/50 ring-1 ring-white/20">
          <Clapperboard className="h-12 w-12 text-white" />
        </div>

        <h1 className="mt-7 font-display text-3xl font-bold tracking-wide sm:text-4xl">
          🎬 ASSISTA PELO APLICATIVO
        </h1>

        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-zinc-300 sm:text-base">
          Para uma melhor experiência e reprodução mais rápida, assista pelo
          aplicativo <span className="font-semibold text-white">MovieFlix</span>.
        </p>

        {titulo && (
          <p className="mx-auto mt-3 flex max-w-sm items-center justify-center gap-1.5 text-xs text-zinc-400">
            <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{titulo}</span>
          </p>
        )}

        {/* Botões */}
        <div className="mt-9 flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={abrirApp}
            data-tv-focusable
            className="group flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-brand-600 via-roxo-600 to-roxo-600 px-6 py-4 text-base font-bold text-white shadow-xl shadow-roxo-900/50 ring-1 ring-white/20 transition hover:from-brand-500 hover:via-roxo-500 hover:to-roxo-500 active:scale-[0.98]"
          >
            <Smartphone className="h-5 w-5 transition group-hover:scale-110" />
            📱 ABRIR APLICATIVO
          </button>

          <a
            href={DOWNLOAD_PAGE_URL}
            data-tv-focusable
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-white/15 bg-white/5 px-6 py-4 text-base font-semibold text-white backdrop-blur transition hover:border-white/30 hover:bg-white/10 active:scale-[0.98]"
          >
            <Download className="h-5 w-5" />
            ⬇️ BAIXAR APLICATIVO
          </a>
        </div>

        {/* Benefícios */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-zinc-400 sm:text-xs">
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-roxo-400" />
            Reprodução mais rápida
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Sem anúncios
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MonitorSmartphone className="h-3.5 w-3.5 text-brand-400" />
            Android · Android TV · Google TV · TV Box
          </span>
        </div>

        {/* Voltar */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          data-tv-focusable
          className="mt-9 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white backdrop-blur transition hover:border-white/30 hover:bg-white/10"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>
    </div>
  );
}