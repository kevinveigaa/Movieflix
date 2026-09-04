# MovieFlix — Configuração do Supabase Auth (Reset de Senha)

Este documento descreve a configuração **exigida** no painel do Supabase para o
fluxo de recuperação de senha funcionar de ponta a ponta (e-mail → link → nova
senha → login).

## Como o fluxo funciona (código)

1. O usuário clica em **"Esqueceu a senha?"** (`/recuperar-senha`).
2. `AuthContext.resetPassword(email)` chama
   `supabase.auth.resetPasswordForEmail(email, { redirectTo: "<origin>/#/redefinir-senha" })`.
3. O Supabase envia um e-mail com um link que aponta para
   `https://movieflix-bszf.onrender.com/#/redefinir-senha` e anexa um **hash**
   com o token de recuperação (`#access_token=...&type=recovery`).
4. O `supabase-js` (com `detectSessionInUrl: true`) processa o hash e dispara o
   evento `PASSWORD_RECOVERY` com uma sessão temporária.
5. **Captura do evento (causa raiz corrigida):** o `AuthProvider` (montado
   ANTES das rotas) escuta `onAuthStateChange` e, ao receber
   `PASSWORD_RECOVERY`, guarda o flag `isPasswordRecovery` no contexto. Isso é
   essencial porque o supabase-js **consome/limpa o hash da URL** e dispara o
   evento antes de a `ResetPasswordPage` montar o seu próprio listener — o
   re-parse manual de `window.location.hash` falhava (hash já limpo).
6. A página `ResetPasswordPage` (`/redefinir-senha`) lê `isPasswordRecovery`
   do contexto e mostra o formulário "Definir nova senha".
7. O usuário define a nova senha → `supabase.auth.updateUser({ password })` →
   confirmação → redireciona para `/login`.

## Configuração obrigatória no Supabase

Acesse **Supabase Dashboard → Authentication → URL Configuration**:

| Campo | Valor |
|-------|-------|
| **Site URL** | `https://movieflix-bszf.onrender.com` |
| **Redirect URLs** | `https://movieflix-bszf.onrender.com/redefinir-senha` |

> **Importante:** o `redirectTo` enviado no e-mail é
> `https://movieflix-bszf.onrender.com/#/redefinir-senha`. Como o app usa
> **HashRouter**, a parte `#/redefinir-senha` é tratada pelo frontend e o
> servidor (Render) só precisa servir o `index.html` na raiz. A **Redirect URL**
> cadastrada no Supabase deve ser a URL **sem** o hash
> (`https://movieflix-bszf.onrender.com/redefinir-senha`), pois o Supabase valida
> o `redirectTo` contra a lista de Redirect URLs permitidas.

### E-mail de recuperação (opcional, recomendado)

Em **Authentication → Emails → Templates → Reset password**, o link do template
deve apontar para o `redirectTo` acima. O template padrão do Supabase já usa o
`redirectTo` configurado, então normalmente não é preciso alterar.

## Render (SPA fallback)

O projeto usa **HashRouter** (`/#/rota`), então **não** é necessário configurar
rewrite de SPA no Render — todas as rotas são servidas pelo `index.html` e a
navegação acontece no cliente. O `render.yaml` já serve o app via
`backend/server.js` (que entrega o `dist/`).

## Verificação

- [ ] `Site URL` e `Redirect URLs` configurados no Supabase (valores acima).
- [ ] `npm run build` passa (o `ResetPasswordPage` é incluído no bundle).
- [ ] Fluxo manual: Esqueci minha senha → e-mail → link → nova senha → login.