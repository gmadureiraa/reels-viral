import type { MetadataRoute } from "next";

/**
 * robots.txt gerado pelo Next (App Router resolve app/robots.ts em /robots.txt).
 * Libera o site público mas bloqueia rotas privadas/transacionais:
 *  - /app/*  → área logada (não indexável, exige auth)
 *  - /api/*  → endpoints
 *  - /r/*    → links de referral (não são conteúdo)
 * Aponta o sitemap pra ajudar crawlers a priorizar landing + legais.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://reels.kaleidos.com.br";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/api/", "/r/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
