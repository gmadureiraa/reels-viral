/**
 * GET /api/cron/power-user — roda diariamente as 14h UTC.
 *
 * Detecta users que atingiram 10+ analises (rows em `scripts`) no mes
 * corrente e dispara `reels.power_user` no Resend pra automacao de
 * upsell / depoimento / NPS.
 *
 * "Mes corrente": calculado via DATE_TRUNC('month', NOW()) — janeiro
 * inteiro, fevereiro inteiro, etc. No dia 1 zera contadores naturalmente.
 *
 * Dedup mensal: `user_profiles.last_power_user_email_at`. Se ja foi
 * enviado depois do inicio do mes corrente, pula. Garante 1 disparo
 * por user por mes.
 *
 * Auth: Vercel injeta Authorization: Bearer ${CRON_SECRET}.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { fireResendEvent } from "@/lib/resend";

export const runtime = "nodejs";
export const maxDuration = 60;

interface PowerRow {
  user_id: string;
  email: string;
  name: string | null;
  scripts_this_month: number;
  plan: string | null;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL missing" }, { status: 500 });
  }

  const sql = neon(process.env.DATABASE_URL);

  // Conta scripts do mes corrente por user. Filtra >= 10 e nao notificado
  // ainda neste mes.
  const rows = (await sql.query(
    `WITH counts AS (
       SELECT user_id, COUNT(*)::int AS n
       FROM scripts
       WHERE created_at >= DATE_TRUNC('month', NOW())
         AND user_id IS NOT NULL
       GROUP BY user_id
       HAVING COUNT(*) >= 10
     )
     SELECT
       c.user_id,
       u.email,
       u.name,
       c.n AS scripts_this_month,
       COALESCE(us.plan, 'free') AS plan
     FROM counts c
     JOIN neon_auth.user u ON u.id = c.user_id
     LEFT JOIN user_subscriptions us ON us.user_id = c.user_id
     LEFT JOIN user_profiles      up ON up.user_id = c.user_id
     WHERE u.email IS NOT NULL AND u.deleted_at IS NULL
       AND (
         up.last_power_user_email_at IS NULL
         OR up.last_power_user_email_at < DATE_TRUNC('month', NOW())
       )
     ORDER BY c.n DESC
     LIMIT 500`
  )) as PowerRow[];

  let dispatched = 0;
  let failed = 0;

  for (const lead of rows) {
    try {
      await fireResendEvent("reels.power_user", {
        email: lead.email,
        user_id: lead.user_id,
        name: lead.name ?? null,
        plan: lead.plan ?? "free",
        scripts_this_month: lead.scripts_this_month,
      });

      await sql.query(
        `INSERT INTO user_profiles (user_id, last_power_user_email_at)
         VALUES ($1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           last_power_user_email_at = NOW(),
           updated_at = NOW()`,
        [lead.user_id]
      );
      dispatched++;
    } catch (err) {
      console.warn(`[cron power-user] fail ${lead.email}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, dispatched, failed, scanned: rows.length });
}
