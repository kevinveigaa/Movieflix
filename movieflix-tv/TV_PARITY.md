# MovieFlix TV — Mapa de paridade funcional (v2.1.0)

Mapa direto: **funcionalidade do mobile → arquivo que a implementa na TV**.
Tudo em `movieflix-tv/android/app/src/main/java/com/movieflix/tv/`, salvo
indicação contrária.

## Núcleo (camada de paridade, isolada)

| Responsabilidade | Arquivo | Observação |
|---|---|---|
| Acesso REST ao Supabase (PostgREST + GoTrue) | `SupabaseRest.kt` | inclui refresh de sessão |
| Autenticação (login/cadastro/sessão/logout) | `AuthRepository.kt` | mesma conta do site/app |
| Recuperação e troca de senha | `AuthRepository.kt` | `/auth/v1/recover` e `PUT /auth/v1/user` |
| Assinatura e planos | `AccountRepository.kt` | tabelas `subscriptions` / `plans` |
| Regras de plano (preços, telas, qualidade, downloads, perfis) | `PlanoRegras.kt` | cópia fiel de `src/lib/plans.ts` |
| Perfis de exibição | `ProfilesRepository.kt` | tabela `viewer_profiles` |
| Histórico / continuar assistindo | `WatchHistoryRepository.kt` | tabela `watch_history` + regras de `watchProgress.ts` |
| Limite de telas simultâneas | `PlaybackSessionRepository.kt` | tabela `playback_sessions`, heartbeat |
| Favoritos | `FavoritesRepository.kt` | tabela `favorites` por `tmdb_id` |
| Catálogo (filmes, séries, busca, categorias, temporadas, episódios, URL do player) | `CatalogRepository.kt` + `MediaCatalog.kt` | mesmos `filmes.json` / `series.json` |
| Resolução do stream no backend | `StreamResolver.kt` | mesmo `/api/streambetter-resolve` |
| Progresso local (retomada instantânea) | `ProgressRepository.kt` | storage local |
| Preferências aplicáveis da TV | `AppPrefs.kt` | qualidade, autoplay |

## Interface (reconstruída para TV)

| Tela / componente | Arquivo | Identidade visual nova |
|---|---|---|
| Sistema de design (cores, tipografia, foco, fábricas) | `MfDesign.kt` | paleta e métricas da referência aprovada |
| Métricas responsivas 720p/1080p/4K | `MfMetrics.kt` | card, menu e HERO como fração da tela |
| Teclado em tela completo (D-pad) | `MfKeyboard.kt` | ABC/123/SYM, SHIFT, CAPS LOCK, acentos |
| Diálogos navegáveis pelo controle | `MfDialog.kt` | listas e entrada de texto sem `AlertDialog` |
| Menu lateral persistente | `SidebarView.kt` | pílula em gradiente no item ativo |
| Base das telas com sidebar | `SidebarHostActivity.kt` + `res/layout/activity_shell.xml` | navegação de foco explícita |
| Card de catálogo | `CardPresenter.kt` | poster 2:3 grande, selos, anel de foco, play/favorito |
| HERO de destaque | `DropBannerPresenter.kt` | selo DESTAQUE, chips, título display, 2 botões, dots |
| Carrosséis e grades | `MfRows.kt` | linhas horizontais + grade reaproveitando o card |
| Login / cadastro | `LoginActivity.kt` + `layout/activity_login.xml` | formulário grande, botões pílula |
| Splash | `SplashActivity.kt` + `layout/activity_splash.xml` | logo + wordmark display |
| Perfis | `ProfilesActivity.kt` | grade de cards com avatar em gradiente |
| Home | `MainActivity.kt` | HERO + carrosséis |
| Filmes / Séries | `CatalogActivity.kt` | linha "Todos" + linha por categoria |
| Minha Lista | `MyListActivity.kt` | estados sem login / vazia / com itens |
| Continuar assistindo | `HistoryActivity.kt` | cards 16:9 com barra de progresso |
| Detalhes | `DetailsActivity.kt` | backdrop, poster, chips, temporada/episódio em chips |
| Busca | `SearchActivity.kt` | campo grande + teclado em tela + grade |
| Assinatura / planos | `AccountActivity.kt` | cartões de plano com preços do banco |
| Configurações | `SettingsActivity.kt` | linhas focáveis + logout |
| Paywall | `PaywallActivity.kt` + `layout/activity_paywall.xml` | atalho para os planos reais |
| Player | `PlaybackActivity.kt` + `layout/activity_playback.xml` | overlay D-pad, barra em gradiente |

## Recursos de tema

| Recurso | Arquivo | Conteúdo |
|---|---|---|
| Cores | `res/values/colors.xml` | paleta preta premium + acentos de marca |
| Métricas | `res/values/dimens.xml` | alvos grandes para TV 16:9 |
| Estilos | `res/values/styles.xml` + `values-night/styles.xml` | tema, tipografia, botões, campos |
| Drawables | `res/drawable/*.xml` | pílulas, chips, selos, scrims, anel de foco, ícones |
| Manifest | `AndroidManifest.xml` | `leanback required`, `touchscreen not required`, 11 telas |

## Diferenças conscientes em relação ao mobile (declaradas)

| Item | Mobile | TV | Motivo |
|---|---|---|---|
| Motor de vídeo | embed HTML (StreamBetter) | ExoPlayer/Media3 nativo | WebView/iframe proibidos no pedido |
| Navegação | toque + gestos | D-pad (↑↓←→ OK BACK) | é uma TV |
| Layout | vertical, telas pequenas | horizontal, 16:9, alvos grandes | distância de visualização |
| Recuperação de senha | fluxo por e-mail | disparado pela TV (`/auth/v1/recover`) | mesma conta Supabase |
| Checkout | no site/app | exibe o estado e leva aos planos | não criar gateway paralelo |
| Downloads offline | no aparelho | direito exibido; download no celular | modelo de storage da TV |
