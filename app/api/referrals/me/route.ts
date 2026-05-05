/**
 * GET /api/referrals/me
 *
 * Retorna o codigo de referral do user logado + counters agregados.
 * Cria o code on-demand se ainda nao existe.
 *
 * Resposta:
 *   { code, signupCount, conversionCount, totalCreditCents }
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireUserId } from "@/lib/server-auth";
import { getOrCreateReferralCode } from "@/lib/referrals";

export const runtime = "nodejs";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  return neon(url);
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

  const code = await getOrCreateReferralCode(sql, auth.user.id, auth.user.name);
  if (!code) {
    return NextResponse.json(
      { error: "Falha ao gerar código de indicação" },
      { status: 500 },
    );
  }

  // Counters agregados.
  const [statRows, profileRows] = (await Promise.all([
    sql`
      SELECT status, reward_amount_cents, reward_applied
        FROM user_referrals
       WHERE referrer_user_id = ${auth.user.id}
    `,
    sql`
      SELECT referral_credits_cents
        FROM user_profiles
       WHERE user_id = ${auth.user.id}
       LIMIT 1
    `,
  ])) as [
    Array<{ status: string; reward_amount_cents: number | null; reward_applied: boolean | null }>,
    Array<{ referral_credits_cents: number | null }>,
  ];

  const signupCount = statRows.filter((r) =>
    ["signup", "converted"].includes(r.status),
  ).length;
  const conversionCount = statRows.filter((r) => r.status === "converted").length;
  const totalCreditCents =
    profileRows[0]?.referral_credits_cents ??
    statRows
      .filter((r) => r.reward_applied)
      .reduce((acc, r) => acc + (r.reward_amount_cents ?? 0), 0);

  return NextResponse.json({
    code,
    signupCount,
    conversionCount,
    totalCreditCents,
  });
}
