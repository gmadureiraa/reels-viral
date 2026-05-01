/**
 * GET /api/admin/users/[id] — drilldown completo do user.
 * PATCH /api/admin/users/[id] — ações admin (gift plan, ban, unban, restore).
 *
 * Auth: requireAdmin server-side.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireAdmin } from "@/lib/admin";
import type { PlanId } from "@/lib/pricing";

export const runtime = "nodejs";

const dbUrl = process.env.DATABASE_URL;

interface CountRow { n: number }
interface SumRow { v: number | null }

interface UserDetailScript {
  id: string;
  tema: string;
  source_url: string;
  source_owner: string | null;
  titulo: string;
  duration_ms: number | null;
  created_at: string;
}

interface UserDetailUsage {
  id: string;
  provider: string;
  operation: string;
  cost_usd: number;
  duration_ms: number | null;
  success: boolean;
  created_at: string;
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
  created_at: string;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!dbUrl) return NextResponse.json({ error: "DB ausente" }, { status: 503 });
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const { id: userId } = await params;
  const sql = neon(dbUrl);

  const [
    totalReelsRow,
    totalCostRow,
    sub,
    scripts,
    usage,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM scripts WHERE user_id = ${userId}`,
    sql`SELECT COALESCE(SUM(cost_usd), 0)::float AS v FROM ai_usage WHERE user_id = ${userId}`,
    sql`SELECT * FROM user_subscriptions WHERE user_id = ${userId} LIMIT 1`,
    sql`SELECT id::text, tema, source_url, source_owner, titulo, duration_ms, created_at::text
          FROM scripts WHERE user_id = ${userId}
         ORDER BY created_at DESC LIMIT 100`,
    sql`SELECT id::text, provider, operation, cost_usd::float AS cost_usd, duration_ms,
                success, created_at::text
          FROM ai_usage WHERE user_id = ${userId}
         ORDER BY created_at DESC LIMIT 100`,
  ]);

  const tr = totalReelsRow as unknown as CountRow[];
  const tc = totalCostRow as unknown as SumRow[];
  const subRows = sub as unknown as SubRow[];

  return NextResponse.json({
    userId,
    totalReels: tr[0]?.n ?? 0,
    totalCostUsd: tc[0]?.v ?? 0,
    subscription: subRows[0] ?? null,
    scripts: scripts as unknown as UserDetailScript[],
    usage: usage as unknown as UserDetailUsage[],
  });
}

// PATCH actions: gift plan / ban / restore
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!dbUrl) return NextResponse.json({ error: "DB ausente" }, { status: 503 });
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const { id: userId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "gift_plan" | "ban" | "restore";
    plan?: PlanId;
    days?: number;
  };

  const sql = neon(dbUrl);

  if (body.action === "gift_plan") {
    const plan = body.plan;
    const days = body.days ?? 30;
    if (!plan || (plan !== "basic" && plan !== "max")) {
      return NextResponse.json({ error: "plan deve ser basic ou max" }, { status: 400 });
    }
    await sql`
      INSERT INTO user_subscriptions (user_id, plan, status, current_period_start, current_period_end, created_at, updated_at)
      VALUES (${userId}, ${plan}, 'active', NOW(), NOW() + (${days} || ' days')::interval, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        status = 'active',
        current_period_end = EXCLUDED.current_period_end,
        updated_at = NOW()
    `;
    return NextResponse.json({ ok: true, action: "gift_plan", plan, days });
  }

  if (body.action === "ban") {
    await sql`
      INSERT INTO user_subscriptions (user_id, plan, status, created_at, updated_at)
      VALUES (${userId}, 'free', 'banned', NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        status = 'banned',
        updated_at = NOW()
    `;
    return NextResponse.json({ ok: true, action: "ban" });
  }

  if (body.action === "restore") {
    await sql`
      UPDATE user_subscriptions SET status = 'active', updated_at = NOW() WHERE user_id = ${userId}
    `;
    return NextResponse.json({ ok: true, action: "restore" });
  }

  return NextResponse.json({ error: "action inválida" }, { status: 400 });
}
