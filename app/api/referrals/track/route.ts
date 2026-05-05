/**
 * POST /api/referrals/track
 * Body: { referralCode: string }
 *
 * Chamado pelo client logo apos o user fazer signup (ou no proximo SIGNED_IN
 * se tiver `rv_ref_code` no localStorage). Cria a linha em `user_referrals`
 * com status='signup'.
 *
 * Idempotente — chamar 2x nao duplica.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireUserId } from "@/lib/server-auth";
import { recordReferralSignup } from "@/lib/referrals";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  return neon(url);
}

export async function POST(req: Request) {
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;

  // Rate limit defensivo: 5 tracks/minuto por user.
  const limiter = checkRateLimit({
    key: `referral-track:${auth.user.id}:${getClientKey(req)}`,
    limit: 5,
    windowMs: 60 * 1000,
  });
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Tente novamente em alguns segundos." },
      { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } },
    );
  }

  let body: { referralCode?: string } = {};
  try {
    body = (await req.json()) as { referralCode?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const code = (body.referralCode || "").trim();
  if (!code) {
    return NextResponse.json({ error: "referralCode obrigatório" }, { status: 400 });
  }

  let sql;
  try {
    sql = getSql();
  } catch {
    return NextResponse.json({ error: "DATABASE_URL não configurado" }, { status: 500 });
  }

  const result = await recordReferralSignup({
    sql,
    referralCode: code,
    referredEmail: auth.user.email || "",
    referredUserId: auth.user.id,
  });

  if (!result.ok) {
    // Razões esperadas (referrer_not_found, self_referral_blocked) não são
    // erro pro cliente — apenas indicam que o código não foi associado.
    return NextResponse.json({ ok: false, reason: result.reason });
  }

  return NextResponse.json({ ok: true });
}
