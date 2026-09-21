# MovieFlix TV — Arquivos alterados FORA de `movieflix-tv/`

> Regra do projeto: o TV app é **independente**. Tudo o que foi possível ficou
> dentro de `movieflix-tv/`. Este documento lista **exatamente** o que foi
> tocado fora dessa pasta, com a justificativa e o impacto.

---

## Resumo

| # | Arquivo (fora de `movieflix-tv/`) | Tipo | Justificativa | Impacto no comportamento existente |
|---|---|---|---|---|
| 1 | `public/apk/MovieFlixTV-v1.9.0.apk` | **novo** | Arquivo do APK TV (entrega pedida). O site já serve `/apk/*` para o APK mobile. | **Nenhum** — arquivo novo, não substitui nada. |
| 2 | `src/lib/appInfo.ts` | edição aditiva | Central de versões/downloads do site. Adiciona as constantes do APK TV. | **Nenhum** — só exporta constantes novas; nenhum valor existente foi alterado. |
| 3 | `src/pages/DownloadAppPage.tsx` | edição aditiva | A página de downloads já mencionava "Android TV / Google TV / TV Box". Adiciona o cartão de download do app TV. | **Nenhum** — bloco novo; o cartão do app mobile e todo o resto seguem iguais. |

**Arquivos do app mobile (`src/` mobile, `android/`, `ios/`): NENHUM foi alterado.**

---

## Por que essas 3 mudanças são necessárias e mínimas

1. **Não há alternativa isolada dentro de `movieflix-tv/`.** O site é o único
   canal público onde o usuário baixa o APK; o arquivo precisa ser servido pelo
   site (`public/apk/` é o diretório servido pelo backend em `/apk/`).
2. **A entrega exige o APK acessível.** Sem o arquivo em `public/apk/` e sem um
   link na página de download, o APK TV não chega ao usuário.
3. **A edição é puramente aditiva.** Foram acrescentadas constantes e um cartão
   novo. Nenhuma rota, layout, estilo, autenticação ou regra existente do site
   foi modificada. O app mobile continua idêntico.

---

## Verificação

- `git diff --stat` fora de `movieflix-tv/` deve mostrar **apenas** os itens acima.
- O app mobile (build Capacitor) não depende de `appInfo` do TV: as constantes
  adicionadas são novas (`TV_APK_*`), sem colisão de nomes.
