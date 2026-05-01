/**
 * Subscriptions helpers — server-side only.
 *
 * Helpers pra ler estado da subscription do user e contar uso do mês
 * corrente pra enforce do paywall.
 */

import { neon } from "@neondatabase/serverless";
import { DEFAULT_PLAN, getReelsLimit, type PlanId } from "./pricing";

const dbUrl = process.env.DATABASE_URL;

function getSql() {
  if (!dbUrl) throw new Error("DATABASE_URL missing");
  return neon(dbUrl);
}

export interface UserSubscription {
  userId: string;
  plan: PlanId;
  status: "active" | "past_due" | "canceled" | "incomplete";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface SubRow {
  user_id: string;
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

/**
 * Retorna a subscription ativa do user. Se não existir row OU status !==
 * 'active', cai pro plano free (default). Sem throw — sempre retorna algo.
 */
export async function getUserSubscription(
  userId: string,
): Promise<UserSubscription> {
  const sql = getSql();
  const rows = (await sql`
    SELECT user_id, plan, status, stripe_customer_id, stripe_subscription_id,
           current_period_start, current_period_end, cancel_at_period_end
      FROM user_subscriptions
     WHERE user_id = ${userId}
     LIMIT 1
  `) as SubRow[];

  if (rows.length === 0) {
    return {
      userId,
      plan: DEFAULT_PLAN,
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }
  const row = rows[0];
  // Se status não for 'active', degrada pro free silencioso
  const isActive = row.status === "active";
  return {
    userId: row.user_id,
    plan: isActive ? (row.plan as PlanId) : DEFAULT_PLAN,
    status: row.status as UserSubscription["status"],
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
  };
}

/**
 * Conta quantos reels o user gerou no mês corrente (calendar month).
 * Idealmente usaríamos current_period_start/end pra alinhar com Stripe,
 * mas pra MVP calendar month é simples e suficiente.
 */
export async function countReelsThisMonth(userId: string): Promise<number> {
  const sql = getSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS n
      FROM scripts
     WHERE user_id = ${userId}
       AND created_at >= date_trunc('month', NOW())
  `) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

export interface QuotaStatus {
  plan: PlanId;
  used: number;
  limit: number;
  remaining: number;
  blocked: boolean;
  /** ISO timestamp de quando o counter reseta (1º do próximo mês). */
  resetsAt: string;
}

/**
 * Resumo da quota: usado + limite + se está bloqueado pra criar mais.
 * Usado na UI (mostra "X/Y reels usados") e no middleware do POST.
 */
export async function getQuotaStatus(userId: string): Promise<QuotaStatus> {
  const sub = await getUserSubscription(userId);
  const used = await countReelsThisMonth(userId);
  const limit = getReelsLimit(sub.plan);
  const remaining = Math.max(0, limit - used);
  const blocked = used >= limit;

  // Próximo reset = 1º dia do próximo mês 00:00 UTC.
  const now = new Date();
  const nextMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  return {
    plan: sub.plan,
    used,
    limit,
    remaining,
    blocked,
    resetsAt: nextMonth.toISOString(),
  };
}
