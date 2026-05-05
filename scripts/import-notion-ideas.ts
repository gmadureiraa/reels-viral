/**
 * Importa "100 Ideias pra viralizar" da Kaleidos (Notion público).
 *
 * Flow:
 *   1. Fetch /api/v3/queryCollection no notion.site (público — sem token)
 *   2. Parse cada bloco do recordMap.block (title + formato/tipo/pirâmide)
 *   3. UPSERT em library_ideas (idempotente via notion_id UNIQUE)
 *
 * Rodar: bun --env-file=.env.local scripts/import-notion-ideas.ts
 */

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL ausente — cheque .env.local");
  process.exit(1);
}
const sql = neon(url);

// IDs extraídos do link público da Kaleidos.
const NOTION_DOMAIN = "https://kaleidosdigital.notion.site";
const COLLECTION_ID = "61da0de2-73c3-41b0-9c5e-315e25177195";
const COLLECTION_VIEW_ID = "9220050e-560f-4cb7-8160-bd5a5bbcabac";
const SPACE_ID = "8604ace1-bacd-4fd1-b832-6b8588bc47be";

interface NotionBlockProps {
  [key: string]: unknown;
}

interface NotionBlockValue {
  id: string;
  properties?: NotionBlockProps;
}

interface NotionCollectionSchemaField {
  name?: string;
  type?: string;
}

interface NotionRecordMap {
  block?: Record<string, { value?: { value?: NotionBlockValue } }>;
  collection?: Record<
    string,
    {
      value?: {
        value?: { schema?: Record<string, NotionCollectionSchemaField> };
      };
    }
  >;
}

interface QueryCollectionResponse {
  result?: {
    reducerResults?: {
      collection_group_results?: { blockIds?: string[] };
    };
  };
  recordMap?: NotionRecordMap;
}

function flattenText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((seg) => (Array.isArray(seg) && seg.length > 0 ? String(seg[0]) : ""))
      .join("")
      .trim();
  }
  return value == null ? "" : String(value);
}

async function fetchCollection(): Promise<QueryCollectionResponse> {
  const res = await fetch(`${NOTION_DOMAIN}/api/v3/queryCollection?src=initial_load`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({
      collection: { id: COLLECTION_ID, spaceId: SPACE_ID },
      collectionView: { id: COLLECTION_VIEW_ID, spaceId: SPACE_ID },
      loader: {
        reducers: {
          collection_group_results: { type: "results", limit: 200 },
        },
        searchQuery: "",
        userTimeZone: "America/Sao_Paulo",
      },
    }),
  });
  if (!res.ok) throw new Error(`queryCollection HTTP ${res.status}`);
  return (await res.json()) as QueryCollectionResponse;
}

async function main() {
  console.log("[import] fetching Notion collection…");
  const data = await fetchCollection();
  const blockIds = data.result?.reducerResults?.collection_group_results?.blockIds ?? [];
  const blocks = data.recordMap?.block ?? {};
  const collections = data.recordMap?.collection ?? {};

  console.log(`[import] ${blockIds.length} blocks recebidos`);

  // Mapa propKey -> {name, type} a partir do schema da collection
  const firstCollection = Object.values(collections)[0];
  const schema = firstCollection?.value?.value?.schema ?? {};
  const propByName: Record<string, string> = {};
  for (const [propKey, meta] of Object.entries(schema)) {
    if (meta?.name) propByName[meta.name] = propKey;
  }

  const fmtKey = propByName["Formato do Conteúdo"];
  const tipoKey = propByName["Tipo do Conteúdo"];
  const piramideKey = propByName["Pirâmide de Conteúdo"];

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < blockIds.length; i++) {
    const bid = blockIds[i];
    const val = blocks[bid]?.value?.value;
    if (!val) {
      skipped++;
      continue;
    }
    const props = val.properties ?? {};
    const title = flattenText(props.title);
    if (!title) {
      skipped++;
      continue;
    }
    const formato = fmtKey ? flattenText(props[fmtKey]) || null : null;
    const tipo = tipoKey ? flattenText(props[tipoKey]) || null : null;
    const piramide = piramideKey ? flattenText(props[piramideKey]) || null : null;

    const result = (await sql`
      INSERT INTO library_ideas (notion_id, position, title, formato, tipo, piramide, source, updated_at)
      VALUES (${bid}, ${i + 1}, ${title}, ${formato}, ${tipo}, ${piramide}, 'kaleidos-100', NOW())
      ON CONFLICT (notion_id) DO UPDATE SET
        position = EXCLUDED.position,
        title = EXCLUDED.title,
        formato = EXCLUDED.formato,
        tipo = EXCLUDED.tipo,
        piramide = EXCLUDED.piramide,
        updated_at = NOW()
      RETURNING xmax = 0 AS inserted
    `) as Array<{ inserted: boolean }>;

    if (result[0]?.inserted) inserted++;
    else updated++;
  }

  console.log(
    `\n[import] terminou · inseridos=${inserted} atualizados=${updated} pulados=${skipped}`,
  );

  const total = (await sql`SELECT COUNT(*)::int AS n FROM library_ideas`) as Array<{ n: number }>;
  console.log(`[import] total atual em library_ideas: ${total[0]?.n}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[import] crashed:", err);
    process.exit(1);
  });
