/**
 * Analisa o reel-exemplo das primeiras N ideias da biblioteca via
 * Apify + Gemini analyze-only e adiciona como library_reels (apontando
 * pra library_idea de origem via source_idea_id).
 *
 * Critério: pegar ideias em ordem de position que tenham pelo menos 1
 * URL Instagram nos exampleUrls. Pula carrosséis (/?img_index=) e
 * perfis (sem shortcode).
 *
 * Idempotente: pula ideias que já têm um library_reels com source_idea_id
 * apontando pra elas.
 *
 * Usage:
 *   bun --env-file=.env.local scripts/analyze-idea-examples.ts          # 10 primeiras
 *   bun --env-file=.env.local scripts/analyze-idea-examples.ts 20       # 20 primeiras
 *   bun --env-file=.env.local scripts/analyze-idea-examples.ts --force  # reanalyse
 */

import { neon } from "@neondatabase/serverless";
import { fetchInstagramPost, downloadReelVideo } from "../lib/apify";
import { analyzeReelOnly } from "../lib/gemini";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL ausente");
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

const args = process.argv.slice(2);
const force = args.includes("--force");
const limitArg = args.find((a) => /^\d+$/.test(a));
const TARGET_COUNT = limitArg ? parseInt(limitArg, 10) : 10;

interface IdeaRow {
  id: string;
  position: number;
  title: string;
  example_urls: string[] | null;
  formato: string | null;
  tipo: string | null;
  piramide: string | null;
}

/**
 * Filtra URLs IG que provavelmente são reel/post analisável:
 *  - tem /reel/SHORTCODE ou /p/SHORTCODE
 *  - exclui carrossel (?img_index=)
 *  - exclui perfis sem shortcode
 */
function pickIgUrl(urls: string[]): string | null {
  for (const u of urls) {
    if (!u.includes("instagram.com")) continue;
    if (u.includes("img_index")) continue; // carrossel
    if (!/\/(reel|p)\/[A-Za-z0-9_-]{5,}/.test(u)) continue; // sem shortcode
    return u;
  }
  return null;
}

async function main() {
  // Pega ideias com IG analisável; ordena por position
  const candidates = (await sql`
    SELECT id::text, position, title, example_urls, formato, tipo, piramide
      FROM library_ideas
     WHERE example_urls IS NOT NULL
       AND jsonb_array_length(example_urls) > 0
     ORDER BY position
  `) as IdeaRow[];

  // Filtra só as que têm IG válido
  const withIg = candidates
    .map((c) => ({ idea: c, ig: pickIgUrl(c.example_urls ?? []) }))
    .filter((x) => x.ig !== null) as Array<{ idea: IdeaRow; ig: string }>;

  // Skip ideias já analisadas (a menos que --force)
  let queue = withIg;
  if (!force) {
    const analyzedIds = (await sql`
      SELECT DISTINCT source_idea_id::text AS id FROM library_reels WHERE source_idea_id IS NOT NULL
    `) as Array<{ id: string }>;
    const analyzedSet = new Set(analyzedIds.map((r) => r.id));
    queue = queue.filter((x) => !analyzedSet.has(x.idea.id));
  }

  queue = queue.slice(0, TARGET_COUNT);

  console.log(`[analyze-idea] vai processar ${queue.length} ideias (target=${TARGET_COUNT}, force=${force})`);
  if (queue.length === 0) {
    console.log("[analyze-idea] nada pra fazer.");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < queue.length; i++) {
    const { idea, ig } = queue[i];
    const tag = `[${i + 1}/${queue.length}] #${idea.position} ${idea.title.slice(0, 50)}`;
    try {
      console.log(`${tag} · scrape ${ig}`);
      const item = await fetchInstagramPost(ig);
      if (item.type !== "Video" || !item.videoUrl) {
        console.warn(`${tag} ⚠ não é vídeo (type=${item.type}) — skip`);
        fail++;
        continue;
      }

      console.log(`${tag} · download MP4…`);
      const videoBytes = await downloadReelVideo(item.videoUrl);
      const sizeMb = (videoBytes.byteLength / 1024 / 1024).toFixed(1);
      console.log(`${tag} · Gemini analyze (${sizeMb}MB)…`);
      const t0 = Date.now();
      const { transcript, analysis } = await analyzeReelOnly(videoBytes, item.caption);
      const elapsed = Math.round((Date.now() - t0) / 100) / 10;

      // Insert em library_reels (UPSERT por ig_url UNIQUE)
      const tags = [idea.formato, idea.tipo, idea.piramide].filter(Boolean);

      // Tenta detectar template_type pelo formato
      const templateType = idea.formato
        ? idea.formato.toLowerCase().replace(/\s+/g, "_")
        : null;

      await sql`
        INSERT INTO library_reels (
          ig_url, short_code, author_handle, caption, thumb_url,
          likes_count, views_count, duration_seconds, template_type,
          tags, featured, scraped_at,
          transcript, analysis_json, analyzed_at, source_idea_id
        ) VALUES (
          ${item.url}, ${item.shortCode}, ${"@" + item.ownerUsername},
          ${item.caption ?? null}, ${item.displayUrl ?? null},
          ${item.likesCount ?? null}, ${item.videoViewCount ?? item.videoPlayCount ?? null},
          ${item.videoDuration != null ? Math.round(item.videoDuration) : null},
          ${templateType},
          ${JSON.stringify(tags)}::jsonb,
          true, NOW(),
          ${transcript}, ${JSON.stringify(analysis)}::jsonb, NOW(),
          ${idea.id}::uuid
        )
        ON CONFLICT (ig_url) DO UPDATE SET
          transcript = EXCLUDED.transcript,
          analysis_json = EXCLUDED.analysis_json,
          analyzed_at = NOW(),
          source_idea_id = EXCLUDED.source_idea_id,
          featured = TRUE,
          tags = EXCLUDED.tags
      `;

      console.log(`${tag} ✓ ${elapsed}s · ${transcript.length}c transcript`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} ✗`, msg);
      fail++;
    }
  }

  console.log(`\n[analyze-idea] terminou · ok=${ok} fail=${fail}`);

  const summary = (await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(source_idea_id)::int AS from_ideas,
           COUNT(analysis_json)::int AS analyzed
      FROM library_reels
  `) as Array<{ total: number; from_ideas: number; analyzed: number }>;
  console.log("[analyze-idea] library_reels summary:", JSON.stringify(summary[0]));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[analyze-idea] crashed:", err);
    process.exit(1);
  });
