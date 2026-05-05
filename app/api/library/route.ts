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
  categories: string[] | null;
  source_idea_id: string | null;
  source_idea_position: number | null;
  source_idea_title: string | null;
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
  // Filtros: ?category=Tutorial filtra pelo array categories. Mantém
  // ?template= legacy só pra compatibilidade.
  const category = url.searchParams.get("category");
  const template = url.searchParams.get("template");
  // Default 8 (entrega rápida + first-screen completa); user clica "Ver mais" pra carregar até 60.
  const limitRaw = Number(url.searchParams.get("limit") ?? 8);
  const limit = Math.min(60, Math.max(6, Number.isFinite(limitRaw) ? limitRaw : 8));

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
    if (category) {
      rows = (await sql`
        SELECT r.id::text, r.ig_url, r.short_code, r.author_handle, r.caption, r.thumb_url,
               r.likes_count, r.views_count, r.duration_seconds, r.template_type,
               r.hook_pattern, r.featured, r.categories,
               r.source_idea_id::text AS source_idea_id,
               i.position AS source_idea_position,
               i.title AS source_idea_title
          FROM library_reels r
          LEFT JOIN library_ideas i ON i.id = r.source_idea_id
         WHERE ${category} = ANY(r.categories)
         ORDER BY r.featured DESC, r.likes_count DESC NULLS LAST
         LIMIT ${limit}
      `) as LibraryRow[];
    } else if (template) {
      rows = (await sql`
        SELECT r.id::text, r.ig_url, r.short_code, r.author_handle, r.caption, r.thumb_url,
               r.likes_count, r.views_count, r.duration_seconds, r.template_type,
               r.hook_pattern, r.featured, r.categories,
               r.source_idea_id::text AS source_idea_id,
               i.position AS source_idea_position,
               i.title AS source_idea_title
          FROM library_reels r
          LEFT JOIN library_ideas i ON i.id = r.source_idea_id
         WHERE r.template_type = ${template}
         ORDER BY r.featured DESC, r.likes_count DESC NULLS LAST
         LIMIT ${limit}
      `) as LibraryRow[];
    } else {
      rows = (await sql`
        SELECT r.id::text, r.ig_url, r.short_code, r.author_handle, r.caption, r.thumb_url,
               r.likes_count, r.views_count, r.duration_seconds, r.template_type,
               r.hook_pattern, r.featured, r.categories,
               r.source_idea_id::text AS source_idea_id,
               i.position AS source_idea_position,
               i.title AS source_idea_title
          FROM library_reels r
          LEFT JOIN library_ideas i ON i.id = r.source_idea_id
         ORDER BY r.featured DESC, r.likes_count DESC NULLS LAST
         LIMIT ${limit}
      `) as LibraryRow[];
    }
  } catch (err) {
    // Tabela não migrada ainda — retorna vazio
    console.warn("[library] query failed:", err);
    return NextResponse.json({ reels: [], unlocked });
  }

  // Free user: scrub campos sensíveis server-side (defense in depth — UI
  // já borra, mas evita inspect DOM bypass). thumb_url também ofusca pra
  // não vazar imagem em cleartext via DOM inspect.
  if (!unlocked) {
    rows = rows.map((r) => ({
      ...r,
      ig_url: "",
      short_code: null,
      caption: null,
      hook_pattern: null,
      thumb_url: null,
      author_handle: r.author_handle ? maskHandle(r.author_handle) : null,
    }));
  }

  // Map source_idea_* → sourceIdea object + normaliza categories
  const reels = rows.map((r) => ({
    id: r.id,
    ig_url: r.ig_url,
    short_code: r.short_code,
    author_handle: r.author_handle,
    categories: Array.isArray(r.categories) ? r.categories : [],
    caption: r.caption,
    thumb_url: r.thumb_url,
    likes_count: r.likes_count,
    views_count: r.views_count,
    duration_seconds: r.duration_seconds,
    template_type: r.template_type,
    hook_pattern: r.hook_pattern,
    featured: r.featured,
    sourceIdea:
      r.source_idea_id && r.source_idea_position != null
        ? {
            id: r.source_idea_id,
            position: r.source_idea_position,
            title: r.source_idea_title ?? "",
          }
        : null,
  }));
  return NextResponse.json({ reels, unlocked });
}

function maskHandle(handle: string): string {
  // @nomedaperson → @no•••son (preserva first/last 2 chars)
  if (handle.length <= 4) return "@•••";
  const start = handle.slice(0, 3); // inclui @
  const end = handle.slice(-2);
  return `${start}•••${end}`;
}
