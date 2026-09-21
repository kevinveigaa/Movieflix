# MovieFlix TV — Arquivos externos alterados

Regra do projeto: **o novo app é independente**. Tudo o que pôde ficar dentro de
`movieflix-tv/` ficou lá. Qualquer alteração fora desse diretório é mínima,
justificada e não muda o comportamento existente.

## Lista exata (tudo o que foi alterado fora de `movieflix-tv/`)

Comando de verificação usado:

```bash
git diff --cached --name-only | grep -v "^movieflix-tv/"
```

| # | Arquivo | Alteração | Por que era necessário | Impacto no que já existia |
|---|---|---|---|---|
| 1 | `src/lib/appInfo.ts` | Bloco `TV_APP_INFO`: `version` 1.9.0 → **2.0.0**, `versionCode` 12 → **13**, `apkFileName` → `MovieFlixTV-v2.0.0.apk`, `sizeMB` → `11.6 MB` | É o ponto único que a página de download lê para exibir a versão do app TV. Sem isso o site anunciaria a versão antiga. | **Aditivo.** Nenhuma outra constante foi tocada: `APP_INFO` (app mobile), `APK_URL`, `DOWNLOAD_PAGE_URL` e as funções de versão continuam idênticas. |
| 2 | `public/apk/MovieFlixTV-v2.0.0.apk` | **Arquivo novo** (o APK TV v2.0.0) | É a entrega pedida — o site já serve tudo em `/apk/`, então basta colocar o arquivo lá. | **Nenhum.** Arquivo novo; os APKs anteriores permanecem. |
| 3 | `public/apk/MovieFlixTV-v1.9.0.apk` | **Arquivo novo** (APK TV v1.9.0, build anterior) | Foi gerado em momento anterior desta mesma continuação e ainda não estava versionado. | **Nenhum.** Arquivo novo. |

> `src/pages/DownloadAppPage.tsx` **não precisou de alteração** nesta rodada: ele
> já consome `TV_APP_INFO.apkFileName` / `TV_APP_INFO.version` de `appInfo.ts`,
> então atualizar o APK e a constante foi suficiente. (O card "BAIXAR MOVIEFLIX TV"
> com QR já havia sido adicionado na rodada anterior, com autorização.)

## Confirmação de isolamento

- `git diff --cached --name-only | grep -v "^movieflix-tv/"` retorna **exatamente**
  os 4 itens acima (2 arquivos de código/dados + 2 APKs).
- Nada em `src/` do app mobile, `android/`, `ios/`, `public/` (fora de `apk/`) ou
  qualquer outra página do site foi modificado.
- O app mobile (`android/`, `ios/`, `src/` do Capacitor) permanece **byte a byte**
  igual: o módulo TV é um projeto Gradle separado, com `applicationId` próprio
  (`com.movieflix.tv`), que não compartilha código-fonte com o app mobile.
