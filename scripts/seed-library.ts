/**
 * Seed da biblioteca de reels virais.
 *
 * Estratégia low-cost:
 *  - Lista de handles curados (criadores que fazem reels educacionais virais)
 *  - 1 profile scrape por handle (~$0.005-0.010) retorna 20 posts
 *  - Filtra só reels (type=Video, isVideo, productType=clips)
 *  - Ordena por likesCount, pega top N total
 *  - Insert em library_reels com auto-classify de template_type
 *
 * Custo estimado: 6 handles × $0.008 = ~$0.05 total. Cabe num orçamento
 * preocupado.
 *
 * Rodar: `bun scripts/seed-library.ts`
 *  - Lê DATABASE_URL e APIFY_API_KEY do .env.local
 *  - Idempotente: ON CONFLICT DO NOTHING (ig_url UNIQUE)
 */

import { neon } from "@neondatabase/serverless";

const APIFY_TOKEN = process.env.APIFY_API_KEY;
const DB_URL = process.env.DATABASE_URL;

if (!APIFY_TOKEN) {
  console.error("APIFY_API_KEY ausente no .env.local");
  process.exit(1);
}
if (!DB_URL) {
  console.error("DATABASE_URL ausente no .env.local");
  process.exit(1);
}

const sql = neon(DB_URL);

// ── Curadoria — handles que fazem reels educacionais virais ─────────
// Mistura de:
//  - marketing/business edu (high engagement IG): hormozi, garyvee
//  - dev/IA edu (cresce rápido + relevante pro nicho dos users RV):
//    blakeandersonw, leonardomaximiliano (DSEC pra teste de signal local)
//  - copy/conteúdo BR (relevante pra audiência brasileira):
//    leadgenman, ledymarques (criadora BR que viralizou recente)
//
// Lista curta inicial — fácil expandir depois com `bun seed-library.ts <handle>`
const HANDLES = [
  "hormozi",
  "garyvee",
  "leadgenman",
  "blakeandersonw",
  "tenfoldmarc",
  "matheus.chibebe",
];

const TARGET_LIBRARY_SIZE = 20;

interface ApifyPost {
  shortCode: string;
  url?: string;
  type?: string;
  caption?: string;
  displayUrl?: string;
  videoUrl?: string;
  isVideo?: boolean;
  productType?: string;
  videoDuration?: number;
  videoViewCount?: number;
  videoPlayCount?: number;
  likesCount?: number;
  commentsCount?: number;
  timestamp?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  hashtags?: string[];
  mentions?: string[];
}

async function scrapeProfile(handle: string, postsLimit = 20): Promise<ApifyPost[]> {
  // Timeout 120s — Apify às vezes leva 60-90s pra perfis grandes (garyvee)
  // por causa do scroll IG. Sem timeout próprio, bun fetch corta em ~30s.
  const APIFY_TIMEOUT_S = 100;
  const endpoint = `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${APIFY_TIMEOUT_S}`;
  const input = {
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsType: "posts",
    resultsLimit: postsLimit,
    addParentData: false,
    searchType: "user",
    searchLimit: 1,
  };
  console.log(`  → Apify scrape @${handle} (${postsLimit} posts, timeout ${APIFY_TIMEOUT_S}s)…`);
  const t0 = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((APIFY_TIMEOUT_S + 15) * 1000),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn(`  ✗ falha @${handle}: ${res.status} ${txt.slice(0, 200)}`);
      return [];
    }
    const posts = (await res.json()) as ApifyPost[];
    const ms = Date.now() - t0;
    console.log(`  ✓ @${handle}: ${posts.length} posts em ${(ms / 1000).toFixed(1)}s`);
    return posts;
  } catch (err) {
    const ms = Date.now() - t0;
    console.warn(`  ✗ timeout/erro @${handle} após ${(ms / 1000).toFixed(1)}s:`, err instanceof Error ? err.message : err);
    return [];
  }
}

/** Heurística simples pra classificar template_type pelo conteúdo. */
function classifyTemplate(post: ApifyPost): string {
  const caption = (post.caption ?? "").toLowerCase();
  const dur = post.videoDuration ?? 0;

  // Tutoriais costumam ser >45s, com keyword "como" ou listas
  if (dur > 45 && (caption.includes("how to") || caption.includes("como ") || /^\d+\s+(steps|ways|tips|formas)/i.test(caption))) {
    return "tutorial";
  }
  // POVs explícitos
  if (caption.includes("pov ") || caption.startsWith("pov:")) {
    return "pov";
  }
  // Duetos / reactions
  if (caption.includes("duet") || caption.includes("react") || caption.includes("@")) {
    return "duet";
  }
  // Curtos com hook pessoal são face-cam por padrão
  if (dur <= 30) {
    return "hook_face_cam";
  }
  // Médios sem hook claro = transição cinemática
  return "transition";
}

interface LibraryRow {
  ig_url: string;
  short_code: string | null;
  author_handle: string | null;
  caption: string | null;
  thumb_url: string | null;
  likes_count: number | null;
  views_count: number | null;
  duration_seconds: number | null;
  template_type: string | null;
  hook_pattern: string | null;
  featured: boolean;
}

function postToRow(post: ApifyPost, featured: boolean): LibraryRow | null {
  if (!post.shortCode) return null;
  if (post.type !== "Video" && !post.isVideo && post.productType !== "clips") {
    return null; // não é reel
  }
  return {
    ig_url: post.url ?? `https://www.instagram.com/reel/${post.shortCode}/`,
    short_code: post.shortCode,
    author_handle: post.ownerUsername ? `@${post.ownerUsername}` : null,
    caption: post.caption?.slice(0, 600) ?? null,
    // displayUrl é o thumbnail. IG CDN tem TTL — pra MVP serve, futuro
    // cache local se thumb 403 começar a aparecer.
    thumb_url: post.displayUrl ?? null,
    likes_count: post.likesCount ?? null,
    views_count: post.videoPlayCount ?? post.videoViewCount ?? null,
    duration_seconds: post.videoDuration ? Math.round(post.videoDuration) : null,
    template_type: classifyTemplate(post),
    hook_pattern: extractHook(post.caption ?? ""),
    featured,
  };
}

/** Extrai possível "hook pattern" — primeira frase curta da caption. */
function extractHook(caption: string): string | null {
  if (!caption) return null;
  const firstLine = caption.split("\n")[0].trim();
  if (firstLine.length === 0 || firstLine.length > 140) return null;
  return firstLine;
}

async function insertRow(row: LibraryRow): Promise<boolean> {
  try {
    const result = await sql`
      INSERT INTO library_reels (
        ig_url, short_code, author_handle, caption, thumb_url,
        likes_count, views_count, duration_seconds,
        template_type, hook_pattern, featured, scraped_at
      ) VALUES (
        ${row.ig_url}, ${row.short_code}, ${row.author_handle},
        ${row.caption}, ${row.thumb_url},
        ${row.likes_count}, ${row.views_count}, ${row.duration_seconds},
        ${row.template_type}, ${row.hook_pattern}, ${row.featured}, NOW()
      )
      ON CONFLICT (ig_url) DO NOTHING
      RETURNING id
    `;
    return Array.isArray(result) && result.length > 0;
  } catch (err) {
    console.warn(`  ✗ insert fail ${row.ig_url}:`, err);
    return false;
  }
}

async function main() {
  console.log(`[seed] target=${TARGET_LIBRARY_SIZE} reels · ${HANDLES.length} handles`);
  console.log(`[seed] handles: ${HANDLES.join(", ")}\n`);

  // Confere quantos já existem (idempotência)
  const existing = (await sql`SELECT COUNT(*)::int AS n FROM library_reels`) as Array<{ n: number }>;
  console.log(`[seed] biblioteca atual: ${existing[0]?.n ?? 0} reels\n`);

  // Coleta posts de todos os handles
  const allPosts: ApifyPost[] = [];
  for (const handle of HANDLES) {
    const posts = await scrapeProfile(handle, 20);
    allPosts.push(...posts);
    // Pequeno delay entre handles pra evitar rate-limit IG
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n[seed] total posts coletados: ${allPosts.length}`);

  // Filtra só reels (vídeo) + ordena por likes desc
  const reels = allPosts
    .filter((p) => p.type === "Video" || p.isVideo || p.productType === "clips")
    .sort((a, b) => (b.likesCount ?? 0) - (a.likesCount ?? 0));
  console.log(`[seed] reels filtrados: ${reels.length}`);

  // Pega top N (top 3 viram featured)
  const top = reels.slice(0, TARGET_LIBRARY_SIZE);
  console.log(`[seed] inserindo top ${top.length}…\n`);

  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < top.length; i++) {
    const row = postToRow(top[i], i < 3);
    if (!row) {
      skipped++;
      continue;
    }
    const ok = await insertRow(row);
    if (ok) {
      inserted++;
      console.log(
        `  ✓ #${i + 1} ${row.author_handle} · ${(row.likes_count ?? 0).toLocaleString()} likes · ${row.template_type} · ${row.short_code}`,
      );
    } else {
      skipped++;
      console.log(`  · #${i + 1} já existe (${row.short_code})`);
    }
  }

  // Sanity final
  const final = (await sql`SELECT COUNT(*)::int AS n FROM library_reels`) as Array<{ n: number }>;
  console.log(`\n[seed] DONE.`);
  console.log(`  inserted: ${inserted}`);
  console.log(`  skipped:  ${skipped}`);
  console.log(`  total na biblioteca: ${final[0]?.n ?? 0} reels`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] FAILED:", err);
    process.exit(1);
  });
