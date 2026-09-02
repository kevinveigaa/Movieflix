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