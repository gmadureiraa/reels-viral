/**
 * Stripe SDK (RV) — server-side only.
 *
 * Mesma conta Stripe do SV (Sequência Viral). Diferenciamos via
 * `metadata.app = 'rv'` no checkout session + subscription. Webhook
 * filtra por esse metadata pra não confundir com sub do SV.
 *
 * IMPORTANTE: instância criada lazy (function getter) pra não quebrar o
 * build quando STRIPE_SECRET_KEY ainda não tá setada (collect-page-data
 * do Next 16 importa o módulo e estourava throw em prod).
 */

import Stripe from "stripe";
export * from "./pricing";

let _stripeInstance: Stripe | null = null;

function buildStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "STRIPE_SECRET_KEY ausente — checkout/webhook indisponíveis. Configura no Vercel.",
      );
    }
    // Dev sem chave: stub funcional pra import não quebrar
    return new Stripe("sk_test_missing", { typescript: true });
  }
  return new Stripe(secret, { typescript: true });
}

/**
 * Proxy lazy: a instância só é construída na primeira chamada de método.
 * Permite que `import { stripe } from "@/lib/stripe"` em route handlers
 * não quebre durante o build do Next quando env var ausente.
 */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!_stripeInstance) _stripeInstance = buildStripe();
    return (_stripeInstance as any)[prop];
  },
});

/** Marker que separa subs do RV das do SV no mesmo Stripe account. */
export const STRIPE_APP_TAG = "rv" as const;
