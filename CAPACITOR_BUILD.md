# MovieFlix — Aplicativo nativo (Capacitor)

O MovieFlix é um aplicativo Android real via **Capacitor**, mas o APK é um
**WebView remoto** que SEMPRE carrega a versão atual do site online:

```
https://movieflix-bszf.onrender.com
```

Isso significa que **qualquer mudança no site** (layout, filmes, séries,
categorias, player, textos, configurações, features) aparece
**automaticamente no app** — SEM precisar gerar/instalar um novo APK.

## Estrutura

```
MovieFlix/
├── src/                → código React (site)
├── public/             → estáticos (incl. apk/ com o APK oficial)
├── android/            → projeto nativo Android (Gradle)
├── capacitor.config.ts → configuração do Capacitor (server.url = site online)
└── package.json        → scripts cap:* / apk / aab
```

## Como funciona (auto-follow)

- `capacitor.config.ts` usa `server.url: 'https://movieflix-bszf.onrender.com'`
  em vez de `webDir: "dist"` → o WebView NUNCA embute uma cópia antiga do site.
- `android/app/src/main/java/com/movieflix/app/MainActivity.java`:
  - **DPAD/controle remoto**: mantém o WebView focado para setas/OK/Voltar
    (o site navega via `useTvNavigation`).
  - **Back inteligente**: Player → filme → página anterior (histórico SPA);
    na raiz, sai do app.
  - **Bloqueio de anúncios/redirects**: `shouldOverrideUrlLoading` bloqueia
    popups, abas novas e navegação externa para domínios de anúncio; domínios
    do site/player (StreamBetter etc.) passam. O site ainda tem `antiAds.ts`
    (bloqueio de popup + auto-close + guard de redirect no iframe).
  - **Cache**: `LOAD_NO_CACHE` no primeiro load → sempre a versão mais recente.
- `android/app/src/main/java/com/movieflix/app/MovieFlixPlugin.java`:
  plugin nativo que o site usa (`src/lib/appShell.ts`) para detectar que está
  rodando dentro do APK → esconde o botão "Baixar app" no menu (não faz
  sentido baixar o app dentro do próprio app) e ativa `tv-nav`.

## Fluxo de build

```bash
npm install            # instala dependências (incl. @capacitor/*)
npm run build          # compila o frontend (só para o site/verificação)
npx cap sync android   # gera android/app/src/main/assets/capacitor.config.json
cd android && ./gradlew assembleDebug   # gera o APK
```

- APK de debug: `android/app/build/outputs/apk/debug/app-debug.apk`

## Gerar APK release (assinado) — opcional

O APK release assinado precisa de keystore. O fluxo completo (com keystore
versionado ou gerado) está documentado nas versões anteriores do projeto;
para atualizar o APK servido pelo site basta rebuildar com o mesmo keystore:

```bash
cd android
./gradlew assembleRelease -Dorg.gradle.jvmargs="-Xmx1400m"
# assinar com o keystore e copiar para public/apk/MovieFlix-vX.X.X.apk
```

## Android TV / Google TV

- `AndroidManifest.xml` declara `LEANBACK_LAUNCHER` + `android.banner`.
- `uses-feature leanback required=false` + `touchscreen required=false`:
  funciona em TV e em celular, sem exigir touch.
- Navegação por D-pad/controle remoto é 100% JS (`src/hooks/useTvNavigation.ts`)
  + DPAD nativo (MainActivity). Sem código nativo extra.

## Observações de build

- O sandbox de CI tem limite de memória (cgroup ~2 GB): use
  `./gradlew assembleDebug --no-daemon --max-workers=2 -Dorg.gradle.jvmargs="-Xmx1024m -XX:MaxMetaspaceSize=512m"`.
- iOS: o projeto `ios/` fica pronto para abrir no Xcode (CocoaPods só em macOS);
  o mesmo `server.url` se aplica ao iOS.
