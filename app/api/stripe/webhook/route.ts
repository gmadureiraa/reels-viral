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
import { fireResendEvent } from "@/lib/resend";
import { applyReferralReward } from "@/lib/referrals";

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

  // Idempotência: dedup precisa rodar DEPOIS do handler ter sucesso.
  // Pattern: SELECT primeiro pra detectar replay. Se já processado,
  // ack 200 e pula. Se novo, executa handler. Só insere o registro de
  // dedup após handler retornar OK — assim se handler throw, Stripe
  // retry vê o evento como novo e tenta de novo limpo.
  let dbAvailable = true;
  try {
    const existing = (await getSql()`
      SELECT 1 FROM stripe_webhook_events WHERE id = ${event.id} LIMIT 1
    `) as Array<unknown>;
    if (existing && existing.length > 0) {
      // Já processado anteriormente — ack e sai.
      return NextResponse.json({ received: true, dedup: true });
    }
  } catch (err) {
    // Tabela pode não existir ainda (migration pendente) — não bloqueia
    // produção, mas avisa. Idempotência fica best-effort.
    console.warn("[webhook] dedup table miss:", err);
    dbAvailable = false;
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
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // Eventos não relevantes (invoice.*, etc) — ignora silenciosamente
        break;
    }

    // Handler OK → registra event.id pra dedup futuro.
    // ON CONFLICT DO NOTHING garante idempotência mesmo em race com
    // outro handler concorrente (ex: Stripe retry sobreposto).
    if (dbAvailable) {
      try {
        await getSql()`
          INSERT INTO stripe_webhook_events (id, type, app)
          VALUES (${event.id}, ${event.type}, ${STRIPE_APP_TAG})
          ON CONFLICT (id) DO NOTHING
        `;
      } catch (err) {
        // Falha aqui é tolerável: handler já completou. Pior caso
        // Stripe retransmite e o handler reprocessa idempotentemente
        // (UPSERT em user_subscriptions).
        console.warn("[webhook] dedup write failed:", err);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // Retorna 500 SEM gravar o dedup — Stripe retry vai tentar de novo
    // limpo. Handler error em checkout/subscription.* significa que o
    // estado do user no DB pode estar inconsistente. Stripe faz retry
    // exponencial até 3 dias, dando janela pra recuperar de falhas
    // transitórias de Neon/Resend.
    console.error("[webhook] handler error:", err, "event:", event.type);
    return NextResponse.json(
      { error: "handler failed", eventId: event.id },
      { status: 500 },
    );
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

  // Programa Indique-e-Ganhe — se a session veio com referralCode (ou
  // simplesmente se o user tem uma indicacao pendente em user_referrals),
  // marca como converted, aplica R$ 25 de credito Stripe no balance do
  // referrer e dispara email transacional. Idempotente (reward_applied
  // flag) e silencioso em qualquer falha pra nao quebrar o webhook.
  // Mesmo sem referralCode na metadata, tenta aplicar pelo referredUserId
  // — cobre o caso onde o user fez signup com codigo (ja existe linha
  // pending/signup) mas o checkout foi sem o code passado adiante.
  try {
    const result = await applyReferralReward({
      sql,
      referredUserId: userId,
      stripeSessionId: session.id,
    });
    if (!result.ok && result.reason && result.reason !== "no_referral") {
      console.warn(
        "[webhook] applyReferralReward nao aplicado:",
        result.reason,
      );
    }
  } catch (err) {
    console.error("[webhook] applyReferralReward exception:", err);
  }

  // Fire reels.upgraded event no Resend pra trigger automacao
  // (welcome paid, onboarding step-up, etc). Best-effort.
  const email = await resolveCustomerEmail(customerId);
  const amount =
    typeof session.amount_total === "number"
      ? session.amount_total / 100
      : null;
  // Stripe 2024+: discount on session breakdown nao expoe coupon id
  // direto via tipos. Acessamos via cast — fallback null se ausente.
  const coupon =
    ((session.total_details?.breakdown?.discounts?.[0] as unknown as {
      discount?: { coupon?: { id?: string } };
    })?.discount?.coupon?.id) ?? null;
  await fireResendEvent("reels.upgraded", {
    email,
    user_id: userId,
    plan: planId,
    amount,
    currency: session.currency ?? null,
    coupon,
  });
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  if (sub.metadata?.app !== STRIPE_APP_TAG) return;
  const userId = sub.metadata.userId;
  const planId = sub.metadata.planId as PlanId | undefined;
  if (!userId || !planId) return;

  const sql = getSql();
  // Le plano anterior ANTES do UPDATE pra detectar upgrade vs downgrade.
  const prev = (await sql`
    SELECT plan FROM user_subscriptions
     WHERE stripe_subscription_id = ${sub.id}
     LIMIT 1
  `) as Array<{ plan: string }>;
  const prevPlan = prev[0]?.plan ?? null;

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

  // Resend event:
  // - downgrade pra free → reels.canceled
  // - upgrade pra plano pago diferente → reels.upgraded
  // - mesmo plano (renew, etc) → silencio
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  const email = await resolveCustomerEmail(customerId);

  if (planId === "free" && prevPlan && prevPlan !== "free") {
    await fireResendEvent("reels.canceled", {
      email,
      user_id: userId,
      previous_plan: prevPlan,
      reason: "downgrade",
    });
  } else if (prevPlan && prevPlan !== planId && planId !== "free") {
    await fireResendEvent("reels.upgraded", {
      email,
      user_id: userId,
      plan: planId,
      previous_plan: prevPlan,
    });
  }
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  if (sub.metadata?.app !== STRIPE_APP_TAG) return;
  const sql = getSql();
  // Pega o user_id antes de degradar pra alimentar o event payload.
  const rows = (await sql`
    SELECT user_id FROM user_subscriptions
     WHERE stripe_subscription_id = ${sub.id}
     LIMIT 1
  `) as Array<{ user_id: string }>;
  const userId = rows[0]?.user_id ?? sub.metadata.userId ?? null;

  await sql`
    UPDATE user_subscriptions
       SET plan = 'free', status = 'canceled', updated_at = NOW()
     WHERE stripe_subscription_id = ${sub.id}
  `;
  console.log(`[webhook] sub cancelada ${sub.id} → degrade pra free`);

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  const email = await resolveCustomerEmail(customerId);
  await fireResendEvent("reels.canceled", {
    email,
    user_id: userId,
    reason: "subscription_deleted",
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // Filtra: o invoice nao carrega o nosso metadata.app diretamente — pega
  // do subscription associado. Se nao bate, ignora (provavelmente SV).
  const subscriptionId =
    typeof (invoice as unknown as { subscription?: string | Stripe.Subscription })
      .subscription === "string"
      ? ((invoice as unknown as { subscription: string }).subscription)
      : null;
  if (!subscriptionId) return;

  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    console.warn("[webhook] payment_failed retrieve sub:", err);
    return;
  }
  if (sub.metadata?.app !== STRIPE_APP_TAG) return;

  const userId = sub.metadata.userId ?? null;
  const planId = (sub.metadata.planId as PlanId | undefined) ?? null;
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id ?? null;
  const email =
    invoice.customer_email ?? (await resolveCustomerEmail(customerId));
  const amount =
    typeof invoice.amount_due === "number" ? invoice.amount_due / 100 : null;
  const attemptCount =
    (invoice as unknown as { attempt_count?: number }).attempt_count ?? null;

  await fireResendEvent("reels.payment.failed", {
    email,
    user_id: userId,
    plan: planId,
    amount,
    currency: invoice.currency ?? null,
    attempt_count: attemptCount,
  });
  console.log(
    `[webhook] payment_failed sub=${subscriptionId} user=${userId} attempt=${attemptCount}`,
  );
}

/**
 * Busca o email do customer no Stripe. Retorna null se Stripe falhar ou
 * customer nao tiver email. Usado pra alimentar events do Resend, que
 * precisam do email pra disparar a automacao certa.
 */
async function resolveCustomerEmail(
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) return null;
  try {
    const c = await stripe.customers.retrieve(customerId);
    if ((c as Stripe.DeletedCustomer).deleted) return null;
    return (c as Stripe.Customer).email ?? null;
  } catch (err) {
    console.warn("[webhook] resolveCustomerEmail failed:", err);
    return null;
  }
}
