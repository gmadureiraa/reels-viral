import type { MetadataRoute } from "next";

/**
 * sitemap.xml gerado pelo Next (App Router resolve app/sitemap.ts).
 * Só rotas públicas indexáveis — a landing e as páginas legais.
 * /app/* fica de fora (auth-gated) e /r/* são links de referral.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://reels.kaleidos.com.br";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
