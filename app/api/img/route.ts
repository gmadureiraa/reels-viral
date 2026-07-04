/**
 * GET /api/img?u=<encoded-url>
 *
 * Proxy de imagens pra contornar CDNs que retornam 403 quando o Referer
 * é o nosso domínio (mesmo padrão de SV/Radar). Hoje cobre IG/Facebook
 * e TikTok — biblioteca tem thumbs dos dois.
 *
 * Whitelist de hosts pra evitar SSRF — só aceitamos domínios conhecidos.
 *
 * Cache HTTP agressivo (24h) — thumbnails de reels da biblioteca não
 * mudam. Quando upstream retorna 4xx (URL TikTok com signed token
 * expirado, por exemplo), retorna PNG 1x1 transparente em vez de JSON
 * de erro pra que o `background-image` no card simplesmente caia no
 * fallback gradient sem deixar quadrado branco quebrado.
 */

import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import net from "node:net";

export const runtime = "nodejs";

const ALLOWED_HOST_PATTERNS = [
  /\.cdninstagram\.com$/i,
  /\.fbcdn\.net$/i,
  /^scontent[\w-]*\.cdninstagram\.com$/i,
  /^instagram\.[a-z]+\.fbcdn\.net$/i,
  // TikTok CDN — thumbs de Reels com origem TikTok aparecem na biblioteca.
  /\.tiktokcdn\.com$/i,
  /\.tiktokcdn-us\.com$/i,
  /\.tiktokcdn-eu\.com$/i,
  /\.tiktokv\.com$/i,
];

function isAllowed(host: string): boolean {
  return ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

function isPrivateIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    const [a, b] = p;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return false;
}

async function isUpstreamHostSafe(hostname: string): Promise<boolean> {
  if (net.isIP(hostname)) return !isPrivateIp(hostname);
  try {
    const addrs = await lookup(hostname, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

/**
 * 1x1 PNG transparente em base64. Servido com Content-Type image/png e
 * cache curto (1h) quando upstream falha — evita mostrar quadrado em
 * branco e deixa o `background-color`/gradient do card aparecer por baixo.
 * Cache curto (1h, não 24h) porque a URL pode voltar a funcionar antes.
 */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

function transparentPlaceholder(): Response {
  return new Response(TRANSPARENT_PNG, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "X-Img-Proxy": "fallback-transparent",
    },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get("u");
  if (!target) {
    return NextResponse.json({ error: "missing ?u=" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "https only" }, { status: 400 });
  }
  if (!isAllowed(parsed.hostname)) {
    return NextResponse.json(
      { error: `host not allowed: ${parsed.hostname}` },
      { status: 403 },
    );
  }

  if (!(await isUpstreamHostSafe(parsed.hostname))) {
    return NextResponse.json(
      { error: "host not allowed" },
      { status: 403 },
    );
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      // Sem Referer → IG/TikTok CDN libera. Padrão SV.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      // URL pode ter token expirado (típico TikTok signed URL) ou ter sido
      // removido. Retorna PNG transparente pro CSS background cair no
      // gradient fallback sem deixar quadrado quebrado na UI.
      return transparentPlaceholder();
    }
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Cache em 3 camadas:
        //  - browser: 1 dia + immutable (URL IG/TikTok tem token único)
        //  - CDN Vercel: 1 dia (s-maxage)
        //  - CDN Vercel-specific: backup pro override
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
        "CDN-Cache-Control": "public, s-maxage=86400, immutable",
        "Vercel-CDN-Cache-Control": "public, s-maxage=86400, immutable",
      },
    });
  } catch (err) {
    console.warn("[/api/img] proxy failed:", err);
    // Mesmo em erro de rede / timeout, devolve placeholder ao invés de
    // 502 pra UI ficar limpa.
    return transparentPlaceholder();
  }
}
