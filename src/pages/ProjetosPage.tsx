import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Download,
  Smartphone,
  ShieldCheck,
  Database,
  WifiOff,
  BarChart3,
  CalendarDays,
  Wallet,
  Target,
  ExternalLink,
  FolderKanban,
} from 'lucide-react';
import {
  MEU_GANHO_ATUAL,
  MEU_GANHO_APK_ABSOLUTE_URL,
  MEU_GANHO_APK_MIRROR_URL,
} from '@/lib/projetos';
import {
  MF_ATUAL,
  MF_APK_ABSOLUTE_URL,
  MF_APK_MIRROR_URL,
  MF_LOGO,
  MF_RECURSOS,
} from '@/lib/minhas-financas';

/* ============================================================
   META ROBOTS — noindex, nofollow
   Aplicado assim que o módulo desta página é carregado e
   reforçado no useEffect. Revertido ao sair, para não "vazar"
   noindex para o resto do site.
   ============================================================ */
const ROBOTS_INDEX = 'index, follow';

function aplicarNoIndex() {
  document.title = 'Projetos — MovieFlix';
  const meta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (meta) meta.setAttribute('content', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  const ref = document.head.querySelector<HTMLMetaElement>('meta[name="referrer"]');
  if (ref) ref.setAttribute('content', 'no-referrer');
}

function restaurarRobots() {
  const meta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (meta) meta.setAttribute('content', ROBOTS_INDEX);
}

export function ProjetosPage() {
  useEffect(() => {
    aplicarNoIndex();
    return restaurarRobots;
  }, []);

  const recursos = [
    { icon: Wallet, texto: 'Registre quanto entrou e quanto saiu — o app calcula o resto' },
    { icon: BarChart3, texto: 'Dashboard com resultado, disponível, reservado e progresso da meta' },
    { icon: CalendarDays, texto: 'Calendário real por mês e ano (28/29/30/31 dias)' },
    { icon: Database, texto: 'Dados salvos no aparelho (SQLite) — nada se perde' },
    { icon: WifiOff, texto: 'Funciona 100% offline, sem internet' },
    { icon: Target, texto: 'Metas, categorias e distribuição do dinheiro configuráveis' },
  ];

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Faixa superior */}
      <div className="bg-gradient-to-r from-brand-700 via-roxo-700 to-brand-700 px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-white">
        <FolderKanban className="mr-1.5 inline h-3 w-3" />
        Área de projetos · acesso por link direto
      </div>

      <div className="container-app py-10 sm:py-14">
        <div className="mx-auto max-w-4xl">
          {/* Cabeçalho */}
          <header className="flex flex-col items-center text-center">
            <img
              src="/logo.png"
              alt="MovieFlix"
              width={56}
              height={56}
              draggable={false}
              className="h-14 w-14 rounded-xl object-contain"
            />
            <h1 className="mt-4 font-display text-4xl tracking-wide text-white sm:text-6xl">
              MEUS <span className="text-gradient">PROJETOS</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm text-ink-400 sm:text-base">
              Espaço pessoal com os aplicativos e projetos do proprietário.
            </p>
          </header>

          {/* ── CARD MEU GANHO ─────────────────────────────────────── */}
          <section className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-ink-900 to-ink-950 shadow-2xl shadow-black/60">
            <div className="flex flex-col gap-8 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-roxo-600 text-2xl font-black text-white shadow-lg shadow-roxo-900/40">
                    M
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-bold text-white">💰 MEU GANHO</h2>
                    <p className="mt-0.5 text-sm text-ink-400">
                      <span className="font-semibold text-roxo-300">📱 Meu Ganho</span>{' '}
                      · 📦 Versão: {MEU_GANHO_ATUAL.versao}
                    </p>
                  </div>
                </div>

                <p className="mt-5 text-sm leading-relaxed text-ink-200">
                  Aplicativo pessoal para controle de ganhos, gastos, categorias, metas e
                  organização financeira.
                </p>

                <ul className="mt-5 space-y-2.5">
                  {recursos.map((r) => (
                    <li key={r.texto} className="flex items-start gap-3 text-sm text-ink-200">
                      <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                      <span>{r.texto}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <a
                    href={MEU_GANHO_APK_ABSOLUTE_URL}
                    download={MEU_GANHO_ATUAL.arquivo}
                    className="inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-roxo-600 px-8 py-4 text-base font-bold text-white shadow-lg shadow-brand-600/30 transition hover:from-brand-500 hover:to-roxo-500 active:scale-[0.98]"
                  >
                    <Download className="h-6 w-6" />
                    ⬇️ BAIXAR APLICATIVO
                  </a>
                  <a
                    href={MEU_GANHO_APK_MIRROR_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-sm font-semibold text-ink-200 transition hover:bg-white/10 hover:text-white"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Link alternativo
                  </a>
                </div>
              </div>

              {/* QR code — baixar direto no celular */}
              <div className="flex shrink-0 flex-col items-center gap-3 md:pl-6">
                <div className="rounded-2xl border border-white/10 bg-white p-3">
                  <QRCodeSVG
                    value={MEU_GANHO_APK_ABSOLUTE_URL}
                    size={148}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#0a0a0f"
                    title={`MEU GANHO v${MEU_GANHO_ATUAL.versao}`}
                  />
                </div>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-400">
                  <Smartphone className="h-3.5 w-3.5" /> Aponte a câmera para baixar
                </span>
              </div>
            </div>

            {/* Rodapé técnico do card */}
            <div className="border-t border-white/10 bg-black/30 px-6 py-4 sm:px-8">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-ink-500">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Pacote: {MEU_GANHO_ATUAL.pacote}
                </span>
                <span>Android 7.0+ · {MEU_GANHO_ATUAL.tamanhoLabel}</span>
                <span>Lançamento: {MEU_GANHO_ATUAL.releaseDate}</span>
              </div>
            </div>
          </section>

          {/* ── CARD MINHAS FINANÇAS ──────────────────────────────────────
              Aplicativo INDEPENDENTE (com.minhasfinancas.app). O card do Meu
              Ganho acima permanece intacto — este é um bloco novo e separado. */}
          <section className="mt-6 overflow-hidden rounded-3xl border border-roxo-500/25 bg-gradient-to-b from-ink-900 to-ink-950 shadow-2xl shadow-black/60">
            <div className="flex flex-col gap-8 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-roxo-500 to-roxo-700 shadow-lg shadow-roxo-900/40">
                    <img
                      src={MF_LOGO}
                      alt="Minhas Finanças"
                      width={44}
                      height={44}
                      draggable={false}
                      className="h-11 w-11"
                    />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-bold text-white">💜 MINHAS FINANÇAS</h2>
                    <p className="mt-0.5 text-sm text-ink-400">
                      <span className="font-semibold text-roxo-300">💜 Minhas Finanças</span>{' '}
                      · 📦 Versão: {MF_ATUAL.versao}
                    </p>
                  </div>
                </div>

                <p className="mt-5 text-sm leading-relaxed text-ink-200">
                  Aplicativo de organização financeira pessoal: salário, comissões, gastos,
                  categorias, contas recorrentes, reserva, metas, VR, planejamento, calendário,
                  relatórios, gráficos, notificações e backup — tudo local, offline e
                  configurável pela própria usuária.
                </p>

                <ul className="mt-5 space-y-2.5">
                  {MF_RECURSOS.map((r) => (
                    <li key={r.texto} className="flex items-start gap-3 text-sm text-ink-200">
                      <span className="mt-0.5 w-4 shrink-0 text-center text-roxo-300">{r.emoji}</span>
                      <span>{r.texto}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <a
                    href={MF_APK_ABSOLUTE_URL}
                    download={MF_ATUAL.arquivo}
                    className="inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-roxo-600 to-roxo-500 px-8 py-4 text-base font-bold text-white shadow-lg shadow-roxo-600/30 transition hover:from-roxo-500 hover:to-roxo-600 active:scale-[0.98]"
                  >
                    <Download className="h-6 w-6" />
                    ⬇️ BAIXAR APLICATIVO
                  </a>
                  <a
                    href={MF_APK_MIRROR_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-sm font-semibold text-ink-200 transition hover:bg-white/10 hover:text-white"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Link alternativo
                  </a>
                </div>
              </div>

              {/* QR code — baixar direto no celular */}
              <div className="flex shrink-0 flex-col items-center gap-3 md:pl-6">
                <div className="rounded-2xl border border-white/10 bg-white p-3">
                  <QRCodeSVG
                    value={MF_APK_ABSOLUTE_URL}
                    size={148}
                    level="M"
                    bgColor="#ffffff"
                    fgColor="#2b0b52"
                    title={`Minhas Finanças v${MF_ATUAL.versao}`}
                  />
                </div>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-400">
                  <Smartphone className="h-3.5 w-3.5" /> Aponte a câmera para baixar
                </span>
              </div>
            </div>

            {/* Rodapé técnico do card */}
            <div className="border-t border-white/10 bg-black/30 px-6 py-4 sm:px-8">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-ink-500">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Pacote: {MF_ATUAL.pacote}
                </span>
                <span>{MF_ATUAL.android} · {MF_ATUAL.tamanhoLabel}</span>
                <span>Lançamento: {MF_ATUAL.releaseDate}</span>
              </div>
            </div>
          </section>

          {/* Como instalar */}
          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { n: '1', t: 'Baixar o APK', d: 'Toque em BAIXAR APLICATIVO ou leia o QR code com o celular.' },
              { n: '2', t: 'Permitir instalação', d: 'Se o Android pedir, autorize "instalar apps desconhecidos".' },
              { n: '3', t: 'Abrir e usar', d: 'Instale, abra e comece a registrar seus ganhos offline.' },
            ].map((p) => (
              <div key={p.n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-roxo-600/20 text-sm font-bold text-roxo-200">
                  {p.n}
                </span>
                <h3 className="mt-3 text-sm font-bold text-white">{p.t}</h3>
                <p className="mt-1 text-xs text-ink-400">{p.d}</p>
              </div>
            ))}
          </section>

          <p className="mt-10 text-center text-[11px] text-ink-600">
            MovieFlix · Área de projetos · uso pessoal
          </p>
        </div>
      </div>
    </div>
  );
}
