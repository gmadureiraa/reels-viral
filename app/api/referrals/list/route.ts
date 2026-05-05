/**
 * GET /api/referrals/list
 *
 * Lista as indicações do user atual. Email do referido vem mascarado
 * (a@b.com -> a***@b.com) pra proteger privacidade.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  return neon(url);
}

function maskEmail(email: string): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 2) return `${local[0] || ""}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

export async function GET(req: Request) {
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;

  let sql;
  try {
    sql = getSql();
  } catch {
    return NextResponse.json({ error: "DATABASE_URL não configurado" }, { status: 500 });
  }

  const rows = (await sql`
    SELECT id, referred_email, status,
           signup_at::text  AS signup_at,
           conversion_at::text AS conversion_at,
           reward_amount_cents, reward_applied,
           created_at::text AS created_at
      FROM user_referrals
     WHERE referrer_user_id = ${auth.user.id}
     ORDER BY created_at DESC
     LIMIT 100
  `) as Array<{
    id: string;
    referred_email: string;
    status: string;
    signup_at: string | null;
    conversion_at: string | null;
    reward_amount_cents: number | null;
    reward_applied: boolean | null;
    created_at: string;
  }>;

  const items = rows.map((r) => ({
    id: r.id,
    email: maskEmail(r.referred_email),
    status: r.status,
    signupAt: r.signup_at,
    conversionAt: r.conversion_at,
    rewardAmountCents: r.reward_amount_cents ?? 0,
    rewardApplied: !!r.reward_applied,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ items });
}
