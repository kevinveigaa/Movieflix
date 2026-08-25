import type { Plan, Subscription } from '@/types';

export interface PlanEntitlements {
  /** Altura máxima de vídeo permitida (px). 480 = SD, 720 = HD, 1080 = Full HD, 2160 = 4K */
  maxHeight: number;
  qualityLabel: string;
  /** Telas simultáneas permitidas */
  screens: number;
  /** Cuántos downloads puede mantener el suscriptor por mes (0 = no permitido, Infinity = ilimitado) */
  downloads: number;
  /** Cuántos perfiles (ver) puede crear el suscriptor. Sin plan = 1. */
  maxProfiles: number;
  /** Cuántos títulos guarda "Continuar viendo" (0 = no disponible, Infinity = ilimitado). */
  maxHistory: number;
}

/** Límite usado por los planes con continuar viendo ilimitado. */
const UNLIMITED_HISTORY = Number.POSITIVE_INFINITY;

/** Limite usado pelos planos com downloads ilimitados. */
const UNLIMITED_DOWNLOADS = Number.POSITIVE_INFINITY;

const DEFAULT_BY_CODE: Record<string, PlanEntitlements> = {
  simple: { maxHeight: 720, qualityLabel: 'HD (720p)', screens: 1, downloads: 0, maxProfiles: 2, maxHistory: 5 },
  basico: { maxHeight: 720, qualityLabel: 'HD (720p)', screens: 1, downloads: 0, maxProfiles: 2, maxHistory: 5 },
  basic: { maxHeight: 720, qualityLabel: 'HD (720p)', screens: 1, downloads: 0, maxProfiles: 2, maxHistory: 5 },
  standard: { maxHeight: 1080, qualityLabel: 'Full HD (1080p)', screens: 2, downloads: 5, maxProfiles: 3, maxHistory: 15 },
  padrao: { maxHeight: 1080, qualityLabel: 'Full HD (1080p)', screens: 2, downloads: 5, maxProfiles: 3, maxHistory: 15 },
  medio: { maxHeight: 1080, qualityLabel: 'Full HD (1080p)', screens: 2, downloads: 5, maxProfiles: 3, maxHistory: 15 },
  premium: { maxHeight: 2160, qualityLabel: '4K + HDR', screens: 4, downloads: UNLIMITED_DOWNLOADS, maxProfiles: 5, maxHistory: UNLIMITED_HISTORY },
};

export const FREE_ENTITLEMENTS: PlanEntitlements = {
  maxHeight: 0,
  qualityLabel: 'Somente catálogo e trailers',
  screens: 0,
  downloads: 0,
  maxProfiles: 1,
  maxHistory: 3,
};

/** Normaliza um valor para comparação case-insensitive. */
function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Resolve o plano associado a uma assinatura, tolerando dados inconsistentes:
 * `plan_code` pode vir como código ('standard'), como UUID do plano ou nulo;
 * `plan_id` pode conter o UUID do plano. Compara sempre de forma case-insensitive.
 */
export function resolveSubscriptionPlan(
  sub: Subscription | null | undefined,
  plans?: Plan[] | null,
): Plan | null {
  if (!sub) return null;
  if (sub.plan) return sub.plan;
  if (!plans?.length) return null;

  const code = normalize(sub.plan_code);
  const planId = normalize(sub.plan_id);

  return (
    plans.find((p) => planId !== '' && normalize(p.id) === planId) ??
    plans.find((p) => code !== '' && normalize(p.code) === code) ??
    plans.find((p) => code !== '' && normalize(p.id) === code) ??
    plans.find((p) => planId !== '' && normalize(p.code) === planId) ??
    null
  );
}

/** Entitlements de um plano — usa o código do plano, com fallback por preço. */
export function entitlementsForPlan(plan?: Plan | null): PlanEntitlements {
  if (!plan) return FREE_ENTITLEMENTS;

  const byCode = DEFAULT_BY_CODE[normalize(plan.code)];
  if (byCode) return byCode;

  // Fallback: define pelo preço do plano
  const price = plan.price_cents ?? 0;
  if (price >= 4000) return DEFAULT_BY_CODE['premium']!;
  if (price >= 2500) return DEFAULT_BY_CODE['standard']!;
  return DEFAULT_BY_CODE['basic']!;
}

export function entitlementsForSubscription(
  sub: Subscription | null,
  active: boolean,
  plans?: Plan[] | null,
): PlanEntitlements {
  if (!active || !sub) return FREE_ENTITLEMENTS;
  return entitlementsForPlan(resolveSubscriptionPlan(sub, plans));
}

/** true cuando o limite de downloads é ilimitado (Infinity). */
export function hasUnlimitedDownloads(downloads: number): boolean {
  return !Number.isFinite(downloads);
}

/** Rótulo legível do limite de downloads (ex.: '5 downloads por mês'). */
export function downloadsLimitLabel(downloads: number): string {
  if (downloads <= 0) return 'Sem downloads offline';
  if (hasUnlimitedDownloads(downloads)) return 'Downloads ilimitados';
  return `${downloads} downloads por mês`;
}

/** Rótulo legible del límite de "Continuar viendo" (ex.: '15 títulos en continuar viendo'). */
export function historyLimitLabel(maxHistory: number): string {
  if (maxHistory <= 0) return 'Sin continuar viendo';
  if (hasUnlimitedDownloads(maxHistory)) return 'Continuar viendo ilimitado';
  return `${maxHistory} títulos en continuar viendo`;
}

/** Lista de beneficios legible para mostrar en los cards de plan. */
export function entitlementHighlights(plan: Plan): string[] {
  const e = entitlementsForPlan(plan);
  return [
    `Qualidade até ${e.qualityLabel}`,
    `${e.screens} ${e.screens === 1 ? 'tela simultánea' : 'telas simultáneas'}`,
    downloadsLimitLabel(e.downloads),
    historyLimitLabel(e.maxHistory),
    `Até ${e.maxProfiles} ${e.maxProfiles === 1 ? 'perfil' : 'perfis'}`,
    'Catálogo completo liberado',
  ];
}

/** Rótulo legível do limite de perfis (ex.: 'Até 3 perfis'). */
export function maxProfilesLabel(maxProfiles: number): string {
  if (maxProfiles <= 1) return '1 perfil';
  return `Até ${maxProfiles} perfis`;
}

// ─── Utilidades de assinatura (dias restantes / vencimento / avisos) ─────────
// Usadas pela SubscriptionPage (painel) e pela PlayerPage (gate). Cálculo com
// datas UTC reais — nunca depende do relógio do dispositivo além do `now()`.

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias restantes até o vencimento (inteiro, arredondado para cima; 0 = expirado). */
export function diasRestantes(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  const fim = new Date(expiresAt).getTime();
  if (!Number.isFinite(fim)) return 0;
  const agora = Date.now();
  if (fim <= agora) return 0;
  return Math.ceil((fim - agora) / DIA_MS);
}

/** Rótulo de dias restantes ("10 dias restantes", "1 dia restante", "0 dias…"). */
export function rotuloDiasRestantes(expiresAt: string | null | undefined): string {
  const dias = diasRestantes(expiresAt);
  if (dias <= 0) return '0 dias — assinatura expirada';
  return dias === 1 ? '1 dia restante' : `${dias} dias restantes`;
}

/** Data de vencimento formatada dd/mm/aaaa (ou '' se ausente). */
export function formatarVencimento(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '';
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export interface AvisoVencimento {
  nivel: '5' | '3' | '1' | null;
  mensagem: string | null;
}

/**
 * Aviso automático de vencimento próximo (baseado em dias reais restantes):
 *  - <= 5 dias  → "Seu plano termina em X dias. Renove agora…"
 *  - <= 3 dias  → "Seu plano termina em X dias. Seu acesso está próximo…"
 *  - <= 1 dia   → "Seu plano termina amanhã! Renove agora…"
 * Nunca mostra aviso prematuro (>5 dias) nem dias errados (usa diff real).
 */
export function avisoVencimento(expiresAt: string | null | undefined): AvisoVencimento {
  const dias = diasRestantes(expiresAt);
  if (dias <= 0) return { nivel: null, mensagem: null };
  const venc = formatarVencimento(expiresAt);
  if (dias <= 1) {
    return {
      nivel: '1',
      mensagem: `🔔 Seu plano termina amanhã! Renove agora para não perder o acesso ao MovieFlix.${
        venc ? ` Seu plano vence em ${venc}.` : ''
      }`,
    };
  }
  if (dias <= 3) {
    return {
      nivel: '3',
      mensagem: `⚠️ Seu plano termina em ${dias} dias. Seu acesso está próximo do vencimento. Renove para continuar assistindo.${
        venc ? ` Vencimento: ${venc}.` : ''
      }`,
    };
  }
  if (dias <= 5) {
    return {
      nivel: '5',
      mensagem: `⚠️ Seu plano termina em ${dias} dias. Renove agora para continuar assistindo ao MovieFlix sem interrupções.${
        venc ? ` Vencimento: ${venc}.` : ''
      }`,
    };
  }
  return { nivel: null, mensagem: null };
}