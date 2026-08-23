# Dublagem pt-BR no Movieflix — status e caminho definitivo

**Data:** 2026-08-23 (atualização final — catálogo 100% dublado)
**Objetivo:** todo filme abre com **áudio dublado em português brasileiro**.

---

## ✅ O que mudou nesta atualização

| Ação | Detalhe |
|---|---|
| Filmes removidos (não-dublados) | **733 filmes** removidos de `filmes/filmes.json` — todos apontavam para `player.vidzee.wtf`, cuja dublagem **não é garantida** (player genérico, sem seletor de idioma) |
| Filmes dublados mantidos | **451 filmes** com dublagem pt-BR garantida |
| Fonte garantida | **450 filmes** → `megaembedapi.site` (players "#1 Dublado"/"#2 Dublado") + **1 comprovado** (O Último Duelo, da lista validada de 84) |
| `videos.json` | Mantido com **84 itens** dublados (canal "Boxoffice \| Full Movies in Brazilian Portuguese") |
| Catálogo Supabase | **1.184 → 451 filmes** (remoção via API REST) |

---

## 🎬 Filmes dublados mantidos (451)

Todos os 451 filmes têm `video_url` apontando para **megaembedapi.site**,
que exibe players "#1 Dublado" / "#2 Dublado" em pt-BR garantido.
Exemplos: Um Sonho de Liberdade, Homem-Aranha: Através do Aranhaverso,
Operação Sombra, Três Homens em Conflito, De Olhos Bem Fechados,
O Último Duelo (comprovado dublado), Força-G...

Lista completa: `filmes/filmes.json` (451 entradas, todas `language: Dublado`).

---

## 🗑️ Filmes removidos (733 — não-dublados)

Todos os 733 filmes removidos usavam **https://player.vidzee.wtf/embed/movie/{tmdb_id}**.
O player VidZee carrega um stream único **sem seletor de idioma** — o áudio
depende do backend e **não há garantia de dublagem pt-BR**. Por isso foram
removidos do catálogo.

Exemplos: Jackass 2, Jackass 3, Backrooms: Um Não-Lugar, Vixen!,
12 Homens e uma Sentença, Corações Jovens, My Massive Cock...

---

## 🎯 Fontes dubladas pt-BR (garantidas)

### 1. megaembedapi.site ✅ (USO ATUAL)
- `https://megaembedapi.site/embed/tt{imdb_id}` — exibe players "#1 Dublado"/"#2 Dublado".
- **450 filmes** do catálogo apontam para esta fonte (dublagem garantida).

### 2. playerflixapi.com (repositório embed-movies de JonasCaetanoSz)
- URL: `https://playerflixapi.com/pages/ajax.php?id={tmdb_id}&type=movie`
- Retorna players `data-audio="pt-br"` (Dublado): **WatchPlayer**, **VIP Player**, **EmbedPlay**.
- Validado em 25/25 filmes amostrais (100% de cobertura pt-br).

### 3. YouTube (canais pt-BR)
- Canal **"Boxoffice | Full Movies in Brazilian Portuguese"** — 84 filmes já em `videos.json`.
- Canal **"Movie Central - Filmes Completos Em Português"** e playlist **"Filmes Completos - Dublados"** (1.009 vídeos).

---

## Como adicionar mais filmes dublados

1. Adicione o `tmdb_id` do filme em `filmes/filmes.json` com
   `video_url` apontando para `https://megaembedapi.site/embed/tt{imdb_id}`
   (ou outro player com dublagem garantida).
2. Para fontes YouTube: adicione o vídeo dublado em `videos.json`
   (JSONL, `title` em português + `url` do YouTube).
3. Use `scripts/importar-dublados.mjs` para casar fontes com o catálogo.

> ⚠️ **NÃO adicionar** filmes com `player.vidzee.wtf` — dublagem não garantida.
> Fontes garantidas: megaembedapi, playerflixapi, YouTube pt-BR, WarezCDN (lang=2).
