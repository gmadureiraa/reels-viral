/**
 * POST /api/stripe/webhook — recebe eventos do Stripe.
 *
 * Filtra eventos do Reels Viral via `metadata.app = 'rv'`. Eventos do SV
 * (mesma conta) são ignorados silenciosamente.
 *
 * Eventos tratados:
 *  - checkout.session.completed → cria/upserta user_subscriptions com plano correto
 *  - customer.subscription.updated → sincroniza status, plano, period_end
 *  - customer.subscription.deleted → marca status='canceled', degrade pro free
 *
 * Configuração:
 *  - STRIPE_WEBHOOK_SECRET_RV (ou STRIPE_WEBHOOK_SECRET, fallback do SV) — secret
 *    do endpoint configurado no Stripe Dashboard. Recomendado endpoint dedicado
 *    com filter por `app=rv`, mas funciona compartilhado.
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, STRIPE_APP_TAG, type PlanId } from "@/lib/stripe";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
// Stripe webhook precisa do raw body pra verificar a signature.
// Next 16 App Router: req.text() devolve raw, suficiente.

const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET_RV ?? process.env.STRIPE_WEBHOOK_SECRET;

const dbUrl = process.env.DATABASE_URL;

function getSql() {
  if (!dbUrl) throw new Error("DATABASE_URL missing");
  return neon(dbUrl);
}

export async function POST(req: Request) {
  if (!webhookSecret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET ausente");
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        // Eventos não relevantes (invoice.*, etc) — ignora silenciosamente
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webhook] handler error:", err, "event:", event.type);
    // Retorna 200 mesmo em erro pra Stripe não retentar infinitamente —
    // erros internos são logados e investigados manualmente. Bug crítico
    // só seria se stripe-signature falhar (já tratado acima).
    return NextResponse.json({ received: true, warning: "handler failed" });
  }
}

// ────────────────────────────────────────────────────────────────────────
// Handlers
// ────────────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Filtra: só eventos com metadata.app === 'rv'
  if (session.metadata?.app !== STRIPE_APP_TAG) {
    return; // sub do SV ou outro app — ignora
  }

  const userId = session.metadata.userId;
  const planId = session.metadata.planId as PlanId | undefined;
  const customerId = typeof session.customer === "string" ? session.customer : null;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  if (!userId || !planId || !customerId || !subscriptionId) {
    console.warn("[webhook] checkout.completed missing fields:", session.id);
    return;
  }

  // Pega detalhes da subscription pra extrair period_end
  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  const sql = getSql();
  await sql`
    INSERT INTO user_subscriptions (
      user_id, plan, status,
      stripe_customer_id, stripe_subscription_id, stripe_price_id,
      current_period_start, current_period_end, cancel_at_period_end,
      created_at, updated_at
    )
    VALUES (
      ${userId}, ${planId}, ${sub.status},
      ${customerId}, ${subscriptionId},
      ${sub.items.data[0]?.price?.id ?? null},
      to_timestamp(${(sub as unknown as { current_period_start: number }).current_period_start}),
      to_timestamp(${(sub as unknown as { current_period_end: number }).current_period_end}),
      ${sub.cancel_at_period_end},
      NOW(), NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      plan = EXCLUDED.plan,
      status = EXCLUDED.status,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      stripe_price_id = EXCLUDED.stripe_price_id,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      updated_at = NOW()
  `;

  console.log(`[webhook] sub criada/atualizada user=${userId} plan=${planId}`);
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  if (sub.metadata?.app !== STRIPE_APP_TAG) return;
  const userId = sub.metadata.userId;
  const planId = sub.metadata.planId as PlanId | undefined;
  if (!userId || !planId) return;

  const sql = getSql();
  await sql`
    UPDATE user_subscriptions
       SET plan = ${planId},
           status = ${sub.status},
           stripe_price_id = ${sub.items.data[0]?.price?.id ?? null},
           current_period_start = to_timestamp(${(sub as unknown as { current_period_start: number }).current_period_start}),
           current_period_end = to_timestamp(${(sub as unknown as { current_period_end: number }).current_period_end}),
           cancel_at_period_end = ${sub.cancel_at_period_end},
           updated_at = NOW()
     WHERE stripe_subscription_id = ${sub.id}
  `;
  console.log(`[webhook] sub atualizada ${sub.id} status=${sub.status}`);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  if (sub.metadata?.app !== STRIPE_APP_TAG) return;
  const sql = getSql();
  await sql`
    UPDATE user_subscriptions
       SET plan = 'free', status = 'canceled', updated_at = NOW()
     WHERE stripe_subscription_id = ${sub.id}
  `;
  console.log(`[webhook] sub cancelada ${sub.id} → degrade pra free`);
}
