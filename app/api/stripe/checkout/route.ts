/**
 * POST /api/stripe/checkout — cria sessão Stripe Checkout pro plano escolhido.
 *
 * Body: { planId: 'basic' | 'max', interval?: 'month' }
 *
 * Reusa a conta Stripe do SV. Diferenciador: metadata.app='rv' tanto na
 * session quanto na subscription. Webhook filtra por isso.
 *
 * Pricing inline via product_data — Gabriel não precisa criar product
 * manualmente no dashboard. Quando quiser, seta STRIPE_PRICE_RV_BASIC_MONTH
 * e STRIPE_PRICE_RV_MAX_MONTH em env e passamos a usar Price IDs.
 */

import { NextResponse } from "next/server";
import { stripe, PLANS_RV, STRIPE_APP_TAG, type PlanId } from "@/lib/stripe";
import { requireUserId } from "@/lib/server-auth";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

const DEFAULT_ORIGIN = "https://reels-viral.vercel.app";
const ALLOWED_ORIGINS = [
  "https://reels-viral.vercel.app",
  "https://reels.kaleidos.com.br",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
];

export async function POST(req: Request) {
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;
  const userEmail = auth.user.email;

  let body: { planId?: string };
  try {
    body = (await req.json()) as { planId?: string };
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const planId = body.planId as PlanId | undefined;
  if (!planId || planId === "free" || !PLANS_RV[planId]) {
    return NextResponse.json(
      { error: "planId deve ser 'basic' ou 'max'" },
      { status: 400 },
    );
  }
  const plan = PLANS_RV[planId];

  // Se já temos stripe_customer_id salvo, reuse pra customer ficar consistente.
  const dbUrl = process.env.DATABASE_URL;
  let existingCustomerId: string | null = null;
  if (dbUrl) {
    try {
      const sql = neon(dbUrl);
      const rows = (await sql`
        SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = ${userId} LIMIT 1
      `) as Array<{ stripe_customer_id: string | null }>;
      existingCustomerId = rows[0]?.stripe_customer_id ?? null;
    } catch (err) {
      console.warn("[checkout] read existing customer failed:", err);
    }
  }

  const reqOrigin = req.headers.get("origin");
  const origin =
    reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : DEFAULT_ORIGIN;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      // Reuse customer se já existe; senão Stripe cria via email.
      ...(existingCustomerId
        ? { customer: existingCustomerId }
        : { customer_email: userEmail || undefined }),
      client_reference_id: userId,
      // Metadata na SESSION pro webhook checkout.session.completed
      metadata: {
        app: STRIPE_APP_TAG,
        userId,
        planId,
      },
      // Metadata na SUBSCRIPTION pra eventos futuros (renew, cancel)
      subscription_data: {
        metadata: {
          app: STRIPE_APP_TAG,
          userId,
          planId,
        },
      },
      line_items: [
        {
          price_data: {
            currency: "brl",
            product_data: {
              name: `Reels Viral ${plan.name}`,
              description: plan.features.slice(0, 4).join(" · "),
            },
            unit_amount: plan.priceMonthly,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${origin}/?payment=success&plan=${planId}`,
      cancel_url: `${origin}/?payment=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] stripe error:", err);
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Falha ao criar checkout. Tente novamente."
            : err instanceof Error
              ? err.message
              : "Checkout failed",
      },
      { status: 500 },
    );
  }
}
