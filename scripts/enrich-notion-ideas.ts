/**
 * Enriquece library_ideas com URLs de exemplo extraídos do conteúdo
 * INTERNO de cada card no Notion (children blocks via loadPageChunk).
 *
 * Cada card tem:
 *  - Um callout com "Exemplos dessa postagem: <link TikTok search>"
 *  - Eventualmente URLs IG diretos colados na descrição
 *  - Um callout/text "Como adaptar esse conteúdo para o seu nicho:"
 *
 * Idempotente: pula ideas com enriched_at != null (a menos que --force).
 *
 * Usage: bun --env-file=.env.local scripts/enrich-notion-ideas.ts
 *        bun --env-file=.env.local scripts/enrich-notion-ideas.ts --force
 */

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL ausente");
  process.exit(1);
}
const sql = neon(url);

const NOTION_DOMAIN = "https://kaleidosdigital.notion.site";
const force = process.argv.includes("--force");

interface Row {
  id: string;
  notion_id: string;
  title: string;
}

interface PageBlock {
  id?: string;
  type?: string;
  properties?: Record<string, unknown>;
  format?: { display_source?: string; source?: string };
}

interface LoadPageChunkResp {
  recordMap?: {
    block?: Record<string, { value?: { value?: PageBlock } }>;
  };
}

async function loadPage(pageId: string): Promise<LoadPageChunkResp> {
  const res = await fetch(`${NOTION_DOMAIN}/api/v3/loadPageChunk`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({
      pageId,
      limit: 50,
      chunkNumber: 0,
      cursor: { stack: [] },
      verticalColumns: false,
    }),
  });
  if (!res.ok) throw new Error(`loadPageChunk ${pageId} HTTP ${res.status}`);
  return (await res.json()) as LoadPageChunkResp;
}

interface RichText {
  text: string;
  links: string[];
}

function parseTitle(value: unknown): RichText {
  if (!Array.isArray(value)) return { text: "", links: [] };
  let text = "";
  const links: string[] = [];
  for (const seg of value) {
    if (!Array.isArray(seg) || seg.length === 0) continue;
    text += String(seg[0] ?? "");
    const annotations = seg[1];
    if (Array.isArray(annotations)) {
      for (const ann of annotations) {
        if (Array.isArray(ann) && ann[0] === "a" && typeof ann[1] === "string") {
          links.push(ann[1]);
        }
      }
    }
  }
  return { text: text.trim(), links };
}

const URL_RE = /https?:\/\/[^\s)<>"']+/gi;

interface Enriched {
  search_query: string | null;
  search_url: string | null;
  example_urls: string[];
  how_to_adapt: string | null;
}

function isExampleUrl(u: string): boolean {
  return /(?:tiktok\.com|instagram\.com|youtu\.be|youtube\.com)/i.test(u);
}

function parseEnrichment(blocks: Record<string, { value?: { value?: PageBlock } }>): Enriched {
  let searchQuery: string | null = null;
  let searchUrl: string | null = null;
  const exampleUrls = new Set<string>();
  let howToAdapt: string | null = null;

  for (const bv of Object.values(blocks)) {
    const val = bv.value?.value;
    if (!val) continue;
    const props = val.properties ?? {};
    const titleParsed = parseTitle((props as Record<string, unknown>).title);
    const text = titleParsed.text;
    const lower = text.toLowerCase();

    // 1. Detecta search TikTok
    if (lower.includes("exemplos dessa postagem")) {
      // Pega URLs (anotação primeiro, fallback regex)
      const urls = titleParsed.links.length > 0
        ? titleParsed.links
        : (text.match(URL_RE) ?? []);
      for (const u of urls) {
        const decoded = u.replace(/^https?:\/\//, "https://");
        if (decoded.includes("tiktok.com/search")) {
          if (!searchUrl) searchUrl = decoded;
          // Extrai query
          try {
            const url = new URL(decoded);
            const q = url.searchParams.get("q");
            if (q && !searchQuery) searchQuery = q;
          } catch {
            /* */
          }
        } else if (isExampleUrl(decoded)) {
          exampleUrls.add(decoded);
        }
      }
    }

    // 2. Detecta "como adaptar"
    if (lower.startsWith("como adaptar")) {
      // Texto principal pode estar nos próximos blocos ou como continuação
      // Se o block tem corpo depois do label, captura
      const afterColon = text.split(":").slice(1).join(":").trim();
      if (afterColon) howToAdapt = afterColon;
    }

    // 3. Detecta URLs IG/TT em qualquer outro texto/link
    for (const link of titleParsed.links) {
      if (isExampleUrl(link) && !link.includes("/search?")) {
        exampleUrls.add(link);
      }
    }

    // 4. Se for embed/video/bookmark, pega o source
    const fmt = val.format ?? {};
    const src = fmt.display_source || fmt.source;
    if (src && isExampleUrl(src)) {
      exampleUrls.add(src);
    }
  }

  return {
    search_query: searchQuery,
    search_url: searchUrl,
    example_urls: Array.from(exampleUrls),
    how_to_adapt: howToAdapt,
  };
}

async function processOne(row: Row): Promise<{ updated: boolean; reason?: string }> {
  const data = await loadPage(row.notion_id);
  const blocks = data.recordMap?.block ?? {};
  const enriched = parseEnrichment(blocks);
  const hasAny =
    enriched.search_url ||
    enriched.example_urls.length > 0 ||
    enriched.how_to_adapt;

  if (!hasAny) return { updated: false, reason: "no enrichment data" };

  await sql`
    UPDATE library_ideas
       SET search_query = ${enriched.search_query},
           search_url = ${enriched.search_url},
           example_urls = ${JSON.stringify(enriched.example_urls)}::jsonb,
           how_to_adapt = ${enriched.how_to_adapt},
           enriched_at = NOW()
     WHERE id = ${row.id}::uuid
  `;
  return { updated: true };
}

async function main() {
  const rows = (force
    ? ((await sql`
        SELECT id::text, notion_id, title FROM library_ideas
         WHERE notion_id IS NOT NULL
         ORDER BY position
      `) as Row[])
    : ((await sql`
        SELECT id::text, notion_id, title FROM library_ideas
         WHERE notion_id IS NOT NULL AND enriched_at IS NULL
         ORDER BY position
      `) as Row[]));

  console.log(`[enrich] ${rows.length} cards pra processar (force=${force})`);
  if (rows.length === 0) {
    console.log("[enrich] tudo em dia.");
    return;
  }

  let updated = 0;
  let empty = 0;
  let failed = 0;

  // Processa em batches de 8 paralelo
  const BATCH = 8;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const results = await Promise.allSettled(slice.map(processOne));
    results.forEach((r, idx) => {
      const row = slice[idx];
      const tag = `[${i + idx + 1}/${rows.length}] ${row.title.slice(0, 50)}`;
      if (r.status === "fulfilled") {
        if (r.value.updated) {
          updated++;
          console.log(`${tag} ✓`);
        } else {
          empty++;
          console.log(`${tag} ∅ (${r.value.reason})`);
        }
      } else {
        failed++;
        console.error(`${tag} ✗`, r.reason instanceof Error ? r.reason.message : r.reason);
      }
    });
    // Pequena pausa entre batches pra não esquentar a Notion
    if (i + BATCH < rows.length) await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n[enrich] terminou · enriched=${updated} empty=${empty} failed=${failed}`);

  const summary = (await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(search_url)::int AS with_search,
      SUM(CASE WHEN jsonb_array_length(COALESCE(example_urls, '[]'::jsonb)) > 0 THEN 1 ELSE 0 END)::int AS with_examples,
      COUNT(how_to_adapt)::int AS with_how
    FROM library_ideas
  `) as Array<{ total: number; with_search: number; with_examples: number; with_how: number }>;
  console.log("[enrich] summary:", JSON.stringify(summary[0]));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[enrich] crashed:", err);
    process.exit(1);
  });
