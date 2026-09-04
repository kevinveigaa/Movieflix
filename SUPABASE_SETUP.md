# MovieFlix — Configuração do Supabase Auth (Reset de Senha)

Este documento descreve a configuração **exigida** no painel do Supabase para o
fluxo de recuperação de senha funcionar de ponta a ponta (e-mail → link → nova
senha → login).

## Como o fluxo funciona (código)

1. O usuário clica em **"Esqueceu a senha?"** (`/recuperar-senha`).
2. `AuthContext.resetPassword(email)` chama
   `supabase.auth.resetPasswordForEmail(email, { redirectTo: "<origin>/" })`.
3. O Supabase envia um e-mail com um link que aponta para
   `https://movieflix-bszf.onrender.com/` e anexa um **hash ÚNICO** com o token
   de recuperação (`#access_token=...&type=recovery`).
4. O `supabase-js` (com `detectSessionInUrl: true`) processa o hash e dispara o
   evento `PASSWORD_RECOVERY` com uma sessão temporária.
5. **Captura do evento (causa raiz corrigida):** o `AuthProvider` (montado
   ANTES das rotas) escuta `onAuthStateChange` e, ao receber
   `PASSWORD_RECOVERY`, guarda o flag `isPasswordRecovery` no contexto e
   navega para `/redefinir-senha`. Isso é essencial porque o supabase-js
   **consome/limpa o hash da URL** e dispara o evento antes de a
   `ResetPasswordPage` montar o seu próprio listener.
6. A página `ResetPasswordPage` (`/redefinir-senha`) lê `isPasswordRecovery`
   do contexto e mostra o formulário "Definir nova senha".
7. O usuário define a nova senha → `supabase.auth.updateUser({ password })` →
   confirmação → redireciona para `/login`.

> **⚠️ IMPORTANTE (hash duplo):** o `redirectTo` deve ser a **RAIZ**
> (`<origin>/`), **NUNCA** `<origin>/#/redefinir-senha`. Como o app usa
> **HashRouter**, se o redirectTo fosse `#/redefinir-senha`, o Supabase anexaria
> o token como hash DUPLO (`#/redefinir-senha#access_token=...`), que o
> supabase-js não consegue ler → o evento `PASSWORD_RECOVERY` nunca dispara e a
> tela mostra "link inválido". Com o redirectTo na raiz, o hash é único e o
> supabase-js o processa corretamente; o AuthProvider então navega para
> `/redefinir-senha`.

## Configuração obrigatória no Supabase

Acesse **Supabase Dashboard → Authentication → URL Configuration**:

| Campo | Valor |
|-------|-------|
| **Site URL** | `https://movieflix-bszf.onrender.com` |
| **Redirect URLs** | `https://movieflix-bszf.onrender.com/**` |

> **Importante:** o `redirectTo` enviado no e-mail é
> `https://movieflix-bszf.onrender.com/` (raiz). O Supabase anexa o hash de
> recuperação a essa URL. A **Redirect URL** cadastrada deve cobrir a raiz
> (`https://movieflix-bszf.onrender.com/**` ou a URL exata sem hash). Para dev
> local, adicione também `http://localhost:5173/**`.

### E-mail de recuperação (opcional, recomendado)

Em **Authentication → Emails → Templates → Reset password**, o link do template
deve apontar para o `redirectTo` acima. O template padrão do Supabase já usa o
`redirectTo` configurado, então normalmente não é preciso alterar.

## Render (SPA fallback)

O projeto usa **HashRouter** (`/#/rota`), então **não** é necessário configurar
rewrite de SPA no Render — todas as rotas são servidas pelo `index.html` e a
navegação acontece no cliente. O `render.yaml` já serve o app via
`backend/server.js` (que entrega o `dist/`).

## Painel de Administrador (gestão de clientes e planos)

O painel admin fica em **`/#/admin`** e é acessível **somente** ao admin
autenticado (e-mail `veigakevin71@gmail.com`). Nele o admin pode:

- **Ver todos os e-mails** dos clientes cadastrados (aba **Clientes**).
- **Ativar/trocar/desativar plano** de um cliente (plano 1/2/3) informando o
  e-mail na seção "Ativação manual de assinatura (WhatsApp)".
- **Alterar a senha** de um cliente diretamente (aba **Clientes** → digitar a
  nova senha → "Alterar senha").

### Backend (service_role)

As operações de listar clientes e alterar senha usam a **service_role** do
Supabase **somente no servidor** (`backend/server.js`), via os endpoints:

- `GET /api/admin/clientes` — lista todos os e-mails (exige token do admin).
- `POST /api/admin/alterar-senha` — altera a senha de um cliente
  (`supabase.auth.admin.updateUserById`).

**Variáveis de ambiente do backend (Render):** `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` (a service_role **nunca** vai para o frontend). O
endpoint valida que o JWT enviado pertence ao admin antes de usar a service_role.

## Verificação

- [ ] `Site URL` e `Redirect URLs` configurados no Supabase (valores acima).
- [ ] `npm run build` passa (o `ResetPasswordPage` é incluído no bundle).
- [ ] Fluxo manual: Esqueci minha senha → e-mail → link → nova senha → login.
- [ ] Painel admin (`/#/admin`) lista clientes, ativa/troca plano e altera senha.