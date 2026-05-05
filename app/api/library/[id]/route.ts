/**
 * GET /api/library/[id] — detalhe completo de um reel da biblioteca.
 *
 * Inclui transcript + analysis (lazy-cached). Se o reel ainda não foi
 * analisado, dispara Apify (videoUrl) + Gemini analyze-only e salva no
 * DB pra próximas requests não pagarem de novo.
 *
 * Paid only: free user recebe 402 com mensagem pra upgrade.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { requireUserId } from "@/lib/server-auth";
import { getUserSubscription } from "@/lib/subscriptions";
import { hasLibraryAccess } from "@/lib/pricing";
import { fetchInstagramPost, downloadReelVideo } from "@/lib/apify";
import { analyzeReelOnly } from "@/lib/gemini";
import {
  logUsage,
  APIFY_REEL_COST_USD,
  estimateGeminiCost,
} from "@/lib/cost-tracking";
import type { SourceAnalysis } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ReelRow {
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
  transcript: string | null;
  analysis_json: SourceAnalysis | null;
  analyzed_at: string | null;
  source_idea_id: string | null;
  source_idea_position: number | null;
  source_idea_title: string | null;
  has_scene_frames: boolean;
  categories: string[] | null;
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

  // Gate: só paid (basic/max) — free vê biblioteca borrada e cards mascarados
  const sub = await getUserSubscription(auth.user.id);
  if (!hasLibraryAccess(sub.plan)) {
    return NextResponse.json(
      {
        error: "Plano free não tem acesso à biblioteca destravada",
        code: "library_locked",
      },
      { status: 402 },
    );
  }

  const { id } = await params;
  const sql = getSql();

  let rows: ReelRow[];
  try {
    rows = (await sql`
      SELECT r.id::text, r.ig_url, r.short_code, r.author_handle, r.caption, r.thumb_url,
             r.likes_count, r.views_count, r.duration_seconds, r.template_type,
             r.hook_pattern, r.featured, r.transcript, r.analysis_json,
             r.analyzed_at::text,
             r.source_idea_id::text AS source_idea_id,
             i.position AS source_idea_position,
             i.title AS source_idea_title,
             (r.scene_frames IS NOT NULL) AS has_scene_frames,
             r.categories
        FROM library_reels r
        LEFT JOIN library_ideas i ON i.id = r.source_idea_id
       WHERE r.id = ${id}::uuid
       LIMIT 1
    `) as ReelRow[];
  } catch (err) {
    console.error("[/api/library/[id]] query failed:", err);
    return NextResponse.json({ error: "Erro ao buscar reel" }, { status: 500 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Reel não encontrado" }, { status: 404 });
  }

  let reel = rows[0];

  // Cache miss: roda Gemini analyze-only e salva no DB.
  if (!reel.transcript || !reel.analysis_json) {
    try {
      console.log(`[library/${id}] cache miss · vai analisar`);
      const apifyT0 = Date.now();
      const item = await fetchInstagramPost(reel.ig_url);
      void logUsage({
        userId: auth.user.id,
        scriptId: null,
        provider: "apify",
        operation: "scrape_library_detail",
        costUsd: APIFY_REEL_COST_USD,
        durationMs: Date.now() - apifyT0,
        success: true,
        metadata: { libraryReelId: id, shortCode: item.shortCode },
      });

      if (item.type !== "Video" || !item.videoUrl) {
        return NextResponse.json(
          { error: "Reel da biblioteca não retornou vídeo (mídia removida?)" },
          { status: 502 },
        );
      }

      const videoBytes = await downloadReelVideo(item.videoUrl);
      const geminiT0 = Date.now();
      const { transcript, analysis } = await analyzeReelOnly(
        videoBytes,
        reel.caption ?? item.caption,
      );

      const seconds = Math.max(1, item.videoDuration ?? reel.duration_seconds ?? 60);
      const outputTokens = Math.round(
        JSON.stringify({ transcript, analysis }).length / 3.5,
      );
      const cost = estimateGeminiCost({
        durationSeconds: seconds,
        outputTokens,
      });
      await logUsage({
        userId: auth.user.id,
        scriptId: null,
        provider: "gemini",
        model: "gemini-2.5-flash",
        operation: "analyze_library_reel",
        inputTokens: Math.round(seconds * 258),
        outputTokens,
        costUsd: cost,
        durationMs: Date.now() - geminiT0,
        success: true,
        metadata: { libraryReelId: id, shortCode: item.shortCode },
      });

      // Persiste cache. Próximas requests no mesmo reel são instant.
      await sql`
        UPDATE library_reels
           SET transcript = ${transcript},
               analysis_json = ${JSON.stringify(analysis)}::jsonb,
               analyzed_at = NOW()
         WHERE id = ${id}::uuid
      `;
      reel = { ...reel, transcript, analysis_json: analysis, analyzed_at: new Date().toISOString() };
    } catch (err) {
      console.error("[/api/library/[id]] analyze failed:", err);
      return NextResponse.json(
        {
          error: "Falha ao analisar reel — tenta de novo em alguns segundos",
          details: err instanceof Error ? err.message : String(err),
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({
    reel: {
      id: reel.id,
      igUrl: reel.ig_url,
      shortCode: reel.short_code,
      authorHandle: reel.author_handle,
      caption: reel.caption,
      thumbUrl: reel.thumb_url,
      likesCount: reel.likes_count,
      viewsCount: reel.views_count,
      durationSeconds: reel.duration_seconds,
      templateType: reel.template_type,
      hookPattern: reel.hook_pattern,
      featured: reel.featured,
      transcript: reel.transcript,
      analysis: reel.analysis_json,
      analyzedAt: reel.analyzed_at,
      sourceIdea:
        reel.source_idea_id && reel.source_idea_position != null
          ? {
              id: reel.source_idea_id,
              position: reel.source_idea_position,
              title: reel.source_idea_title ?? "",
            }
          : null,
      hasSceneFrames: Boolean(reel.has_scene_frames),
      categories: Array.isArray(reel.categories) ? reel.categories : [],
    },
  });
}
