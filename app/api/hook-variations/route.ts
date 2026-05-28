/**
 * POST /api/hook-variations
 *
 * Body: { analysis, script, brief: { tema, objetivo, cta, nicho?, persona? } }
 *
 * Gera 4-5 ângulos alternativos de hook (0-3s) pro roteiro JÁ adaptado.
 * Text-only — NÃO toca Apify nem reprocessa vídeo. Custo ~$0.0003, ~2-4s.
 *
 * Rate limit mais frouxo que /adapt-reel porque é barato: logado 30/h,
 * anônimo 8/h. Sem quota/paywall — é um refinamento de output já pago.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { generateHookVariations } from "@/lib/gemini";
import {
  checkRateLimit,
  getAnonFingerprint,
} from "@/lib/rate-limit";
import { getOptionalUserId } from "@/lib/server-auth";
import { logUsage } from "@/lib/cost-tracking";
import type { HookVariationsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Schemas mínimos — só validamos o que o gerador realmente lê. Mantemos
// passthrough nos objetos grandes (analysis/script) pra não duplicar o
// schema canônico de types.ts (já validado na geração original).
const BodySchema = z.object({
  analysis: z.object({
    resumo: z.string(),
    porQueViralizou: z.array(z.string()),
    estrutura: z.object({
      hook: z.object({ texto: z.string(), tempo: z.string() }),
    }).passthrough(),
  }).passthrough(),
  script: z.object({
    titulo: z.string(),
    hook: z.string(),
    roteiroCompleto: z.string(),
  }).passthrough(),
  brief: z.object({
    tema: z.string().min(1).max(500),
    objetivo: z.string().max(40).default("engajamento"),
    cta: z.string().max(300).default(""),
    nicho: z.string().max(120).optional(),
    persona: z.string().max(280).optional(),
  }),
});

export async function POST(req: Request) {
  const started = Date.now();

  // Kill switch compartilhado com a pipeline principal.
  if (
    process.env.RV_PIPELINE_DISABLED &&
    process.env.RV_PIPELINE_DISABLED !== "0" &&
    process.env.RV_PIPELINE_DISABLED.toLowerCase() !== "false"
  ) {
    return NextResponse.json(
      { error: "Geração temporariamente desabilitada. Volta em alguns minutos.", code: "PIPELINE_DISABLED" },
      { status: 503 },
    );
  }

  const authed = await getOptionalUserId(req);
  const userId = authed?.id ?? null;

  if (process.env.NODE_ENV !== "development") {
    const key = userId
      ? `hookvar:user:${userId}`
      : `hookvar:anon:${getAnonFingerprint(req)}`;
    const limit = userId ? 30 : 8;
    const rate = checkRateLimit({ key, limit });
    if (!rate.allowed) {
      const resetMin = Math.ceil(rate.retryAfterSec / 60);
      return NextResponse.json(
        {
          error: userId
            ? `Limite de ${limit} variações/hora atingido. Reset em ${resetMin}min.`
            : `Limite de ${limit} variações/hora atingido. Crie uma conta pra ter mais ou tente em ${resetMin}min.`,
          retryAfterSec: rate.retryAfterSec,
        },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
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
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const variations = await generateHookVariations({
      // casts seguros: passthrough preserva os campos extras do schema canônico
      analysis: parsed.data.analysis as never,
      script: parsed.data.script as never,
      brief: parsed.data.brief,
    });

    const durationMs = Date.now() - started;

    // Custo desprezível mas logamos pra observabilidade/auditoria.
    void logUsage({
      userId,
      scriptId: null,
      provider: "gemini",
      model: "gemini-2.5-flash",
      operation: "hook_variations",
      outputTokens: Math.round(JSON.stringify(variations).length / 3.5),
      costUsd: 0.0003,
      durationMs,
      success: true,
      metadata: { count: variations.length },
    });

    const response: HookVariationsResponse = { variations, durationMs };
    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[hook-variations] failure:", msg);
    return NextResponse.json(
      { error: `Falha ao gerar variações: ${msg}` },
      { status: 500 },
    );
  }
}
