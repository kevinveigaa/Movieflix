# MovieFlix TV

Aplicativo **nativo para Android TV, Google TV e TV Box** — a mesma experiência do
MovieFlix do celular e do site, com interface, navegação e controles
reconstruídos para **controle remoto (D-pad)**.

O app mobile **não** é copiado visualmente: o mobile é a **referência funcional**
(mesma lógica, mesmos dados, mesmas regras, mesmas contas) e a interface é 100%
nova, pensada para tela grande a 3 metros de distância.

---

## Arquitetura

```
movieflix-tv/
└── android/                      # Projeto Gradle independente (applicationId com.movieflix.tv)
    ├── app/
    │   ├── src/main/
    │   │   ├── assets/           # filmes.json + series.json (MESMO catálogo do site)
    │   │   ├── java/com/movieflix/tv/
    │   │   │   ├── AppConfig.kt            # URLs do Supabase e do backend (mesmos do site)
    │   │   │   ├── SupabaseRest.kt         # cliente HTTP do PostgREST/Auth
    │   │   │   ├── AuthRepository.kt       # login, refresh, logout, recuperar/trocar senha
    │   │   │   ├── AccountRepository.kt    # assinatura, planos, validade, limite de telas
    │   │   │   ├── PlanoRegras.kt          # MESMAS regras de plano do mobile
    │   │   │   ├── ProfilesRepository.kt   # perfis + avatares (mesmo conjunto do site)
    │   │   │   ├── CatalogRepository.kt    # catálogo (redes + assets), busca, gêneros, categorias
    │   │   │   ├── FavoritesRepository.kt  # Favoritos (tabela `favorites`)
    │   │   │   ├── WatchHistoryRepository.kt      # histórico (tabela `watch_history`)
    │   │   │   ├── PlaybackSessionRepository.kt   # limite de telas (`playback_sessions`)
    │   │   │   ├── StreamResolver.kt       # resolução do stream para o player
    │   │   │   ├── MfDesign.kt             # design system (cores, tipografia, foco)
    │   │   │   ├── MfKeyboard.kt           # teclado em tela completo (D-pad)
    │   │   │   ├── MfRowsView.kt / MfRows.kt      # carrosséis horizontais
    │   │   │   ├── CardPresenter.kt        # cards (tamanho, estados, foco)
    │   │   │   ├── DropBannerPresenter.kt  # HERO/banner do topo
    │   │   │   ├── SidebarView.kt / SidebarHostActivity.kt   # menu lateral
    │   │   │   ├── LoginActivity.kt        # login + recuperar senha
    │   │   │   ├── ProfilesActivity.kt     # "Quem está assistindo?" + avatar
    │   │   │   ├── MainActivity.kt         # Home (HERO + linhas)
    │   │   │   ├── CatalogActivity.kt      # Filmes / Séries
    │   │   │   ├── SearchActivity.kt       # Busca
    │   │   │   ├── MyListActivity.kt       # Favoritos
    │   │   │   ├── HistoryActivity.kt      # Continuar assistindo + histórico
    │   │   │   ├── DetailsActivity.kt      # Detalhes, temporadas e episódios
    │   │   │   ├── AccountActivity.kt      # Assinatura e planos
    │   │   │   ├── SettingsActivity.kt     # Configurações + trocar senha + logout
    │   │   │   └── PlaybackActivity.kt     # Player nativo em tela cheia (Media3)
    │   │   └── res/                        # layouts, drawables, cores, dimens
    │   └── build.gradle
    └── gradle/wrapper/
```

**Player:** `androidx.media3` (ExoPlayer) **nativo**. Não há WebView, iframe,
navegador externo nem Chrome em nenhum ponto do app.

---

## Build

Pré-requisitos: JDK 17, Android SDK (compileSdk 34).

```bash
cd movieflix-tv/android

# Debug
./gradlew :app:assembleDebug --no-daemon
# → app/build/outputs/apk/debug/app-debug.apk

# Release (assinado com a keystore do projeto)
./gradlew :app:assembleRelease --no-daemon
# → app/build/outputs/apk/release/app-release.apk
```

Instalar na TV (com a TV em modo desenvolvedor e `adb` conectado):

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

O `AndroidManifest.xml` exige `android.software.leanback` e declara
`android.hardware.touchscreen` como **não obrigatório**: o app só aparece em
Android TV / Google TV / TV Box e funciona inteiramente sem toque.

---

## Controles (controle remoto)

### Geral
| Tecla | Ação |
|---|---|
| ↑ ↓ ← → | move o foco entre menus, cards, botões e teclas |
| OK / ENTER | seleciona, abre detalhes, aciona o botão focado |
| BACK | volta uma tela (nunca fecha o app sem querer) |
| SEARCH | abre a Busca |
| MENU / SETTINGS | abre as Configurações |

### Menu lateral
← a partir do conteúdo entra no menu; ↑ ↓ percorre os itens; OK navega.

### Carrosséis
← → percorre os cards; ↑ ↓ troca de fileira; OK abre Detalhes.

### HERO (banner)
← → troca o destaque em exibição; OK aciona "Assistir" ou "Mais informações".

### Teclado em tela
↑ ↓ ← → percorre as teclas • OK digita • `⇧` (SHIFT) alterna maiúsculas por uma
letra • `⇪` (CAPS) fixa maiúsculas • `123` / `ABC` / `#$%` alternam os conjuntos •
`⌫` apaga • `LIMPAR` apaga tudo • `ENTER` confirma • BACK volta ao campo.
Letras, números, acentos, `@ . - _` e símbolos estão disponíveis.

### Player
| Tecla | Ação |
|---|---|
| OK | play/pause (com os controles abertos, aciona o botão focado) |
| ← / → | retroceder / avançar |
| ↑ / ↓ | abrir os controles |
| BACK | fecha os controles (se abertos) ou sai do player |
Os controles **aparecem quando precisos e somem sozinhos** após alguns segundos.

---

## Player e tela cheia

- Reprodução **nativa** via Media3/ExoPlayer, com suporte a HLS (`.m3u8`) e MP4.
- Iniciar "▶ Assistir" abre o player **em tela cheia real** — sem menu, sem
  cabeçalho, sem margens, usando modo imersivo.
- O progresso é salvo periodicamente na MESMA tabela `watch_history` do
  site/mobile, então o que você assiste na TV continua de onde parou no celular.

---

## Dados, contas e regras (tudo compartilhado com o site/mobile)

| Domínio | Fonte |
|---|---|
| Autenticação | Supabase (`/auth/v1/token`, `/auth/v1/recover`, `/auth/v1/user`) |
| Perfis | tabela `viewer_profiles` |
| Favoritos | tabela `favorites` |
| Histórico / Continuar assistindo | tabela `watch_history` |
| Limite de telas | tabela `playback_sessions` |
| Planos e assinatura | tabela `plans` + `subscriptions` |
| Catálogo | `filmes.light.json` / `series.light.json` (mesmos arquivos do site) + cache local |
| Gêneros | `/api/tmdb/generos` (mesma API pública do site) |

Nenhum plano, preço, catálogo ou regra paralela é criado aqui.

---

## Limitações reais (declaradas, não escondidas)

1. **Fontes de vídeo protegidas por desafio anti-bot.** O embed do provedor usado
   pelo site/runtime web é protegido por Cloudflare Turnstile. Um player
   **nativo** não executa esse desafio, e o projeto **proíbe WebView/iframe**.
   Por isso o app resolve o stream pela **API oficial do provedor** (com a chave
   pública do projeto) e reproduz o HLS/MP4 direto no ExoPlayer. Quando o
   provedor não entregar um stream nativo para um título, o app mostra um estado
   de erro claro com "TENTAR NOVAMENTE" e "VOLTAR" — **nunca** marca o título
   como indisponível por conta própria e **nunca** inventa um vídeo.
2. **Downloads offline** — o direito do plano é lido e exibido; o download em si
   continua sendo feito no celular (o modelo de armazenamento é diferente na TV).
3. **Contratação/pagamento** — feita no site/app; a TV exibe plano, validade,
   qualidade e limite de telas reais.
4. Sem um aparelho Android TV físico neste ambiente, a validação feita aqui é de
   **compilação, layout, lógica e navegação por D-pad**; o teste em aparelho real
   depende do dono do projeto.
