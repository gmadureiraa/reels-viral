/**
 * Rate limiting in-memory pro MVP do Reels Viral.
 *
 * Cada IP pode disparar 5 adaptações por hora. Se passar, retorna 429.
 * Não é distributed-safe (cada instância serverless tem seu próprio map),
 * mas pra Hobby tier do Vercel é suficiente — queremos só evitar abuse
 * descarado que estoure custo Apify+Gemini.
 *
 * Migrar pra Upstash Redis (igual SV) quando ligar billing.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const BUCKETS = new Map<string, Bucket>();
const WINDOW_MS = 60 * 60 * 1000; // 1h
const LIMIT = 5;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  retryAfterSec: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const existing = BUCKETS.get(key);

  if (!existing || existing.resetAt <= now) {
    BUCKETS.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return {
      allowed: true,
      remaining: LIMIT - 1,
      resetIn: WINDOW_MS,
      retryAfterSec: 0,
    };
  }

  if (existing.count >= LIMIT) {
    const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetIn: existing.resetAt - now,
      retryAfterSec,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: LIMIT - existing.count,
    resetIn: existing.resetAt - now,
    retryAfterSec: 0,
  };
}

/**
 * Extrai uma key estável de um Request — IP do header ou fallback.
 * Vercel popula `x-forwarded-for` em Edge/Node runtime.
 */
export function getClientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "anonymous";
}
