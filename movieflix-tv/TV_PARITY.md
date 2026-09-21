# MovieFlix TV — Paridade Funcional com o app Mobile

> Documento de rastreabilidade: **cada funcionalidade do MovieFlix mobile** → onde ela
> vive no **app Android TV nativo** (`movieflix-tv/`).
>
> Princípio do projeto: **o mobile é a referência funcional**. Reaproveitamos lógica,
> regras, dados e integração; reconstruímos layout, navegação e interação para
> controle remoto (D-pad). O app mobile **não foi alterado**.

---

## 1. Arquitetura

| Camada | Mobile / Site (referência) | MovieFlix TV (novo) |
|---|---|---|
| App | React + Vite + Capacitor (WebView) | **Kotlin nativo + Leanback (Android TV)** |
| Dados | Supabase (PostgREST + GoTrue) | **Mesmo Supabase** (`SupabaseRest.kt`) |
| Auth | `supabase-js` (persistSession + autoRefresh) | **GoTrue REST + refresh automático** (`AuthRepository.kt`) |
| Catálogo | `public/filmes/*.json` via backend | **Mesmos JSON do backend** (`CatalogRepository.kt`) |
| Player | embed StreamBetter → HLS | **Media3/ExoPlayer** + resolvedor (`StreamResolver.kt`) |
| Planos | `src/lib/plans.ts` | **`PlanoRegras.kt`** (cópia fiel das regras) |

Nenhuma tabela, plano, preço ou regra nova foi criado. O TV app **é** o mesmo MovieFlix.

---

## 2. Mapa funcional (mobile → TV)

| # | Funcionalidade (mobile/site) | Arquivo de referência | Implementação na TV | Status |
|---|---|---|---|---|
| 1 | Login por e-mail/senha | `AuthContext.tsx` | `LoginActivity.kt` + `AuthRepository.kt` | ✅ |
| 2 | Cadastro (signup) | `AuthContext.tsx` | `LoginActivity.kt` (CRIAR CONTA) | ✅ |
| 3 | Sessão persistente | `supabase.ts` (`persistSession`) | `AuthRepository.saveSession` (SharedPreferences) | ✅ |
| 4 | Renovação de token | `autoRefreshToken: true` | `AuthRepository.validToken/forcarRefresh` | ✅ |
| 5 | Perfis de exibição | `ProfileSelectPage.tsx` | `ProfilesActivity.kt` + `ProfilesRepository.kt` | ✅ |
| 6 | Limite de perfis por plano | `plans.ts` (`maxProfiles`) | `PlanoRegras.kt` + validação em `ProfilesActivity` | ✅ |
| 7 | Home / destaque + carrosséis | `Home.tsx`, `HeroBanner.tsx` | `MainActivity.kt` (Leanback rows + hero banner) | ✅ |
| 8 | Filmes | `MoviesPage.tsx` | `CatalogActivity` (modo `filmes`) | ✅ |
| 9 | Séries | `SeriesPage.tsx` | `CatalogActivity` (modo `series`) | ✅ |
| 10 | Busca | `SearchPage.tsx` | `SearchActivity.kt` (+ tecla SEARCH do controle) | ✅ |
| 11 | Minha Lista / Favoritos | `favorites` + `useFavorite.ts` | `MyListActivity.kt` + `FavoritesRepository.kt` | ✅ |
| 12 | Histórico | `watch_history` | `HistoryActivity.kt` + `WatchHistoryRepository.kt` | ✅ |
| 13 | Continuar assistindo | `watchProgress.ts` | `HistoryActivity` + `WatchHistoryRepository.temProgressoReal` | ✅ |
| 14 | Temporadas / Episódios | `streamEmbed.ts`, `EpisodioSelector.tsx` | `MediaCatalog.kt` + `DetailsActivity` | ✅ |
| 15 | Detalhes do título | `DetailsPage.tsx` | `DetailsActivity.kt` (+ `DetailsDescriptionPresenter`) | ✅ |
| 16 | Assinatura e planos | `plans.ts`, `subscriptions` | `AccountActivity.kt` + `AccountRepository.kt` | ✅ |
| 17 | Paywall (bloqueio por assinatura) | `SubscriptionPaywall.tsx` | `PaywallActivity.kt` + gate em `PlaybackActivity` | ✅ |
| 18 | Limite de telas simultâneas | `usePlaybackSession.ts` | `PlaybackSessionRepository.kt` (heartbeat 20 s) | ✅ |
| 19 | Player de vídeo | `PlayerPage.tsx` + embed | `PlaybackActivity.kt` (Media3/ExoPlayer **nativo**) | ✅ |
| 20 | Qualidade por plano | `plans.ts` (`maxHeight`) | `PlanoRegras.entitlementsForPlan` + `AppPrefs` | ✅ |
| 21 | Downloads offline | `downloads` no plano | Exibido no plano; **feito no app do celular** | ⚠️ ver §4 |
| 22 | Idioma / Legendas | embed `lang=pt-BR` | `MediaCatalog.embedUrl` (mesmo parâmetro) | ✅ |
| 23 | Configurações | `SettingsPage.tsx` | `SettingsActivity.kt` + `AppPrefs.kt` | ✅ |
| 24 | Perfil / Conta | `ProfilePage.tsx` | `SettingsActivity` (seção CONTA) | ✅ |
| 25 | Logout | `signOut()` | `SettingsActivity.confirmarLogout()` | ✅ |
| 26 | Recuperação de senha | página do site | Delegada ao site (mesma conta) | ⚠️ ver §4 |

---

## 3. Mapa do controle remoto (D-pad)

| Tecla | Ação |
|---|---|
| ▲ ▼ | Rolar telas de detalhes/config/histórico; volume no player |
| ◀ ▶ | Navegar carrosséis; −15 s / +15 s no player |
| OK (centro) | Selecionar / play-pause; abre os controles do player |
| BACK | Volta uma tela; no login, sai do app |
| SEARCH | Abre a Pesquisa |
| SETTINGS / MENU | Abre as Configurações |

**Nenhuma funcionalidade depende de touchscreen** — o manifest declara
`android.hardware.touchscreen required=false` e `android.software.leanback required=true`.

---

## 4. Limitações honestas (documentadas, não escondidas)

1. **Downloads offline na TV**: o sistema de arquivos/storage de uma Android TV não é
   um bom alvo para o modelo de download do celular (e as emissoras de catálogo não
   distribuem arquivos por episódio no catálogo). A TV **exibe** quantos downloads o
   plano permite e orienta o usuário a baixar no app do celular, com a mesma conta.
   Não foi criado nenhum mecanismo paralelo de download.
2. **Recuperação de senha**: a redefinição exige um link por e-mail (fluxo web).
   A TV orienta e o link abre no site/telefone — a conta é a mesma.
3. **Checkout de assinatura**: a contratação/renovação acontece no site/app
   (integração de pagamento existente). A TV mostra os planos, preços e o status
   reais do banco, sem inventar meio de pagamento.

---

## 5. Invariantes respeitados

- **Mesma conta**: login no TV usa o mesmo Supabase Auth do site/mobile.
- **Mesmos dados**: catálogo (`filmes.json`/`series.json`), favoritos
  (`favorites`), histórico (`watch_history`), assinatura (`subscriptions`/`plans`),
  sessões (`playback_sessions`), perfis (`viewer_profiles`).
- **Mesmas regras**: limites de tela, qualidade máxima, número de perfis e
  validade vêm de `subscriptions.expires_at` + `PlanoRegras` — idênticas ao mobile.
- **Mobile intocado**: nenhum arquivo de `src/`, `android/` ou `ios/` do app
  mobile foi modificado (ver `EXTERNAL_CHANGES.md`).
