import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Lock,
  Download,
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  Database,
  WifiOff,
  BarChart3,
  CalendarDays,
  EyeOff,
  KeyRound,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import {
  AREA_PRIVADA_SLUG,
  AREA_PRIVADA_URL,
  MEU_GANHO_APK,
  MEU_GANHO_APK_ABSOLUTE_URL,
  MEU_GANHO_APK_MIRROR_URL,
} from '@/lib/areaPrivada';

/* ============================================================
   META ROBOTS — noindex, nofollow
   ════════════════════════════════════════════════════════════
   Aplicado assim que o módulo desta página é carregado (ele só é
   carregado porque a rota bateu) e reforçado no useEffect. Vale
   também para quando o usuário sai da página: revertemos para o
   padrão do site, para não "vazar" noindex para o resto do site.
   ============================================================ */
const ROBOTS_INDEX = 'index, follow';

function aplicarNoIndex() {
  document.title = 'Área Privada — MEU GANHO v1.0.0';
  const meta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (meta) meta.setAttribute('content', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  // Referrer: não entregar a URL secreta para terceiros.
  const ref = document.head.querySelector<HTMLMetaElement>('meta[name="referrer"]');
  if (ref) ref.setAttribute('content', 'no-referrer');
}

function restaurarRobots() {
  const meta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (meta) meta.setAttribute('content', ROBOTS_INDEX);
}

export function PrivatePage() {
  const { slug } = useParams<{ slug: string }>();
  const autorizado = slug === AREA_PRIVADA_SLUG;
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!autorizado) return;
    aplicarNoIndex();
    return restaurarRobots;
  }, [autorizado]);

  if (!autorizado) {
    // Slug errado: não revela NADA sobre a existência da área privada.
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-6 text-center">
        <EyeOff className="h-14 w-14 text-ink-600" />
        <h1 className="mt-4 font-display text-3xl tracking-wide text-white">Página não encontrada</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-400">
          O endereço acessado não existe ou foi removido.
        </p>
        <Link to="/" className="btn-ghost mt-6">
          Voltar ao início
        </Link>
      </div>
    );
  }

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(AREA_PRIVADA_URL);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard indisponível — ignora */
    }
  };

  const recursos = [
    { icon: BarChart3, texto: 'Dashboard com faturamento, ganho líquido e progresso' },
    { icon: CalendarDays, texto: 'Calendário real por mês e ano (28/29/30/31 dias)' },
    { icon: Database, texto: 'Registros salvos no aparelho (SQLite) — nada se perde' },
    { icon: WifiOff, texto: 'Funciona 100% offline, sem internet' },
  ];

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Faixa de aviso: área privada */}
      <div className="bg-gradient-to-r from-brand-700 via-roxo-700 to-brand-700 px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-white">
        <Lock className="mr-1.5 inline h-3 w-3" />
        Área privada · acesso somente por link direto
      </div>

      <div className="container-app py-10 sm:py-14">
        <div className="mx-auto max-w-4xl">
          {/* ── Cabeçalho ─────────────────────────────────────── */}
          <header className="flex flex-col items-center text-center">
            <img
              src="/logo.png"
              alt="MovieFlix"
              width={56}
              height={56}
              draggable={false}
              className="h-14 w-14 rounded-xl object-contain"
            />
            <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-roxo-500/40 bg-roxo-500/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-roxo-200">
              <KeyRound className="h-3.5 w-3.5" />
              Espaço pessoal do proprietário
            </span>
            <h1 className="mt-4 font-display text-4xl tracking-wide text-white sm:text-6xl">
              MEU <span className="text-gradient">GANHO</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm text-ink-400 sm:text-base">
              Página privada de distribuição do aplicativo <strong className="text-white">MEU GANHO</strong>{' '}
              v{MEU_GANHO_APK.versao}. Nenhum menu, busca ou outro ponto do site
              leva até aqui — o acesso é exclusivamente por este link.
            </p>
          </header>

          {/* ── Card de download principal ────────────────────── */}
          <section className="mt-10 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-ink-900 to-ink-950 shadow-2xl shadow-black/60">
            <div className="flex flex-col gap-8 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-roxo-600 text-2xl font-black text-white shadow-lg shadow-roxo-900/40">
                    M
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-2xl font-bold text-white">{MEU_GANHO_APK.nome}</h2>
                    <p className="mt-0.5 text-sm text-ink-400">
                      <span className="font-semibold text-roxo-300">v{MEU_GANHO_APK.versao}</span>{' '}
                      · {MEU_GANHO_APK.tamanhoLabel} · .apk · Android 7.0+
                    </p>
                  </div>
                </div>

                <ul className="mt-6 space-y-2.5">
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
                    download={MEU_GANHO_APK.arquivo}
                    className="inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-roxo-600 px-8 py-4 text-base font-bold text-white shadow-lg shadow-brand-600/30 transition hover:from-brand-500 hover:to-roxo-500 active:scale-[0.98]"
                  >
                    <Download className="h-6 w-6" />
                    BAIXAR APK
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
                    title="MEU GANHO v1.0.0"
                  />
                </div>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-400">
                  <Smartphone className="h-3.5 w-3.5" /> Aponte a câmera para baixar
                </span>
              </div>
            </div>

            {/* Rodapé técnico do card: integridade do arquivo */}
            <div className="border-t border-white/10 bg-black/30 px-6 py-4 sm:px-8">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-ink-500">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Pacote: {MEU_GANHO_APK.pacote}
                </span>
                <span>SHA-256: {MEU_GANHO_APK.sha256.slice(0, 16)}…</span>
                <span>Lançamento: {MEU_GANHO_APK.releaseDate}</span>
              </div>
            </div>
          </section>

          {/* ── Como instalar ─────────────────────────────────── */}
          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { n: '1', t: 'Baixar o APK', d: 'Toque em BAIXAR APK ou leia o QR code com o celular.' },
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

          {/* ── Aviso de marca ────────────────────────────────── */}
          <section className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-5">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <p className="text-xs leading-relaxed text-amber-100/90">
              O aplicativo <strong>MEU GANHO</strong> é uma ferramenta pessoal de controle
              financeiro e <strong>não é vinculado, afiliado ou patrocinado</strong> por Uber, 99
              ou qualquer outra empresa. Os nomes de aplicativos de transporte são usados
              apenas como exemplos de fontes de renda cadastráveis pelo próprio usuário.
            </p>
          </section>

          {/* ── Link secreto (para o dono copiar) ─────────────── */}
          <section className="mt-6 rounded-2xl border border-white/10 bg-ink-900/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                  Link secreto desta página
                </p>
                <p className="mt-1 break-all font-mono text-xs text-ink-300">{AREA_PRIVADA_URL}</p>
              </div>
              <button
                type="button"
                onClick={copiarLink}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10"
              >
                {copiado ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copiado ? 'Copiado!' : 'Copiar link'}
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
              Não compartilhe este endereço. Quem tiver o link consegue abrir a página —
              ela não aparece em nenhum menu, busca ou mecanismo de busca
              (<span className="font-mono">noindex, nofollow</span>).
            </p>
          </section>

          <p className="mt-10 text-center text-[11px] text-ink-600">
            MovieFlix · Área privada · uso pessoal
          </p>
        </div>
      </div>
    </div>
  );
}
