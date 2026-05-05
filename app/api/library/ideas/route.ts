/**
 * GET /api/library/ideas — lista pautas/ideias da biblioteca.
 *
 * Importadas do Notion "100 Ideias pra viralizar" da Kaleidos. Free user
 * também tem acesso (não há mídia cara — é só prompt textual). Paywall
 * fica pro `Adaptar reel` no /app.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

interface IdeaRow {
  id: string;
  position: number;
  title: string;
  formato: string | null;
  tipo: string | null;
  piramide: string | null;
  featured: boolean;
  search_query: string | null;
  search_url: string | null;
  example_urls: string[] | null;
  how_to_adapt: string | null;
}

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  return neon(url);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 30);
  const offsetRaw = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.min(101, Math.max(6, Number.isFinite(limitRaw) ? limitRaw : 30));
  const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0);
  const formato = url.searchParams.get("formato");

  try {
    const sql = getSql();
    const rows = (formato
      ? ((await sql`
          SELECT id::text, position, title, formato, tipo, piramide, featured,
                 search_query, search_url, example_urls, how_to_adapt
            FROM library_ideas
           WHERE formato = ${formato}
           ORDER BY featured DESC, position ASC
           LIMIT ${limit} OFFSET ${offset}
        `) as IdeaRow[])
      : ((await sql`
          SELECT id::text, position, title, formato, tipo, piramide, featured,
                 search_query, search_url, example_urls, how_to_adapt
            FROM library_ideas
           ORDER BY featured DESC, position ASC
           LIMIT ${limit} OFFSET ${offset}
        `) as IdeaRow[]));

    const totalRows = (await sql`
      SELECT COUNT(*)::int AS n FROM library_ideas
    `) as Array<{ n: number }>;
    const total = totalRows[0]?.n ?? 0;

    return NextResponse.json({
      ideas: rows.map((r) => ({
        id: r.id,
        position: r.position,
        title: r.title,
        formato: r.formato,
        tipo: r.tipo,
        piramide: r.piramide,
        featured: r.featured,
        searchQuery: r.search_query,
        searchUrl: r.search_url,
        exampleUrls: Array.isArray(r.example_urls) ? r.example_urls : [],
        howToAdapt: r.how_to_adapt,
      })),
      total,
      hasMore: offset + rows.length < total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[/api/library/ideas] failed:", err);
    return NextResponse.json({ error: "Falha ao carregar ideias" }, { status: 500 });
  }
}
