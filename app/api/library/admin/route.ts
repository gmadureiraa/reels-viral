/**
 * Admin endpoints da biblioteca (gated por requireAdmin).
 *
 * POST /api/library/admin
 *   Body: { url: string }
 *   Aceita URL Instagram (post/reel) ou TikTok. Roda Apify scrape no
 *   post específico, insere em library_reels com idempotência (ON CONFLICT
 *   DO NOTHING em ig_url). Retorna { reel } ou { error }.
 *
 * Pode demorar 30-60s por causa do scrape sync. Cliente deve mostrar
 * loader enquanto aguarda.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 90;

interface ApifyPost {
  shortCode?: string;
  url?: string;
  type?: string;
  caption?: string;
  displayUrl?: string;
  videoUrl?: string;
  isVideo?: boolean;
  productType?: string;
  videoDuration?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  likesCount?: number;
  timestamp?: string;
  ownerUsername?: string;
}

function classifyTemplate(caption: string | null): string | null {
  if (!caption) return null;
  const c = caption.toLowerCase();
  if (/passo a passo|step by step|how to|tutorial|aprenda|como fazer/.test(c))
    return "tutorial";
  if (/antes.*depois|before.*after|transforma/.test(c)) return "transformation";
  if (/lista|top \d|melhores|piores|\d+ (formas|maneiras|coisas)/.test(c))
    return "list";
  if (/^[A-Z].{0,40}\?/.test(caption.trim())) return "question";
  return null;
}

async function scrapeInstagramPost(url: string): Promise<ApifyPost | null> {
  const APIFY_TOKEN = process.env.APIFY_API_KEY;
  if (!APIFY_TOKEN) {
    throw new Error("APIFY_API_KEY ausente");
  }
  const endpoint = `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=70`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      directUrls: [url],
      resultsType: "posts",
      resultsLimit: 1,
      addParentData: false,
    }),
    signal: AbortSignal.timeout(85_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Apify ${res.status}: ${txt.slice(0, 200)}`);
  }
  const posts = (await res.json()) as ApifyPost[];
  return posts[0] ?? null;
}

function normalizeIgUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (!/^(www\.)?instagram\.com$/i.test(u.hostname)) return null;
    if (!/^\/(p|reel|reels|tv)\/[^/]+/.test(u.pathname)) return null;
    return `https://www.instagram.com${u.pathname.replace(/\/+$/, "")}/`;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("response" in auth) return auth.response;

  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const igUrl = body.url ? normalizeIgUrl(body.url) : null;
  if (!igUrl) {
    return NextResponse.json(
      {
        error:
          "URL inválida. Cole um link de post ou reel do Instagram (ex: instagram.com/reel/ABC123).",
      },
      { status: 400 },
    );
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: "DB não configurado" }, { status: 503 });
  }

  // Conferir duplicata antes de gastar Apify
  const sql = neon(dbUrl);
  const existing = (await sql`
    SELECT id::text FROM library_reels WHERE ig_url = ${igUrl} LIMIT 1
  `) as Array<{ id: string }>;
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "Esse reel já está na biblioteca.", id: existing[0].id },
      { status: 409 },
    );
  }

  let post: ApifyPost | null;
  try {
    post = await scrapeInstagramPost(igUrl);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Falha no scrape: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 },
    );
  }

  if (!post) {
    return NextResponse.json(
      { error: "Apify não retornou dados pra essa URL." },
      { status: 502 },
    );
  }

  if (!(post.type === "Video" || post.isVideo || post.productType === "clips")) {
    return NextResponse.json(
      { error: "URL não é um Reel/vídeo (post estático)." },
      { status: 400 },
    );
  }

  const row = {
    ig_url: igUrl,
    short_code: post.shortCode ?? null,
    author_handle: post.ownerUsername ? `@${post.ownerUsername}` : null,
    caption: post.caption ?? null,
    thumb_url: post.displayUrl ?? null,
    likes_count: post.likesCount ?? null,
    views_count: post.videoPlayCount ?? post.videoViewCount ?? null,
    duration_seconds: post.videoDuration
      ? Math.round(post.videoDuration)
      : null,
    template_type: classifyTemplate(post.caption ?? null),
    hook_pattern: null,
    featured: false,
  };

  const inserted = (await sql`
    INSERT INTO library_reels (
      ig_url, short_code, author_handle, caption, thumb_url,
      likes_count, views_count, duration_seconds,
      template_type, hook_pattern, featured, scraped_at
    ) VALUES (
      ${row.ig_url}, ${row.short_code}, ${row.author_handle},
      ${row.caption}, ${row.thumb_url},
      ${row.likes_count}, ${row.views_count}, ${row.duration_seconds},
      ${row.template_type}, ${row.hook_pattern}, ${row.featured}, NOW()
    )
    ON CONFLICT (ig_url) DO NOTHING
    RETURNING id::text, ig_url, author_handle, thumb_url, likes_count
  `) as Array<{
    id: string;
    ig_url: string;
    author_handle: string | null;
    thumb_url: string | null;
    likes_count: number | null;
  }>;

  if (inserted.length === 0) {
    return NextResponse.json(
      { error: "Insert não retornou linha (duplicata race condition?)" },
      { status: 500 },
    );
  }

  return NextResponse.json({ reel: inserted[0] }, { status: 201 });
}
