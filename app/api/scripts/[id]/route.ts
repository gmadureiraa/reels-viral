/**
 * GET    /api/scripts/[id] → carrega 1 roteiro do user logado
 * DELETE /api/scripts/[id] → apaga
 */

import { NextResponse } from "next/server";
import { isDbConfigured } from "@/lib/db";
import { requireUserId } from "@/lib/server-auth";
import { deleteScript, getScriptById } from "@/lib/scripts-store";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "DB não configurado." },
      { status: 503 }
    );
  }
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  try {
    const script = await getScriptById(id, auth.user.id);
    if (!script) {
      return NextResponse.json(
        { error: "Roteiro não encontrado." },
        { status: 404 }
      );
    }
    return NextResponse.json({ script });
  } catch (err) {
    console.error("[scripts GET id]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "DB não configurado." },
      { status: 503 }
    );
  }
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  try {
    const ok = await deleteScript(id, auth.user.id);
    return NextResponse.json({ deleted: ok });
  } catch (err) {
    console.error("[scripts DELETE]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro" },
      { status: 500 }
    );
  }
}
