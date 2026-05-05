/**
 * Re-traduz transcript+análise dos reels existentes que estão em outro
 * idioma (geralmente inglês: hormozi, leadgenman, tenfoldmarc) com o
 * prompt novo PT-BR forçado.
 *
 * Heurística pra detectar inglês: presença de palavras-stop comuns no
 * transcript ('the ', ' you ', ' your ', ' is ', ' to '). Se passa
 * threshold, considera em inglês e re-roda Gemini.
 *
 * Apify: usa cache 24h se ainda válido — sem custo extra na maioria.
 * Gemini: ~$0.005/reel × ~30 reels = ~$0.15 total.
 *
 * Usage:
 *   bun --env-file=.env.local scripts/retranslate-to-ptbr.ts          # auto-detect inglês
 *   bun --env-file=.env.local scripts/retranslate-to-ptbr.ts --all    # re-roda tudo (force)
 */

import { neon } from "@neondatabase/serverless";
import { fetchInstagramPost, downloadReelVideo } from "../lib/apify";
import { analyzeReelOnly } from "../lib/gemini";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL ausente");
  process.exit(1);
}
const sql = neon(url);

const all = process.argv.includes("--all");

interface Row {
  id: string;
  ig_url: string;
  caption: string | null;
  author_handle: string | null;
  transcript: string | null;
}

const ENGLISH_MARKERS = [
  /\bthe\s/gi,
  /\byou\s/gi,
  /\byour\s/gi,
  /\b(is|are|was|were)\s/gi,
  /\b(to|for|with)\s/gi,
  /\bgonna\s/gi,
  /\bdon't\b/gi,
];

function looksLikeEnglish(text: string): boolean {
  if (!text || text.length < 80) return false;
  let hits = 0;
  for (const re of ENGLISH_MARKERS) {
    const matches = text.match(re);
    if (matches && matches.length > 0) hits += matches.length;
  }
  // Threshold: >= 5 hits em texto curto (~150c) sugere inglês.
  // Frases típicas em PT-BR têm <2 desses tokens.
  const density = hits / (text.length / 100);
  return hits >= 5 && density >= 1.5;
}

async function main() {
  const rows = (await sql`
    SELECT id::text, ig_url, caption, author_handle, transcript
      FROM library_reels
     WHERE analysis_json IS NOT NULL
       AND transcript IS NOT NULL
     ORDER BY scraped_at DESC NULLS LAST
  `) as Row[];

  const queue = all
    ? rows
    : rows.filter((r) => looksLikeEnglish(r.transcript ?? ""));

  console.log(
    `[retranslate] ${queue.length}/${rows.length} reels detectados em inglês (all=${all})`,
  );
  if (queue.length === 0) return;

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < queue.length; i++) {
    const r = queue[i];
    const tag = `[${i + 1}/${queue.length}] ${r.author_handle ?? "?"} ${r.id.slice(0, 8)}`;
    try {
      console.log(`${tag} · scrape (cache hit provável)…`);
      const item = await fetchInstagramPost(r.ig_url);
      if (item.type !== "Video" || !item.videoUrl) {
        console.warn(`${tag} ⚠ não é vídeo — skip`);
        fail++;
        continue;
      }
      console.log(`${tag} · download MP4…`);
      const videoBytes = await downloadReelVideo(item.videoUrl);
      console.log(`${tag} · Gemini analyze (PT-BR)…`);
      const t0 = Date.now();
      const { transcript, analysis } = await analyzeReelOnly(
        videoBytes,
        item.caption ?? r.caption ?? undefined,
      );
      const elapsed = Math.round((Date.now() - t0) / 100) / 10;
      await sql`
        UPDATE library_reels
           SET transcript = ${transcript},
               analysis_json = ${JSON.stringify(analysis)}::jsonb,
               analyzed_at = NOW()
         WHERE id = ${r.id}::uuid
      `;
      console.log(`${tag} ✓ ${elapsed}s · ${transcript.length}c PT-BR`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} ✗`, msg);
      fail++;
    }
  }

  console.log(`\n[retranslate] terminou · ok=${ok} fail=${fail}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[retranslate] crashed:", err);
    process.exit(1);
  });
