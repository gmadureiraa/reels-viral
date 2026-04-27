/**
 * Rate limiting in-memory pro MVP do Reels Viral.
 *
 * Usuários logados: 10 adaptações/hora (chave = user:<userId>)
 * Anônimos:          2 adaptações/hora (chave = anon:<ip>:<deviceId>)
 *
 * A diferença de limite força bots a criar contas pra abusar — custo real.
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

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  retryAfterSec: number;
}

export interface RateLimitOpts {
  /** Chave única do bucket (ex: "user:abc123" ou "anon:1.2.3.4:device-uuid") */
  key: string;
  /** Máximo de requests permitidos na janela */
  limit: number;
  /** Janela em ms (padrão: 1h) */
  windowMs?: number;
}

export function checkRateLimit(opts: RateLimitOpts): RateLimitResult {
  const { key, limit, windowMs = WINDOW_MS } = opts;
  const now = Date.now();
  const existing = BUCKETS.get(key);

  if (!existing || existing.resetAt <= now) {
    BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: limit - 1,
      resetIn: windowMs,
      retryAfterSec: 0,
    };
  }

  if (existing.count >= limit) {
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
    remaining: limit - existing.count,
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
