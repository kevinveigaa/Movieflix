# MovieFlix

Plataforma de streaming inspirada em serviços modernos como Netflix, construída com React, TypeScript, Tailwind CSS, Vite, Supabase, Mercado Pago, React Router e React Query.

## Tecnologias

- **React 18** + **TypeScript**
- **Vite** — build e dev server
- **Tailwind CSS** — estilização (tema escuro, cores preto/vermelho/branco)
- **Supabase** — autenticação, banco de dados (Postgres + RLS) e Edge Functions
- **Mercado Pago** — pagamentos via Pix com confirmação automática por webhook
- **React Router** — roteamento
- **React Query** — cache e estado de dados
- **TMDb API** — catálogo de filmes, séries, animes, documentários e infantil
- **lucide-react** — ícones

## Funcionalidades

- Home com banner em destaque e carrosséis horizontais
- Catálogos: Filmes, Séries, Animes, Documentários, Infantil
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
  hooks/             # useFavorite, useWatchHistory
  lib/               # supabase, tmdb, mercadopago, cn
  pages/             # Todas as páginas
    auth/            # Login, Signup, ForgotPassword, ProfileSelect
  types/             # Tipos TypeScript
supabase/
  functions/         # Edge Functions
    mercadopago-pay/      # Gera pagamento Pix
    mercadopago-webhook/  # Recebe confirmação do Mercado Pago
```

## Banco de dados (Supabase)

Tabelas:
- `profiles` — metadados do usuário + flag de admin
- `viewer_profiles` — perfis Netflix-style (até 4 por usuário)
- `plans` — planos de assinatura (Básico, Padrão, Premium)
- `subscriptions` — assinatura atual do usuário
- `payments` — registros de pagamento do Mercado Pago
- `favorites` — títulos favoritados
- `watch_history` — continuar assistindo + histórico

Todas as tabelas têm RLS (Row Level Security) habilitada com políticas de propriedade.

## Configuração

As variáveis de ambiente do Supabase já estão em `.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Deploy

O projeto está pronto para deploy na Vercel (`vercel.json` já configurado para SPA).

## Deploy das Edge Functions

As Edge Functions (`mercadopago-pay` e `mercadopago-webhook`) precisam ser deployadas no Supabase. O código está em `supabase/functions/`.

## Licença

Projeto de demonstração. Dados de filmes fornecidos por TMDb.
