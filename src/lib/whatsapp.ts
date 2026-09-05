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

import { abrirWhatsAppNoApp, ehAppSincrono } from '@/lib/appShell';

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

/** O link é o WhatsApp OFICIAL do MovieFlix (wa.me/numero ou whatsapp://send)? */
export function ehWhatsAppOficial(url: string): boolean {
  try {
    // Suporta o deep link nativo whatsapp://send?phone=... (usado no app).
    if (url.startsWith('whatsapp://')) {
      const u = new URL(url);
      const phone = u.searchParams.get('phone');
      if (phone) {
        const limpo = phone.replace(/\D/g, '');
        return limpo === WHATSAPP_NUMBER || limpo === `+${WHATSAPP_NUMBER}`;
      }
      return false;
    }
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
  // Deep link nativo do WhatsApp (whatsapp://send?phone=...) — permite.
  if (url.startsWith('whatsapp://')) {
    return ehWhatsAppOficial(url);
  }
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
 * MÉTODO MAIS CONFIÁVEL: `window.open` em nova aba — NÃO fecha o site e é o
 * método que o antiAds.ts permite explicitamente para o WhatsApp oficial
 * (isAllowedExternalUrl). Em WebViews que bloqueiam window.open, cai para o
 * link real com target=_blank e, por último, navegação direta.
 *
 * NUNCA lança exceção — sempre retorna boolean (evita erro de runtime que
 * quebraria o clique do botão).
 */
export function abrirLinkExternoPermitido(url: string): boolean {
  if (!isAllowedExternalUrl(url)) return false;
  // Deep link nativo do WhatsApp (whatsapp://) — abre direto (app instalado).
  if (url.startsWith('whatsapp://')) {
    try {
      window.location.href = url;
      return true;
    } catch {
      return false;
    }
  }
  try {
    // 1) window.open (nova aba) — não fecha o site; o antiAds permite o WhatsApp.
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) return true;
  } catch {
    /* tenta o próximo método */
  }
  try {
    // 2) Link real com target=_blank + clique programático.
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    /* tenta o próximo */
  }
  try {
    // 3) Navegação direta (popup bloqueado / WebView).
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
 *  2. NAVEGADOR: link real com target=_blank (não fecha o site); se o navegador
 *     bloquear, cai para window.open e depois navegação direta.
 *
 * NUNCA lança exceção — sempre retorna boolean (evita erro de runtime que
 * quebraria o botão e mostraria erro na tela).
 */
export function abrirWhatsApp(url: string): boolean {
  try {
    if (!isAllowedExternalUrl(url)) return false;
    // 1) App nativo (APK/Capacitor): ponte nativa (síncrona, sem await).
    if (ehAppSincrono()) {
      void abrirWhatsAppNoApp(url);
      return true;
    }
    // 2) Navegador: link real com target=_blank + clique programático.
    //    (sem `noopener` para não retornar null; o site não fecha porque abre
    //    em nova aba). Se o navegador bloquear o popup, cai para window.open.
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch {
    // Nunca deixa o erro chegar ao botão (evita erro de tela).
    try {
      window.open(url, '_blank');
      return true;
    } catch {
      return false;
    }
  }
}

