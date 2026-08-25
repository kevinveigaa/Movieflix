# MovieFlix

Plataforma de streaming inspirada em serviços modernos como Netflix, construída com React, TypeScript, Tailwind CSS, Vite, Supabase, Mercado Pago, React Router e React Query.

## 🎬 Catálogo e reprodução — StreamBetter

Todos os filmes e séries do catálogo vêm de **https://streambetter.shop** (API de streaming com player embutível).

- **Catálogo**: gerado offline por `node gerar-catalogo.cjs` e publicado em `filmes/filmes.json` + `filmes/series.json` (importados direto pelo front — carregamento instantâneo, sem depender de rede/Supabase). A API pública `GET https://streambetter.shop/api/titles` é a fonte original dos dados.
- **Filtros do catálogo**: somente **Filmes e Séries** (animes removidos), somente títulos com **capa**, somente títulos **dublados em pt-BR** e com **fonte cadastrada** (séries com ≥1 episódio com fonte).
- **Player**: embutido DENTRO do site Movieflix via `<iframe src="https://streambetter.shop/filme/{tmdb_id}?lang=pt-BR">`.
- **Áudio pt-BR**: o player do StreamBetter seleciona automaticamente a faixa de áudio em português quando disponível (trilhas "pt"/"por"/"portug"); `lang=pt-BR` reforça a preferência.
- **Séries**: `https://streambetter.shop/serie/{tmdb_id}/{temporada}/{episodio}`.
- **Sem players de terceiros**: nada de vidlink.pro, megaembedapi, VidZee etc. — player único do StreamBetter.
- **Ordenação e categorias**: catálogo ordenável por ano (recentes/antigos), A–Z e nota, com filtro por gênero (categorias TMDb em pt-BR).

### Sem anúncios

O Movieflix **não injeta nenhum anúncio próprio** (zero código de ad) e agora tem **duas camadas** para garantir que o usuário nunca veja anúncio nem redirecionamento:

1. **Modo direto HLS (padrão, automático):** para títulos do StreamBetter, o backend Movieflix (`backend/streambetter-resolver.js`) resolve o **stream HLS real** (`/api/proxy?t=...&ext=m3u8`) e o player reproduz num `<video>` nativo + hls.js — **sem iframe**. O overlay "Só mais um passo" do plano free vive DENTRO do iframe cross-origin do StreamBetter (impossível de fechar via JS da página pai); sem iframe, ele **não existe**. Também elimina qualquer possibilidade de redirecionamento. Se a resolução falhar, o player volta silenciosamente ao iframe com a proteção antiAds ativa.

2. **Bloqueio silencioso em camadas (`src/lib/antiAds.ts` + CSS global + camada nativa do APK):** intercepta `window.open`, `location.assign/replace/href`, cliques em links externos, meta refresh, iframes de anúncio, `beforeunload` e alterações de histórico — tudo cancelado em silêncio, sem aviso/toast. O CSS global oculta elementos de anúncio conhecidos (AdSense, popads, adsterra etc.).

### ⚠️ OBRIGATÓRIO para eliminar 100% dos anúncios do player

Para um player **100% sem anúncios no seu domínio**, assine o plano **Creator** em https://streambetter.shop/planos, gere a chave `sb_pk_*`, cadastre o domínio do site e defina **`VITE_STREAMBETTER_KEY`** no build (a chave vai na URL do iframe, é pública por natureza — ver `.env.example`). **Sem essa chave**, o plano free do StreamBetter pode exibir o overlay de anúncio quando o modo iframe é usado como fallback; o modo direto HLS (item 1) já evita esse cenário na maioria dos casos.

> ⚠️ Não use `sandbox`/bloqueadores no iframe — o StreamBetter detecta e recusa exibir o conteúdo (mostra "Reprodução bloqueada"). A proteção é feita na janela pai + modo direto HLS.

## Tecnologias

- **React 18** + **TypeScript**
- **Vite** — build e dev server
- **Tailwind CSS** — estilização (tema escuro, cores preto/vermelho/branco)
- **Supabase** — autenticação, banco de dados (Postgres + RLS) e Edge Functions
- **Mercado Pago** — pagamentos via Pix com confirmação automática por webhook
- **React Router** — roteamento
- **React Query** — cache e estado de dados
- **StreamBetter API** — catálogo de filmes + player embed
- **lucide-react** — ícones

## Funcionalidades

- Home com banner em destaque e carrosséis horizontais
- Catálogos: Filmes e Séries (com filtro por gênero e ordenação por ano)
- Pesquisa instantânea em tempo real
- Página de título com poster, banner, sinopse, nota, gênero, ano, duração e trailer
- Favoritos, Continuar Assistindo e Histórico
- Autenticação (login, cadastro, recuperação de senha) via Supabase
- Seleção de perfil (até 4 perfis com avatar e controle infantil)
- Assinatura com 3 planos (Básico R$19,90 / Padrão R$29,90 / Premium R$39,90)
- Pagamento via Pix (QR Code + Copia e Cola) com confirmação automática
- Controle de acesso: usuários sem assinatura navegam, mas não assistem conteúdo restrito
- Painel administrativo: total de usuários, assinantes, receitas, histórico de pagamentos e busca
- Design responsivo, animações suaves, skeletons de carregamento

## Estrutura do projeto

```
src/
  components/        # Componentes reutilizáveis (Carousel, Hero, Modal, Navbar, etc.)
    cards/           # PosterCard
    layout/          # AppLayout, Navbar, Footer
    ui/              # Feedback, Modal, Rating
  context/           # AuthContext (sessão, perfil, assinatura)
  hooks/             # useMovies (StreamBetter), useFavorite, useWatchHistory
  lib/               # supabase, strembetter, tmdb, mercadopago, cn
  pages/             # Todas as páginas
    auth/            # Login, Signup, ForgotPassword, ProfileSelect
  types/             # Tipos TypeScript
supabase/
  functions/         # Edge Functions
    mercadopago-pay/      # Gera pagamento Pix
    mercadopago-webhook/  # Recebe confirmação do Mercado Pago
```

## Configuração

As variáveis de ambiente do Supabase já estão em `.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Variáveis opcionais:
- `VITE_STREAMBETTER_KEY` — chave pública do plano Creator do StreamBetter (embed sem anúncios, com trava de domínio)

## Deploy

O projeto está pronto para deploy na Vercel (`vercel.json` já configurado para SPA).

## Licença

Projeto de demonstração. Dados de filmes fornecidos pela API do StreamBetter (metadados via TMDb).
