/**
 * Reels Viral — Planos e limites.
 *
 * Moeda: BRL. Stripe BR aceita BRL nativo, PIX recorrente possível.
 *
 * Pattern espelha sequencia-viral/lib/pricing.ts (mesma conta Stripe,
 * mas products diferentes). Webhook diferencia via `metadata.app = 'rv'`.
 *
 * Custo por reel (Apify + Gemini Flash + storage):  ~R$ 0,09
 * Margem alvo: ~80% pra cobrir churn, LTV, infra, suporte.
 */

export const PLAN_CURRENCY = "brl" as const;

export const PLANS_RV = {
  free: {
    name: "Free",
    priceMonthly: 0,
    reelsPerMonth: 3,
    libraryAccess: false,
    features: [
      "3 reels analisados/mês",
      "Roteiro adaptado por IA (hook, demo, CTA)",
      "Storyboard cena por cena",
      "Histórico no painel",
    ],
  },
  basic: {
    name: "Basic",
    priceMonthly: 1490, // R$ 14,90 em centavos BRL
    priceAnchor: 2990, // âncora visual
    reelsPerMonth: 30,
    libraryAccess: true,
    // Sem stripeProductId — usa product_data inline na criação do checkout.
    // Gabriel pode criar product manualmente depois e passar STRIPE_PRODUCT_RV_BASIC env.
    features: [
      "30 reels analisados/mês",
      "Biblioteca de reels virais desbloqueada",
      "Filtro por template (hook, transição, dueto, etc)",
      "Histórico ilimitado",
      "Suporte por email",
    ],
  },
  max: {
    name: "Max",
    priceMonthly: 4990, // R$ 49,90 em centavos BRL
    priceAnchor: 9990,
    reelsPerMonth: 100,
    libraryAccess: true,
    features: [
      "100 reels analisados/mês",
      "Biblioteca completa + filtros avançados",
      "Export script PDF",
      "Favoritos e comparação entre reels",
      "Suporte prioritário",
      "Acesso antecipado a novas features",
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS_RV;

/** Plano default pra users sem subscription ativa. */
export const DEFAULT_PLAN: PlanId = "free";

/** Helper: retorna se o plano tem acesso à biblioteca. */
export function hasLibraryAccess(plan: PlanId): boolean {
  return PLANS_RV[plan].libraryAccess;
}

/** Helper: retorna limite mensal de reels do plano. */
export function getReelsLimit(plan: PlanId): number {
  return PLANS_RV[plan].reelsPerMonth;
}

/** Stripe Price IDs por interval/plan — preencher via env quando criar no dashboard.
 *  Por padrão usa product_data inline e price_data dinâmico (sem precisar de Price ID). */
export const STRIPE_PRICE_IDS = {
  basic_month: process.env.STRIPE_PRICE_RV_BASIC_MONTH,
  max_month: process.env.STRIPE_PRICE_RV_MAX_MONTH,
} as const;
