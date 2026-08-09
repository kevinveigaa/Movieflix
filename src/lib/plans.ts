import type { Plan, Subscription } from '@/types';

export interface PlanEntitlements {
  /** Altura máxima de vídeo permitida (px). 480 = SD, 720 = HD, 1080 = Full HD, 2160 = 4K */
  maxHeight: number;
  qualityLabel: string;
  /** Telas simultâneas permitidas */
  screens: number;
  /** Quantos downloads o assinante pode manter por mês (0 = não permitido) */
  downloads: number;
}

const DEFAULT_BY_CODE: Record<string, PlanEntitlements> = {
  basic: { maxHeight: 720, qualityLabel: 'HD (720p)', screens: 1, downloads: 0 },
  basico: { maxHeight: 720, qualityLabel: 'HD (720p)', screens: 1, downloads: 0 },
  standard: { maxHeight: 1080, qualityLabel: 'Full HD (1080p)', screens: 2, downloads: 10 },
  padrao: { maxHeight: 1080, qualityLabel: 'Full HD (1080p)', screens: 2, downloads: 10 },
  premium: { maxHeight: 2160, qualityLabel: '4K + HDR', screens: 4, downloads: 30 },
};

export const FREE_ENTITLEMENTS: PlanEntitlements = {
  maxHeight: 0,
  qualityLabel: 'Somente catálogo e trailers',
  screens: 0,
  downloads: 0,
};

/** Entitlements de um plano — usa o código do plano, com fallback por preço. */
export function entitlementsForPlan(plan?: Plan | null): PlanEntitlements {
  if (!plan) return FREE_ENTITLEMENTS;

  const byCode = DEFAULT_BY_CODE[(plan.code ?? '').toLowerCase()];
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
  const plan = sub.plan ?? plans?.find((p) => p.code === sub.plan_code) ?? null;
  return entitlementsForPlan(plan);
}

/** Lista de benefícios legível para exibir nos cards de plano. */
export function entitlementHighlights(plan: Plan): string[] {
  const e = entitlementsForPlan(plan);
  return [
    `Qualidade até ${e.qualityLabel}`,
    `${e.screens} ${e.screens === 1 ? 'tela simultânea' : 'telas simultâneas'}`,
    e.downloads > 0 ? `${e.downloads} downloads por mês` : 'Sem downloads offline',
    'Catálogo completo liberado',
  ];
}
