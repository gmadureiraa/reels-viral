/**
 * Cost tracking — server-side only.
 *
 * Custos estimados por chamada cara. Pricing baseline 2026-05:
 *
 *  Apify Instagram Scraper:
 *    - $0.005-0.010 por post (média $0.008). Cache hit = $0.
 *  Gemini 2.5 Flash (video inlineData):
 *    - Input: $0.30/1M tokens. Video tokenizado ~258 tok/s.
 *    - Output JSON: $1.20/1M tokens. ~2k tokens típico.
 *    - Reel 60s: ~15.5k input + 2k output = ~$0.0070 input + $0.0024 output
 *  Storage Neon: desprezível.
 *
 *  Total típico por reel: ~$0.018 USD ≈ R$ 0.09
 */

import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.DATABASE_URL;

function getSql() {
  if (!dbUrl) return null;
  return neon(dbUrl);
}

export interface UsageEvent {
  userId: string | null;
  scriptId: string | null;
  provider: "apify" | "gemini" | "imagen" | "other";
  model?: string;
  operation: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd: number;
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Loga um evento de uso. Best-effort — falhas no DB não bloqueiam o flow
 * principal (silenciosamente loga warning).
 */
export async function logUsage(event: UsageEvent): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  try {
    await sql`
      INSERT INTO ai_usage (
        user_id, script_id, provider, model, operation,
        input_tokens, output_tokens, cost_usd, duration_ms,
        success, error_message, metadata, created_at
      ) VALUES (
        ${event.userId},
        ${event.scriptId},
        ${event.provider},
        ${event.model ?? null},
        ${event.operation},
        ${event.inputTokens ?? null},
        ${event.outputTokens ?? null},
        ${event.costUsd},
        ${event.durationMs ?? null},
        ${event.success ?? true},
        ${event.errorMessage ?? null},
        ${event.metadata ? JSON.stringify(event.metadata) : null},
        NOW()
      )
    `;
  } catch (err) {
    console.warn("[cost-tracking] log failed:", err);
  }
}

// ── Estimadores de custo ────────────────────────────────────────────────

/** Custo médio Apify por scrape (cache miss). */
export const APIFY_REEL_COST_USD = 0.008;

/**
 * Estima custo de uma chamada Gemini 2.5 Flash com video inlineData.
 * Pricing (2026): $0.30/1M input, $1.20/1M output.
 * Video é tokenizado em ~258 tokens por segundo.
 */
export function estimateGeminiCost({
  durationSeconds,
  outputTokens,
}: {
  durationSeconds: number;
  outputTokens: number;
}): number {
  const TOKENS_PER_SECOND = 258;
  const INPUT_PRICE_PER_M = 0.30;
  const OUTPUT_PRICE_PER_M = 1.20;
  const inputTokens = durationSeconds * TOKENS_PER_SECOND;
  const inputCost = (inputTokens / 1_000_000) * INPUT_PRICE_PER_M;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_PRICE_PER_M;
  return inputCost + outputCost;
}
