import type { Plan, Subscription } from '@/types';

export interface PlanEntitlements {
  /** Altura máxima de vídeo permitida (px). 480 = SD, 720 = HD, 1080 = Full HD, 2160 = 4K */
  maxHeight: number;
  qualityLabel: string;
  /** Telas simultâneas permitidas */
  screens: number;
  /** Quantos downloads o assinante pode manter por mês (0 = não permitido, Infinity = ilimitado) */
  downloads: number;
  /** Quantos perfis (assistir) o assinante pode criar. Sem plano = 1. */
  maxProfiles: number;
}

/** Limite usado pelos planos com downloads ilimitados. */
const UNLIMITED_DOWNLOADS = Number.POSITIVE_INFINITY;

const DEFAULT_BY_CODE: Record<string, PlanEntitlements> = {
  simple: { maxHeight: 720, qualityLabel: 'HD (720p)', screens: 1, downloads: 0, maxProfiles: 2 },
  basico: { maxHeight: 720, qualityLabel: 'HD (720p)', screens: 1, downloads: 0, maxProfiles: 2 },
  basic: { maxHeight: 720, qualityLabel: 'HD (720p)', screens: 1, downloads: 0, maxProfiles: 2 },
  standard: { maxHeight: 1080, qualityLabel: 'Full HD (1080p)', screens: 2, downloads: 5, maxProfiles: 3 },
  padrao: { maxHeight: 1080, qualityLabel: 'Full HD (1080p)', screens: 2, downloads: 5, maxProfiles: 3 },
  medio: { maxHeight: 1080, qualityLabel: 'Full HD (1080p)', screens: 2, downloads: 5, maxProfiles: 3 },
  premium: { maxHeight: 2160, qualityLabel: '4K + HDR', screens: 4, downloads: UNLIMITED_DOWNLOADS, maxProfiles: 5 },
};

export const FREE_ENTITLEMENTS: PlanEntitlements = {
  maxHeight: 0,
  qualityLabel: 'Somente catálogo e trailers',
  screens: 0,
  downloads: 0,
  maxProfiles: 1,
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

/** true quando o limite de downloads é ilimitado (Infinity). */
export function hasUnlimitedDownloads(downloads: number): boolean {
  return !Number.isFinite(downloads);
}

/** Rótulo legível do limite de downloads (ex.: '5 downloads por mês'). */
export function downloadsLimitLabel(downloads: number): string {
  if (downloads <= 0) return 'Sem downloads offline';
  if (hasUnlimitedDownloads(downloads)) return 'Downloads ilimitados';
  return `${downloads} downloads por mês`;
}

/** Lista de benefícios legível para exibir nos cards de plano. */
export function entitlementHighlights(plan: Plan): string[] {
  const e = entitlementsForPlan(plan);
  return [
    `Qualidade até ${e.qualityLabel}`,
    `${e.screens} ${e.screens === 1 ? 'tela simultânea' : 'telas simultâneas'}`,
    downloadsLimitLabel(e.downloads),
    `Até ${e.maxProfiles} ${e.maxProfiles === 1 ? 'perfil' : 'perfis'}`,
    'Catálogo completo liberado',
  ];
}

/** Rótulo legível do limite de perfis (ex.: 'Até 3 perfis'). */
export function maxProfilesLabel(maxProfiles: number): string {
  if (maxProfiles <= 1) return '1 perfil';
  return `Até ${maxProfiles} perfis`;
}
