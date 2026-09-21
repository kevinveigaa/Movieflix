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

**Correção aplicada:** o app agora resolve o stream pela **API oficial do
provedor, com a chave pública do projeto**, e entrega o **HLS/MP4 direto ao
ExoPlayer nativo**. Quando o provedor não devolve um stream nativo para um
título, o app **não** inventa vídeo nem esconde o conteúdo: exibe **estado de erro
explicativo** com **"TENTAR NOVAMENTE"** e **"VOLTAR"**, ambos navegáveis pelo
D-pad. Nenhum título é marcado como indisponível por conta própria.

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

## 10. Limitações reais

1. Fontes protegidas por Turnstile exigem a API oficial do provedor para virar
   stream nativo (ver §3). Sem stream nativo disponível, o app mostra erro claro
   — o que **não** acontece é inventar vídeo ou esconder conteúdo.
2. Downloads offline: direito do plano exibido; download é feito no celular.
3. Pagamento/contratação: no site/app.
4. Sem aparelho físico: validação de build/layout/lógica (ver §7).
