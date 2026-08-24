# MovieFlix — Aplicativo nativo (Capacitor)

O MovieFlix agora é um aplicativo multiplataforma real: o frontend compilado
(Vite/React) roda dentro de um shell nativo via **Capacitor**. NÃO é um WebView
apontando para um site remoto — o app carrega os próprios arquivos compilados
(`dist/`) empacotados no APK/AAB.

## Estrutura

```
MovieFlix/
├── src/                → código React (site + app)
├── public/             → estáticos (incl. apk/ com o APK oficial)
├── android/            → projeto nativo Android (Gradle)
├── ios/                → projeto nativo iOS (Xcode)
├── capacitor.config.ts → configuração do Capacitor (appId, webDir=dist)
└── package.json        → scripts cap:* / apk / aab
```

## Fluxo de build (web + nativo)

```bash
npm install            # instala dependências (incl. @capacitor/*)
npm run build          # compila o frontend para dist/
npx cap sync android   # copia dist/ + ícones para android/
npx cap sync ios       # copia dist/ + ícones para ios/ (CocoaPods em macOS)
```

Ou, com atalhos:

```bash
npm run cap:sync       # = npm run build && npx cap sync
npm run cap:android    # = build + sync + abre o Android Studio
npm run cap:ios        # = build + sync + abre o Xcode (somente macOS)
```

## Gerar APK (instalação direta / sideload)

```bash
npm run apk            # = cap:sync && cd android && ./gradlew assembleDebug
```

- APK de debug: `android/app/build/outputs/apk/debug/app-debug.apk`
- APK de release (assinado):
  ```bash
  cd android
  ./gradlew assembleRelease -Dorg.gradle.jvmargs="-Xmx1400m"
  # assinar (keystore gerado neste repositório, NÃO versionado):
  export PATH=$PATH:/opt/android-sdk/build-tools/35.0.0
  zipalign -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk app/build/outputs/apk/release/app-release-aligned.apk
  apksigner sign --ks movieflix-release.keystore --ks-key-alias movieflix \
    --ks-pass pass:movieflix2026 --key-pass pass:movieflix2026 \
    --out app/build/outputs/apk/release/MovieFlix-v1.0.0.apk app/build/outputs/apk/release/app-release-aligned.apk
  ```
- O APK oficial assinado fica em `android/app/build/outputs/apk/release/MovieFlix-v1.0.0.apk`
  e é copiado para `public/apk/MovieFlix-v1.0.0.apk` (servido pelo site).

## Gerar AAB (Google Play)

```bash
cd android
./gradlew bundleRelease -Dorg.gradle.jvmargs="-Xmx1400m"
```

- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- ⚠️ Para publicar na Play Store é preciso assinar com o mesmo keystore do APK
  (via Play App Signing ou upload do keystore). Mantenha o `movieflix-release.keystore`
  em local seguro — sem ele não é possível atualizar o app no futuro.

## Abrir no Android Studio

```bash
npm run cap:android    # ou: Android Studio → Open → pasta android/
```

- SDK: instale via SDK Manager (compileSdk 35).
- Depois de alterar código web: `npm run build && npx cap sync android`.

## Abrir no Xcode (iOS / iPadOS)

```bash
npm run cap:ios        # ou: Xcode → Open → ios/App/App.xcworkspace
```

- Requer macOS + CocoaPods (`sudo gem install cocoapods`, depois `npx cap sync ios`).
- Bundle ID: `com.movieflix.app` (ajuste em Xcode → Signing & Capabilities se precisar).
- Ícones e splash já estão configurados em `Assets.xcassets`.

## Android TV / Google TV

- O `AndroidManifest.xml` declara `LEANBACK_LAUNCHER` + `android.banner`
  (banner 320×180 em `mipmap-xhdpi/tv_banner.png`), então o app aparece na
  tela inicial das TVs Android com banner próprio.
- `uses-feature leanback required=false` + `touchscreen required=false`:
  funciona em TV e em celular, sem exigir touch.
- Navegação por D-pad/controle remoto é 100% JS (`src/hooks/useTvNavigation.ts`):
  setas/OK/Voltar + anel de foco. Nenhum código nativo extra é necessário.

## Atualizar o APK no site (futuras versões)

1. `npm run cap:sync` (ou só `npm run build && npx cap sync android`)
2. `cd android && ./gradlew assembleRelease`
3. Assinar (comando acima), renomear para `MovieFlix-vX.X.X.apk`
4. Copiar para `public/apk/MovieFlix-vX.X.X.apk`
5. Atualizar `src/lib/appInfo.ts` (version, apkFileName) — o botão usa esse arquivo
6. `npm run build` e commitar. O backend serve `dist/apk/...` automaticamente.

## Observações de build

- O sandbox de CI tem limite de memória (cgroup ~2 GB): use
  `-Dorg.gradle.jvmargs="-Xmx1400m"` para não estourar.
- `android/app/build.gradle` desativa lint vital em release
  (`checkReleaseBuilds false`) para builds de CI enxutos.
- iOS: CocoaPods/pod install só funciona em macOS — no Linux o projeto fica
  pronto para abrir no Xcode sem pods instalados.
