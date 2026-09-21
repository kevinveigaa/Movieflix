# MovieFlix TV

Aplicativo **nativo para Android TV, Google TV e TV Box** do MovieFlix.
É a mesma conta, o mesmo catálogo e as mesmas regras do site e do app mobile —
com interface, navegação e controles projetados para **controle remoto**.

> **Fonte de verdade funcional:** o app **mobile** (`/src`, `/android`) e o site.
> Nada de catálogo, conta, assinatura ou progresso é inventado aqui: o TV lê e
> grava exatamente as mesmas tabelas e os mesmos arquivos de catálogo.

---

## 1. Arquitetura

```
movieflix-tv/
├── android/                      # Projeto Android (Kotlin, sem framework de UI de terceiros)
│   ├── app/src/main/java/com/movieflix/tv/
│   │   ├── AppConfig.kt          # URLs (Supabase, backend) + chave pública StreamBetter
│   │   ├── AuthRepository.kt     # Login, cadastro, refresh, recuperação e troca de senha
│   │   ├── CatalogRepository.kt  # filmes.json / series.json (mesmos dados do mobile)
│   │   ├── MediaCatalog.kt       # Embed por tmdb_id + temporadas/episódios
│   │   ├── StreamResolver.kt     # Resolve a URL real do vídeo (backend + direto)
│   │   ├── FavoritesRepository.kt# Tabela `favorites` (mesma do site)
│   │   ├── WatchHistoryRepository.kt / ProgressRepository.kt / PlaybackSessionRepository.kt
│   │   ├── MfDesign.kt / MfMetrics.kt / MfRows.kt / CardPresenter.kt
│   │   ├── MfKeyboard.kt         # Teclado em tela COMPLETO (controle remoto)
│   │   ├── MfDialog.kt           # Diálogos navegáveis pelo D-pad
│   │   ├── SidebarView.kt / SidebarHostActivity.kt
│   │   ├── MainActivity.kt       # Home (HERO + carrosséis)
│   │   ├── CatalogActivity.kt    # Filmes / Séries / Favoritos / Continuar assistindo
│   │   ├── DetailsActivity.kt    # Detalhes, temporadas, episódios, Favoritos
│   │   ├── SearchActivity.kt     # Busca
│   │   ├── PlaybackActivity.kt   # Player nativo (Media3/ExoPlayer) em tela cheia
│   │   ├── ProfilesActivity.kt   # Perfis e avatares
│   │   ├── LoginActivity.kt      # Login, cadastro e "ESQUECI A SENHA"
│   │   ├── SettingsActivity.kt   # Configurações, qualidade e troca de senha
│   │   └── AccountActivity.kt    # Assinatura, planos, validade e limites
│   └── app/src/main/res/         # Layouts, cores, drawables e dimens
├── AUDITORIA_TV.md               # Auditoria mobile × TV
├── TV_PARITY.md                  # Matriz de paridade funcional
└── EXTERNAL_CHANGES.md           # Alterações fora deste diretório (se houver)
```

### Camadas

| Camada | Responsabilidade | Espelha no mobile |
|---|---|---|
| `*Repository` | Dados e regras (Supabase, catálogo, progresso) | mesmas tabelas/arquivos |
| `MfDesign` / `MfMetrics` | Identidade visual e métricas responsivas | tema do site/mobile |
| `CardPresenter` / `MfRows` | Cards, carrosséis e grades | pôsteres do catálogo |
| `SidebarView` | Menu lateral navegável | navegação do mobile |
| Activities | Composição de tela e foco | telas do mobile |

**Nenhuma regra de negócio vive na camada visual.** Trocas de tema/layout não
afetam conta, catálogo, assinatura ou progresso.

---

## 2. Paridade com o mobile

| Função | Mobile | TV |
|---|---|---|
| Login / cadastro | Supabase Auth | ✅ mesma conta |
| Sessão / logout / refresh | supabase-js | ✅ `AuthRepository` |
| **Esqueci a senha** | `resetPasswordForEmail` | ✅ `/auth/v1/recover` |
| **Trocar senha (logado)** | `updateUser({password})` | ✅ `PUT /auth/v1/user` |
| Perfis e avatares | tabela `profiles` | ✅ mesma tabela |
| Catálogo (filmes/séries) | filmes.json / series.json | ✅ mesmos arquivos |
| Temporadas / episódios | `episodes_available` | ✅ mesma regra |
| Busca | título original/pt | ✅ mesma normalização |
| **Favoritos** | tabela `favorites` | ✅ mesma tabela |
| **Continuar assistindo** | `watch_history` + posição | ✅ mesma tabela |
| Player | HLS/MP4 | ✅ Media3/ExoPlayer |
| Assinatura / planos / validade | `subscriptions` / `plans` | ✅ mesmas regras |
| Limite de telas | `playback_sessions` | ✅ mesma tabela |

Detalhamento em [`TV_PARITY.md`](TV_PARITY.md) e [`AUDITORIA_TV.md`](AUDITORIA_TV.md).

---

## 3. Reprodução de vídeo — como funciona

O TV usa **exatamente a mesma infraestrutura** do site e do mobile:

1. `MediaCatalog.embedUrl()` monta a URL do embed oficial do StreamBetter
   (`/filme/{tmdb}` ou `/serie/{tmdb}/{temporada}/{episodio}`) **sempre com a
   chave pública do plano Creator** (`key=sb_pk_*`), pela mesma regra de
   `src/lib/streamEmbed.ts` (`comChave()`).
2. `StreamResolver` resolve a URL real do stream, tentando primeiro o backend
   (`/api/streambetter-resolve`) e, em seguida, o caminho direto (mesma
   página, mesmos parâmetros, mesmo `lang=pt-BR`, mesmos headers).
3. A URL final (`m3u8`/`mp4`) é entregue ao **player nativo**.

> ### Correção do bloqueador "conteúdo indisponível"
> A versão anterior da TV montava a URL do embed **sem a chave pública**
> `key=sb_pk_*` e, além disso, o resolvedor **descartava a query string**
> inteira ao baixar o HTML (`base = url.substringBefore("?")`). Sem a chave, o
> provedor não reconhece a conta Creator e o embed volta **sem `sources`** —
> resultado: a TV dizia "fonte indisponível" em títulos que abrem normalmente
> no celular.
>
> Correção aplicada em `AppConfig.comChaveStreamBetter()`,
> `MediaCatalog.embedUrl()` e `StreamResolver.buscarHtmlEmbed()` (esta agora
> **preserva** os parâmetros originais e apenas acrescenta `lang=pt-BR`).

**Fonte realmente indisponível** (quando existe): a TV mostra um estado de erro
explicativo com **TENTAR NOVAMENTE** e **SAIR** — nunca uma tela preta muda.

---

## 4. Controle remoto

Nada no aplicativo depende de touchscreen ou de mouse.

| Tela | Tecla | Ação |
|---|---|---|
| Geral | ↑ ↓ ← → | Navegação entre itens, carrosséis e menu |
| Geral | **OK** | Seleciona / abre |
| Geral | **BACK** | Volta (fecha diálogo → sai da tela) |
| Menu lateral | ← do conteúdo | Foca o menu; → volta ao conteúdo |
| HERO | ← → | Troca o destaque; OK abre o título |
| Texto | OK no campo | Abre o **teclado em tela** |
| Teclado | ↑ ↓ ← → + OK | Digita; SHIFT/CAPS alternam a caixa |
| Teclado | BACK | Volta ao campo de texto |

### Player

| Tecla | Ação |
|---|---|
| **OK** | Mostra/esconde os controles; com os controles abertos, aciona o botão focado |
| **←** | Retrocede 15 s |
| **→** | Avança 15 s |
| **↑ / ↓** | Volume (controles fechados) / navegação (controles abertos) |
| **⏯ / ESPAÇO** | Play / pause |
| **BACK** | Fecha os controles; fora deles, sai do player (salvando o progresso) |

Os controles **aparecem quando necessário e desaparecem automaticamente**, e o
overlay some sozinho após alguns segundos sem interação.

---

## 5. Player e tela cheia

- Player **nativo** (`androidx.media3` / ExoPlayer). **Não há WebView, iframe,
  navegador ou site externo** em nenhum ponto da reprodução.
- Ao confirmar **▶ ASSISTIR**, o player abre **imediatamente em tela cheia
  real**: sem menu lateral, sem Home, sem cabeçalho, sem barras do aplicativo.
- Modo **imersivo** (`SYSTEM_UI_FLAG_IMMERSIVE_STICKY` + fullscreen) — quando o
  aparelho permite — e tela sempre acesa durante a reprodução.
- Ao sair, o progresso é salvo localmente e em `watch_history`.

---

## 6. Interface e foco (referência visual aprovada)

- **HERO** no topo com **~33 % da altura da tela** — o banner **não** ocupa a
  tela inteira; abaixo dele vêm os carrosséis.
- **Cards** dimensionados por fração da tela (`MfMetrics`), garantindo
  **4 a 6 colunas** e **~3 a 4 fileiras** visíveis em 720p, 1080p e 4K.
- **Foco dos cards:** borda em gradiente (magenta→violeta) + glow (elevação) +
  **zoom sutil** + play/favorito. **A capa nunca é coberta por camada opaca** —
  só o rodapé recebe um scrim leve para os ícones ficarem legíveis.
- O mesmo padrão de card e de foco vale para **Home, Filmes, Séries,
  Favoritos, Busca e Continuar Assistindo**.
- **Menu lateral:** Início, Filmes, Séries, Favoritos, Continuar Assistindo,
  Pesquisar, Perfis e Configurações — todos com foco visível.

### Responsividade

`MfMetrics` calcula menu, HERO, cards e paddings como **fração dos pixels da
tela**, e não em `dp` fixos. Isso mantém a mesma composição em:

| Resolução | Colunas | Fileiras visíveis |
|---|---|---|
| 1280 × 720 | 4 | ~3 |
| 1920 × 1080 | 5 | ~3–4 |
| 3840 × 2160 | 6 | ~3–4 |

Telas de login, perfis, teclado, configurações e player seguem a mesma regra;
onde o conteúdo pode passar da altura útil (login, troca de senha), há rolagem,
de modo que **nada fica cortado ou inalcançável**.

---

## 7. Teclado em tela

`MfKeyboard` é um teclado próprio do app (o IME do sistema não é confiável em TV
e costuma não abrir pelo controle). É navegável **só com o D-pad** e oferece:

- letras **minúsculas e maiúsculas**;
- **SHIFT** (próxima letra em maiúscula) e **CAPS LOCK** (trava, com o estado
  indicado na própria tecla);
- **números** 0–9;
- **símbolos**: `- _ . , @ # $ % & * + = ( ) [ ] { } / \ ! ? : ; " ' ~ ^ | < >`;
- **caracteres especiais/acentuados** do português: `á à â ã é ê í ó ô õ ú ü ç ñ`
  (e maiúsculas), além de `§ ° ª º € £ ¥ ¢ © ®`;
- **ESPAÇO**, **⌫ backspace**, **LIMPAR**, **Enter** e as teclas de modo
  **ABC / 123 / SYM**.

Usado em **login, cadastro, esqueci a senha, troca de senha e busca**.

---

## 8. Estados de erro

Nenhuma tela fica preta sem explicação. Há estados navegáveis pelo controle
para: **sem internet**, **erro de login**, **sessão expirada**, **erro de
catálogo**, **erro de API**, **erro de reprodução**, **fonte indisponível**,
**assinatura necessária/expirada** e **limite de telas atingido** — sempre com
ações claras (**TENTAR NOVAMENTE**, **VOLTAR/SAIR**, **VER PLANOS**).

---

## 9. Build

### Requisitos

- JDK **17**
- Android SDK com `platforms;android-34` e `build-tools;34.0.0`
- `local.properties` com `sdk.dir=/caminho/do/Android/Sdk`

### Comandos

```bash
cd movieflix-tv/android

# APK de debug
./gradlew :app:assembleDebug --no-daemon

# APK de release (assinado com a keystore de debug, para distribuição interna)
./gradlew :app:assembleRelease --no-daemon
```

Saída:

```
app/build/outputs/apk/debug/app-debug.apk
app/build/outputs/apk/release/app-release.apk
```

### Assinatura do APK de release

O `buildTypes.release` espera a keystore em
`movieflix-tv/android/keystore/movieflix-tv-release.jks` (alias `movieflix`).
Arquivos `*.jks` estão no `.gitignore` — **nenhuma chave é versionada**.

Para gerar a keystore (uma única vez, guarde-a com segurança):

```bash
keytool -genkeypair -v \
  -keystore android/keystore/movieflix-tv-release.jks \
  -alias movieflix -keyalg RSA -keysize 2048 -validity 10950 \
  -dname "CN=MovieFlix TV, O=MovieFlix, C=BR"
```

### Instalação em TV / TV Box

```bash
adb connect <IP-DA-TV>:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

O app declara `LEANBACK_LAUNCHER`, então aparece na tela inicial da TV junto aos
demais aplicativos.

---

## 10. Limitações reais

- **A reprodução depende do provedor de vídeo.** Quando o StreamBetter não
  devolve `sources` para um título específico (fonte inexistente no provedor),
  a TV mostra o estado "fonte indisponível" com **TENTAR NOVAMENTE** — o
  mesmo comportamento do site/mobile.
- **Downloads offline** continuam sendo feitos pelo app do **celular** com a
  mesma conta; a TV apenas informa os limites do plano.
- **Qualidade preferida** é uma preferência de reprodução. A qualidade máxima
  efetiva continua limitada pelo **plano** e pela fonte disponível — a TV não
  libera nem eleva qualidade fora do que o plano permite.
- **Legendas/faixas de áudio** seguem o que a fonte entrega; a TV não adiciona
  faixas inexistentes.
- O agendador de atualização de catálogo roda em background (1×/dia) e não
  bloqueia a interface.
