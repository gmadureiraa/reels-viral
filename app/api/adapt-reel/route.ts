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
import { getOptionalUserId } from "@/lib/server-auth";
import { getCachedScrape, setCachedScrape } from "@/lib/scripts-store";
import { isDbConfigured } from "@/lib/db";
import { logUsage, APIFY_REEL_COST_USD, estimateGeminiCost } from "@/lib/cost-tracking";
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

  // Kill switch de emergência: se RV_PIPELINE_DISABLED estiver setado
  // (qualquer truthy), retorna 503 antes de tocar Apify/Gemini. Útil
  // quando custo dispara, key vaza, ou Gemini está em outage. User
  // recebe mensagem clara em vez de timeout.
  if (
    process.env.RV_PIPELINE_DISABLED &&
    process.env.RV_PIPELINE_DISABLED !== "0" &&
    process.env.RV_PIPELINE_DISABLED.toLowerCase() !== "false"
  ) {
    return NextResponse.json(
      {
        error:
          "Estamos em manutenção rápida — geração de roteiros desabilitada. Volta em alguns minutos.",
        code: "PIPELINE_DISABLED",
      },
      { status: 503 }
    );
  }

  // Etapa 1: detectar usuário via JWT do Neon Auth (sem forçar login).
  // Anônimos passam normalmente — apenas recebem limite mais apertado.
  const authedUser = await getOptionalUserId(req);
  const userId = authedUser?.id ?? null;

  // Etapa 3: audit trail — loga quem fez a requisição antes de processar.
  // Útil pra debug e futura integração com PostHog.
  // (parsed.data.sourceUrl só existe depois do parse, mas logamos aqui
  //  pra garantir o log mesmo em requests malformados — URL virá do body bruto
  //  depois do parse ou "unknown" se falhar)
  const rawBodyForLog = userId; // placeholder; o log real ocorre após parse

  // Rate limit: logado = 10/hora, anônimo = 2/hora.
  // Diferença de limite força bots a criar conta pra abusar — custo real.
  // Etapa 4: anônimos usam IP + device fingerprint como chave composta.
  // Skip pra dev (NODE_ENV=development).
  if (process.env.NODE_ENV !== "development") {
    let rateLimitKey: string;
    let rateLimitLimit: number;
    let rateLimitMsg: string;

    if (userId !== null) {
      // Usuário autenticado: chave por ID, limite generoso
      rateLimitKey = `user:${userId}`;
      rateLimitLimit = 10;
      rateLimitMsg = ""; // preenchido abaixo se bloqueado
    } else {
      // Anônimo: chave = IP + device fingerprint (header opcional do client)
      const ip = getClientKey(req);
      const deviceId = req.headers.get("x-device-id");
      rateLimitKey = `anon:${ip}:${deviceId ?? "no-device"}`;
      rateLimitLimit = 2;
      rateLimitMsg = "";
    }

    const rate = checkRateLimit({ key: rateLimitKey, limit: rateLimitLimit });
    if (!rate.allowed) {
      const resetMin = Math.ceil(rate.retryAfterSec / 60);

      // Etapa 5: mensagem 429 informativa e diferenciada por tipo de user
      if (userId !== null) {
        rateLimitMsg = `Limite de 10 adaptações/hora atingido. Reset em ${resetMin}min.`;
      } else {
        rateLimitMsg = `Limite de 2 adaptações/hora atingido. Crie uma conta pra ter 10/h ou tente em ${resetMin}min.`;
      }

      return NextResponse.json(
        { error: rateLimitMsg, retryAfterSec: rate.retryAfterSec },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSec) },
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

  // Etapa 3: audit trail — loga usuário (ou IP anônimo) + URL solicitada.
  // Útil pra debug + futura integração com PostHog events.
  // Suprime aviso de variável não usada do placeholder acima.
  void rawBodyForLog;
  console.log(
    `[adapt-reel] user=${userId ?? `anon-${getClientKey(req)}`} url=${brief.sourceUrl}`
  );

  // ── Quota guard (paywall) + Cost guard global ────────────────────────
  // 1) Quota individual: free user com 3+ reels do mês → 402
  // 2) Cost guard global (kill switch): se SOFT_DAILY_CAP_USD definido e
  //    gasto do dia exceder, bloqueia free + anon (pagantes seguem).
  let isPaidUser = false;
  if (userId) {
    try {
      const { getQuotaStatus, getUserSubscription } = await import("@/lib/subscriptions");
      const [quota, sub] = await Promise.all([
        getQuotaStatus(userId),
        getUserSubscription(userId),
      ]);
      isPaidUser = sub.plan !== "free";
      if (quota.blocked) {
        return NextResponse.json(
          {
            error: `Você atingiu o limite de ${quota.limit} reels do plano ${quota.plan}. Reset em ${new Date(quota.resetsAt).toLocaleDateString("pt-BR")}.`,
            code: "quota_exceeded",
            quota,
          },
          { status: 402 }, // Payment Required
        );
      }
    } catch (err) {
      // Best-effort: se a tabela ainda não existe ou DB falha, não bloqueia.
      console.warn("[adapt-reel] quota check skipped:", err);
    }
  }

  // Cost guard global — kill switch quando o dia tá esquentando demais
  try {
    const { checkCostGuard } = await import("@/lib/cost-guard");
    const guard = await checkCostGuard(isPaidUser);
    if (!guard.allowed) {
      return NextResponse.json(
        {
          error:
            "Recebemos muitas gerações hoje, dá um respiro. Tenta novamente amanhã ou assine um plano pago pra prioridade.",
          code: "soft_cap_exceeded",
          spent: guard.spentTodayUsd,
          cap: guard.capUsd,
        },
        { status: 503 }, // Service Unavailable
      );
    }
  } catch (err) {
    console.warn("[adapt-reel] cost guard skipped:", err);
  }

  try {
    // 1) Scrape Apify (com cache 24h por shortCode quando DB tá ativo).
    //    Cache compartilhado entre users — economiza créditos Apify quando
    //    múltiplos users adaptam o mesmo Reel viral. Custos por adapt
    //    caem ~70% em reels populares.
    const shortCode = extractShortCode(brief.sourceUrl);
    let item: ApifyReelItem | null = null;
    let cacheHit = false;
    const apifyT0 = Date.now();
    if (isDbConfigured() && shortCode) {
      try {
        const cached = (await getCachedScrape(shortCode)) as ApifyReelItem | null;
        if (cached?.shortCode && cached?.videoUrl) {
          item = cached;
          cacheHit = true;
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
    // Log Apify usage (cache hit cost=0, miss ~$0.008)
    void logUsage({
      userId,
      scriptId: null,
      provider: "apify",
      operation: cacheHit ? "scrape_cache_hit" : "scrape_miss",
      costUsd: cacheHit ? 0 : APIFY_REEL_COST_USD,
      durationMs: Date.now() - apifyT0,
      success: true,
      metadata: { shortCode, sourceUrl: brief.sourceUrl },
    });

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
    const geminiT0 = Date.now();
    const { analysis, script } = await adaptReelWithGemini(
      videoBytes,
      brief,
      item.caption
    );
    // Estima custo Gemini baseado em duração do reel + tamanho do JSON output
    const geminiSeconds = Math.max(1, item.videoDuration ?? 60);
    const outputTokensEstimate = Math.round(JSON.stringify({ analysis, script }).length / 3.5);
    const geminiCost = estimateGeminiCost({
      durationSeconds: geminiSeconds,
      outputTokens: outputTokensEstimate,
    });
    void logUsage({
      userId,
      scriptId: null,
      provider: "gemini",
      model: "gemini-2.5-flash",
      operation: "analyze_reel",
      inputTokens: Math.round(geminiSeconds * 258),
      outputTokens: outputTokensEstimate,
      costUsd: geminiCost,
      durationMs: Date.now() - geminiT0,
      success: true,
      metadata: { shortCode, durationSeconds: geminiSeconds },
    });

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
