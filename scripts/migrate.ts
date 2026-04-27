/**
 * Migration runner — cria as tabelas necessárias no Neon.
 *
 * Rodar: `bun scripts/migrate.ts`
 *
 * Idempotente: usa CREATE TABLE IF NOT EXISTS. Pode rodar várias vezes.
 */

import { neon } from "@neondatabase/serverless";

// Bun carrega .env.local automaticamente quando rodado com `bun script.ts`.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing — cheque .env.local");
  process.exit(1);
}

const sql = neon(url);

async function main() {
  console.log("[migrate] starting…");

  // Tabela de roteiros gerados — espelha o shape do AdaptResponse mas
  // serializado como JSONB pra flexibilidade (schema do Gemini ainda
  // muda durante o MVP). Indexa user_id pra listagem rápida.
  await sql.query(`
    CREATE TABLE IF NOT EXISTS scripts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      tema TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source_owner TEXT,
      source_short_code TEXT,
      titulo TEXT NOT NULL,
      hook TEXT,
      data JSONB NOT NULL,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("[migrate] ✓ scripts");

  await sql.query(`
    CREATE INDEX IF NOT EXISTS scripts_user_idx
    ON scripts (user_id, created_at DESC);
  `);
  console.log("[migrate] ✓ scripts_user_idx");

  await sql.query(`
    CREATE INDEX IF NOT EXISTS scripts_short_code_idx
    ON scripts (source_short_code);
  `);
  console.log("[migrate] ✓ scripts_short_code_idx");

  // Cache de scrapes do Apify pra evitar custo duplicado quando 2 users
  // adaptam o mesmo reel. TTL de 24h via filter na leitura.
  await sql.query(`
    CREATE TABLE IF NOT EXISTS scrape_cache (
      short_code TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("[migrate] ✓ scrape_cache");

  // Sanity: lista as tabelas criadas no schema public.
  const rows = await sql.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  console.log("\n[migrate] tabelas no schema public:");
  for (const r of rows as Array<{ table_name: string }>) {
    console.log("  •", r.table_name);
  }
}

main()
  .then(() => {
    console.log("[migrate] done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  });
