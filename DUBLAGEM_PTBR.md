# Dublagem pt-BR no Movieflix — status e caminho definitivo

**Data:** 2026-08-23
**Objetivo:** todo filme abre com áudio **dublado em português brasileiro**.

---

## Resumo executivo

| Métrica | Valor |
|---|---|
| Filmes no catálogo (tabela `movies`) | 1.184 |
| Filmes com dublagem pt-BR **garantida** hoje | **0** |
| Filmes com `video_url` apontando para VidZee (sem dublagem garantida) | 1.183 |
| Fontes dubladas pt-BR conhecidas e disponíveis (YouTube) | 84 vídeos |
| Desses 84, presentes no catálogo atual | **0** (filmes B/indie fora do catálogo) |

**Conclusão:** o app **agora suporta** reproduzir fontes com dublagem garantida
(YouTube embed oficial com `hl=pt-BR`, MP4/HLS direto via `hls.js`, preview do
Google Drive), mas **nenhum título do catálogo atual tem** uma fonte dublada
associada. Preencher o `video_url` com fontes dubladas é o único caminho que
garante dublagem de verdade.

---

## Por que os players de embed NÃO garantem dublagem

Foram testados exaustivamente (e documentados nos commits `a15bc02`,
`d781608`, `33f5a71`): VidZee, 2Embed, vidsrc.to/me/xyz, vidlink.pro, embed.su,
multiembed, superembed, cineby e outros. Todos os embeds gratuitos vivos:

- decidem a faixa de áudio **no backend de terceiros** — não existe parâmetro
  de URL confiável (`?lang=pt-BR`, `?audio=pt`…) para forçar dublagem; ou
- exigem interação manual (2Embed: "LOAD PLAYER" + escolha de servidor)
  incompatível com iframe/WebView; ou
- estão mortos (HTTP 000/403/522).

O VidZee (fonte atual) reproduz, mas a trilha de áudio é decidida por ele —
impossível garantir pt-BR via código.

---

## O que foi implementado (commit desta entrega)

### 1. Player com suporte a fontes dubladas (`src/pages/PlayerPage.tsx`)
Quando o `video_url` do banco aponta para uma fonte cujo **áudio já é
dublado**, o player renderiza a forma adequada:

| Fonte no `video_url` | Como reproduz |
|---|---|
| `youtube.com` / `youtu.be` | iframe oficial `youtube-nocookie` com `hl=pt-BR&cc_lang_pref=pt-BR` (áudio dublado embutido no vídeo) |
| `.mp4` / `.mkv` / `.webm` / `.m3u8` | `<video>` nativo + `hls.js` (sem iframe) |
| `drive.google.com` | iframe de preview (áudio embutido no arquivo) |
| qualquer outra (ex.: VidZee) | iframe genérico com hints `?lang=pt-BR&audio=pt-BR&sub=pt-BR&dub=1` |

Também corrige o falso erro **"O vídeo não carregou pela fonte principal"**:
o timeout de 10s é desativado para YouTube/MP4/Drive (o iframe do YouTube não
dispara eventos confiáveis de load e um vídeo dublado pode demorar a iniciar).

### 2. Utilitários de normalização (`src/lib/videoSources.ts`)
`getYoutubeId`, `youtubeEmbedUrl`, `isDirectVideoUrl`, `isDriveUrl`,
`drivePreviewUrl`, `normalizeDubbedSource`.

### 3. Script de importação (`scripts/importar-dublados.mjs`)
Casa fontes dubladas com o catálogo por **TMDB id + título + duração** e
atualiza `video_url`. Suporta:
- lote de YouTube dublado (preencher `LOTE_YOUTUBE_DUBLADOS` com
  título do catálogo + ID validado);
- lista M3U/M3U8 de vídeos diretos dublados (`--m3u=arquivo.m3u`);
- `--dry-run` para simular.

```bash
node scripts/importar-dublados.mjs --dry-run
node scripts/importar-dublados.mjs --m3u=minha-lista-dublada.m3u
```

---

## Cobertura atual (honesta)

- **0/1.184** filmes com dublagem garantida — porque os 84 vídeos dublados
  conhecidos (canal YouTube "Boxoffice | Full Movies in Brazilian Portuguese")
  **não estão no catálogo** (são filmes B/indie: "Profecia do Juízo Final",
  "Missão Everest", "O Último Duelo"…). Foram verificados 84/84 por TMDB:
  nenhum casa com `tmdb_id` do catálogo (a busca TMDB retorna o filme correto,
  mas ele não existe na tabela `movies`).
- O casamento por título simples produz **falsos positivos** (ex.: "Fim do
  Mundo" de 81 min foi erroneamente casado com "Piratas do Caribe 3" de 168
  min) — por isso a validação **exige** duração ≈ runtime (±12 min).

## O que falta para 100% (caminho de solução)

1. **Adquirir fontes dubladas para os títulos do catálogo:**
   - upload próprio de filmes dublados (MP4/HLS) para o Google Drive/BunnyCDN
     (o app já suporta reprodução nativa e o backend já tem player-proxy);
   - ou API paga/parceiro com faixa pt-BR garantida (ex.: JustWatch,
     provedores TMDB, CDN com multiáudio);
2. **Preencher `video_url`** com essas fontes via
   `scripts/importar-dublados.mjs` (ou update direto no Supabase).
3. O app **já está pronto** para reproduzi-las — não precisa de mais mudança
   de código.

> ⚠️ Enquanto o `video_url` apontar para VidZee, a dublagem **não é
> garantida** (depende do backend do VidZee). Trocar o player por outro embed
> gratuito **não resolve** — todos têm o mesmo problema (já comprovado).
