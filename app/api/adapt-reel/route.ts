/**
 * POST /api/adapt-reel
 *
 * Body: { sourceUrl, tema, objetivo, cta, persona?, nicho? }
 *
 * Pipeline (síncrono, ~25-45s):
 *   1. Apify scrape do reel → metadata + videoUrl
 *   2. Download do MP4 do CDN do IG
 *   3. Upload pro Gemini File API
 *   4. Gemini 2.5 Flash analisa o vídeo + gera roteiro adaptado
 *   5. Retorna AdaptResponse
 *
 * Edge case: se a URL não for um reel/post de IG válido, 400 cedo.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchInstagramPost, downloadReelVideo, ApifyError, type ApifyReelItem } from "@/lib/apify";
import { adaptReelWithGemini } from "@/lib/gemini";
import { extractShortCode, isValidInstagramUrl } from "@/lib/utils";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { getCachedScrape, setCachedScrape } from "@/lib/scripts-store";
import { isDbConfigured } from "@/lib/db";
import type { AdaptResponse, SourceMeta } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  sourceUrl: z
    .string()
    .url()
    .refine(isValidInstagramUrl, "URL precisa ser de Reel/post Instagram"),
  tema: z.string().min(3).max(280),
  objetivo: z.enum(["leads", "produto", "seguidores", "engajamento"]),
  cta: z.string().min(2).max(280),
  persona: z.string().max(280).optional(),
  nicho: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  const started = Date.now();

  // Rate limit: 5 adapts/hora por IP. Limite conservador pra MVP — cada
  // adapt custa ~$0.05 Apify + Gemini. Migrar pra Upstash quando ligar
  // billing real. Skip pra dev (NODE_ENV=development).
  if (process.env.NODE_ENV !== "development") {
    const key = getClientKey(req);
    const rate = checkRateLimit(key);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          error: `Limite de adaptações atingido. Tenta de novo em ${Math.ceil(
            rate.retryAfterSec / 60
          )}min.`,
          retryAfterSec: rate.retryAfterSec,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rate.retryAfterSec),
          },
        }
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }
  const brief = parsed.data;

  try {
    // 1) Scrape Apify (com cache 24h por shortCode quando DB tá ativo).
    //    Cache compartilhado entre users — economiza créditos Apify quando
    //    múltiplos users adaptam o mesmo Reel viral. Custos por adapt
    //    caem ~70% em reels populares.
    const shortCode = extractShortCode(brief.sourceUrl);
    let item: ApifyReelItem | null = null;
    if (isDbConfigured() && shortCode) {
      try {
        const cached = (await getCachedScrape(shortCode)) as ApifyReelItem | null;
        if (cached?.shortCode && cached?.videoUrl) {
          item = cached;
        }
      } catch (err) {
        console.warn("[adapt-reel] cache lookup failed:", err);
      }
    }
    if (!item) {
      item = await fetchInstagramPost(brief.sourceUrl);
      // Best-effort: salva no cache pra próximos requests do mesmo shortCode.
      if (isDbConfigured() && item.shortCode) {
        try {
          await setCachedScrape(item.shortCode, item);
        } catch (err) {
          console.warn("[adapt-reel] cache write failed:", err);
        }
      }
    }
    if (item.type !== "Video" || !item.videoUrl) {
      return NextResponse.json(
        {
          error:
            "URL não é um vídeo (Reel). Cola um link de Reel, não foto/carrossel.",
        },
        { status: 400 }
      );
    }

    // 2) Download MP4
    const videoBytes = await downloadReelVideo(item.videoUrl);

    // 3+4) Gemini analisa + gera
    const { analysis, script } = await adaptReelWithGemini(
      videoBytes,
      brief,
      item.caption
    );

    const source: SourceMeta = {
      shortCode: item.shortCode,
      url: item.url,
      ownerUsername: item.ownerUsername,
      ownerFullName: item.ownerFullName,
      caption: item.caption,
      videoDuration: item.videoDuration,
      views: item.videoViewCount,
      plays: item.videoPlayCount,
      likes: item.likesCount,
      comments: item.commentsCount,
      publishedAt: item.timestamp,
    };

    const response: AdaptResponse = {
      source,
      analysis,
      script,
      durationMs: Date.now() - started,
    };

    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof ApifyError) {
      return NextResponse.json(
        {
          error: err.message,
          retryable: err.retryable,
        },
        { status: err.retryable ? 502 : 400 }
      );
    }
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[adapt-reel] failure:", msg);
    return NextResponse.json(
      { error: `Falha ao adaptar reel: ${msg}` },
      { status: 500 }
    );
  }
}
