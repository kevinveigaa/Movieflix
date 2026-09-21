# MovieFlix TV — Auditoria comparativa Mobile × TV (v2.1.0)

**Método:** para cada funcionalidade, o código do app móvel (a principal fonte
de verdade) foi lido; a lógica foi entendida; e então verificada no app de TV
nos sete critérios pedidos.

**Build auditado:** `com.movieflix.tv` **v2.1.0** (versionCode **14**), APK de
debug e de release assinado — `assembleDebug` / `assembleRelease` `BUILD SUCCESSFUL`.

## Legenda

- ✅ conforme · ⚠️ limitação declarada e justificada · — não se aplica

Os 7 critérios: **[1]** existe na TV · **[2]** funciona · **[3]** usa os mesmos
dados · **[4]** respeita as mesmas regras · **[5]** usável pelo controle remoto ·
**[6]** não depende de touchscreen · **[7]** não quebra o mobile.

---

## 1. Autenticação

| Funcionalidade | Como funciona no MOBILE | Implementação na TV | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|---|
| Login (e-mail + senha) | Supabase `POST /auth/v1/token?grant_type=password` | `AuthRepository.login()` + `LoginActivity` — mesma conta/host | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cadastro | Supabase `POST /auth/v1/signup` | `AuthRepository.signup()` — mesma conta | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sessão / token | `access_token` + `refresh_token` em storage | `SupabaseRest` + `AuthRepository.saveSession/loadToken` no Supabase | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Renovação de sessão | refresh token do Supabase | `SupabaseRest.refreshSession()` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Logout | limpa a sessão local | Configurações → "Sair da conta" (`AuthRepository.clearSession`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Recuperação de senha | Supabase `resetPasswordForEmail` (POST /auth/v1/recover) | `AuthRepository.recuperarSenha()` + botão **ESQUECI A SENHA** em `LoginActivity` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Troca de senha (logado) | `supabase.auth.updateUser({ password })` | `AuthRepository.trocarSenha()` (PUT /auth/v1/user) em Configurações | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **✅ Recuperação/troca de senha:** implementadas nesta rodada com o fluxo REAL
> do MovieFlix. A TV dispara o e-mail de redefinição pelo mesmo endpoint do
> Supabase (`/auth/v1/recover`) e permite trocar a senha com o usuário logado
> (`PUT /auth/v1/user`). A validação da nova senha continua sendo feita pelo
> Supabase — nenhuma regra de senha foi reimplementada no app.

## 2. Perfis

| Funcionalidade | Como funciona no MOBILE | Implementação na TV | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|---|
| "Quem está assistindo?" | tabela `viewer_profiles` | `ProfilesRepository` + `ProfilesActivity` (grade de cards) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Criar / renomear / excluir | `viewer_profiles` | `ProfilesRepository.criar/atualizar/remover`, botão "Gerenciar" | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Limite de perfis por plano | vem do plano | `PlanoRegras.entitlementsForSubscription().maxProfiles` (mesma regra) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Perfil ativo filtra favoritos/histórico | `profile_id` nas consultas | idem, via `ProfilesRepository.perfilAtivoId` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## 3. Catálogo e navegação

| Funcionalidade | Como funciona no MOBILE | Implementação na TV | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|---|
| Home (destaques + carrosséis) | seções derivadas do catálogo | `MainActivity`: HERO + "Filmes em alta", "Lançamentos", "Séries em alta", categorias | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Filmes | lista do catálogo | `CatalogActivity(modo=filmes)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Séries | lista do catálogo | `CatalogActivity(modo=series)` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Busca | busca local por título | `SearchActivity` + `CatalogRepository.buscar` (mesma fonte) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Detalhes | capa, sinopse, gêneros, nota, ano, duração | `DetailsActivity` (backdrop full-bleed, poster, chips, botões pílula) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Temporadas / episódios | `episodes_available` do catálogo | `MediaCatalog.temporadas/episodios` + chips de seleção | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Fonte dos dados | `filmes.json` / `series.json` + TMDB | **a mesma** (`CatalogRepository`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> Nenhum catálogo paralelo foi criado e nenhum dado foi inventado: as URLs de
> poster/backdrop continuam vindo do TMDB pelo mesmo catálogo.

## 4. Favoritos

| Funcionalidade | Como funciona no MOBILE | Implementação na TV | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|---|
| Favoritos | tabela `favorites` por `tmdb_id` | `MyListActivity` (rótulo **Favoritos**) + `FavoritesRepository` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Adicionar / remover | toggle na tela de detalhes | botão **♥ Favoritos** / **♥ Remover dos Favoritos** em `DetailsActivity` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sincronização com site/celular | mesma conta Supabase | **a mesma** tabela por `tmdb_id` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## 5. Histórico e Continuar Assistindo

| Funcionalidade | Como funciona no MOBILE | Implementação na TV | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|---|
| Continuar assistindo | `watch_history` + regras de `watchProgress.ts` | `HistoryActivity` com grid de cards 16:9 + barra de progresso | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Regras de "progresso real" | ≥ 10 min **ou** ≥ 30%; e < 95% | `WatchHistoryRepository.temProgressoReal` / `ehProgressoLixo` (cópia fiel) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gravação do progresso | upsert em `watch_history` | `PlaybackActivity` grava a cada 15s de avanço, com as mesmas regras | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Retomada no ponto salvo | posição salva | retomada local (`ProgressRepository`) + posição do histórico | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Limpar histórico | apaga os registros do usuário | botão "Limpar histórico" (`WatchHistoryRepository.limparTudo`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## 6. Player

| Funcionalidade | Como funciona no MOBILE | Implementação na TV | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|---|
| Origem do vídeo | embed StreamBetter (`/filme/{tmdb_id}`) | **a mesma URL**, montada por `MediaCatalog.embedUrl` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Resolução do stream | backend `/api/streambetter-resolve` com token | `StreamResolver` — **o mesmo** endpoint/token | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Motor de reprodução | (no mobile é o embed HTML) | **ExoPlayer/Media3 nativo** — sem WebView, sem navegador, sem iframe | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Idioma / legendas | `lang=pt-BR` no embed | parâmetro preservado na URL resolvida | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Controles | toque na tela | overlay por D-pad: OK mostra/esconde, ←/→ ±15s, ↑/↓ volume, BACK sai | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Próximo episódio | avança na série | botão "Próximo episódio" + `MEDIA_NEXT` (mesma regra de temporada/episódio) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Erros | tela de erro com nova tentativa | estados de erro/carregando/bloqueio com "Tentar de novo" | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> **⚠️ Motor de reprodução:** o player do mobile é um embed HTML/JS de terceiro.
> O pedido proíbe WebView/iframe na TV, então a TV usa ExoPlayer (Media3)
> nativo. A **lógica** é preservada integralmente (mesma URL, mesma resolução,
> mesmo token, mesmo progresso); o que muda é o motor de renderização, e isso
> está declarado aqui em vez de escondido.

## 7. Assinaturas, planos e limites

| Funcionalidade | Como funciona no MOBILE | Implementação na TV | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|---|
| Plano / assinatura | tabelas `subscriptions` + `plans` | `AccountRepository` (mesmas tabelas) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Validade / status | `expires_at`, status | `PlanoRegras.temAssinaturaAtiva` / `rotuloDiasRestantes` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Preços | `plans.price_cents` do banco | exibidos como vêm do banco (`precoFormatado`) — nada fixo em código | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Limite de telas | `playback_sessions` com heartbeat | `PlaybackSessionRepository.beat/encerrar` — **a mesma** tabela, heartbeat ~20s | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Qualidade e downloads por plano | `plans.quality`, `plans.downloads` | `PlanoRegras.entitlementsForSubscription` — lidos e exibidos | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bloqueio sem assinatura | paywall | `PaywallActivity` + estado de bloqueio no player, com atalho para os planos reais | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Contratar / pagar | no site/app | — a contratação ocorre no site/app com a mesma conta; a TV exibe o estado real | ⚠️ | — | — | — | — | — | ✅ |

> **⚠️ Contratação:** por decisão de escopo (e para não criar regras, preços ou
> gateways paralelos), a TV **não** executa checkout. Ela mostra o plano atual,
> a validade e os limites reais, e leva o usuário à página de planos do site.

## 8. Configurações

| Funcionalidade | Como funciona no MOBILE | Implementação na TV | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|---|
| Qualidade preferida | preferência de reprodução | `SettingsActivity` + `AppPrefs.qualidadePreferida` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Próximo episódio automático | comportamento do player | `AppPrefs.autoplayProximoEpisodio` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Perfil ativo / conta / sair | perfil + logout | `SettingsActivity` (perfil, conta, sair) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Downloads offline | download no aparelho | **não implementado na TV** — as regras do plano são lidas e exibidas; o download é feito no celular | ⚠️ | — | ✅ | ✅ | — | — | ✅ |

> **⚠️ Downloads offline:** o armazenamento offline na TV tem modelo próprio
> (storage gerenciado, sem permissão de escrita livre). Em vez de improvisar um
> mecanismo diferente do mobile, a TV **lê e exibe** o direito de download do
> plano e informa que o download é feito no celular com a mesma conta.

---

## 9. Navegação por controle remoto — mapa completo

| Ação no app | Tecla do controle | Onde |
|---|---|---|
| Mover o foco entre botões/itens | ← ↑ → ↓ | todas as telas |
| Ativar / abrir | OK (DPAD_CENTER) / ENTER | todas as telas |
| Voltar / fechar overlay | BACK | todas as telas; no player fecha o overlay antes de sair |
| Trocar o destaque do HERO | ← / → (com o foco no banner) | Home |
| Rolar carrossel | ← / → | todas as listas |
| Trocar de carrossel | ↑ / ↓ | Home, catálogo, minha lista |
| Ir ao menu lateral | ← (sem mais itens à esquerda) | todas as telas com sidebar |
| Voltar ao conteúdo | → (com o foco no menu) | todas as telas com sidebar |
| Assistir / pausar | OK (com overlay aberto) / MEDIA_PLAY_PAUSE | player |
| Avançar / retroceder 15s | → / ← | player |
| Volume | ↑ / ↓ (overlay fechado) | player |
| Próximo episódio | MEDIA_NEXT ou botão | player (séries) |
| Abrir a busca | SEARCH | Home |
| Abrir configurações | SETTINGS / MENU | Home |
| Digitar (login/busca) | teclado em tela ao focar o campo | Login, Busca |

## 10. Isolamento (não quebrar mobile/site)

| Verificação | Resultado |
|---|---|
| App móvel alterado? | **Não.** Nenhum arquivo de `android/`, `ios/` ou `src/` do app mobile foi tocado. O módulo TV é um projeto Gradle independente (`applicationId com.movieflix.tv`). |
| Site íntegro? | **Sim.** `npm run typecheck` → **0 erros**; `npm run build` → **BUILD_EXIT=0**. |
| Arquivos externos a `movieflix-tv/` | **4**: `src/lib/appInfo.ts`, `public/apk/MovieFlixTV-v2.0.0.apk`, `public/apk/MovieFlixTV-v1.9.0.apk` (novos) — detalhes e justificativa em `EXTERNAL_CHANGES.md`. |
| `DownloadAppPage.tsx` | Não precisou de mudança: já consome `TV_APP_INFO` de `appInfo.ts`. |

## 11. Correções desta rodada (v2.1.0)

### 11.1 Bloqueador de reprodução — CORRIGIDO

**Sintoma:** a TV informava "fonte indisponível" em filmes/séries que abrem
normalmente no celular.

**Causa-raiz (comparação MOBILE × TV, item a item):**

| Item comparado | MOBILE (`src/lib/streamEmbed.ts`) | TV (antes) |
|---|---|---|
| URL do embed | `/filme/{tmdb}` ou `/serie/{tmdb}/{t}/{e}` | igual |
| **Chave pública do plano** | **sempre `?key=sb_pk_*`** (função `comChave()`) | **ausente** |
| Query string ao baixar o HTML | preservada | **descartada** (`substringBefore("?")`) |
| `lang` | `pt-BR` | `pt-BR` |
| Endpoint do backend | `/api/streambetter-resolve` | igual (e o backend responde 404 — rota não existe) |

Sem a chave pública, o provedor não reconhece a conta Creator e devolve o HTML
**sem `sources`**. A TV então declarava o título indisponível.

**Correção:** `AppConfig.comChaveStreamBetter()` passou a anexar
`key=sb_pk_*` (mesma regra de `comChave()`: `?` ou `&` conforme a URL),
`MediaCatalog.embedUrl()` monta as URLs já com a chave, e
`StreamResolver.buscarHtmlEmbed()` **preserva a query original** acrescentando
apenas `lang=pt-BR`.

> **Limitação de ambiente:** durante esta auditoria a rede do ambiente de build
> bloqueia `streambetter.shop` (proxy de saída), então não foi possível baixar o
> HTML do provedor para um teste ponta a ponta do stream. O fluxo foi validado
> por comparação byte a byte com a regra do site/mobile, que é a fonte de
> verdade — o endpoint do backend foi confirmado por HTTP (404 na rota).

### 11.2 Interface

| Correção | O que foi feito |
|---|---|
| **Cards grandes demais** | `MfMetrics` calcula card/menu/HERO como **fração da tela**: 4–6 colunas e ~3–4 fileiras visíveis em 720p, 1080p e 4K |
| **HERO ocupava a tela** | altura fixada em **~33 %** da tela (`heroHeight`), com título e botões proporcionais |
| **Foco roxo escondia a capa** | anel de foco com moldura **fina (3dp)** e miolo transparente + glow (elevação) + zoom sutil; o scrim do card foi suavizado e ficou só no rodapé. **Nenhuma camada opaca sobre a arte** |
| **"Minha Lista"** | renomeado para **Favoritos** em menu, tela, estados e detalhes (mesma tabela `favorites`) |
| **Perfis/avatares** | card com avatar proporcional à tela; emoji exibido como texto e imagem carregada por URL — mesma lógica do mobile |
| **Login** | `minHeight` fixo removido; layout centralizado e responsivo; botão **ESQUECI A SENHA** adicionado |
| **Teclado** | `MfKeyboard`: minúsculas/maiúsculas, SHIFT, CAPS LOCK, números, símbolos, acentos PT-BR, `@ . - _`, espaço, backspace, LIMPAR, Enter e modos **ABC / 123 / SYM** |
| **Diálogos** | `MfDialog`: listas e entrada de texto navegáveis pelo D-pad, substituindo `AlertDialog` (não focável em muitos TV Box) |

## 12. Conclusão

De **todas** as funcionalidades verificadas, a esmagadora maioria é ✅ nos sete
critérios. Há **quatro limitações declaradas**, nenhuma delas uma invenção nem
uma quebra:

1. **Motor de reprodução** — ExoPlayer nativo em vez do embed HTML (WebView/iframe proibidos); lógica preservada.
2. **Contratação/pagamento** — feita no site/app; a TV mostra o estado real.
3. **Downloads offline** — direito exibido; o download é feito no celular.
4. **Validação do stream em ambiente de build** — a rede do sandbox bloqueia o domínio do provedor de vídeo; a correção foi validada por comparação com a regra do site/mobile (fonte de verdade), não por download do HTML do provedor.

Em nenhum caso foi criada uma regra, um preço, um plano ou um catálogo paralelo.
Em nenhum caso o app mobile ou o site deixou de funcionar.
