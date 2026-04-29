/**
 * GET /api/lead/feedback?id=<leadId>&posted=yes|no
 *
 * Endpoint de tracking 1-click clicado pelos botões do checkin email.
 * Marca `posted_feedback` no lead e redireciona pra uma thank-you page
 * com mensagem contextual.
 *
 * Idempotente: se mesmo lead clica duas vezes, só atualiza o último
 * valor. Sem auth — é tracking público (similar a links de unsubscribe).
 * Lead id é UUID v4, suficientemente unguessable.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const maxDuration = 5;

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://reels.kaleidos.com.br";

export async function GET(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.redirect(`${SITE}?feedback=error`, 302);
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const posted = url.searchParams.get("posted");

  if (!id || !["yes", "no"].includes(posted ?? "")) {
    return NextResponse.redirect(`${SITE}?feedback=invalid`, 302);
  }

  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`
      UPDATE leads
      SET posted_feedback = ${posted}, updated_at = NOW()
      WHERE id = ${id}::uuid
    `;
  } catch (err) {
    console.warn("[feedback] update failed:", err);
    return NextResponse.redirect(`${SITE}?feedback=error`, 302);
  }

  return NextResponse.redirect(
    `${SITE}/obrigado?posted=${posted}`,
    302,
  );
}
