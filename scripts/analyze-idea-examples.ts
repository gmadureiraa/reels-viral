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
import {
  fetchInstagramPost,
  fetchTikTokVideo,
  searchTikTokTopVideo,
  downloadReelVideo,
  type ApifyMediaItem,
} from "../lib/apify";
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
  search_query: string | null;
  search_url: string | null;
  formato: string | null;
  tipo: string | null;
  piramide: string | null;
}

type Platform = "instagram" | "tiktok";
type FetchMode = "direct" | "search";

interface PickedSource {
  mode: FetchMode;
  url: string;
  platform: Platform;
  query?: string;
}

/**
 * Decide a melhor fonte pra analisar a ideia. Prioridade:
 *  1. URL direta IG (mais barato)
 *  2. URL direta TikTok
 *  3. Search query do TikTok (cai no Apify search → top 1)
 *
 * Retorna null se a ideia não tem nada usável.
 */
function pickSource(idea: IdeaRow): PickedSource | null {
  const urls = idea.example_urls ?? [];

  // 1ª: instagram com shortcode
  for (const u of urls) {
    if (!u.includes("instagram.com")) continue;
    if (u.includes("img_index")) continue;
    if (!/\/(reel|p)\/[A-Za-z0-9_-]{5,}/.test(u)) continue;
    return { mode: "direct", url: u, platform: "instagram" };
  }
  // 2ª: tiktok com /video/<id>
  for (const u of urls) {
    if (!u.includes("tiktok.com")) continue;
    if (u.includes("/search")) continue;
    if (!/\/video\/\d+/.test(u)) continue;
    return { mode: "direct", url: u.split("?")[0], platform: "tiktok" };
  }
  // 3ª: search query do TikTok
  if (idea.search_query) {
    return {
      mode: "search",
      url: idea.search_url ?? "",
      platform: "tiktok",
      query: idea.search_query,
    };
  }
  return null;
}

async function fetchSource(src: PickedSource): Promise<ApifyMediaItem> {
  if (src.mode === "direct" && src.platform === "instagram") {
    const item = await fetchInstagramPost(src.url);
    return { ...item, source: "instagram" };
  }
  if (src.mode === "direct" && src.platform === "tiktok") {
    return await fetchTikTokVideo(src.url);
  }
  // Search TikTok
  if (!src.query) throw new Error("search mode sem query");
  return await searchTikTokTopVideo(src.query);
}

async function main() {
  // Pega TODAS as ideias com pelo menos URL direta OU search query
  const candidates = (await sql`
    SELECT id::text, position, title, example_urls, search_query, search_url,
           formato, tipo, piramide
      FROM library_ideas
     WHERE (example_urls IS NOT NULL AND jsonb_array_length(example_urls) > 0)
        OR search_query IS NOT NULL
     ORDER BY position
  `) as IdeaRow[];

  // Filtra só as que têm uma fonte usável
  const withUrl = candidates
    .map((c) => ({ idea: c, picked: pickSource(c) }))
    .filter((x) => x.picked !== null) as Array<{ idea: IdeaRow; picked: PickedSource }>;

  // Skip ideias já analisadas (a menos que --force)
  let queue = withUrl;
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
    const { idea, picked } = queue[i];
    const modeTag = picked.mode === "search" ? `${picked.platform}-search` : picked.platform;
    const tag = `[${i + 1}/${queue.length}] #${idea.position} [${modeTag}] ${idea.title.slice(0, 45)}`;
    try {
      const sourceLabel =
        picked.mode === "search" ? `q='${picked.query}'` : picked.url;
      console.log(`${tag} · scrape ${sourceLabel}`);
      const item = await fetchSource(picked);
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

      // Insert em library_reels (UPSERT por ig_url UNIQUE — TikTok também
      // entra como ig_url usando webVideoUrl como ID único; é o campo de
      // dedupe do schema atual e cobre ambas plataformas).
      const tags = [
        picked.platform === "tiktok" ? "tiktok" : null,
        idea.formato,
        idea.tipo,
        idea.piramide,
      ].filter(Boolean);

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
