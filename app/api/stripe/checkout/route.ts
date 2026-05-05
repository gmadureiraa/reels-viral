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

/**
 * Resolve Price ID canônico do Stripe pra um planId. Setado via env vars
 * no Vercel (STRIPE_PRICE_RV_BASIC_MONTH / STRIPE_PRICE_RV_MAX_MONTH).
 * Quando ausente, checkout cai no fallback inline price_data.
 */
function priceIdFor(planId: string): string | undefined {
  if (planId === "basic") return process.env.STRIPE_PRICE_RV_BASIC_MONTH;
  if (planId === "max") return process.env.STRIPE_PRICE_RV_MAX_MONTH;
  return undefined;
}
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

  let body: { planId?: string; referralCode?: string };
  try {
    body = (await req.json()) as { planId?: string; referralCode?: string };
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const planId = body.planId as PlanId | undefined;
  const trimmedReferralCode = (body.referralCode ?? "").trim().slice(0, 64);
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

  // Programa Indique-e-Ganhe — se o user veio com referral code (do
  // localStorage rv_ref_code) e ainda nao registrou a indicacao, registra
  // agora (idempotente). Garante que mesmo se o post-signup hook nao rodou
  // (ex: Google OAuth redirect com browser fechado mid-flight), o codigo
  // associa antes do checkout completar. Falha nao bloqueia o checkout.
  if (trimmedReferralCode && dbUrl) {
    try {
      const sql = neon(dbUrl);
      const { recordReferralSignup } = await import("@/lib/referrals");
      await recordReferralSignup({
        sql,
        referralCode: trimmedReferralCode,
        referredEmail: userEmail || "",
        referredUserId: userId,
      });
    } catch (err) {
      console.warn("[checkout] recordReferralSignup falhou (nao bloqueia):", err);
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
        ...(trimmedReferralCode ? { referralCode: trimmedReferralCode } : {}),
      },
      // Metadata na SUBSCRIPTION pra eventos futuros (renew, cancel)
      subscription_data: {
        metadata: {
          app: STRIPE_APP_TAG,
          userId,
          planId,
          ...(trimmedReferralCode ? { referralCode: trimmedReferralCode } : {}),
        },
      },
      // Prefere Price ID canônico quando env var setada — habilita troca de
      // plano via Stripe Billing Portal e mantém Stripe catalog limpo.
      // Fallback pra inline price_data se env var ausente (dev local sem
      // configuração ou se algum dia o Price ID for revogado).
      line_items: [
        priceIdFor(planId)
          ? { price: priceIdFor(planId)!, quantity: 1 }
          : {
              price_data: {
                currency: "brl",
                product_data: {
                  name: `Reels Viral — ${plan.name} by Kaleidos Digital`,
                  description: plan.features.slice(0, 4).join(" · "),
                },
                unit_amount: plan.priceMonthly,
                recurring: { interval: "month" as const },
              },
              quantity: 1,
            },
      ],
      allow_promotion_codes: true,
      // Volta pra /app/precos pra dar feedback (toast + plano atualizado).
      // Anterior ia pra `/` que não tinha handler — user achava que falhou.
      success_url: `${origin}/app/precos?payment=success&plan=${planId}`,
      cancel_url: `${origin}/app/precos?payment=cancelled`,
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
