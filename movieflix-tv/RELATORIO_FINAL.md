# MovieFlix TV — Relatório Final

Rodada: revisão, correção e adaptação completa do app de TV.
Referência funcional: **app mobile / site** (`src/`, `backend/`, `public/`).
Referência visual: as 10 imagens enviadas pelo dono.

---

## 1. O que foi encontrado no MOBILE (auditoria)

| Domínio | Como o mobile/site faz | Arquivo de referência |
|---|---|---|
| Autenticação | Supabase Auth (`/auth/v1/token?grant_type=password`), sessão + `refresh_token` | `src/lib/supabase*` |
| Recuperação de senha | `resetPasswordForEmail` → `POST /auth/v1/recover` | fluxo Supabase |
| Troca de senha (logado) | `updateUser` → `PUT /auth/v1/user` | fluxo Supabase |
| Perfis | tabela `viewer_profiles` (nome, avatar, kid) | Supabase |
| Avatares | DiceBear `thumbs` com seeds/cores fixos | `src/lib/avatars.ts` |
| Catálogo | `public/filmes/filmes.light.json` e `series.light.json` | `public/filmes/` |
| Gêneros | `/api/tmdb/generos` | backend |
| Favoritos | tabela `favorites` por `tmdb_id` | `src/lib/favorites*` |
| Histórico | tabela `watch_history` (posição, progresso, episódio) | `src/lib/watchHistory*` |
| Limite de telas | tabela `playback_sessions` + heartbeat | `src/lib/playbackSession*` |
| Planos | tabela `plans` (simple/standard/premium) + `subscriptions` | backend |
| Player | embed do provedor StreamBetter | `src/components/player/StreamBetterEmbed.tsx` |

## 2. Diferenças encontradas no TV (antes desta rodada)

1. **Catálogo desatualizado** — `assets/filmes.json` tinha **4.000** filmes contra
   **18.080** no catálogo real. Metade do conteúdo simplesmente não existia no app.
2. **Cards grandes demais** — 200×300dp → ~4 colunas por fileira.
3. **Foco cobria a capa** — o destaque do card tingia o poster.
4. **Home pobre** — 3 linhas genéricas + até 8 categorias.
5. **"Minha Lista"** em vez de **"Favoritos"** (a função sempre foi favoritos).
6. **Avatares invisíveis** — o site grava avatares **`.svg`**; o Glide/Android não
   decodifica SVG sem módulo extra → nenhum avatar aparecia.
7. **Sem recuperação/troca de senha** na TV.
8. **"Não disponível" espalhado** — bloqueador principal (ver §3).

## 3. Correção CRÍTICA: por que o TV dizia "não disponível"

**Investigação (com prova, não suposição):**

- O app de TV tentava resolver o stream por HTTP (OkHttp) direto no embed do
  provedor e, quando falhava, exibia "indisponível".
- Testes com `curl` mostraram que o embed responde um **desafio Cloudflare
  Turnstile** ("Verificando…") — com **e** sem a chave pública `sb_pk_*`, com
  headers de navegador, Referer e Origin corretos.
- Ou seja: **nenhuma** requisição HTTP simples (OkHttp/ExoPlayer) consegue passar;
  o embed só abre dentro de um motor que executa JavaScript + o desafio — que é
  exatamente o que o site/mobile faz (iframe/WebView).
- O TV **não** pode usar WebView (proibido pelo dono) → a resolução nativa pelo
  embed é **tecnicamente impossível**, não é um bug de ID, parâmetro, header ou
  token.
- A rota `/api/streambetter-resolve` citada na documentação antiga do TV **não
  existe** no backend publicado (devolve o HTML do SPA) — foi por isso que
  tentativas anteriores falharam.

**O que foi feito:** o resolvedor agora envia a **chave pública do plano Creator**
para o embed (antes ela era descartada ao montar a URL), o que é condição
necessária para o provedor autorizar a entrega. Também foi removida a marcação
automática de "indisponível": nenhum título é dado como indisponível por conta
própria, e o app mostra **estado de erro explicativo** com **"TENTAR NOVAMENTE"**
e **"VOLTAR"** navegáveis pelo D-pad.

**O que NÃO está resolvido (limitação real, sem maquiar):** testei os endpoints
que o resolvedor usa e **nenhum existe** no backend publicado — `/api/streambetter-resolve`,
`/api/extract-superflix` e `/api/extract-embedplayer` devolvem **HTML do SPA**
(não há nenhuma rota `/api/...` declarada em `backend/server.js`). Logo, a
camada 1 do resolvedor nunca responde JSON, e a camada 2 (scrape do embed)
esbarra no Turnstile. **Conclusão honesta: com player 100% nativo e sem WebView,
não existe hoje um caminho verificado para reproduzir os títulos** — o site/mobile
consegue porque o embed roda num contexto de navegador, que é justamente o que
foi proibido na TV. Isso precisa de uma decisão do dono (ver §10).

## 4. Alterações visuais

- Cards **reduzidos** para **168×252dp** → **~6 colunas** visíveis e mais fileiras
  por tela, mantendo legibilidade a distância.
- **Foco do card refeito**: moldura em gradiente magenta→vermelho + fio branco
  interno + leve zoom + elevação. **A capa fica 100% visível** — nenhuma camada
  opaca sobre a arte.
- **HERO** de 288dp (não ocupa a tela): selo de destaque, título grande, sinopse,
  botões "Assistir"/"Mais informações" e indicadores de página (←/→).
- Menu lateral de 232dp com pílula em gradiente no item ativo.
- Paleta escura premium, tipografia grande, alto contraste — identidade das
  imagens de referência.

## 5. Alterações funcionais

| Item | Status |
|---|---|
| Home com HERO + linhas | ✅ reescrita (Filmes em alta, Séries em alta, Lançamentos, Populares, Séries recentes + linhas por gênero + categorias) |
| Cards | ✅ menores, ~6 colunas, foco sem cobrir a capa |
| Favoritos | ✅ renomeado para "Favoritos", usando a tabela real `favorites`; detalhes com "▶ ASSISTIR" e "♡ Favoritos" / "♥ Remover dos Favoritos" |
| Continuar assistindo | ✅ separado de Favoritos, mesma `watch_history`; séries retomam no episódio certo |
| Perfis e avatares | ✅ mesmo conjunto do site, pedido em **PNG** para o Android renderizar + tela para trocar avatar |
| Login | ✅ responsivo, com logo, e-mail, senha, entrar, criar conta |
| Recuperar senha | ✅ novo — `POST /auth/v1/recover` (mesmo e-mail de redefinição) |
| Trocar senha | ✅ novo — `PUT /auth/v1/user` em Configurações |
| Teclado | ✅ teclado em tela navegável por D-pad, com letras, números, acentos, `@ . - _`, símbolos, SHIFT, CAPS, apagar, limpar, ENTER, ABC/123/#$% |
| Busca | ✅ preservada e reforçada (teclado novo, resultados, seleção, detalhes, reprodução) |
| Configurações | ✅ mantidas + "Trocar senha" |
| Player | ✅ Media3 nativo (HLS/MP4), sem WebView/iframe/navegador |
| Tela cheia | ✅ modo imersivo, sem menu/cabeçalho/margens |
| Controle remoto | ✅ OK = play/pause, ← = retroceder, → = avançar, BACK = sair; controles auto-ocultam |
| Estados de erro | ✅ novo componente reutilizável com "TENTAR NOVAMENTE" / "VOLTAR" |
| Responsividade | ✅ tudo em dp/sp → 720p, 1080p e 4K |

## 6. Filmes e séries

- Catálogo trocado pelo **real, completo** (mesmos arquivos que o site usa).
- Busca passou a varrer **até 300 resultados** (antes 80).
- Temporadas/episódios continuam vindo do MESMO endpoint do mobile.

## 7. Testes realizados

- **Compilação real**: `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL**.
- `./gradlew :app:assembleRelease` → **APK assinado gerado** (versionCode 15 /
  2.1.0, `com.movieflix.tv`).
- **Correções de erro de compilação feitas durante o processo** (não maquiadas):
  recurso de cor inexistente (`mf_magenta` → `mf_red`), import faltante de
  `View`, 4 usos de `MfDesign.dp(this…)` dentro de `apply {}` (onde `this` é a
  View, não Context) → corrigidos com `this@Activity`.
- Navegação por D-pad revisada tela a tela (foco inicial, ordem de foco, BACK).
- **Não** foi possível executar em um Android TV físico neste ambiente — essa
  validação depende do dono. O que foi validado aqui é compilação, layout, lógica
  e navegação.

## 8. Resoluções

Todos os tamanhos são `dp`/`sp`, portanto escalam por densidade. Revisado para
**1280×720**, **1920×1080** e **3840×2160** (nada cortado, sobreposto ou fora da
tela: o conteúdo rola e o HERO tem altura fixa menor que a tela).

## 9. Arquivos alterados fora de `movieflix-tv/`

Apenas 2, ambos mínimos e autorizados:

1. `src/lib/appInfo.ts` — constantes `TV_APP_INFO` (versão 2.1.0, versionCode 15,
   `MovieFlixTV-v2.1.0.apk`). **Aditivo**; o app mobile não lê esse bloco.
2. `public/apk/MovieFlixTV-v2.1.0.apk` — o APK publicado.

**Nenhum arquivo do app mobile foi tocado.**

## 10. Limitações reais — e a decisão que só o dono pode tomar

**A mais importante, declarada sem rodeios:** com player **100% nativo** e **sem
WebView/iframe/navegador** (como foi exigido), **não há hoje caminho verificado
para reproduzir os títulos**. O motivo é técnico e foi medido:

1. A fonte usada pelo site/mobile é um **embed protegido por Cloudflare
   Turnstile** — só funciona dentro de um motor que executa JavaScript e resolve
   o desafio (um navegador).
2. Os endpoints que permitiriam "traduzir" esse embed em um HLS/MP4 nativo
   (`/api/streambetter-resolve`, `/api/extract-superflix`,
   `/api/extract-embedplayer`) **não existem** no backend publicado — respondem
   HTML do SPA; não há nenhuma rota `/api/...` em `backend/server.js`.
3. Também testei as rotas de API do próprio provedor (`/api/stream-token`,
   `/api/sources`, `/api/v1/stream`) com a chave pública: todas devolvem a página
   de desafio, não JSON.

**As três saídas possíveis** (a escolha é do dono, porque mudam a arquitetura):

| Opção | O que implica |
|---|---|
| **A. Backend resolve o stream** | Criar no backend (fora de `movieflix-tv/`) uma rota que resolva o embed e devolva HLS/MP4 — exigiria contornar o Turnstile do provedor, o que pode violar os termos de uso. **Não foi feito sem autorização.** |
| **B. Player por WebView** | Reproduz exatamente como o site/mobile já fazem — mas **contraria a regra explícita** "NÃO USAR WEBVIEW". Só com liberação do dono. |
| **C. Manter nativo e usar outra fonte** | Se o provedor oferecer um endpoint oficial de API para o plano Creator, o caminho nativo volta a ser viável. Precisa de acesso a essa documentação/chave de API. |

Enquanto isso, a correção feita (enviar a chave pública + não marcar títulos como
indisponíveis + estado de erro navegável) **melhora o comportamento e elimina a
mensagem enganosa**, mas **não** faz a reprodução funcionar. Prefiro dizer isso
com clareza a alegar um "funciona" que não testei.

**Demais limitações:**

2. **Downloads offline** — o direito do plano é exibido; o download em si continua
   sendo feito no celular.
3. **Pagamento/contratação** — no site/app; a TV exibe plano, validade, qualidade
   e limite de telas reais.
4. **Sem aparelho Android TV físico neste ambiente** — a validação feita é de
   compilação (BUILD SUCCESSFUL), layout, lógica e navegação por D-pad; o teste
   em aparelho real depende do dono.
