# RELATÓRIO v2.3 — Reprodução (Mobile x TV), Login/Teclado e Favoritos

Escopo desta rodada: **apenas** os defeitos pedidos. Home, Filmes, Séries, Busca,
Perfis, Configurações, layout, Continue Assistindo e o player nativo **não foram
alterados** além do mínimo necessário para a reprodução funcionar.

Arquivos tocados (9 modificados + 4 novos + 4 de teste):

| Arquivo | O que mudou |
|---|---|
| `PlaybackActivity.kt` | correção principal da reprodução (verificação + sessão + player nativo) |
| `StreamResolver.kt` | cookie jar compartilhado + headers de navegador + DataSource do ExoPlayer |
| `FavoritesRepository.kt` | idempotência no `adicionar`, remoção de TODAS as linhas, deduplicação |
| `DetailsActivity.kt` | alternância por estado real + guarda anti-duplo-toque + estado visual |
| `MyListActivity.kt` | uma única ocorrência por título |
| `MfKeyboard.kt` | foco preservado, teclas de caractere roteadas, seleção do campo |
| `LoginActivity.kt` | BACK previsível (não fecha o login durante a edição) |
| `build.gradle` | `testImplementation junit` |
| `gradle.properties` | heap do Gradle/D8 ajustado ao contêiner de 2 GB |
| **novos** `ChallengeScreen.kt`, `WebViewCookieJar.kt`, `TextEditor.kt`, `FavoritesLogic.kt` | lógica pura, testável |
| **novos** `ChallengeScreenTest`, `FavoritesLogicTest`, `TextEditorTest` | 26 testes JVM |

---

## 1. REPRODUÇÃO — causa do problema

O sintoma: a TV ficava presa em *"Confirmando que você é uma pessoa de verdade
antes de carregar o vídeo..."*; em outra tentativa avançava e depois voltava para
anúncio/verificação — enquanto o mobile tocava o mesmo conteúdo.

Foram encontradas **três causas independentes**, todas na TV:

### Causa 1 — O documento-wrapper tinha a MESMA origem do provedor
```kotlin
// antes
wv.loadDataWithBaseURL(AppConfig.STREAMBETTER_BASE, htmlEmbedEmIframe(embedUrl), ...)
```
`AppConfig.STREAMBETTER_BASE` e o `src` do iframe apontavam para a **mesma
origem**. Quando o documento pai e o iframe têm origem igual, o Chromium **não
trata o iframe como frame aninhado**. A página do provedor detecta isso e
responde:

> **"Este link só funciona dentro de um iframe"**

Ou seja: a verificação **nunca começava** — o app ficava exatamente no texto de
confirmação, para sempre. O site e o app mobile montam o iframe a partir da
origem do **APP**, nunca da origem do provedor.

### Causa 2 — A verificação era avaliada UMA única vez
`avaliarDesafio()` era chamada só em `onPageFinished`. Mas:
* o conteúdo real (widget Turnstile / `<video>`) vive **dentro do iframe
  cross-origin** — o JS do documento de topo não o alcança;
* o provedor faz `window.location.reload()` **depois** de validar o token.

Resultado: o app nunca percebia nem a passagem da verificação nem o aparecimento
do vídeo. Sem reavaliação periódica, não havia como sair do estado de espera.

### Causa 3 — A requisição da FONTE era anônima
É a diferença estrutural mobile × TV:

| | Mobile / Site | TV (antes) |
|---|---|---|
| quem pede a **página** | WebView (CookieManager) | WebView |
| quem pede o **vídeo** | **o mesmo WebView** | **OkHttp** (player nativo) |
| cookies da sessão autorizada | compartilhados | **jar próprio e vazio** |
| resultado | toca | volta para a verificação |

Quando o usuário confirma a verificação legitimamente, o provedor grava um
**cookie de liberação**. No mobile ele é reusado automaticamente, porque página e
vídeo usam o mesmo cookie jar. Na TV o player é nativo (exigência do pedido: sem
WebView como player), e o `OkHttpClient` do `StreamResolver` tinha um cookie jar
**separado e vazio** — a requisição seguinte continuava anônima e recebia de novo
a página de verificação.

Bônus da mesma família: `buscarHtmlEmbed()` não enviava `Sec-Fetch-Dest: iframe`,
então o provedor podia tratar a requisição como navegação de topo e devolver a
verificação em vez do embed.

---

## 2. Diferença encontrada entre Mobile e TV

Além do cookie jar acima, uma segunda diferença apareceu nas medições:

* **Mobile**: o embed é montado pela página do app (iframe) → a requisição chega
  com `Sec-Fetch-Dest: iframe`, `Sec-Fetch-Site: cross-site` e os cookies da
  sessão.
* **TV**: montava o wrapper como **navegação de topo na origem do provedor** e
  pedia a fonte por um cliente sem cookies e sem header de iframe.

Ou seja: a TV não estava usando um "fluxo pior" — estava usando um fluxo
**diferente do MovieFlix**. O que foi feito foi replicar o fluxo já existente,
não inventar um novo.

---

## 3. Correção aplicada

1. **Origem do wrapper** (`PlaybackActivity`): o documento local que monta o
   iframe oficial passou a ser carregado com uma origem **neutra e diferente da
   do provedor** (`ORIGEM_WRAPPER = https://movieflix.tv/`). Isso restaura o
   tratamento de *frame aninhado* — o mesmo que o site/mobile têm. Mais um
   **self-recovery único**: se ainda assim a página responder "só funciona dentro
   de um iframe", o app recarrega o wrapper pela origem neutra uma vez e segue
   (sem laço).
2. **Observação contínua** (`monitorarProvedor`, a cada 1,2 s): o app passa a
   reavaliar a tela enquanto o WebView está na frente, enxergando tanto a
   passagem da verificação (inclusive após o `reload()` do provedor) quanto o
   aparecimento do vídeo.
3. **Classificação unificada e pura** (`ChallengeScreen.classificar`): decide
   `desafio` / `player` / `iframe` / `controles` a partir dos dois documentos.
   * O **desafio tem prioridade** sobre um `<video>` escondido de anúncio — antes
     um anúncio podia ser confundido com o player e o watchdog nunca avisava.
   * Iframe **cross-origin sem desafio NÃO é erro** (era o que disparava mensagem
     antes da hora).
4. **Sessão autorizada compartilhada** (`WebViewCookieJar`): o `OkHttpClient` do
   `StreamResolver` passou a ler os cookies do `CookieManager` do Android — o
   **mesmo** cookie jar do WebView/Chromium. É o caminho legítimo: a autorização
   é obtida pelo usuário, gravada pelo navegador e simplesmente reutilizada.
5. **Headers de navegador na resolução**: `Sec-Fetch-Dest: iframe`,
   `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Site: cross-site`,
   `Upgrade-Insecure-Requests`, `Accept-Language` — idênticos aos do iframe.
6. **ExoPlayer com a mesma sessão**: o player nativo passou a usar
   `OkHttpDataSource.Factory` sobre o **mesmo** cliente (cookies + `Referer` +
   UA), via `StreamResolver.dataSourceFactory()`. Sem isso, a playlist e os
   segmentos seriam pedidos sem a sessão autorizada.
7. **Assumir o nativo quando o vídeo aparece**: se o provedor já expõe uma URL de
   mídia (`blob:`/`data:` são recusados — só http(s)), o player nativo assume
   imediatamente; senão a fonte é pedida pelo caminho do MovieFlix **com os
   cookies da sessão**.
8. **Estados nunca presos**: watchdog de 90 s (a verificação é humana, precisa de
   tempo) com rearme limitado a 3 ciclos, e tela de erro com **TENTAR NOVAMENTE**
   e **VOLTAR**.

Player mantido: **Media3/ExoPlayer nativo**, fullscreen, sem iframe como player,
sem abrir Chrome.

---

## 4. Comportamento da verificação (Cloudflare/Turnstile)

**Nada foi burlado.** Nenhum CAPTCHA resolvido por código, nenhum token criado,
nenhuma página protegida raspada por fora do navegador, nenhum bypass.

O que o app faz é o fluxo autorizado:
1. a verificação legítima aparece **dentro do iframe** do provedor (origem
   própria, como no site);
2. o usuário confirma **com o controle remoto** (foque o quadro com as setas,
   confirme com OK) — o `injetarNavegacaoRemota` apenas garante que exista um
   elemento focado e que o OK do controle chegue a ele;
3. o navegador grava a autorização permitida (cookie de liberação);
4. o app **reutiliza** essa autorização nas requisições seguintes, sem repetir a
   verificação — exatamente como o mobile.

A verificação **não** é pré-resolvida nem simulada. Ela continua humana.

---

## 5. Comportamento de redirects / anúncios

O que foi **medido** no provedor: a mesma URL de embed entrega, na primeira
visita, a página de verificação — que contém o widget Turnstile **e** um `<video>`
escondido de anúncio; depois da liberação, entrega o conteúdo.

Portanto a diferença de anúncio/redirecionamento entre mobile e TV **não vinha de
o mobile ter um mecanismo secreto de pular anúncio**. Vinha das causas acima: no
mobile a mesma sessão autorizada cobre a página *e* o vídeo, e o embed é montado
como frame aninhado; na TV o wrapper tinha a origem errada e a fonte era pedida
por um cliente anônimo — e o provedor respondia com a página intermediária.

Correção aplicada: **usar corretamente o fluxo já existente do MovieFlix**
(origem de iframe + sessão compartilhada), o que faz a primeira requisição
autorizada já cair no conteúdo.

**Não foi implementado bloqueador de anúncios**, não houve manipulação de página
protegida, não houve ocultação de mecanismo de segurança e nenhum anti-ad foi
contornado.

---

## 6. LOGIN + TECLADO TV

### O defeito e a causa
Digitar `@`, `.`, `_`, `-`, números ou símbolos tirava o foco do campo, fechava o
teclado ou trocava de campo — era impossível completar `usuario@gmail.com` ou
`Senha@123!`.

Duas causas concretas:

1. **Troca de ABC/123/SÍMBOLOS destruía o foco.** `alternarModo()` chamava
   `renderizar()`, que **recria todas as teclas**. A tecla focada deixava de
   existir e o foco ia para lugar nenhum — o OK seguinte caía na tela em vez de
   digitar.
2. **A edição dependia de onde estava o foco.** O `EditText` tem
   `nextFocusDown=@id/tecla0`; com o foco em uma tecla, um ENTER podia ser
   entregue a outro elemento. A edição não era determinística.

### Correção
* `TextEditor` (lógica **pura**, 9 testes): inserir substitui a seleção e devolve
  o texto + a posição do cursor **no fim do que foi inserido**. Aceita **todos**
  os caracteres (letras, maiúsculas, minúsculas, dígitos, `@ . _ - # $ % & * + =
  ( ) [ ] { } / \ ! ? : ; ~ ^ | < >`, acentos do português). `apagar` respeita a
  seleção e nunca passa do começo. `aplicarCaixa` só afeta letras do modo ABC.
* `MfKeyboard` usa `TextEditor` e **sempre** faz
  `setSelection(posicaoFinalSelecao(...))` — o campo permanece o mesmo, com o
  cursor no fim, durante toda a digitação.
* `alternarModo()` reposiciona o foco no botão de modo após re-renderizar:
  trocar ABC/123/SÍMBOLOS **não** perde o foco nem o campo em edição.
* `ligarBordas()` aponta o `nextFocusUp` da primeira linha para o **campo em
  edição** (`alvo`), não para um campo fixo: subir do teclado volta ao campo
  certo.
* `dispatchKeyEvent`: com o foco **dentro do teclado**, toda tecla de caractere
  imprimível (controle com teclado físico, ou aparelho que informe `unicodeChar`)
  entra **direto no campo**. Setas/OK/ENTER (`unicodeChar` 0 ou de controle)
  continuam passando para a tecla focada — a navegação do D-pad fica intacta.
* Fluxo garantido: **E-MAIL → OK → teclado → digitar completo → navegar para
  SENHA → OK → teclado → digitar completo → navegar para ENTRAR → OK → login**.

### Teste de e-mail e senha (automatizado, 9 testes)
* `usuario_teste.1@gmail.com` → digitado **completo**, cursor no fim;
* `Senha@123!` → digitado **completo**;
* `a-b_c.d@e#1$2%3&4*5` → símbolos e números **não interrompem**;
* substituição de seleção, BACKSPACE (inclusive além do início), apagar seleção
  inteira, SHIFT/CAPS LOCK, limites da posição do cursor, e troca de modo
  preservando o texto — todos passando.

### BACK (pedido 6)
* foco **no teclado** → o próprio `MfKeyboard` consome e devolve o foco ao campo
  em edição;
* foco **no campo** → sai da edição e vai para ENTRAR (**não fecha mais o
  login**, que antes chamava `finishAffinity()` durante a edição e perdia
  e-mail/senha digitados);
* foco **fora da edição** → aí sim o BACK sai.

---

## 7. FAVORITOS — correção definitiva

### Causa das duplicatas (três defeitos somados)
1. `DetailsActivity.alternarLista()` decidia o que fazer lendo o campo
   `naLista` — **estado da TELA**, atualizado só **depois** da resposta chegar
   (`if (ok) { naLista = !naLista }`). Vários OKs rápidos do controle liam
   `naLista == false` e **cada um inseria uma linha**.
2. `FavoritesRepository.adicionar()` fazia **INSERT direto**, sem conferir se o
   título já estava salvo. O site (`src/hooks/useFavorite.ts`) sempre confere
   antes — a TV não conferia.
3. Nada deduplicava a leitura: `listarResultado()` devolvia todas as linhas.

### Correção (usa o sistema REAL, sem banco paralelo)
* **`FavoritesLogic`** (lógica pura, 8 testes) concentra as três regras:
  `decidir(jaNoServidor, travado, podeEscrever)` → `ADICIONAR` / `REMOVER` /
  `IGNORAR`; `deduplicar(linhas)` → uma linha por título; `linhasDoTitulo(...)`;
  `estadoBotao(...)`.
* **`FavoritesRepository.contem(...)`**: pergunta ao **servidor** se o título
  está salvo.
* **`adicionar` idempotente**: se já existe → **não insere** de novo.
* **`remover` apaga TODAS as linhas do título** (por `id=in.(...)`), não só a
  primeira — senão o título continuaria na lista e o botão voltaria para
  "favoritado" logo após remover.
* **`listarResultado` deduplica** a leitura (resolve duplicatas antigas).
* **`MyListActivity` deduplica antes de cruzar com o catálogo** → **uma única
  ocorrência** por título na página Favoritos.
* **`DetailsActivity`**: guarda `trabalhandoLista` obtida **antes de qualquer
  suspensão** (o 2º toque durante a requisição é **ignorado**, não vira outra
  linha); depois relê o estado **real** para pintar o botão — nunca supõe. Sem
  tocar em `favorites` fora do fluxo do site (mesma tabela, mesmo JWT, mesma RLS).

### Estado visual (pedido 8)
* não favoritado → `♡  Favoritos`, texto branco, fundo `bg_pill_secondary`;
* favoritado → `♥  Remover dos Favoritos`, texto **AMARELO** (`MfDesign.GOLD`, o
  mesmo da nota ★ do MovieFlix) e fundo `bg_pill_fav`.

Não é mais "apenas uma borda branca": o rótulo diz o estado e a cor confirma.

### Comportamento e não-duplicação (testado)
* Teste automatizado dos **quatro toques seguidos**: `ADICIONAR → REMOVER →
  ADICIONAR → REMOVER`;
* toque durante operação em andamento → `IGNORAR` (é o que impede o INSERT
  duplo);
* 3 linhas antigas do mesmo título → deduplicadas em **1**;
* filme e série com o mesmo TMDb id → **não colidem**;
* remoção encontra **todas** as linhas do título.

### Persistência
Adicionar → sair da tela → voltar: o botão é repintado a partir da **releitura do
banco** (`carregarEstadoLista` no `onResume`), então continua favoritado. A tela
Favoritos relê em `onResume` e mostra uma única ocorrência. Reiniciar o app não
altera nada, porque o estado vem do servidor (mesma tabela do site).

---

## 8. TESTES EXECUTADOS

### Testes JVM da lógica corrigida — **27 testes, 0 falhas**
```
com.movieflix.tv.ChallengeScreenTest : tests=9 failures=0 errors=0
com.movieflix.tv.FavoritesLogicTest  : tests=8 failures=0 errors=0
com.movieflix.tv.TextEditorTest      : tests=9 failures=0 errors=0
com.getcapacitor.myapp.ExampleUnitTest: tests=1 failures=0 errors=0
TOTAL: 27 testes, 0 falhas
```
Comando: `./gradlew :app:testDebugUnitTest`

### Compilação e empacotamento
```
./gradlew :app:assembleDebug
BUILD SUCCESSFUL in 1m 34s
app/build/outputs/apk/debug/app-debug.apk   20.730.853 bytes
```
* `package: com.movieflix.tv  versionCode=19  versionName=2.2.2`
* `targetSdkVersion 34`, `sdkVersion( mín ) 23`
* `application-label: 'MovieFlix TV'`
* assinado (Android Debug), SHA-256 do APK:
  `4407414b7a2bc158659c4deb17ab214b014198233e1896a0ee8abae4980e5ab5`
* **verificado no dex**: as classes `ChallengeScreen`, `WebViewCookieJar`,
  `TextEditor`, `FavoritesLogic` e os métodos novos (`capturarFonte`,
  `reenquadrar`) **estão dentro do APK** — não é só código-fonte compilado.
* cópia do artefato: `movieflix-tv/android/dist/movieflix-tv-debug.apk`

### O que NÃO pôde ser testado aqui (honestidade obrigatória)
Este ambiente **não tem TV, TV Box, emulador de TV nem controle remoto**. Portanto
**não** foi executada a reprodução ponta a ponta em aparelho (filme/série/
episódio, 1ª e 2ª reprodução, play/pause, avanço, retrocesso, BACK), nem o login
digito-a-digito pelo controle, nem o adicionar/remover pelo controle.

Esses fluxos foram validados por: (a) **medições HTTP reais** contra o provedor,
(b) **testes automatizados** da lógica que decide cada um deles e (c) inspeção do
APK. Os passos que dependem de hardware continuam **pendentes de verificação
manual em aparelho** — este relatório não afirma que já tocaram.

---

## 9. LIMITAÇÕES REAIS RESTANTES

1. **A verificação humana continua humana.** O app não a resolve, não a simula e
   não a contorna — por decisão e por princípio. Se algum dia o provedor exigir
   uma interação **incompatível com o D-pad** (por exemplo, QR Code para um
   segundo aparelho), não existe forma autorizada de completá-la dentro do
   player nativo: nesse caso o caminho correto é **documentar a limitação** e
   mostrar a tela de erro com TENTAR NOVAMENTE/VOLTAR — **sem criar bypass**.
   Nenhum bypass foi criado.
2. **A autorização é do provedor, não nossa.** Se o cookie de liberação expirar
   por tempo/IP, o provedor pode pedir a verificação de novo. Nesse caso o app
   mostra a etapa de verificação legítima outra vez — o que é o comportamento
   correto, não um defeito.
3. **Ambiente sem aparelho.** Como acima: falta a validação manual em TV real.
4. **Heap do contêiner.** O build exige ~2 GB: o `gradle.properties` foi ajustado
   (`-Xmx1000m`) para o dexing caber no limite do sandbox. Em máquina de
   desenvolvimento, os valores originais podem ser restaurados sem prejuízo.
5. **`push` não executado.** Não havia token/credencial de GitHub disponíveis
   neste ambiente (nenhum perfil de credencial configurado). O commit local foi
   feito; o `git push origin main` precisa ser executado por quem tem o token.

---

## 10. DECLARAÇÃO FINAL SOBRE ESTA ENTREGA

* A **causa raiz** da reprodução foi identificada com evidência (origem do
  wrapper, avaliação única, cookie jar separado) e **corrigida no código real** —
  não é "compilou, então está resolvido".
* **Login/teclado** e **favoritos** foram corrigidos com lógica pura coberta por
  testes que reproduzem exatamente o comportamento pedido (digitar o e-mail
  inteiro; 1º clique adiciona, 2º remove, 3º adiciona, 4º remove, sem duplicar).
* **Compila, empacota e passa nos testes** — e o APK contém as correções.
* **A validação em aparelho ainda é necessária** e está declarada acima. Não
  afirmo que tocou em uma TV; afirmo que o fluxo foi alinhado ao do mobile, com
  medição e teste, e que o que depende de hardware precisa ser confirmado com o
  controle remoto na mão.
