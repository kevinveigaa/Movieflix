/**
 * MovieFlix — ATIVAÇÃO MANUAL VIA WHATSAPP
 *
 * Centraliza o número do admin, o link oficial do WhatsApp e a montagem das
 * mensagens automáticas (contratação, renovação, suporte) com o e-mail do
 * usuário logado + plano + valor. Nenhum componente monta a URL na mão.
 *
 * Princípio: E-MAIL + PLANO = ATIVAÇÃO. O admin recebe a mensagem, confirma o
 * pagamento manualmente e ativa a conta informando SOMENTE e-mail + plano.
 */

import { abrirWhatsAppNoApp } from '@/lib/appShell';

/** Número do admin (formato internacional, sem +). */
export const WHATSAPP_NUMBER = '5511943750307';

/** Link oficial do WhatsApp do admin. */
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

/** Nome de exibição do suporte (para mensagens). */
export const WHATSAPP_LABEL = 'Suporte MovieFlix';

/** Formata um valor em centavos como moeda brasileira (ex.: R$ 29,90). */
export function formatarBRL(cents: number | null | undefined): string {
  const valor = (cents ?? 0) / 100;
  return `R$ ${valor.toFixed(2).replace('.', ',')}`;
}

/** Monta a URL do WhatsApp com a mensagem pré-preenchida (encodeURIComponent). */
export function whatsappLink(mensagem: string): string {
  return `${WHATSAPP_URL}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * Mensagem de CONTRATAÇÃO de plano.
 * Inclui e-mail do usuário logado + nome/código/valor do plano.
 */
export function mensagemContratarPlano(opts: {
  email: string;
  planoNome: string;
  planoCodigo: string;
  valorCents: number;
}): string {
  return [
    'Olá! Quero contratar um plano do MovieFlix.',
    `E-mail: ${opts.email}`,
    `Plano: ${opts.planoNome}`,
    `Valor: ${formatarBRL(opts.valorCents)}`,
    'Gostaria de realizar o pagamento.',
  ].join('\n');
}

/**
 * Mensagem de RENOVAÇÃO (usuário com assinatura expirada ou próxima do fim).
 * Inclui e-mail + plano atual (se disponível) + intenção de renovar.
 */
export function mensagemRenovarPlano(opts: {
  email: string;
  planoNome?: string | null;
  planoCodigo?: string | null;
}): string {
  const linhas = [
    'Olá! Quero RENOVAR minha assinatura do MovieFlix.',
    `E-mail: ${opts.email}`,
  ];
  if (opts.planoNome) linhas.push(`Plano atual: ${opts.planoNome}`);
  if (opts.planoCodigo) linhas.push(`Código do plano: ${opts.planoCodigo}`);
  linhas.push('Gostaria de renovar meu acesso.');
  return linhas.join('\n');
}

/**
 * Mensagem de SUPORTE (dúvidas, pagamento, ativação).
 * Inclui o e-mail do usuário para o admin localizar a conta.
 */
export function mensagemSuporte(email: string): string {
  return [
    'Olá! Preciso de ajuda com o MovieFlix.',
    `E-mail: ${email}`,
    'Pode me ajudar?',
  ].join('\n');
}

/** Link do WhatsApp com mensagem de contratação de um plano. */
export function linkContratarPlano(opts: {
  email: string;
  planoNome: string;
  planoCodigo: string;
  valorCents: number;
}): string {
  return whatsappLink(mensagemContratarPlano(opts));
}

/** Link do WhatsApp com mensagem de renovação. */
export function linkRenovarPlano(opts: {
  email: string;
  planoNome?: string | null;
  planoCodigo?: string | null;
}): string {
  return whatsappLink(mensagemRenovarPlano(opts));
}

/** Link do WhatsApp com mensagem de suporte. */
export function linkSuporte(email: string): string {
  return whatsappLink(mensagemSuporte(email));
}

/**
 * Mensagem genérica de ASSINATURA (banners/CTAs que não têm um plano específico
 * selecionado). Inclui o e-mail do usuário para o admin localizar a conta.
 */
export function mensagemAssinarGenerico(email: string): string {
  return [
    'Olá! Quero assinar o MovieFlix.',
    `E-mail: ${email}`,
    'Gostaria de conhecer os planos e realizar o pagamento.',
  ].join('\n');
}

/** Link do WhatsApp com mensagem genérica de assinatura. */
export function linkAssinarGenerico(email: string): string {
  return whatsappLink(mensagemAssinarGenerico(email));
}

// ============================================================
// REDIRECIONAMENTO SEGURO (exceção única: WhatsApp oficial)
// ============================================================
// O MovieFlix bloqueia TODOS os redirecionamentos externos (antiAds + guard
// nativo do app). A ÚNICA exceção é o WhatsApp OFICIAL do MovieFlix, usado
// para assinar/trocar/renovar plano e falar com o suporte. Nenhum outro
// domínio ou número é permitido. A URL/número vêm da configuração acima
// (WHATSAPP_NUMBER / WHATSAPP_URL) — nunca inventar outro.

/** O link é o WhatsApp OFICIAL do MovieFlix (wa.me com o número configurado)? */
export function ehWhatsAppOficial(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    const host = u.hostname.toLowerCase();
    if (host !== 'wa.me' && host !== 'api.whatsapp.com' && host !== 'web.whatsapp.com' && !host.endsWith('whatsapp.com')) {
      return false;
    }
    // wa.me/{numero} — confere o número exato configurado.
    const path = u.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    if (host === 'wa.me') {
      return path === WHATSAPP_NUMBER || path === `+${WHATSAPP_NUMBER}`;
    }
    // api.whatsapp.com/send?phone=... — confere o parâmetro phone.
    const phone = u.searchParams.get('phone');
    if (phone) {
      const limpo = phone.replace(/\D/g, '');
      return limpo === WHATSAPP_NUMBER || limpo === `+${WHATSAPP_NUMBER}`;
    }
    // web.whatsapp.com (sem número) — permite apenas se for o domínio oficial.
    return host === 'web.whatsapp.com';
  } catch {
    return false;
  }
}

/**
 * Função centralizada de validação de URL externa.
 * - WhatsApp OFICIAL do MovieFlix → PERMITE.
 * - Qualquer outro domínio/número → BLOQUEIA.
 * Usada pelo antiAds (camada JS) e como referência para a guarda nativa do app.
 */
export function isAllowedExternalUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url, window.location.href);
    // Navegação interna do app (SPA) sempre permitida.
    if (u.origin === window.location.origin) return true;
    return ehWhatsAppOficial(u.href);
  } catch {
    return false;
  }
}

/**
 * Abre um link externo de forma SEGURA, respeitando a política de
 * redirecionamento (isAllowedExternalUrl). Usado pelos botões de assinatura
 * para abrir o WhatsApp oficial.
 *
 * MÉTODO PRIMÁRIO: navegação direta via `window.location.href`. É o mais
 * confiável em Android, navegador mobile, desktop e WebView — não depende de
 * `window.open` (que pode ser bloqueado por popup-blocker ou pelo
 * setSupportMultipleWindows(false) do WebView) nem de `target="_blank"`.
 * O antiAds permite o WhatsApp oficial (isAllowedExternalUrl), então a
 * navegação não é cancelada. Retorna true se a navegação foi iniciada.
 */
export function abrirLinkExternoPermitido(url: string): boolean {
  if (!isAllowedExternalUrl(url)) return false;
  try {
    // Navegação direta: sai do site para o WhatsApp oficial. O antiAds
    // permite (isAllowedExternalUrl) e o guard nativo do app também.
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}

/**
 * Abre o WhatsApp OFICIAL do MovieFlix de forma confiável, respeitando a
 * política de redirecionamento (isAllowedExternalUrl). Usado pelos botões de
 * assinatura/troca/renovação de plano e suporte. Retorna true se abriu.
 *
 * Estratégia em camadas (robusta em TODOS os ambientes):
 *  1. DENTRO DO APP (APK/Capacitor): chama a ponte nativa
 *     `MovieFlixApp.abrirWhatsApp(url)`, que valida a URL e dispara o intent
 *     ACTION_VIEW diretamente — contorna o bloqueio de `window.open` do WebView
 *     (setSupportMultipleWindows(false)) e a interceptação de navegação.
 *  2. NAVEGADOR: `window.open` (nova aba) para não sair do site; se o navegador
 *     bloquear, cai para navegação direta (o antiAds permite o WhatsApp oficial).
 */
export async function abrirWhatsApp(url: string): Promise<boolean> {
  if (!isAllowedExternalUrl(url)) return false;
  // 1) App nativo: ponte Capacitor (mais confiável no WebView).
  const abriuNoApp = await abrirWhatsAppNoApp(url);
  if (abriuNoApp) return true;
  // 2) Navegador: window.open com fallback para navegação direta.
  return abrirLinkExternoPermitido(url);
}