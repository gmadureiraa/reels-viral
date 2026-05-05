/**
 * GET /api/library/[id]/frames — frames-chave (5 base64 JPGs) de um reel.
 *
 * Separado do /api/library/[id] porque cada reel tem ~155KB de frames
 * inline (5 × ~30KB base64). Buscar tudo no detalhe inflava response em
 * 30x. Aqui o modal carrega lista rápida (~5KB) e dispara essa rota
 * em paralelo só pra exibir frames.
 *
 * Paid only: free vê biblioteca borrada e não chega nesse endpoint.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireUserId } from "@/lib/server-auth";
import { getUserSubscription } from "@/lib/subscriptions";
import { hasLibraryAccess } from "@/lib/pricing";

export const runtime = "nodejs";

interface SceneFrame {
  label: string;
  papel: string;
  tempo: string;
  startSec: number;
  texto: string;
  dataUrl: string;
}

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  return neon(url);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;

  const sub = await getUserSubscription(auth.user.id);
  if (!hasLibraryAccess(sub.plan)) {
    return NextResponse.json(
      { error: "Plano free não tem acesso", code: "library_locked" },
      { status: 402 },
    );
  }

  const { id } = await params;
  const sql = getSql();

  try {
    const rows = (await sql`
      SELECT scene_frames FROM library_reels
       WHERE id = ${id}::uuid AND scene_frames IS NOT NULL
       LIMIT 1
    `) as Array<{ scene_frames: SceneFrame[] | null }>;

    if (rows.length === 0) {
      return NextResponse.json(
        { frames: [], message: "Reel sem frames extraídos" },
        {
          status: 200,
          // Curto pra dar chance de re-fetch quando frames forem adicionados.
          headers: { "Cache-Control": "private, max-age=300" },
        },
      );
    }

    return NextResponse.json(
      { frames: rows[0].scene_frames ?? [] },
      {
        status: 200,
        // Frames são imutáveis pro reel — cache agressivo no browser.
        // private (não pode ser CDN-cached porque o JWT do user pode mudar
        // a resposta no futuro se adicionarmos limite por plano).
        headers: { "Cache-Control": "private, max-age=86400, immutable" },
      },
    );
  } catch (err) {
    console.error("[/api/library/[id]/frames] failed:", err);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
