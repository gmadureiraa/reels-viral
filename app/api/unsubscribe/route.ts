/**
 * GET /api/unsubscribe?id=<leadId>
 *
 * Marca `consent_marketing = FALSE` no lead. Cron pula leads sem
 * consent — fim dos emails. Sem auth (link público em footer).
 * Idempotente.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const maxDuration = 5;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://reels.kaleidos.com.br";

export async function GET(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.redirect(`${SITE}?unsub=error`, 302);
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.redirect(`${SITE}?unsub=invalid`, 302);

  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`
      UPDATE leads SET consent_marketing = FALSE, updated_at = NOW()
      WHERE id = ${id}::uuid
    `;
  } catch (err) {
    console.warn("[unsub] update failed:", err);
    return NextResponse.redirect(`${SITE}?unsub=error`, 302);
  }

  return NextResponse.redirect(`${SITE}/obrigado?unsub=ok`, 302);
}
