/**
 * GET /api/library — lista reels da biblioteca.
 *
 * Query params:
 *  - template: filtro por template_type (opcional)
 *  - limit: quantidade (default 24, max 60)
 *
 * Response:
 *   - free user: rows com thumb e likes mas SEM ig_url, caption (server-side
 *     scrub pra evitar bypass via DOM inspect). Tudo borrado no client.
 *   - paid user: row completo.
 *
 * Empty list é OK — popula via script seed (F3.3) após Apify resetar.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getOptionalUserId } from "@/lib/server-auth";
import { getUserSubscription } from "@/lib/subscriptions";
import { hasLibraryAccess } from "@/lib/pricing";

export const runtime = "nodejs";

interface LibraryRow {
  id: string;
  ig_url: string;
  short_code: string | null;
  author_handle: string | null;
  caption: string | null;
  thumb_url: string | null;
  likes_count: number | null;
  views_count: number | null;
  duration_seconds: number | null;
  template_type: string | null;
  hook_pattern: string | null;
  featured: boolean;
}

export async function GET(req: Request) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json(
      { reels: [], unlocked: false, error: "DB não configurado" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const template = url.searchParams.get("template");
  const limitRaw = Number(url.searchParams.get("limit") ?? 24);
  const limit = Math.min(60, Math.max(6, Number.isFinite(limitRaw) ? limitRaw : 24));

  // Determina se user tem acesso pago
  const auth = await getOptionalUserId(req);
  let unlocked = false;
  if (auth) {
    try {
      const sub = await getUserSubscription(auth.id);
      unlocked = hasLibraryAccess(sub.plan);
    } catch {
      unlocked = false;
    }
  }

  const sql = neon(dbUrl);
  let rows: LibraryRow[];
  try {
    rows = template
      ? ((await sql`
          SELECT id::text, ig_url, short_code, author_handle, caption, thumb_url,
                 likes_count, views_count, duration_seconds, template_type,
                 hook_pattern, featured
            FROM library_reels
           WHERE template_type = ${template}
           ORDER BY featured DESC, likes_count DESC NULLS LAST
           LIMIT ${limit}
        `) as LibraryRow[])
      : ((await sql`
          SELECT id::text, ig_url, short_code, author_handle, caption, thumb_url,
                 likes_count, views_count, duration_seconds, template_type,
                 hook_pattern, featured
            FROM library_reels
           ORDER BY featured DESC, likes_count DESC NULLS LAST
           LIMIT ${limit}
        `) as LibraryRow[]);
  } catch (err) {
    // Tabela não migrada ainda — retorna vazio
    console.warn("[library] query failed:", err);
    return NextResponse.json({ reels: [], unlocked });
  }

  // Free user: scrub campos sensíveis server-side (defense in depth — UI
  // já borra, mas evita inspect DOM bypass).
  if (!unlocked) {
    rows = rows.map((r) => ({
      ...r,
      ig_url: "",
      short_code: null,
      caption: null,
      hook_pattern: null,
      author_handle: r.author_handle ? maskHandle(r.author_handle) : null,
    }));
  }

  return NextResponse.json({ reels: rows, unlocked });
}

function maskHandle(handle: string): string {
  // @nomedaperson → @no•••son (preserva first/last 2 chars)
  if (handle.length <= 4) return "@•••";
  const start = handle.slice(0, 3); // inclui @
  const end = handle.slice(-2);
  return `${start}•••${end}`;
}
