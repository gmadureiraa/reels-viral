/**
 * DELETE /api/library/admin/[id] — remove reel da biblioteca.
 *
 * Gate: requireAdmin. UUID validado server-side. Hard delete (sem soft).
 * Reels referenciados por library_ideas ficam órfãos (FK era SET NULL),
 * o que é o comportamento desejado — ideia continua, exemplo somou.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: "DB não configurado" }, { status: 503 });
  }

  const sql = neon(dbUrl);
  const deleted = (await sql`
    DELETE FROM library_reels WHERE id = ${id}::uuid RETURNING id::text
  `) as Array<{ id: string }>;

  if (deleted.length === 0) {
    return NextResponse.json({ error: "reel não encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: deleted[0].id });
}
