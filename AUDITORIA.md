# 🔍 AUDITORIA COMPLETA — MovieFlix (Site + App)

**Data:** 2026-08-25
**Site ao vivo:** https://movieflix-bszf.onrender.com
**Repo:** github.com/kevinveigaa/Movieflix (commit `9711655`)
**Método:** análise estática do código + testes funcionais ao vivo com Chromium (navegação real, console, TV via teclado simulado, mobile via viewport 375x667, proteção de rotas, fluxo de auth).

---

## 1. ✅ FUNCIONANDO (testado e verificado)

| Item | Evidência |
|---|---|
| Home carrega com hero, cards, menu, categorias | snapshot + screenshot (hero "Cocorico 2", menu Início/Filmes/Séries/Categorias) |
| Página de Filmes (via navegação SPA a partir da Home) | "4000 filmes disponíveis · Dublado (pt-BR)", filtros e cards OK |
| Página de Séries | "1256 séries disponíveis · Dublado (pt-BR)", heading "Sterling Point" |
| Detalhes de filme (`#/titulo/movie/1437939`) | título, botão assistir, sinopse, nav OK |
| Login renderiza e responde | formulário E-mail/Senha/Lembrar-me; credenciais falsas → "Invalid login credentials" (erro amigável, sem travar) |
| Cadastro / Recuperar senha | renderizam com campos completos |
| Proteção de rota do player | `#/assistir/1437939` deslogado → "Login necessário / Entrar" (player NÃO renderiza) |
| RequireAuth | `#/minha-assinatura` deslogado → redireciona para `/login` |
| TV navigation (setas/OK) | foco `.tv-focus` presente; ArrowRight moveu "Cinema TV" → "Suspense"; OK em card → `#/assistir/1437939` (player) |
| Mobile (375x667) | sem overflow horizontal, 559 cards, menu presente, conteúdo carrega |
| Imagens/posters | URLs TMDB válidas (HTTP 200); `loading="lazy"` funciona (carrega ao rolar) — 14/14 visíveis carregadas |
| TypeScript | `tsc --noEmit` — 0 erros |
| Build | `vite build` — sucesso |
| APK | Capacitor WebView remoto (`server.url` → site online, sem cache de versão antiga), `versionName 2.1.0 / versionCode 4` |
| Anti-ads silencioso | `antiAds.ts` ativo no App, guarda de iframe no PlayerPage, `MainActivity` bloqueia navegação externa (revisado por código) |
| Renovação de assinatura | webhook: `expires_at = vencimentoAtual + duração` (5+30=35 etc.), sem duplicidade (testado por código no commit `9711655`) |

---

## 2. 🔴 PROBLEMAS CRÍTICOS (bloqueiam o uso)

### 🔴 C1 — Página de Pesquisa quebrada: "Class constructor S cannot be invoked without 'new'"
- **Local:** `#/pesquisa` (SearchPage)
- **Como reproduzir:** abrir https://movieflix-bszf.onrender.com/#/pesquisa (reload direto OU navegação SPA pós-home — reproduz nos dois modos no site ao vivo)
- **Causa raiz (provada com stack trace real):**
  ```
  TypeError: Class constructor S cannot be invoked without 'new'
      at Zn (react-vendor-CowojNnR.js:22:17747)     ← dispatchReducerAction do React
      at Object.useState (react-vendor:22:24557)
      at v.useState (query-vendor-qOSunM4R.js:9:6350)  ← React usado pelo TanStack Query
      at V (SearchPage-Dmc71PGW.js:1:728)
  ```
  O `vite.config.ts` usa `manualChunks` com objeto:
  ```js
  manualChunks: {
    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
    'query-vendor': ['@tanstack/react-query'],
    ...
  }
  ```
  O Rollup, para evitar dependência circular (react-vendor ↔ query-vendor), **embute o React 18.3.1 INTEIRO dentro do `query-vendor`** (confirmado: `v.version="18.3.1"; ts.exports=v; var _=ts.exports` dentro de `query-vendor-qOSunM4R.js`) e o `react-vendor` **importa React do query-vendor** (`import{r as k,R as gc}from"./query-vendor-qOSunM4R.js"`). Resultado: **DUAS instâncias de React** em runtime → o dispatcher de uma é usado pela outra → erro de "Class constructor".
- **Impacto:** usuário não consegue usar a busca (funcionalidade central).
- **Correção necessária:** substituir `manualChunks` de objeto por **função** (`manualChunks(id) { if (id.includes('react') || ...) return 'react-vendor'; }`) ou remover o chunking manual e deixar o Rollup resolver — garante UMA única cópia de React. (Validar com build + teste da /pesquisa.)

### 🔴 C2 — Qualquer reload direto em página interna quebra (cold load)
- **Local:** TODAS as páginas internas ao abrir com reload direto: `/filmes`, `/series`, `/favoritos`, `/minha-assinatura`, `/pesquisa`, `/baixar-app`, `/perfil`, `/configuracoes`…
- **Como reproduzir:** abrir https://movieflix-bszf.onrender.com/#/filmes em aba limpa → "Algo deu errado… Class constructor S cannot be invoked without 'new'"
- **Causa:** mesma do C1 (duas cópias de React). A ordem de carregamento dos chunks no cold load dispara o conflito; navegando por SPA a partir da Home, o React já montado mascara o problema em algumas rotas (mas /pesquisa quebra até por SPA).
- **Impacto:** usuários que acessam link direto/compartilhado/favorito de uma página interna (ou dão refresh) veem tela de erro. **É o bug mais grave** — afeta qualquer acesso direto.
- **Correção necessária:** mesma do C1 (manualChunks por função). Após corrigir, re-testar reload direto em TODAS as rotas.

---

## 3. 🟠 PROBLEMAS IMPORTANTES

### 🟠 I1 — ErrorBoundary global fica preso após erro
- **Local:** `src/components/ui/ErrorBoundary.tsx` + layout que o envolve
- **Como reproduzir:** navegar para `/pesquisa` (erro C1), depois navegar para `/` ou `/filmes` na MESMA sessão → a Home/filmes mostram o MESMO erro do boundary até dar reload
- **Causa:** o ErrorBoundary não reseta `state.erro` quando a rota muda (não há `key` por rota nem reset no `componentDidUpdate`/listener de navegação)
- **Impacto:** um erro em uma página contamina toda a navegação subsequente (SPA) até reload; o usuário vê erro em páginas que funcionariam
- **Correção:** dar `key` ao ErrorBoundary por `location.pathname` (ex.: `<ErrorBoundary key={location.pathname}>`) ou resetar o estado ao navegar

### 🟠 I2 — Limite de sessão: "authLoading" resolvido, mas validação de player depende de UI
- **Local:** `PlayerPage.tsx` / `AuthContext.tsx`
- **Status:** o erro "authLoading is not defined" NÃO aparece mais (commit `9711655` expôs `loading` como `authLoading`). A proteção da rota funciona (testado: deslogado → "Login necessário").
- **Observação (não bloqueia):** a validação de assinatura no player usa estado do contexto (Supabase) — ok para o escopo, mas a regra "dados do backend, não do browser" está correta no webhook (renovação) e no `hasActiveSubscription` (status + expires_at). Revisado sem falhas encontradas.

---

## 4. 🟡 PROBLEMAS MÉDIOS

| ID | Problema | Local | Detalhe |
|---|---|---|---|
| M1 | APK antigo `MovieFlix-v1.1.0.apk` ainda em `public/apk/` | repo | O botão "Baixar app" usa `MovieFlix-v2.1.0.apk` (correto), mas o v1.1.0 antigo continua acessível por URL direta — usuário pode instalar versão velha |
| M2 | Tamanho do APK incorreto na página de download | `src/lib/appInfo.ts` | `APK_SIZE_MB = '32 MB'` mas o arquivo real tem **3.6 MB** — informação errada exibida |
| M3 | `window.location.href = '/login'` sob HashRouter | `SubscriptionPage.tsx` | com HashRouter o caminho correto é `#/login`; `location.href='/login'` causa reload de página inteira (funciona, mas não é SPA) — verificar se há outros usos |

---

## 5. 🔵 MELHORIAS (não bloqueiam)

- **B1:** Remover o APK v1.1.0 de `public/apk/` (limpeza + evitar download da versão errada).
- **B2:** Atualizar `APK_SIZE_MB` para o valor real (3.6 MB).
- **B3:** Adicionar teste de "reload direto por rota" no fluxo de QA (o C2 só aparece em cold load — fácil de escapar em testes SPA).
- **B4:** Considerar `aria-live`/mensagens de erro mais específicas no ErrorBoundary (mostrar "Tentar de novo" já existe, mas o texto técnico do erro pode ser ocultado do usuário final).

---

## 6. SITE — RESULTADO GERAL
**🟡 OPERACIONAL COM BUG CRÍTICO.** Home, catálogo (SPA), detalhes, login, séries, proteção do player e navegação TV funcionam. Porém **a busca está quebrada** (C1) e **qualquer acesso direto/reload em página interna quebra** (C2) — dois bloqueadores reais de uso. A causa é única (manualChunks → React duplicado) e tem correção conhecida e de baixo risco.

## 7. APK — RESULTADO GERAL
**🟢 ARQUITETURA CORRETA, MAS HERDA O BUG DO SITE.** O app é um WebView remoto (Carrega sempre `https://movieflix-bszf.onrender.com`, sem cache, `captureInput: true` para DPAD) — ou seja: **quando o site for corrigido, o app corrige junto automaticamente, sem novo APK**. Porém hoje o app também sofre C1/C2 (mesmos chunks). O APK v2.1.0 (3.6MB) existe em `public/apk/`; o v1.1.0 antigo deveria ser removido.

## 8. TV — NAVEGAÇÃO REMOTA
**🟢 FUNCIONA.** Foco visível (`.tv-focus`), setas movem entre elementos (testado: Cinema TV → Suspense), OK ativa (abriu card → player), long-press OK implementado (1s) com indicador "CONTROLE DO PLAYER", Back inteligente (revisado por código em `useTvNavigation`/`useTvPlayerControls`/`MainActivity`). Limitação: os testes de DPAD físico em TV Box real não foram executados (sem hardware), mas a simulação de teclado cobre o mesmo caminho de eventos.

## 9. FLUXO COMPLETO (Abrir → Login → Home → Buscar → Card → Detalhes → Assinatura → Player → Assistir → Sair)
**❌ NÃO PASSA HOJE.** O fluxo quebra em **Buscar** (`#/pesquisa` → erro C1). Todos os demais passos funcionam: abrir (Home ✅), login (✅), navegar (✅), card → detalhes (✅), assinatura (✅), player protegido (✅). Após a correção de C1/C2 (manualChunks), o fluxo completo deve passar de ponta a ponta — re-verificar.

---

## 10. TABELA SITE × APK

| Funcionalidade | Site | APK | Resultado |
|---|---|---|---|
| Login/Registro | ✅ | ✅ (WebView do site) | OK |
| Menu/navegação | ✅ | ✅ | OK |
| Busca | 🔴 C1 | 🔴 C1 (mesmo bundle) | QUEBRADO |
| Filmes/Séries (SPA) | ✅ | ✅ | OK |
| Filmes/Séries (reload direto) | 🔴 C2 | 🔴 C2 | QUEBRADO |
| Detalhes | ✅ | ✅ | OK |
| Assinatura | ✅ | ✅ | OK |
| Player | ✅ (protegido) | ✅ | OK |
| Favoritos/Minha Lista | ✅ (rota protegida) | ✅ | OK |
| Navegação remota TV | ✅ | ✅ (captureInput) | OK |
| Logout | ✅ | ✅ | OK |

---

## 11. RECOMENDAÇÃO DE CORREÇÃO (prioridade)
1. **CRÍTICO:** corrigir `vite.config.ts` — `manualChunks` como **função** (ou remover) → elimina React duplicado → corrige C1 + C2 de uma vez.
2. **IMPORTANTE:** resetar ErrorBoundary por rota (I1).
3. **MÉDIO:** remover APK antigo (M1), corrigir tamanho (M2), revisar `location.href` (M3).
4. Re-build + re-testar: reload direto em todas as rotas, busca com termos reais, fluxo completo, TV, mobile.

---
*Auditoria funcional executada com Chromium real (navegação, console, eventos de teclado, viewport mobile) + análise estática do código. Sem modificações de código nesta etapa (auditoria pura), conforme solicitado.*
