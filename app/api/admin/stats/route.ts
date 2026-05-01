/**
 * GET /api/admin/stats — payload completo do dashboard admin.
 *
 * Retorna em uma única chamada:
 *  - summary (totais users, reels, custo)
 *  - planCounts (free/basic/max)
 *  - dailySeries (últimos 30d: reels + custo + signups)
 *  - providerBreakdown (apify vs gemini cost)
 *  - users (top 50 por gerações com estatísticas joined)
 *  - recentScripts (últimas 30 gerações)
 *  - subscriptions (active count, MRR, recent payments)
 *
 * Auth: requireAdmin (email em ADMIN_EMAILS).
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireAdmin } from "@/lib/admin";
import { PLANS_RV } from "@/lib/pricing";

export const runtime = "nodejs";

const dbUrl = process.env.DATABASE_URL;

interface CountRow {
  n: number;
}
interface PlanCountRow {
  plan: string;
  n: number;
}
interface DailyRow {
  day: string;
  reels: number;
  cost: number;
  new_users: number;
}
interface ProviderBreakdownRow {
  provider: string;
  ops: number;
  cost: number;
  avg_duration_ms: number | null;
}
interface AdminUserRow {
  user_id: string;
  reels_total: number;
  reels_30d: number;
  cost_usd: number;
  last_at: string | null;
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
}
interface ScriptRow {
  id: string;
  user_id: string;
  tema: string;
  source_url: string;
  source_owner: string | null;
  titulo: string;
  duration_ms: number | null;
  created_at: string;
  reel_cost_usd: number | null;
}
interface SubscriptionRow {
  user_id: string;
  plan: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export async function GET(req: Request) {
  if (!dbUrl) {
    return NextResponse.json({ error: "DB não configurado" }, { status: 503 });
  }
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const sql = neon(dbUrl);

  // ── Summary totals ────────────────────────────────────────────────
  const results = await Promise.all([
    sql`SELECT COUNT(DISTINCT user_id)::int AS n FROM scripts WHERE user_id IS NOT NULL`,
    sql`SELECT COUNT(*)::int AS n FROM scripts`,
    sql`SELECT COUNT(*)::int AS n FROM scripts WHERE created_at >= NOW() - INTERVAL '30 days'`,
    sql`SELECT COALESCE(SUM(cost_usd), 0)::float AS n FROM ai_usage WHERE created_at >= NOW() - INTERVAL '30 days'`,
    sql`SELECT COUNT(*)::int AS n FROM ai_usage WHERE provider = 'apify' AND operation = 'scrape_cache_hit' AND created_at >= NOW() - INTERVAL '30 days'`,
    sql`SELECT COUNT(*)::int AS n FROM ai_usage WHERE provider = 'apify' AND created_at >= NOW() - INTERVAL '30 days'`,
  ]);
  const [
    totalUsersRow,
    totalReelsRow,
    totalReels30dRow,
    totalCost30dRow,
    cacheHitRow,
    apifyCallsRow,
  ] = results as unknown as [
    CountRow[],
    CountRow[],
    CountRow[],
    CountRow[],
    CountRow[],
    CountRow[],
  ];

  // ── Plan counts ─────────────────────────────────────────────────
  const planCountsRows = (await sql`
    SELECT plan, COUNT(*)::int AS n
      FROM user_subscriptions
     WHERE status = 'active'
     GROUP BY plan
  `) as PlanCountRow[];
  const planCounts: Record<string, number> = { free: 0, basic: 0, max: 0 };
  for (const r of planCountsRows) {
    planCounts[r.plan] = r.n;
  }

  // ── Daily series (30d) ───────────────────────────────────────────
  // Joins scripts (reels) + signups (users) + ai_usage (cost) por dia.
  const dailyRows = (await sql`
    WITH days AS (
      SELECT (CURRENT_DATE - i)::date AS day
        FROM generate_series(0, 29) AS i
    ),
    reels_per_day AS (
      SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS n
        FROM scripts
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY 1
    ),
    cost_per_day AS (
      SELECT date_trunc('day', created_at)::date AS day, COALESCE(SUM(cost_usd), 0)::float AS c
        FROM ai_usage
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY 1
    ),
    new_users_per_day AS (
      SELECT date_trunc('day', MIN(created_at))::date AS day, COUNT(DISTINCT user_id)::int AS n
        FROM (
          SELECT user_id, MIN(created_at) AS created_at
            FROM scripts
           WHERE user_id IS NOT NULL
           GROUP BY user_id
        ) AS first_script
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY 1
    )
    SELECT d.day::text AS day,
           COALESCE(r.n, 0)::int AS reels,
           COALESCE(c.c, 0)::float AS cost,
           COALESCE(u.n, 0)::int AS new_users
      FROM days d
      LEFT JOIN reels_per_day r ON r.day = d.day
      LEFT JOIN cost_per_day c ON c.day = d.day
      LEFT JOIN new_users_per_day u ON u.day = d.day
     ORDER BY d.day ASC
  `) as DailyRow[];

  // ── Provider breakdown ──────────────────────────────────────────
  const providerRows = (await sql`
    SELECT provider,
           COUNT(*)::int AS ops,
           COALESCE(SUM(cost_usd), 0)::float AS cost,
           AVG(duration_ms)::float AS avg_duration_ms
      FROM ai_usage
     WHERE created_at >= NOW() - INTERVAL '30 days'
     GROUP BY provider
     ORDER BY cost DESC
  `) as ProviderBreakdownRow[];

  // ── Top users (top 50 por geração no mês) ──────────────────────
  const usersRows = (await sql`
    SELECT s.user_id,
           COUNT(*)::int AS reels_total,
           SUM(CASE WHEN s.created_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END)::int AS reels_30d,
           COALESCE(SUM(au.cost_usd), 0)::float AS cost_usd,
           MAX(s.created_at)::text AS last_at,
           sub.plan,
           sub.status,
           sub.current_period_end::text AS current_period_end,
           sub.stripe_customer_id
      FROM scripts s
      LEFT JOIN ai_usage au ON au.user_id = s.user_id
      LEFT JOIN user_subscriptions sub ON sub.user_id = s.user_id
     WHERE s.user_id IS NOT NULL
     GROUP BY s.user_id, sub.plan, sub.status, sub.current_period_end, sub.stripe_customer_id
     ORDER BY reels_30d DESC
     LIMIT 50
  `) as AdminUserRow[];

  // ── Recent scripts (50 últimas) com custo joined ───────────────
  const scriptsRows = (await sql`
    SELECT s.id::text,
           s.user_id,
           s.tema,
           s.source_url,
           s.source_owner,
           s.titulo,
           s.duration_ms,
           s.created_at::text,
           (SELECT COALESCE(SUM(au.cost_usd), 0)::float
              FROM ai_usage au
             WHERE au.user_id = s.user_id
               AND au.created_at BETWEEN s.created_at - INTERVAL '5 minutes' AND s.created_at + INTERVAL '5 minutes') AS reel_cost_usd
      FROM scripts s
     ORDER BY s.created_at DESC
     LIMIT 50
  `) as ScriptRow[];

  // ── Subscriptions ─────────────────────────────────────────────
  const subsRows = (await sql`
    SELECT user_id, plan, status, current_period_end::text, cancel_at_period_end, created_at::text
      FROM user_subscriptions
     WHERE plan IN ('basic', 'max')
     ORDER BY created_at DESC
     LIMIT 50
  `) as SubscriptionRow[];

  // MRR calc: sum dos planos ativos
  const activeSubs = subsRows.filter((s) => s.status === "active");
  const mrrCentsBrl = activeSubs.reduce((acc, s) => {
    const plan = s.plan as keyof typeof PLANS_RV;
    return acc + (PLANS_RV[plan]?.priceMonthly ?? 0);
  }, 0);

  return NextResponse.json({
    summary: {
      totalUsers: totalUsersRow[0]?.n ?? 0,
      totalReels: totalReelsRow[0]?.n ?? 0,
      totalReels30d: totalReels30dRow[0]?.n ?? 0,
      totalCostUsd30d: totalCost30dRow[0]?.n ?? 0,
      cacheHits30d: cacheHitRow[0]?.n ?? 0,
      apifyCalls30d: apifyCallsRow[0]?.n ?? 0,
      cacheHitRate30d:
        (apifyCallsRow[0]?.n ?? 0) > 0
          ? (cacheHitRow[0]?.n ?? 0) / (apifyCallsRow[0]?.n ?? 1)
          : 0,
    },
    planCounts,
    dailySeries: dailyRows,
    providerBreakdown: providerRows,
    users: usersRows,
    recentScripts: scriptsRows,
    subscriptions: {
      activeCount: activeSubs.length,
      mrrBrl: mrrCentsBrl / 100,
      mrrUsd: mrrCentsBrl / 100 / 5, // ~5 BRL/USD
      list: subsRows,
    },
    generatedAt: new Date().toISOString(),
  });
}
