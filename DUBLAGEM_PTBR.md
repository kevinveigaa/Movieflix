# Dublagem pt-BR no Movieflix — status e caminho definitivo

**Data:** 2026-08-23 (atualização)
**Objetivo:** todo filme abre com **áudio dublado em português brasileiro**.

---

## ✅ O que mudou nesta atualização

| Ação | Detalhe |
|---|---|
| Filmes removidos (não-dublados) | 224 vídeos em inglês/legendados removidos de `videos.json` |
| Filmes dublados mantidos | **84 filmes** com dublagem pt-BR garantida (canal "Boxoffice \| Full Movies in Brazilian Portuguese") |
| `filmes/filmes.json` | Reescrito com **1184 filmes** do catálogo (todos marcados `language: Dublado`), cada um com campo `player` apontando para **playerflixapi** (players #Dublado) |
| `videos.json` | Reduzido de 308 → **84 itens** (apenas vídeos dublados em pt-BR) |

---

## 🎬 Filmes dublados mantidos (84) — fonte YouTube "Boxoffice | Full Movies in Brazilian Portuguese"

Profecia do Juízo Final, Missão Everest, Invasão da Nave-Mãe, Catástrofe na Terra,
O Apocalipse Aproxima-se, Refém em Altitude Elevada, Força Magnética, BIGFOOT,
Fim do Mundo, Alvo da Máfia, IMBATÍVEL, Família em Perigo, Diários de um Vigilante,
CATÁSTROFE DE GELO, Anel de Fogo, Tempestade Negra, Encontro Mortal,
O Viajante do Tempo, Raiva Pura, Trono da Crueldade, OGRE, Os Opostos Atraem-se,
Invasores Metálicos, O Fantasma da Floresta, Aluno e Professor, Pistoleiros Lendários,
O Plano de Sedução da Playboy, Em Fuga, Um Soldado Quebrado, SECRETÁRIA, VINGANÇA,
Tucker um Homem e seu Sonho, À Sangue Frio, Os Condenados, Amor Sem Fim,
o Caminho dos Perigos, Calçada da Fama, Torcida no Trabalho, Minha Criança Interior,
A Assombração do Castelo de Margam, Um Lobisomem Americano em Londres, Zona de Desastre,
Corrida do Dinheiro, Por Que Eu Me Casei?, Algo está se Escondendo, Ricardo Coração de Leão,
Fenômeno Cósmico, O Monstro Interior, Justiça Afiada, Ela é a Única, Perdido Nas Chamas,
Preso em uma Tempestade, O Bad Boy, Exterminador De Aranhas, A Senhora, O Último Duelo,
Guerra Invisível, Uma Mãe Arrependida, Destino Jovem, Um futuro para dois, Agente do FBI,
O Leviatã, O Teste Definitivo, A Busca, Lutador Sobrenatural, Uma Mulher Perturbada,
O Maníaco, O Mentor, Não há esconderijo do mal, Homem Louco na Runa, O Trabalho Interno,
O Aperto do Demônio, Irmandade em apuros, O Anjo Inocente, A Maldição,
Desaparecimento nas Montanhas, O Beijo da Traição, Noite Suja, O dentista,
Acampamento do Terror, Um Realizador em Apuros, Castro - Meu gentil assassino,
A Feira dos Pesadelos, ❤ Amor Hotel.

---

## 🎯 Fontes dubladas pt-BR adicionadas

### 1. playerflixapi.com (do repositório embed-movies de JonasCaetanoSz)
- URL: `https://playerflixapi.com/pages/ajax.php?id={tmdb_id}&type=movie`
- O repositório **embed-movies** (github.com/JonasCaetanoSz/embed-movies) usa essa
  API para obter players de filmes/séries. A resposta traz botões
  `data-audio="pt-br"` (Dublado) e `data-audio="en-us"` (Legendado).
- Players dublados que ela retorna: **WatchPlayer** (`watchplayer.shop`),
  **VIP Player** (`embedplayer2.xyz`), **EmbedPlay** (`embedplayapi.site`).
- Validado em 25/25 filmes amostrais do catálogo (100% de cobertura de players pt-br).

### 2. megaembedapi.site (já em uso)
- `https://megaembedapi.site/embed/tt{imdb_id}` — exibe players "#1 Dublado"/"#2 Dublado".
- **450 filmes** do catálogo já apontam para esta fonte (dublagem garantida).

### 3. Outras fontes pesquisadas na internet
- Canal **"Movie Central - Filmes Completos Em Português"** (YouTube) — playlists de
  filmes completos dublados em pt-BR (ficção científica, ação, terror, suspense).
- Playlist **"Filmes Completos - Dublados"** (1.009 vídeos dublados).
- Superflix API (`superflixapi.life`) e WarezCDN (`embed.warezcdn.link`,
  parâmetro `lang=2`) — usadas pelo embed-movies para vídeo direto.

---

## 🧹 Filmes removidos (não-dublados)

224 vídeos do `videos.json` foram **removidos** por não terem dublagem pt-BR:
títulos com "English Subtitles", "Full Movie (English)", "Legendado" etc.
Exemplos: The Hunt for the Hacker, Kill For Survival, Death in Alaska,
The Legend of Halloween Jack, Komodo VS Cobra, Earth Attack, Dragon Fist...

---

## Como adicionar mais filmes dublados

1. Adicione o `tmdb_id` do filme no `filmes/filmes.json` — o campo `player`
   monta automaticamente a página de players dublados do playerflixapi.
2. Para fontes YouTube: adicione o vídeo dublado em `videos.json` (formato
   JSONL igual ao atual, com `title` em português e `url` do YouTube).
3. Use `scripts/importar-dublados.mjs` para casar fontes com o catálogo
   (TMDB id + título + duração ±12 min).

> ⚠️ Enquanto o `video_url` apontar para VidZee, a dublagem **não é
> garantida** (depende do backend). As fontes acima (playerflixapi,
> megaembedapi, YouTube pt-BR) garantem áudio dublado.
