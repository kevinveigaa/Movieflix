# Verificação de Séries — Movieflix

Data: 2026-08-23
Commit base: `207654c`

## Contexto

O usuário reportou que algumas séries exibem o erro **"Não conseguimos tocar isso"** no player, e pediu para remover do catálogo todas as séries que não reproduzem.

## Método de verificação (o que foi feito)

O embed do StreamBetter (`https://streambetter.shop/serie/{tmdb}/{s}/{e}`) é renderizado no servidor. Isso permite verificar a disponibilidade de fonte **em massa, sem abrir o player**:

| Situação | HTML retornado |
|---|---|
| ✅ Episódio com fonte | Contém `__PLAYER_PARAMS__` com lista `sources` (ex.: `"Embed Public (Dublado)"`) |
| ❌ Episódio sem fonte | HTML pequeno (~4,5KB), sem `__PLAYER_PARAMS__`, com a mensagem *"nenhuma fonte de vídeo está cadastrada ou funcionando agora"* |

### Critério
Cada série foi testada no **primeiro episódio disponível** — exatamente a lógica do app (`primeiroEpisodioDisponivel` em `src/lib/strembetter.ts`), que ordena os episódios "T/E" e abre o menor. Se o primeiro episódio tem fonte, a série "funciona".

## Resultado da varredura (1256 séries)

- **Varredura 1** (sem retry): 1254 OK + 2 FAIL (Chicago P.D. tmdb=58841 e Brooklyn Nine-Nine tmdb=48891)
- **Re-teste manual dos 2 FAIL**: 5/5 tentativas OK cada → **falsos negativos por rate-limit** do servidor durante a varredura em massa
- **Varredura 2** (com retry automático 3x, via `verificar-series.cjs`): **1256/1256 OK** ✅

### Conclusão
**Todas as 1256 séries do catálogo têm fonte válida no primeiro episódio.** Nenhuma série foi removida — removê-las (especialmente Chicago P.D. e Brooklyn Nine-Nine, que funcionam) teria sido um erro causado por falso-negativo.

## O que foi entregue

1. **`verificar-series.cjs`** (novo) — script reutilizável para verificar o catálogo:
   ```bash
   node verificar-series.cjs                 # varre tudo (8 workers, retry 3x)
   node verificar-series.cjs --workers=4     # ajusta paralelismo
   node verificar-series.cjs --only=58841,48891  # testa tmdb específicos
   node verificar-series.cjs --json          # saída JSON (para CI)
   ```
   Exit code 0 = tudo OK; 1 = há séries sem fonte. Útil para rodar periodicamente ou em CI antes de publicar.

2. **Melhoria de robustez confirmada** — o player (`PlayerPage.tsx`) já lida graciosamente com falha em runtime:
   - Timeout de 15s → mostra "O vídeo não carregou pela fonte principal" com botões **"Abrir no navegador"** e **"Tentar novamente"**
   - Séries sem `episodes_available` → mensagem "Nenhum episódio disponível para esta série no momento"
   - Botão "Abrir player" no header abre o embed em nova aba como fallback

## Compatibilidade multi-dispositivo (revisão)

Confirmado por revisão de código (não exigiu alteração):

| Dispositivo | Suporte |
|---|---|
| **TV Box / Smart TV** | `useTvNavigation` (navegação espacial: setas + OK + Voltar, Tizen 10009, webOS 461) + `useTvPlayerControls` (OK/Play = play/pause, Voltar = sair do player) + foco vermelho `tv-focus`. Detectado via UA/`?tv=1` — **desligado em celular/PC** |
| **Celular** | Navegação por toque nativa; player responsivo (`aspect-video`, `w-full`); botão "Abrir no navegador" para iframes bloqueados |
| **PC** | Navegação por mouse/teclado normal; TV-nav desligado quando há mouse (`pointer: fine`) |

## Como monitorar no futuro

```bash
# Depois de regenerar o catálogo (node gerar-catalogo.cjs):
node verificar-series.cjs
# Se listar séries SEM fonte, remova-as do series.json antes do commit.
```
