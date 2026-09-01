# 🔧 RECONSTRUÇÃO — MovieFlix (Passo 1: Fundação, Segurança, Performance, Player)

**Data:** 2026-09-01
**Repo:** github.com/kevinveigaa/Movieflix
**Escopo desta passada:** auditoria completa + correções de segurança, performance e player + documentação. As etapas de redesign de UI (Etapa 4), rework profundo de player (Etapa 5) e polimento de TV/App (Etapa 6) estão documentadas como **próxima fase** no final.

---

## ✅ O QUE FOI RECONSTRUÍDO / CORRIGIDO

### 🔒 Segurança
1. **RLS da tabela `movies` (crítico):** as migrations antigas (`20260802002328`, `20260802002558`, `20260810120000`) criavam policies que permitiam **INSERT/DELETE/UPDATE para o papel `anon`** (público, sem login). Qualquer pessoa podia apagar/alterar/injetar títulos no catálogo.
   - **Correção:** nova migration `supabase/migrations/20260901120000_fix_movies_rls.sql` que:
     - Habilita RLS em `movies`, `seasons` e `episodes`;
     - Mantém **leitura pública** (o catálogo é lido com a chave anon);
     - Restringe **escrita a admins autenticados** (`profiles.is_admin = true`) — o painel admin usa o cliente autenticado, então continua funcionando;
     - O backend (service_role) ignora RLS e continua podendo escrever.
   - **Ação necessária:** aplicar a migration no Supabase (painel → SQL Editor → rodar o arquivo).

- **Chave secreta `sb_sk_*`:** verificado que o `render.yaml` **não** expõe a chave secreta — `STREAMBETTER_API_KEY` usa `sync: false` (valor definido no painel, não versionado). A `sb_pk_*` no `render.yaml` é **pública por design** (chave do plano Creator usada no embed do navegador). **Nenhum secret real vazado.**

- **Scan de secrets:** varredura completa do repo (src, backend, public, configs) — nenhuma `service_role`, `sk_live`, `ghp_`, `AIza` ou chave privada real encontrada. A chave anon do Supabase no `src/lib/supabase.ts` é pública por design (role `anon`).

### ⚡ Performance
- **Catálogo otimizado (~21-28% menor):** novo script `otimizar-catalogo.cjs` gera `filmes/filmes.light.json` e `filmes/series.light.json` removendo campos redundantes não usados pelo frontend (`player` = duplicado de `video_url`; `_ordem` = metadado interno). O frontend (`src/hooks/useMovies.ts`) agora carrega os arquivos `.light`.
  - filmes: 4.23MB → 3.34MB (−21.2%)
  - séries: 1.51MB → 1.08MB (−28.3%)
- **Dependências mortas removidas do `package.json`:** `plyr`, `plyr-react`, `video.js`, `videojs-contrib-quality-levels`, `videojs-hls-quality-selector`, `vidstack`, `@vidstack/player`, `@vidstack/react`, `youtubei.js`, `sharp`, `fast-xml-parser`, `googleapis`, `@types/video.js` — nenhuma era importada no `src/` (verificado por grep). Reduz o `node_modules` e o risco de vulnerabilidades.
- **Code-splitting do player:** `PlayerPage` e `TvApp` agora são carregados via `React.lazy` (lazyWithRetry), tirando o `hls.js` do bundle inicial. O bundle principal caiu de **1.146 kB → 487 kB** (gzip: 345 kB → 142 kB, **-58%**). O hls.js e a UI TV só carregam quando o usuário abre o player ou a interface TV.

### 🎬 Player
- **Overlay roxo (causa raiz corrigida):** o "overlay roxo" era o estado de **carregamento/erro** do próprio `NativeHlsPlayer` — um gradiente `via-roxo-950/60` cobrindo toda a área do player enquanto o vídeo resolvia. Corrigido trocando o gradiente roxo forte por **fundo preto neutro** com acento roxo sutil (spinner/ícone). O usuário agora vê um loading limpo, sem a sensação de "overlay quebrado". **Não foi escondido com `display:none`** — a causa (gradiente visualmente agressivo) foi corrigida.
- **Fullscreen corrigido:** o fallback CSS (`mf-fs-fallback`) cobria o iframe mas **não o `<video>` nativo**. Adicionado `video` ao seletor + `object-fit: contain` para não distorcer. Também adicionado CSS para o estado `:fullscreen` / `:-webkit-full-screen` (Fullscreen API real) garantindo que vídeo e iframe preencham a tela mantendo a proporção.

---

## 📋 O QUE FOI REMOVIDO (e motivo)
| Item | Motivo |
|---|---|
| Políticas RLS anônimas de escrita em `movies` | Vulnerabilidade de segurança (qualquer um podia alterar o catálogo) |
| Dependências mortas de player (plyr, videojs, vidstack, youtubei, sharp, googleapis, fast-xml-parser) | Não usadas no `src/`; inflavam o bundle e o `node_modules` |
| Campos redundantes `player` e `_ordem` do catálogo | Duplicados/não usados; reduziam o payload em ~21% |

---

## 📦 VARIÁVEIS DE AMBIENTE NECESSÁRIAS EM PRODUÇÃO

### Frontend (Vite — `VITE_*`, embutidas no build)
| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | Sim (fallback embutido) | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Sim (fallback embutido) | Chave anon (pública) do Supabase |
| `VITE_STREAMBETTER_PUBLIC_KEY` | Não (fallback embutido) | Chave pública `sb_pk_*` do plano Creator (embed) |
| `VITE_API_URL` | Não (fallback embutido) | URL do backend Express (para `/api/*`) |

### Backend (Render, `render.yaml`)
| Variável | Obrigatória | Descrição |
|---|---|---|
| `TMDB_API_KEY` | Sim | Chave da API TMDb (proxy `/api/tmdb`) |
| `STREAMBETTER_API_KEY` | Sim | Chave **secreta** `sb_sk_*` do plano API (resolver HLS direto) — `sync: false` |
| `SUPABASE_URL` | Sim | URL do Supabase (trial-gate) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Chave service_role (trial-gate) — **nunca no frontend** |
| `SUPABASE_JWT_SECRET` | Sim | Segredo JWT do Supabase (validação de token no trial-gate) |
| `MP_ACCESS_TOKEN` | Sim | Token do Mercado Pago (assinatura) |

> ⚠️ **Deploy:** o `render.yaml` já usa `sync: false` para os secrets — defina-os no painel do Render, **não** no arquivo. O build não depende de `.env` local (fallbacks embutidos no frontend).

---

## 🗺️ ROADMAP — PRÓXIMA FASE (não concluída nesta passada)

Esta passada focou em **estabilidade, segurança e performance** (prioridade 1-3 do plano). As etapas de produto abaixo são o próximo estágio, documentadas honestamente:

1. **Etapa 4 — Redesign de UI/UX:** design system consistente (cores, tipografia, espaçamentos, cards, modais, inputs, skeletons), Home com hero/banner + destaques + continue assistindo + Minha Lista, catálogo com filtros avançados (gênero/ano/classificação/idioma), detalhes completos (elenco, diretor, trailer, relacionados), responsividade 360-414px/tablet/desktop/TV.
2. **Etapa 5 — Player profundo:** auditoria completa de fullscreen, orientação, controles, legendas, áudio, erros, retorno; tratamento seguro de fontes externas não confiáveis.
3. **Etapa 6 — App/TV:** polimento do WebView (foco, DPAD, back, fullscreen, orientação), navegação completa por controle remoto, geração de novo APK.
4. **Etapa 7 — Performance avançada:** lazy loading de imagens, code-splitting fino, cache, virtualização do catálogo (milhares de cards), pré-carregamento inteligente.
5. **Etapa 8 — Testes automatizados:** autenticação, rotas, serviços, player, assinatura.
6. **Etapa 9 — Auditoria final:** performance e visual em todas as telas.

**Pendências de serviço externo (dependem de credencial/API/provedor):**
- Aplicar a migration `20260901120000_fix_movies_rls.sql` no Supabase.
- Configurar `STREAMBETTER_API_KEY` (sb_sk_*) no painel do Render (plano API do StreamBetter) para o player nativo HLS funcionar sem o embed.
- Configurar `TMDB_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `MP_ACCESS_TOKEN` no ambiente do backend.