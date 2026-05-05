/**
 * GET /api/img?u=<encoded-url>
 *
 * Proxy de imagens pra contornar o IG CDN que retorna 403 quando o
 * Referer é o nosso domínio (mesmo padrão de SV/RV/Radar Viral).
 *
 * Whitelist de hosts pra evitar SSRF — só aceitamos domínios de CDN do
 * Instagram/Facebook. Nada de URL arbitrário.
 *
 * Cache HTTP agressivo (24h) — thumbnails de reels da biblioteca não
 * mudam.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_HOST_PATTERNS = [
  /\.cdninstagram\.com$/i,
  /\.fbcdn\.net$/i,
  /^scontent[\w-]*\.cdninstagram\.com$/i,
  /^instagram\.[a-z]+\.fbcdn\.net$/i,
];

function isAllowed(host: string): boolean {
  return ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(host));
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

  try {
    const upstream = await fetch(parsed.toString(), {
      // Sem Referer → IG CDN libera. Padrão SV.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      // 10s timeout via AbortController
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `upstream ${upstream.status}` },
        { status: upstream.status },
      );
    }
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Cache em 3 camadas:
        //  - browser: 1 dia + immutable (URL IG tem token único)
        //  - CDN Vercel: 1 dia (s-maxage)
        //  - CDN Vercel-specific: backup pro override
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
        "CDN-Cache-Control": "public, s-maxage=86400, immutable",
        "Vercel-CDN-Cache-Control": "public, s-maxage=86400, immutable",
      },
    });
  } catch (err) {
    console.warn("[/api/img] proxy failed:", err);
    return NextResponse.json({ error: "proxy failed" }, { status: 502 });
  }
}
