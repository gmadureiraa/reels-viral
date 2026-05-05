/**
 * GET /api/cron/idle-5d — roda diariamente as 13h UTC.
 *
 * Detecta users que ficaram idle entre 5-10 dias (sem login/atividade) e
 * dispara o evento `reels.idle_5d` no Resend pra automacao win-back.
 *
 * Janela 5-10 dias evita spam: quem voltou em <5 dias nao precisa nudge,
 * e quem sumiu >10 dias entra em outra automacao (churn) no futuro.
 *
 * Sinal de atividade: pegamos o maior entre `neon_auth.user.updated_at`
 * (Stack Auth atualiza em eventos de sessao) e `MAX(scripts.created_at)`
 * (uso efetivo do produto). Usa o mais recente dos dois como "last seen".
 *
 * Dedup: coluna `user_profiles.last_idle_5d_email_at`. Se ja foi enviado
 * nos ultimos 30 dias, pula. Migrate adiciona a coluna idempotente.
 *
 * Auth: Vercel injeta Authorization: Bearer ${CRON_SECRET}.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { fireResendEvent } from "@/lib/resend";

export const runtime = "nodejs";
export const maxDuration = 60;

interface IdleRow {
  user_id: string;
  email: string;
  name: string | null;
  last_seen_at: string;
  days_idle: number;
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

  // Pega users idle 5-10 dias. last_seen = greatest(updated_at do auth,
  // ultima script.created_at). Filtra por janela e nao reenviado nos
  // ultimos 30 dias.
  const rows = (await sql.query(
    `WITH activity AS (
       SELECT
         u.id   AS user_id,
         u.email,
         u.name,
         GREATEST(
           u.updated_at,
           COALESCE((SELECT MAX(s.created_at) FROM scripts s WHERE s.user_id = u.id), u.created_at)
         ) AS last_seen_at
       FROM neon_auth.user u
       WHERE u.email IS NOT NULL AND u.deleted_at IS NULL
     )
     SELECT
       a.user_id,
       a.email,
       a.name,
       a.last_seen_at,
       EXTRACT(DAY FROM (NOW() - a.last_seen_at))::int AS days_idle,
       COALESCE(us.plan, 'free') AS plan
     FROM activity a
     LEFT JOIN user_subscriptions us ON us.user_id = a.user_id
     LEFT JOIN user_profiles      up ON up.user_id = a.user_id
     WHERE a.last_seen_at <= NOW() - INTERVAL '5 days'
       AND a.last_seen_at >  NOW() - INTERVAL '10 days'
       AND (
         up.last_idle_5d_email_at IS NULL
         OR up.last_idle_5d_email_at < NOW() - INTERVAL '30 days'
       )
     ORDER BY a.last_seen_at ASC
     LIMIT 500`
  )) as IdleRow[];

  let dispatched = 0;
  let failed = 0;

  for (const lead of rows) {
    try {
      await fireResendEvent("reels.idle_5d", {
        email: lead.email,
        user_id: lead.user_id,
        name: lead.name ?? null,
        plan: lead.plan ?? "free",
        days_idle: lead.days_idle,
        last_seen_at: lead.last_seen_at,
      });

      // Upsert user_profile pra registrar o disparo. PK user_id evita
      // duplicar quando o profile ainda nao existe.
      await sql.query(
        `INSERT INTO user_profiles (user_id, last_idle_5d_email_at)
         VALUES ($1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           last_idle_5d_email_at = NOW(),
           updated_at = NOW()`,
        [lead.user_id]
      );
      dispatched++;
    } catch (err) {
      console.warn(`[cron idle-5d] fail ${lead.email}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, dispatched, failed, scanned: rows.length });
}
