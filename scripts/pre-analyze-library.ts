/**
 * Pre-popula `transcript` + `analysis_json` em library_reels.
 *
 * Pra cada reel sem análise, dispara Apify (videoUrl) + Gemini analyze-only
 * e salva no DB. Idempotente — pula reels que já têm `analyzed_at`.
 *
 * Custo estimado por reel: ~$0.008 Apify + ~$0.005 Gemini ≈ $0.013
 * 20 reels ≈ $0.26 total. Cabe num orçamento preocupado.
 *
 * Usage: bun --env-file=.env.local scripts/pre-analyze-library.ts
 *        bun --env-file=.env.local scripts/pre-analyze-library.ts --force
 */

import { neon } from "@neondatabase/serverless";
import { fetchInstagramPost, downloadReelVideo } from "../lib/apify";
import { analyzeReelOnly } from "../lib/gemini";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL ausente — cheque .env.local");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error("✗ GEMINI_API_KEY ausente");
  process.exit(1);
}
if (!process.env.APIFY_API_KEY) {
  console.error("✗ APIFY_API_KEY ausente");
  process.exit(1);
}

const sql = neon(url);

const force = process.argv.includes("--force");

interface Row {
  id: string;
  ig_url: string;
  caption: string | null;
  author_handle: string | null;
}

async function main() {
  const rows = (force
    ? ((await sql`
        SELECT id::text, ig_url, caption, author_handle
          FROM library_reels
         ORDER BY featured DESC, likes_count DESC NULLS LAST
      `) as Row[])
    : ((await sql`
        SELECT id::text, ig_url, caption, author_handle
          FROM library_reels
         WHERE analysis_json IS NULL OR transcript IS NULL
         ORDER BY featured DESC, likes_count DESC NULLS LAST
      `) as Row[]));

  console.log(`[pre-analyze] ${rows.length} reels pra analisar (force=${force})`);
  if (rows.length === 0) {
    console.log("[pre-analyze] tudo em dia.");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tag = `[${i + 1}/${rows.length}] ${r.author_handle ?? "?"} ${r.id.slice(0, 8)}`;
    try {
      console.log(`${tag} · scrape Apify…`);
      const item = await fetchInstagramPost(r.ig_url);
      if (item.type !== "Video" || !item.videoUrl) {
        console.warn(`${tag} ⚠ não é vídeo — skip`);
        continue;
      }
      console.log(`${tag} · download MP4…`);
      const videoBytes = await downloadReelVideo(item.videoUrl);
      console.log(`${tag} · Gemini analyze (${(videoBytes.byteLength / 1024 / 1024).toFixed(1)}MB)…`);
      const t0 = Date.now();
      const { transcript, analysis } = await analyzeReelOnly(
        videoBytes,
        r.caption ?? item.caption,
      );
      const elapsed = Math.round((Date.now() - t0) / 100) / 10;
      await sql`
        UPDATE library_reels
           SET transcript = ${transcript},
               analysis_json = ${JSON.stringify(analysis)}::jsonb,
               analyzed_at = NOW()
         WHERE id = ${r.id}::uuid
      `;
      console.log(`${tag} ✓ ${elapsed}s · transcript ${transcript.length}c`);
      ok++;
    } catch (err) {
      console.error(`${tag} ✗`, err instanceof Error ? err.message : err);
      fail++;
    }
  }

  console.log(`\n[pre-analyze] terminou · ok=${ok} · fail=${fail}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[pre-analyze] crashed:", err);
    process.exit(1);
  });
