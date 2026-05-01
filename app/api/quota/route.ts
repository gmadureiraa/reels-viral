/**
 * GET /api/quota — retorna o status da quota do user logado.
 * Usado pelo client pra mostrar "X/Y reels usados este mês" + bloqueio.
 *
 * Response shape:
 *   { plan, used, limit, remaining, blocked, resetsAt }
 *
 * Anônimo → 401. Sem subscription → free (3/mês).
 */

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/server-auth";
import { getQuotaStatus } from "@/lib/subscriptions";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;
  try {
    const quota = await getQuotaStatus(auth.user.id);
    return NextResponse.json(quota);
  } catch (err) {
    console.error("[quota] failed:", err);
    return NextResponse.json(
      { error: "Falha ao consultar quota" },
      { status: 500 },
    );
  }
}
