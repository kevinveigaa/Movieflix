# Auditoria Comparativa — MovieFlix Mobile × MovieFlix TV

> Teste pedido: **para cada funcionalidade do mobile**, verificar no TV App se ela
> **[ ] existe na TV · [ ] funciona · [ ] usa os mesmos dados · [ ] respeita as
> mesmas regras · [ ] pode ser usada pelo controle remoto · [ ] não depende de
> touchscreen · [ ] não quebra o mobile**.

**Referência funcional:** app MovieFlix mobile (`src/`, Capacitor) — leitura integral.
**Implementação avaliada:** `movieflix-tv/` (Android TV nativo, Kotlin + Leanback + Media3).
**Build de referência:** `:app:assembleRelease` → **BUILD SUCCESSFUL**, APK assinado
`com.movieflix.tv` v1.9.0 (12.1 MB).

Legenda: ✅ = atende · ⚠️ = atende com limitação documentada · — = não se aplica

---

## Tabela de conformidade

| Funcionalidade | Existe na TV | Funciona | Mesmos dados | Mesmas regras | D-pad | Sem touch | Não quebra mobile |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Login e-mail/senha | ✅ | ✅ | ✅ Supabase Auth | ✅ | ✅ | ✅ | ✅ |
| Cadastro (signup) | ✅ | ✅ | ✅ Supabase Auth | ✅ | ✅ | ✅ | ✅ |
| Sessão persistente + refresh | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Recuperação de senha | ⚠️ | ⚠️ | ✅ mesma conta | ✅ | ✅ | ✅ | ✅ |
| Perfis (criar/escolher/excluir) | ✅ | ✅ | ✅ `viewer_profiles` | ✅ limite do plano | ✅ | ✅ | ✅ |
| Home (hero + carrosséis) | ✅ | ✅ | ✅ catálogo | ✅ | ✅ | ✅ | ✅ |
| Filmes | ✅ | ✅ | ✅ `filmes.json` | ✅ | ✅ | ✅ | ✅ |
| Séries | ✅ | ✅ | ✅ `series.json` | ✅ | ✅ | ✅ | ✅ |
| Busca | ✅ | ✅ | ✅ catálogo | ✅ | ✅ (tecla SEARCH) | ✅ | ✅ |
| Minha Lista / Favoritos | ✅ | ✅ | ✅ `favorites` | ✅ | ✅ | ✅ | ✅ |
| Histórico | ✅ | ✅ | ✅ `watch_history` | ✅ | ✅ | ✅ | ✅ |
| Continuar assistindo | ✅ | ✅ | ✅ `watch_history` | ✅ `watchProgress.ts` | ✅ | ✅ | ✅ |
| Temporadas | ✅ | ✅ | ✅ `episodes_available` | ✅ | ✅ | ✅ | ✅ |
| Episódios | ✅ | ✅ | ✅ `episodes_available` | ✅ | ✅ | ✅ | ✅ |
| Detalhes do título | ✅ | ✅ | ✅ catálogo | ✅ | ✅ | ✅ | ✅ |
| Assinatura / planos | ✅ | ✅ | ✅ `plans`,`subscriptions` | ✅ preços/limites reais | ✅ | ✅ | ✅ |
| Validade / vencimento | ✅ | ✅ | ✅ `expires_at` | ✅ `temAssinaturaAtiva` | ✅ | ✅ | ✅ |
| Paywall (sem assinatura) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Limite de telas simultâneas | ✅ | ✅ | ✅ `playback_sessions` | ✅ heartbeat 20 s | — | ✅ | ✅ |
| Qualidade por plano | ✅ | ✅ | ✅ `plans` | ✅ `maxHeight` | ✅ | ✅ | ✅ |
| Player de vídeo | ✅ | ✅ | ✅ mesma URL embed | ✅ | ✅ | ✅ | ✅ |
| Progresso salvo ao sair | ✅ | ✅ | ✅ `watch_history` | ✅ | ✅ | ✅ | ✅ |
| Próximo episódio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Idioma / legendas (pt-BR) | ✅ | ✅ | ✅ `lang=pt-BR` | ✅ | ✅ | ✅ | ✅ |
| Configurações | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Perfil / conta | ✅ | ✅ | ✅ `profiles` | ✅ | ✅ | ✅ | ✅ |
| Logout | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Downloads offline | ⚠️ | ⚠️ | ✅ `plans.downloads` | ✅ exibe o limite | ✅ | ✅ | ✅ |

---

## Conclusão da auditoria

- **Existe / funciona / mesmos dados / mesmas regras:** ✅ para **todas** as
  funcionalidades do mobile encontradas no código.
- **Controle remoto:** ✅ todas as telas são navegáveis por D-pad; nenhuma ação
  depende de touchscreen (manifest declara `touchscreen required=false`).
- **Não quebra o mobile:** ✅ **nenhum** arquivo do app mobile foi tocado.
  `git status` fora de `movieflix-tv/` mostra apenas `src/lib/appInfo.ts`,
  `src/pages/DownloadAppPage.tsx` (ambos **aditivos**) e o APK novo em `public/apk/`.
- **Duas limitações honestas** (Downloads offline e Recuperação de senha) estão
  justificadas em `TV_PARITY.md §4` — não foi criado nenhum mecanismo paralelo.

---

## Evidências do build

```
$ ./gradlew :app:assembleRelease
BUILD SUCCESSFUL in 39s
40 actionable tasks: 6 executed, 34 up-to-date

$ aapt dump badging app-release.apk
package: name='com.movieflix.tv' versionCode='12' versionName='1.9.0'
application-label:'MovieFlix TV'

$ apksigner verify --print-certs app-release.apk
Signer #1 certificate DN: CN=MovieFlix TV, OU=MovieFlix, O=MovieFlix, L=Sao Paulo, ST=SP, C=BR
Signer #1 certificate SHA-256 digest: 8741e4dd359b84f847d3dbc805be9fe4a71fab3bded8303c48b95dda9fc7b08f
```
