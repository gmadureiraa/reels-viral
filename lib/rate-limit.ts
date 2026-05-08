/**
 * Rate limiting do Reels Viral.
 *
 * Compatibilidade:
 *  - `checkRateLimit(opts)` — interface SÍNCRONA original (in-memory Map).
 *    Mantida pra não quebrar callsites legados (`/api/adapt-reel`,
 *    `/api/referrals/track`).
 *  - `checkRateLimitAsync(opts)` — nova interface assíncrona que usa Upstash
 *    Redis quando `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
 *    estiverem setados. Fallback pro Map in-memory caso contrário (com
 *    `console.warn` na primeira chamada). Use essa em rotas novas.
 *
 * Distribuído x serverless: o Map in-memory NÃO é safe entre instâncias
 * Vercel (cada cold start tem seu próprio Map). Pra defesa real contra abuse
 * que rotaciona regiões/colds, usar a versão async com Upstash setado.
 *
 * Usuários logados: 10 adaptações/hora (chave = user:<userId>)
 * Anônimos:          2 adaptações/hora (chave = anon:<ip>:<deviceId>)
 *
 * A diferença de limite força bots a criar contas pra abusar — custo real.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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

/**
 * Versão SÍNCRONA in-memory (original). Mantida pra compat — usar
 * `checkRateLimitAsync` em rotas novas.
 */
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

// ---- Upstash async path ----------------------------------------------------

let upstashRedis: Redis | null = null;
let upstashWarned = false;
const limiterCache = new Map<string, Ratelimit>();

function getUpstashRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!upstashWarned) {
      // Aviso uma vez por process — Upstash não setado, usando fallback.
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN ausente — usando fallback in-memory (não distribuído)."
      );
      upstashWarned = true;
    }
    return null;
  }
  if (!upstashRedis) {
    upstashRedis = new Redis({ url, token });
  }
  return upstashRedis;
}

function getUpstashLimiter(limit: number, windowMs: number): Ratelimit | null {
  const redis = getUpstashRedis();
  if (!redis) return null;
  // Cache por (limit,windowMs) pra evitar recriar a cada call.
  const cacheKey = `${limit}:${windowMs}`;
  const cached = limiterCache.get(cacheKey);
  if (cached) return cached;
  const seconds = Math.max(1, Math.floor(windowMs / 1000));
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, `${seconds} s`),
    prefix: "rv-rl",
    analytics: false,
  });
  limiterCache.set(cacheKey, limiter);
  return limiter;
}

/**
 * Versão assíncrona — tenta Upstash primeiro, fallback in-memory.
 * Use em rotas novas/expostas onde abuse cross-instance importa.
 */
export async function checkRateLimitAsync(
  opts: RateLimitOpts
): Promise<RateLimitResult> {
  const { key, limit, windowMs = WINDOW_MS } = opts;
  const limiter = getUpstashLimiter(limit, windowMs);
  if (!limiter) {
    // Fallback síncrono in-memory.
    return checkRateLimit(opts);
  }
  try {
    const res = await limiter.limit(key);
    const now = Date.now();
    const resetIn = Math.max(0, res.reset - now);
    return {
      allowed: res.success,
      remaining: Math.max(0, res.remaining),
      resetIn,
      retryAfterSec: Math.ceil(resetIn / 1000),
    };
  } catch (err) {
    // Em caso de falha do Upstash (timeout, network), fail-open com fallback
    // in-memory pra não derrubar o produto. Loga pra observabilidade.
    console.warn("[rate-limit] Upstash falhou, fallback in-memory:", err);
    return checkRateLimit(opts);
  }
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

/**
 * Fingerprint composto pro caso anony — IP + hash 8-char de
 * (User-Agent + Accept-Language). Dificulta bypass via proxies que rodam
 * o mesmo browser default — pra spammar de verdade, attacker precisa
 * variar IP + UA + Lang juntos, custo real.
 *
 * Não é resistente a botnet sofisticado, mas levanta o piso pra abuso
 * casual sem precisar de cookie session/HMAC.
 */
export function getAnonFingerprint(req: Request): string {
  const ip = getClientKey(req);
  const ua = req.headers.get("user-agent") ?? "";
  const lang = req.headers.get("accept-language") ?? "";
  // Hash leve (FNV-1a 32-bit) — não-criptográfico, só pra encurtar a key.
  let hash = 2166136261;
  const str = `${ua}|${lang}`;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const fp = (hash >>> 0).toString(36).slice(0, 8);
  return `${ip}:${fp}`;
}
