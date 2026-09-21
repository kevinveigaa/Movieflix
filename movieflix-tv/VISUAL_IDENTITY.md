# MovieFlix TV — Identidade visual (v2.0.0)

Este documento registra a identidade visual aplicada ao app de TV na versão
**2.0.0**, derivada da referência visual aprovada pelo dono e aplicada em
**todas** as telas — sem copiar o layout do app mobile.

## 1. Princípios

| Princípio | Como aparece no app |
|---|---|
| Fundo preto premium | `#050505` em todas as telas; superfícies em `#0C0A12` / `#16121F` / `#221B30` |
| Alvo grande, longe da TV | cards 200×300dp, títulos 19–46sp, botões 48–62dp de altura, foco com escala + sombra |
| Alto contraste | texto branco `#FFFFFF` sobre preto; secundário `#B0B0B0`; nunca texto fino sobre imagem sem scrim |
| Navegação por D-pad | todo elemento interativo é `focusable`; foco sempre visível (borda/anel em gradiente) |
| Nada depende de toque | nenhuma ação exige touchscreen (o manifest declara `touchscreen required=false`) |

## 2. Paleta

| Papel | Cor | Uso |
|---|---|---|
| Ação primária | gradiente `#5B42F3 → #9D38FF` (índigo → violeta) | botão "Assistir", item ATIVO do menu, botão play do card |
| Destaque | gradiente `#E01E5A → #9D38FF` (magenta → violeta) | selo "DESTAQUE" do HERO, moldura "PLANO ATUAL" |
| Selo de idioma | `#00A896` (teal) | selo "Dublado PT-BR" nos cards |
| Texto | `#FFFFFF` / `#B0B0B0` / `#D4D4D8` | títulos / secundário / corpo |
| Nota | `#FFD700` | estrela ★ nos cards e no HERO |
| Erro | `#F87171` | mensagens de falha |

Os nomes históricos dos recursos (`mf_red`, `mf_purple`, `mf_green`) foram
**mantidos e reapontados** para os novos valores, de modo que nenhuma
referência interna quebrasse.

## 3. Componentes

### Menu lateral (`SidebarView`)
Coluna fixa de 264dp, wordmark no topo e 8 itens (Início, Filmes, Séries,
Minha Lista, Continuar assistindo, Pesquisar, Perfis, Configurações).
O item **ativo** recebe uma pílula em gradiente; o item **focado** recebe
realce claro + contorno violeta. No pé, mostra o perfil ativo.

### HERO (`DropBannerPresenter`)
Backdrop de tela larga (400dp) com escurecimento lateral e inferior, selo
"DESTAQUE", chips de metadados, título na fonte display (**Bebas Neue**, a
mesma do site), linha de meta com ★ nota, sinopse (3 linhas), dois botões
pílula ("Assistir" em gradiente, "Mais informações" com contorno) e
indicadores de página. As setas ←/→ trocam o título em destaque.

### Card de catálogo (`CardPresenter`)
Poster 2:3 com cantos de 12dp, selo teal "Dublado PT-BR", selo de ano, selo
"SÉRIE", título e nota abaixo. Ao focar: anel em gradiente, aumento de
escala, sombra e revelação dos botões **play** (circular, gradiente) e
**favorito** (circular, translúcido).

### Carrosséis (`MfRowsView` / `MfRowView`)
Linhas horizontais com título (19sp) e roláveis; UP/DOWN trocam de carrossel
preservando o índice do card e sobem para o HERO; LEFT/RIGHT rolam a linha.

### Player (`PlaybackActivity`)
Vídeo em tela cheia sobre preto, overlay acionado pelo OK com título display,
botões pílula grandes (retroceder 15s / pausar / avançar 15s), barra de
progresso em gradiente (`#5B42F3 → #9D38FF`), tempos, "Próximo episódio"
(séries) e "Sair". BACK fecha o overlay ou sai.

## 4. Tipografia

- **Wordmark e títulos de display**: Bebas Neue (`@font/bebas_neue`), já
  embarcada no projeto — a mesma família usada no site.
- **Interface**: sans-serif do sistema, pesos `bold` para títulos e meta.
- Escala: 46sp (HERO) · 32sp (título de tela) · 19sp (título de carrossel) ·
  17sp (perfis) · 15–16sp (corpo/botões) · 12–14sp (meta/selos).

## 5. Foco (feedback a distância)

| Elemento | Em foco |
|---|---|
| Card | escala 1.06 + elevação 18dp + anel em gradiente + overlay play/favorito |
| Item do menu | escala 1.03 + fundo claro + contorno violeta |
| Botão pílula | escala 1.05 + elevação + gradiente mais claro / contorno branco |
| Linha de configuração | escala 1.012 + superfície elevada + contorno violeta |
| Perfil | escala 1.05 + contorno violeta |
| Chip de temporada/episódio | contorno violeta de 3dp |

## 6. Verificação

- Build de release: **BUILD SUCCESSFUL** (Gradle, Kotlin/JVM 17).
- APK: `com.movieflix.tv` v2.0.0 (versionCode 13), assinado (SHA-256
  `8741e4dd…b08f`), 11.6 MB.
- Manifest: `android.software.leanback` **required** e
  `android.hardware.touchscreen` **not required**.
