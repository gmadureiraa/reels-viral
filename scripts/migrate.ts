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

  // Leads — capturados quando user submete email+telefone no gate de
  // unlock do roteiro. Email é unique pra evitar duplicate. Tags vem
  // serializadas em JSONB pra flexibilidade (objetivo, tema, etc).
  // Sincronizado com Resend audience pelo /api/lead.
  await sql.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      phone TEXT,
      first_script_id UUID REFERENCES scripts(id) ON DELETE SET NULL,
      source_url TEXT,
      objetivo TEXT,
      tema TEXT,
      tags JSONB,
      resend_contact_id TEXT,
      consent_marketing BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (email)
    );
  `);
  console.log("[migrate] ✓ leads");

  await sql.query(`
    CREATE INDEX IF NOT EXISTS leads_created_idx
    ON leads (created_at DESC);
  `);
  console.log("[migrate] ✓ leads_created_idx");

  // Tracking de envios da automação. Cada coluna marca timestamp do
  // envio bem-sucedido. NULL = ainda não enviado. Cron lê isso pra
  // decidir o que mandar pra cada lead a cada dia.
  // Posted feedback: yes/no/null — vem do click no link do checkin.
  // Neon serverless não aceita múltiplos statements em uma query, então
  // ALTER por coluna.
  const automationCols = [
    "welcome_sent_at TIMESTAMPTZ",
    "checkin_sent_at TIMESTAMPTZ",
    "case_study_sent_at TIMESTAMPTZ",
    "offer_sent_at TIMESTAMPTZ",
    "reengagement_sent_at TIMESTAMPTZ",
    "posted_feedback TEXT",
    "converted_at TIMESTAMPTZ",
  ];
  for (const col of automationCols) {
    await sql.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS ${col}`);
  }
  console.log("[migrate] ✓ leads automation tracking columns");

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
