# Build do MovieFlix TV

O aplicativo TV fica isolado em `movieflix-tv/android` e usa o application ID `com.movieflix.tv`. O módulo Mobile em `android/` não é alterado pelo build TV.

## Build e testes

\`\`\`bash
cd movieflix-tv/android
./gradlew testDebugUnitTest assembleDebug --no-daemon
\`\`\`

APK gerado:

`app/build/outputs/apk/debug/app-debug.apk`

Instalação em TV Box ou dispositivo conectado:

\`\`\`bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
\`\`\`

## Controles do player

- **OK/Enter:** play/pause; com o overlay aberto, ativa o controle focado.
- **Esquerda/Direita:** retrocede/avança 15 segundos.
- **Cima/Baixo:** ajusta o volume quando o overlay está fechado; navega pelos controles quando está aberto.
- **OK pressionado:** alterna tela cheia e modo janela.
- **Back:** fecha o overlay primeiro; depois sai do player.
- **Media Next/Stop:** próximo episódio ou saída do player.

O player tenta a fonte nativa Media3/ExoPlayer e usa o embed oficial como fallback quando o provedor exige JavaScript, mantendo a mesma fonte e a mesma conta do Mobile/site.

