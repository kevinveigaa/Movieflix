import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, Download, ShieldCheck, Play, Monitor, RotateCcw, Tv, Apple, CheckCircle2, QrCode } from 'lucide-react';
import { APP_INFO, APK_URL, APK_SIZE_MB, APK_ABSOLUTE_URL, DOWNLOAD_PAGE_URL } from '@/lib/appInfo';

export function DownloadAppPage() {
  const apkUrl = APK_ABSOLUTE_URL; // URL absoluta usada pelo botão E pelo QR
  return (
    <div className="container-app py-10">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-roxo-500/30 bg-roxo-500/10 px-4 py-1.5 text-xs font-semibold text-roxo-300">
          <Smartphone className="h-4 w-4" />
          APLICATIVO ANDROID
        </span>
        <h1 className="mt-4 font-display text-3xl tracking-wide text-white sm:text-5xl">
          Baixe o app <span className="text-roxo-400">MovieFlix</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-ink-400 sm:text-base">
          O aplicativo oficial do MovieFlix para celular e TV. Assista filmes e
          séries dublados em pt-BR com navegação completa por controle remoto.
        </p>

        {/* Botão de download + QR code */}
        <div className="mt-8 flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-8">
          {/* Botão principal */}
          <div className="flex flex-col items-center">
            <a
              href={apkUrl}
              download={APP_INFO.apkFileName}
              data-tv-focusable
              className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-roxo-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-roxo-600/30 transition hover:from-brand-500 hover:to-roxo-500"
            >
              <Download className="h-6 w-6" />
              Baixar APK
            </a>
            <p className="mt-2 text-xs text-ink-500">
              {APP_INFO.name} v{APP_INFO.version} • {APK_SIZE_MB} • Arquivo .apk • Instalação fora da Play Store
            </p>
            <p className="mt-1 text-[11px] text-ink-500">
              Lançado em {APP_INFO.releaseDate} • {APP_INFO.platforms.join(' · ')}
            </p>
          </div>

          {/* QR code — aponta para a URL direta do APK */}
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white p-4">
            <QRCodeSVG
              value={apkUrl}
              size={176}
              level="M"
              bgColor="#ffffff"
              fgColor="#0a0a0f"
              title="MovieFlix APK"
            />
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-900">
              <QrCode className="h-3.5 w-3.5" />
              Aponte a câmera para baixar
            </span>
          </div>
        </div>

        {/* Nota honesta: como o QR funciona por plataforma */}
        <div className="mx-auto mt-5 max-w-xl rounded-xl border border-white/10 bg-ink-900/40 px-4 py-3 text-left text-xs leading-relaxed text-ink-400">
          <strong className="text-white">Como o QR funciona:</strong> no{' '}
          <strong className="text-roxo-300">Android</strong> (celular, tablet, Android TV, TV Box),
          o QR inicia o download do APK na hora. No{' '}
          <strong className="text-white">iPhone/iPad (iOS)</strong>, o iOS não permite instalar
          APK — então o QR abre esta página de download, onde há o passo a passo
          para instalar o MovieFlix como PWA direto do Safari (mesma experiência,
          sempre atualizado).{' '}
          <a
            href={DOWNLOAD_PAGE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-roxo-300 underline underline-offset-2 hover:text-roxo-200"
          >
            Abrir página de download
          </a>
        </div>

        {/* Changelog da versão atual */}
        <div className="mt-8 rounded-2xl border border-white/10 bg-ink-900/60 p-5 text-left">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <RotateCcw className="h-4 w-4 text-roxo-400" />
            O que há de novo na v{APP_INFO.version}
          </h2>
          <ul className="mt-3 space-y-1.5">
            {APP_INFO.changelog.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-ink-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* iOS */}
        <div className="mt-6 rounded-2xl border border-white/10 bg-ink-900/60 p-6 text-left">
          <h2 className="flex items-center gap-2 font-semibold text-white">
            <Apple className="h-5 w-5 text-zinc-300" />
            iPhone / iPad (iOS)
          </h2>
          <p className="mt-2 text-sm text-ink-400">
            O MovieFlix é um <strong className="text-white">PWA (Progressive Web App)</strong>:
            instale direto pelo Safari, sem App Store. Ele funciona igual ao app
            Android (mesmo catálogo, mesma versão, sempre atualizado).
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-300">
            <li>Abra o site <span className="text-roxo-300">movieflix-bszf.onrender.com</span> no Safari.</li>
            <li>Toque no botão <strong className="text-white">Compartilhar</strong> (ícone de seta para cima).</li>
            <li>Toque em <strong className="text-white">"Adicionar à Tela de Início"</strong>.</li>
            <li>Pronto: o ícone do MovieFlix aparece na tela inicial, em tela cheia.</li>
          </ol>
        </div>

        <div className="mt-12 grid gap-4 text-left sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-ink-900/60 p-5">
            <ShieldCheck className="h-7 w-7 text-emerald-400" />
            <h3 className="mt-3 font-semibold text-white">Seguro</h3>
            <p className="mt-1 text-sm text-ink-400">
              Instale com tranquilidade. O app é o mesmo MovieFlix que você usa no navegador.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-ink-900/60 p-5">
            <Tv className="h-7 w-7 text-roxo-400" />
            <h3 className="mt-3 font-semibold text-white">Na TV e no celular</h3>
            <p className="mt-1 text-sm text-ink-400">
              Android, Android TV, Google TV e TV Box — navegue tudo com o controle remoto.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-ink-900/60 p-5">
            <RotateCcw className="h-7 w-7 text-roxo-400" />
            <h3 className="mt-3 font-semibold text-white">Sempre atualizado</h3>
            <p className="mt-1 text-sm text-ink-400">
              Novas versões são liberadas aqui. Fique de olho nesta página.
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-ink-900/60 p-6 text-left">
          <h2 className="font-semibold text-white">Como instalar no Android</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-300">
            <li>Toque em <strong className="text-white">Baixar APK</strong> acima.</li>
            <li>
              Abra o arquivo baixado. Se aparecer o aviso, permita{' '}
              <strong className="text-white">instalar de fontes desconhecidas</strong>{' '}
              (Ajustes → Segurança ou nas configurações do seu navegador).
            </li>
            <li>Confirme a instalação e pronto — entre com a sua conta MovieFlix.</li>
          </ol>
          <p className="mt-4 text-xs text-ink-500">
            <Play className="mr-1 inline h-3.5 w-3.5" />
            No Android TV / Google TV, o app aparece na tela inicial com banner próprio e
            funciona 100% com o controle remoto (setas, OK e Voltar).
          </p>
          <p className="mt-2 text-xs text-ink-500">
            <Monitor className="mr-1 inline h-3.5 w-3.5" />
            Prefere assistir no computador? Use o site normalmente no navegador.
          </p>
        </div>

        <div className="mt-10">
          <Link to="/" className="text-sm text-ink-400 underline-offset-4 transition hover:text-white hover:underline">
            ← Voltar para o início
          </Link>
        </div>
      </div>
    </div>
  );
}