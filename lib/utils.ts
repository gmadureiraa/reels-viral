import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extrai o shortCode de uma URL do Instagram.
 * Aceita SOMENTE /reel/ e /reels/ (rejeita /p/ carrossel e /tv/ igtv pra
 * não queimar 1 hit Apify antes do guard `item.type !== "Video"` rejeitar).
 * Suporta com ou sem trailing slash, com ou sem segmento de username.
 */
export function extractShortCode(url: string): string | null {
  const match = url.match(
    /instagram\.com\/(?:[^\/]+\/)?reels?\/([A-Za-z0-9_-]+)/
  );
  return match ? match[1] : null;
}

export function isValidInstagramUrl(url: string): boolean {
  return Boolean(extractShortCode(url));
}

export function formatNumber(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatDuration(secs: number | undefined): string {
  if (!secs) return "—";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
