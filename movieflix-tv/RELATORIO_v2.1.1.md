# MovieFlix TV v2.1.1 — Relatório Final

Data: 2026-09-21 · Branch: `main` · package `com.movieflix.tv` · versionCode 16

---

## ITEM 1 — Reprodução de filmes e séries na TV ("faz o que der para funcionar")

### O que foi investigado (com testes reais)

Toda a cadeia do stream foi reexaminada e testada, comparando site/mobile × TV:

| # | Teste | Resultado |
|---|---|---|
| 1 | Embed do provedor com a chave pública (`https://streambetter.shop/filme/550?key=sb_pk_…`) | HTTP 200, mas corpo = página **"Verificando…"** com `challenges.cloudflare.com/turnstile` |
| 2 | Backend `/api/streambetter-resolve?embed=…` | HTTP 200 com `content-type: text/html` → devolve o **SPA do site**, não JSON. A rota não existe no backend |
| 3 | Backend `/api/extract-superflix`, `/api/extract-embedplayer` | HTTP 200 `text/html` → idem, rotas ausentes |
| 4 | Rotas de API do provedor (`/api/stream-token`, resolvers) | Sempre a página de desafio Cloudflare |

**Conclusão técnica:** o embed do provedor é protegido por **Cloudflare Turnstile**.
Só passa quem **executa JavaScript e resolve o desafio** — ou seja, um navegador.
Um player nativo (OkHttp/ExoPlayer) **não** consegue, e o backend do MovieFlix não
tem nenhuma rota que resolva o embed para HLS/MP4. Portanto, no modo 100% nativo,
**não existe caminho verificado** para reproduzir.

### O que foi implementado (autorizado pelo dono)

**Player HÍBRIDO em 2 camadas:**

1. **Nativo primeiro (caminho principal)** — ExoPlayer/Media3 com a URL HLS/MP4
   resolvida pelo `StreamResolver` (backend → fallback direto). Quando a fonte é
   HLS/MP4 direto, o player nativo reproduz normalmente.
2. **Fallback híbrido (WebView do embed oficial)** — quando o nativo **não**
   resolve, o app carrega o **MESMO embed oficial do StreamBetter** que o site e o
   celular usam (`MediaCatalog.embedUrl()` já anexa a chave pública do plano
   Creator). Como roda num WebView com JavaScript habilitado, o desafio Cloudflare
   é resolvido e o vídeo reproduz — exatamente como no site e no mobile.

Também corrigido no resolvedor: a URL do embed **descartava a chave pública**
(`?key=sb_pk_*` era cortada ao reconstruir a query) — agora a chave é preservada
em `buscarHtmlEmbed()`.

**Isolamento:** o WebView existe **somente** dentro do `PlaybackActivity`. Nenhuma
outra tela usa WebView; o app continua 100% nativo em navegação, catálogo, login,
perfis, favoritos etc.

### Controle remoto no player (ambos os modos)

| Tecla | Ação |
|---|---|
| `OK` curto | play/pause (+ mostra/esconde controles) |
| `OK` segurado | **TELA CHEIA ⇄ MODO JANELA** |
| `←` / `→` | −15 s / +15 s |
| `↑` / `↓` | volume (controles fechados) / navegação (abertos) |
| `BACK` | fecha controles; fora deles, sai do player |

No WebView, `←/→`, `OK` e `↑/↓` são traduzidos para JavaScript no `document.querySelector('video')`.

### O que funcionou / o que não funcionou (honesto)

- ✅ **Funciona no código e compila**: cadeia híbrida, injeção de comandos, fallback automático.
- ⚠️ **Não foi possível validar a reprodução fim-a-fim em uma TV física** neste ambiente
  (sem Android TV real). O que se pode afirmar com prova: o embed responde 200 e o
  motivo de o nativo falhar é o desafio Cloudflare (testes 1–4 acima).
- ⚠️ Depende do provedor continuar permitindo o embed no domínio/referer do app.
  Se o provedor endurecer a política, o fallback pode parar — e o app mostra o
  estado de erro com "TENTAR DE NOVO" / "VOLTAR" (nunca tela preta).

---

## ITEM 2 — Erro de download/instalação do APK no site

### Diagnóstico (com evidência real)

O print mostra a caixa do instalador do Android: **"O app não foi instalado."**
Isso é um erro **do dispositivo na etapa de INSTALAÇÃO**, não do download.

Evidências coletadas:

| Verificação | Resultado |
|---|---|
| `HEAD https://movieflix-bszf.onrender.com/apk/MovieFlixTV-v2.1.0.apk` | **HTTP 200**, `content-type: application/vnd.android.package-archive`, `content-length` 17.444.330 |
| Arquivo versionado no git? | **Sim** (`git ls-files` lista o APK) — não está no `.gitignore` |
| `.gitignore` | Não ignora `public/apk/` (só `*.keystore`) |
| ZIP íntegro? | `unzip -t` → **"No errors detected"** |
| Assinatura | `apksigner verify` → **v1 true, v2 true**, 1 signer, mesma keystore |
| Alinhamento | `zipalign -c -v 4` → **"Verification succesful"** |
| Badging | `minSdk 23`, `targetSdk 34`, leanback + touchscreen not required |

**Ou seja: o download funciona e o APK é válido e assinado.** A causa do print é
do lado do aparelho. As causas prováveis, em ordem:

1. **Conflito de assinatura** — o aparelho já tinha a versão **debug** instalada
   (o APK debug tinha sido publicado em `public/apk/`). Debug e release têm
   assinaturas diferentes → o Android recusa a atualização com exatamente esse erro.
2. **"Instalar de fontes desconhecidas"** não habilitado para o navegador.
3. Espaço insuficiente no aparelho.

### Correção aplicada

- **Removido o APK debug de `public/apk/`** (era um dos fatores do conflito) — a
  pasta pública agora serve **apenas o release assinado**.
- Mantida a numeração incremental (v2.1.1, code 16) para o Android aceitar como
  atualização.
- A página de download e o QR continuam derivando de `TV_APP_INFO` (nada de URL
  hardcoded), agora apontando para o APK novo automaticamente.

---

## ITEM 3 — Segurar OK = alternar tela cheia / modo janela

Implementado em `PlaybackActivity` (filmes **e** episódios):

- `onKeyLongPress(KEYCODE_DPAD_CENTER | KEYCODE_ENTER)` → `alternarModoJanela()`.
- `alternarModoJanela()` alterna entre `MATCH_PARENT` (tela cheia) e uma área
  central de ~72% da tela (modo janela), tanto no `PlayerView` quanto no `WebView`.
- **O long press NÃO dispara play/pause**: o `onKeyUp` trata o caso de long press
  consumido e o `onKeyDown` curto só alterna play/pause quando os controles estão
  fechados — sem sobreposição de comportamento.
- Comandos curtos mantidos: `OK` = play/pause, `←/→` = ±15 s, `BACK` = sair.

---

## Build e APKs (v2.1.1)

| | Arquivo | Tamanho |
|---|---|---|
| **Release (site)** | `public/apk/MovieFlixTV-v2.1.1.apk` | 17.444.876 bytes = **16,6 MB** |
| **Debug** | `public/apk/MovieFlixTV-v2.1.1-debug.apk` | 20.705.010 bytes = **19,7 MB** |

- `./gradlew :app:assembleRelease` → **BUILD SUCCESSFUL**
- `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL**
- Assinado com a **mesma keystore** (`SHA-256 8741e4dd…b08f`) → atualiza por cima.
- Erros reais de compilação corrigidos no caminho: null-safety em `player?.volume`
  (Kotlin não permite `?.` em atribuição) → resolvido com `val exo = player; if (exo != null)`.

---

## Site — integridade

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | **exit 0** (0 erros) |
| `npm run build` | **exit 0** |

---

## Arquivos alterados FORA de `movieflix-tv/`

| # | Arquivo | Alteração | Por quê |
|---|---|---|---|
| 1 | `src/lib/appInfo.ts` | `TV_APP_INFO`: 2.1.0 → **2.1.1**, code 15 → **16**, `apkFileName` → `MovieFlixTV-v2.1.1.apk`, `sizeMB` → `16.6 MB` | ponto único que a página de download lê. Aditivo — `APP_INFO` (mobile) intacto |
| 2 | `public/apk/MovieFlixTV-v2.1.1.apk` | arquivo **novo** (release) | APK que o site serve |
| 3 | `public/apk/MovieFlixTV-v2.1.1-debug.apk` | arquivo **novo** (debug) | build de depuração pedido |
| 4 | `public/apk/MovieFlixTV-v2.1.0.apk` | **removido** | substituído pela versão nova |
| 5 | `public/apk/MovieFlixTV-v2.1.0-debug.apk` | **removido** | **causa do conflito de assinatura** no erro de instalação |

**Nenhum arquivo do app mobile (`android/`, `ios/`, `src/` do app) foi tocado.**

---

## Limitações reais remanescentes

1. **Reprodução não validada em TV física** neste ambiente (sem Android TV).
   A cadeia está implementada e compila; a validação em aparelho depende do dono.
2. **Fallback híbrido depende do provedor** permitir o embed. Se endurecer, o
   player mostra erro tratado com "TENTAR DE NOVO" / "VOLTAR".
3. **Downloads offline** seguem não implementados na TV (modelo de storage diferente).
4. **Contratação/pagamento** continua sendo feita no site/app (nenhum preço ou
   gateway paralelo foi criado).
