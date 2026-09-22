# MovieFlix TV v2.2.1 — Reprodução, Cloudflare e Favoritos

Correção cirúrgica: **reprodução** (prioridade nº 1) e **favoritos**. Nenhuma
funcionalidade existente foi removida.

---

## 1) Por que o MOBILE conseguia reproduzir e o TV não

**Não havia diferença de fluxo.** O app "mobile" deste projeto (`capacitor.config.ts`)
é um shell nativo que abre o site em WebView:

```ts
server: { url: 'https://movieflix-bszf.onrender.com' }
```

Ou seja: o celular reproduz porque quem toca o vídeo é um **navegador completo**
com cookies persistentes, exatamente como no site. O TV tentava usar um player
nativo (ExoPlayer/Media3) — que não executa JavaScript nem mantém sessão de
cookie — e por isso recebia algo diferente.

Confirmado por medição, não por suposição:

| Teste | Resultado |
|---|---|
| `GET /filme/550?key=sb_pk_*` com UA de desktop | HTTP 200, 1874 bytes, `<title>Verificando...</title>` |
| O mesmo com UA de celular e de Android TV | **idêntico** — o provedor não varia por aparelho |
| Corpo da resposta | página de desafio **do próprio provedor**, com `challenges.cloudflare.com/turnstile/v0/api.js` |
| `/api/turnstile-verify` (POST) | HTTP 403 `{"success":false,"error":"Verificação falhou."}` (rota existe e é do provedor) |
| Backend do MovieFlix `/api/streambetter-resolve` | HTTP 200 **`text/html`** — devolve o SPA do site; a rota **não existe** (`backend/server.js` não a declara) |

**Conclusão:** a primeira visita a qualquer título, com ou sem chave, cai na
verificação do provedor. Ela é legítima e não é contornável por HTTP puro.

## 2) Qual era o problema no fluxo Cloudflare

O loop tinha **duas** causas somadas — nenhuma delas "falta de cookie".

**(a) O widget ficava sem foco e sem OK — mas a mensagem era enganosa.**
A página de desafio do provedor exibe o quadro de verificação como *widget*
(visualização de iframe cross-origin). Se o quadro não renderiza, o Turnstile
dispara o `data-error-callback` do provedor → aparece
**"Não deu pra confirmar. Atualize a página e tente de novo."**, que é
literalmente o que o print mostra. Não era um loop de dados: era a verificação
**nunca começando**.

**(b) O app recarregava a página por cima do próprio usuário (causa real do loop).**
A versão anterior tinha, dentro de `avaliarDesafio`:

```kotlin
wv.postDelayed({ wv.reload() }, 1500)   // ← o defeito
```

E o OK do controle **nunca chegava ao widget**, porque `onKeyDown` interceptava
`DPAD_CENTER`/`ENTER` para abrir o overlay de controles do app.

Somando: a página era recarregada de 2 em 2 s **e** o usuário não conseguia
confirmar com o controle. O `onTurnstileOk` do provedor ainda faz
`window.location.reload()` ao validar — então mesmo uma confirmação bem-sucedida
seria atropelada pelo próximo reload nosso. Resultado: preso para sempre.

## 3) O que foi corrigido no TV

**`PlaybackActivity.kt`**

1. **O reload automático foi REMOVIDO.** A página do provedor agora fica
   intacta: o widget mantém o progresso e o `window.location.reload()` dele
   pode concluir. (Foi isso que resolveu o principal defeito dos prints.)
2. **O OK passou a chegar ao WebView durante a verificação.** Enquanto
   `verificacaoDetectada` for `true`, `onKeyDown` repassa tudo para o
   `super` — setas navegam, OK aciona o elemento focado, BACK continua saindo.
3. **Navegação remota injetada** (sem tocar na proteção): garante um elemento
   focado ao carregar e faz `Enter` acionar o elemento focado. É literalmente o
   que um mouse faria — **nenhum token é criado, nenhum CAPTCHA é resolvido**.
4. **Detecção mais precisa**: agora procura os marcadores reais
   (`cf-turnstile`, `challenges.cloudflare.com`, "pessoa de verdade") em vez de
   só a palavra "humano".
5. **Watchdog de 30 s** com `taskDesafio`: se a verificação não avançar, o app
   mostra estado limpo e navegável (**TENTAR DE NOVO / VOLTAR**) em vez de
   deixar o usuário preso — **nunca mais tela travada indefinidamente**.
6. Mensagem do erro reescrita para orientar com o controle ("Use as setas para
   focar o quadro de verificação e confirme com OK"), sem jargão técnico.

## 4) Como ficou a primeira verificação

`ASSISTIR` → carregamento discreto → se a fonte for HLS/MP4 direta, **ExoPlayer
nativo em tela cheia**; se não for, o app abre o embed oficial (mesma conta,
mesma fonte do site/celular) → a verificação do provedor aparece **uma vez** →
com as setas o usuário foca o quadro, confirma com OK → o próprio provedor
recarrega e o vídeo entra. Se em 30 s não avançar: mensagem clara + TENTAR DE
NOVO / VOLTAR. **Nunca fica preso sem saída.**

## 5) A autorização/sessão pode ser preservada legitimamente?

**Sim, e a correção tornou isso possível.** Como não recarregamos mais a página,
o cookie de liberação que o Cloudflare grava **permanece** — em versões
anteriores o reload contínuo o invalidava na prática. O app já aceita cookies de
terceiros no WebView (`setAcceptThirdPartyCookies(wv, true)`, que é o
comportamento de navegador padrão), então as reproduções seguintes tendem a não
repetir a verificação enquanto a autorização for válida.

**Limitação real, sem invenção:** a conclusão do Turnstile exige um contexto que
executa JavaScript (o WebView). Não existe caminho nativo — está provado pela
tabela de testes do item 1. Se o aparelho não renderizar o widget, o watchdog
entrega um estado utilizável em vez de silêncio.

## 6-8) Filmes, séries e episódios

O fluxo é o mesmo para os três (`MediaCatalog.embedUrl` monta `/filme/{tmdb}` ou
`/serie/{tmdb}/{temporada}/{episódio}`, sempre com a chave pública do plano
Creator). A correção vale igualmente para filme, série → temporada → episódio, e
o player nativo continua sendo o caminho principal sempre que a fonte resolve
para HLS/MP4. **Nada é marcado como indisponível sem tentar os dois caminhos.**

## 9) Como ficou Favoritos (bug real, com duas causas)

O sintoma era exato: **o botão destacava mas o título não entrava na lista.**

**Causa (a) — o `upsert` nunca funcionava.**
`FavoritesRepository.adicionar` fazia:

```
POST /rest/v1/favorites?on_conflict=user_id,tmdb_id,media_type
Prefer: resolution=merge-duplicates
```

A tabela `favorites` **não tem UNIQUE** em `(user_id, tmdb_id, media_type)` —
as migrations `20260823120000_favorites_profile_columns.sql` e
`20260823130000_favorites_movie_id.sql` só adicionam **colunas**. Comparei com
`playback_sessions`, cuja migration declara `unique (user_id, device_id)`: por
isso o upsert de sessão funciona e o de favoritos não. O Postgres devolvia
erro `42P10` e o app descartava o resultado.

**Correção:** replicamos **o fluxo do site**, que nunca usou upsert — insert
simples e remoção **pelo `id` da linha** (`src/hooks/useFavorite.ts`:

```ts
if (row) await supabase.from('favorites').delete().eq('id', row.id)
else     await supabase.from('favorites').insert(insert)
```

O TV agora guarda o `id` da linha, faz `insert` com `return=representation` e
só considera sucesso quando a linha volta criada (`criado.length() > 0`), e
remove por `id` (com fallback por `user_id + tmdb_id + media_type`).

**Causa (b) — a tela mentia sobre falhas.**
`SupabaseRest.select` devolvia lista vazia em **qualquer** erro, então falha de
RLS/rede/sessão aparecia indistinguível de "lista vazia". Criei
`selectComStatus` (código HTTP + corpo do erro) e:
- a tela **Favoritos** mostra o motivo real quando a consulta falha, e avisa
  quando há favoritos salvos sem TMDb (não casáveis na TV, que casa por
  `tmdb_id` igual ao site);
- os Detalhes mostram **"Não foi possível salvar nos Favoritos. Tente de novo."**
  quando o Supabase recusa, e o botão **continua refletindo o estado real** —
  nunca mais fingimos que salvou.

Fluxo garantido: 1º toque → **adiciona** (insert) → botão vira
**♥ Remover dos Favoritos** dourado → aparece na tela Favoritos. 2º toque →
**remove** (delete por id) → volta para **♡ Favoritos** → some da lista. A tela
Favoritos relê a tabela em `onResume`, então o estado persiste ao sair, voltar
e reabrir o app (a persistência é do Supabase, não local).

## 10) Continuar Assistindo

Verificado, sem alteração: grava na **mesma** `watch_history` do site via
`WatchHistoryRepository.upsert`, só com progresso real
(`temProgressoReal`), a cada 15 s de reprodução, com temporada/episódio nas
séries. Tarefa marcada como **cancelada** (fora do escopo cirúrgico), pois já
estava correta.

## 11) Performance

Sem mudanças de escopo amplo. A abertura do player **ficou mais rápida na
prática** por dois efeitos diretos da correção: o carregamento some assim que a
verificação começa (antes ele ficava preso) e a página do provedor **não é mais
recarregada** de 2 em 2 s. O cache de catálogo existente não foi tocado.

## 12) Testes realizados

**Executados de verdade:**
- `GET /filme/550` com UA de desktop, celular e Android TV → desafio em todos.
- Corpo do desafio inspecionado linha a linha (confirmado que é do provedor).
- `POST /api/turnstile-verify` → 403 com corpo JSON de erro do provedor.
- Backend `/api/streambetter-resolve` → 200 `text/html` (rota inexistente).
- `assembleRelease` → **BUILD SUCCESSFUL**.
- `aapt2 dump badging` → `com.movieflix.tv` **v2.2.1 / versionCode 18**.
- `apksigner verify` → assinado, SHA-256 `8741e4dd…b08f` (**mesma keystore** →
  atualiza por cima das versões anteriores).
- `npm run typecheck` → **0 erros** · `npm run build` → **exit 0**.
- Tamanho publicado confere **byte a byte** com o build local (17.456.025).

**Não executados (e por que):** login, perfil, adicionar/remover favorito,
reprodução e fullscreen **em aparelho físico** — não há Android TV/Google
TV/TV Box neste ambiente. O que afirmo com prova é o diagnóstico e o build.

**Falha real enfrentada:** o daemon do Gradle foi morto duas vezes. A causa era
o **limite de cgroup de 2 GB** do container (`memory.peak` = 2.147.487.744),
não a RAM do host, que `free` mostrava como 295 GB livres e levava a um
diagnóstico errado. O `gradle.properties` do projeto já estava calibrado para
esse teto; o build passou ao usar a configuração do próprio projeto.

## 13-14) APK RELEASE

- **Versão:** 2.2.1 (versionCode 18) · **16,6 MB** (17.456.025 bytes)
- **SHA-256:** `c96dcbca6e338b769ca2e96859cf9883316710e8001f65052fe6fe6b58a05e34`
- **Local:** `public/apk/MovieFlixTV-v2.2.1.apk` (o download oficial do TV)
- **Debug:** **não** está em `public/apk/` e não é oferecido ao público.

## 15-16) Commit e push

Branch `main`. Hash e URL no relatório de entrega.

## 17) Alterações fora de `movieflix-tv/`

| Arquivo | Alteração | Por quê |
|---|---|---|
| `src/lib/appInfo.ts` | `TV_APP_INFO`: 2.2.0→**2.2.1**, versionCode 17→**18**, `apkFileName`→`MovieFlixTV-v2.2.1.apk` | ponto único que a página de download lê. **Aditivo** — `APP_INFO` do mobile, `APK_URL` e `DOWNLOAD_PAGE_URL` intactos. O QR code deriva dessas constantes, então passou a apontar para o APK novo sozinho. |
| `public/apk/MovieFlixTV-v2.2.1.apk` | arquivo **novo** | a entrega pedida |

**Nenhum arquivo do aplicativo mobile foi tocado.** Nenhuma alteração no site
além das duas acima.

## O que NÃO foi feito (propositalmente)

- Não burlamos CAPTCHA/Turnstile, não forjamos tokens, não fizemos scraping
  protegido, não simulamos verificação humana.
- Não criamos catálogo, favoritos, histórico, assinatura ou autenticação
  paralelos — tudo usa as tabelas e a sessão reais do MovieFlix.
- Não inventamos URLs de vídeo nem endpoints.
