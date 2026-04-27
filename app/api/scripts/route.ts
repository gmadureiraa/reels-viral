/**
 * GET  /api/scripts → lista os roteiros do user logado
 * POST /api/scripts → salva um novo (recebe AdaptResponse + tema)
 *
 * Em ambos os casos, requer auth via Bearer JWT do Neon Auth.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isDbConfigured } from "@/lib/db";
import { requireUserId } from "@/lib/server-auth";
import { listScriptsForUser, saveScriptToDb } from "@/lib/scripts-store";
import type { AdaptResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ scripts: [], dbConfigured: false });
  }
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;

  try {
    const scripts = await listScriptsForUser(auth.user.id);
    return NextResponse.json({ scripts, dbConfigured: true });
  } catch (err) {
    console.error("[scripts GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha listando scripts" },
      { status: 500 }
    );
  }
}

const PostSchema = z.object({
  tema: z.string().min(1).max(280),
  data: z.unknown(),
});

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: "DB não configurado." },
      { status: 503 }
    );
  }
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const saved = await saveScriptToDb({
      userId: auth.user.id,
      tema: parsed.data.tema,
      data: parsed.data.data as AdaptResponse,
    });
    return NextResponse.json({ script: saved });
  } catch (err) {
    console.error("[scripts POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao salvar" },
      { status: 500 }
    );
  }
}
