# Dublagem pt-BR no Movieflix — status e caminho definitivo

**Data:** 2026-08-23 (atualização — migração completa para StreamBetter)
**Objetivo:** todo filme abre com **áudio dublado em português brasileiro**.

---

## ✅ O que mudou nesta atualização

| Ação | Detalhe |
|---|---|
| Fonte de vídeo | **Todos** os filmes agora usam o player do **StreamBetter** (`https://streambetter.shop/filme/{tmdb_id}`) |
| Players de terceiros removidos | vidlink.pro, megaembedapi.site, player.vidzee.wtf, playerflixapi — **nenhum** embed de terceiros restou |
| Catálogo | Buscado ao vivo da API pública `https://streambetter.shop/api/titles?type=movie` (600 filmes populados em `filmes/filmes.json`) |
| Áudio pt-BR | `lang=pt-BR` na URL do embed + seleção automática de faixa "pt"/"por"/"portug" pelo player do StreamBetter |
| Anúncios | Nenhum anúncio próprio no Movieflix; embed sem sandbox/blockers (o StreamBetter recusa conteúdo com sandbox) |
| Arquivos legados removidos | `videos.json` (YouTube), `series*.json`, `drive.html` (Google Drive), playlists M3U, posters avulsos |

---

## 🎬 Fonte atual (garantida)

### StreamBetter — player único 🎯
- URL de embed: `https://streambetter.shop/filme/{tmdb_id}?lang=pt-BR`
- O player resolve fontes, legendas, fallbacks e **seleciona automaticamente a faixa de áudio em português** quando disponível (verificado no bundle do player: procura trilhas `pt`/`por`/`portug` e aplica como padrão).
- Séries: `https://streambetter.shop/serie/{tmdb_id}/{temporada}/{episodio}?lang=pt-BR`
- Catálogo (API pública): `GET https://streambetter.shop/api/titles?type=movie&limit=100&page=N`

### Sem anúncios
O Movieflix **não injeta nenhum anúncio próprio**. O embed usa o player padrão do StreamBetter (que pode exibir anúncios da própria plataforma no plano Free). Para um embed **100% sem anúncios**, assine o plano **Creator** em https://streambetter.shop/planos:
1. Gere a chave `sb_pk_*` no perfil (plano Creator).
2. Cadastre o domínio do Movieflix na trava de domínio.
3. Defina `VITE_STREAMBETTER_KEY` no build — a chave entra automaticamente na URL de todos os embeds.

> ⚠️ **NÃO usar** `sandbox` no iframe nem bloqueadores de anúncio — o StreamBetter detecta e recusa exibir o conteúdo ("Não bloqueie os anúncios do player").

---

## 🔧 Como adicionar mais filmes

1. O catálogo é populado automaticamente via `src/hooks/useMovies.ts` → `src/lib/strembetter.ts` (busca páginas do `/api/titles`).
2. Para fixar uma lista local, edite `filmes/filmes.json` com `tmdb_id` do TMDb e `video_url` apontando para `https://streambetter.shop/filme/{tmdb_id}?lang=pt-BR`.

> ⚠️ **NÃO adicionar** players de terceiros (vidlink, vidzee, megaembed, etc.) — a fonte oficial é exclusivamente o StreamBetter.
