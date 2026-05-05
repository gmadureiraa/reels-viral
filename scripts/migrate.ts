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

  // ────────────────────────────────────────────────────────────────────
  // Subscriptions (Fase 2 — paywall + Stripe, 2026-05-01)
  // ────────────────────────────────────────────────────────────────────
  // Uma row por user. plan = 'free' | 'basic' | 'max'. Free é o default
  // implícito (user sem row = free). Basic/Max criados via webhook
  // checkout.session.completed do Stripe.
  // status: 'active' | 'past_due' | 'canceled' | 'incomplete'. Só
  // 'active' libera features; resto cai pra free.
  // current_period_end: usado pra detectar fim do ciclo (renovação ou
  // downgrade pra free). Usado também pelo cron de retention emails.
  await sql.query(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      user_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT UNIQUE,
      stripe_price_id TEXT,
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("[migrate] ✓ user_subscriptions");

  await sql.query(`
    CREATE INDEX IF NOT EXISTS user_subs_stripe_customer_idx
    ON user_subscriptions (stripe_customer_id);
  `);
  console.log("[migrate] ✓ user_subs_stripe_customer_idx");

  // ────────────────────────────────────────────────────────────────────
  // Library reels (Fase 3 — biblioteca de reels virais)
  // ────────────────────────────────────────────────────────────────────
  // Curadoria manual + scraping Apify. Each row = um reel viral indexado.
  // template_type: 'hook_face_cam' | 'transition' | 'duet' | 'pov' | etc
  // (taxonomia evolui conforme curamos). thumb_url cacheada no Neon
  // pra evitar IG CDN 403 (mesmo padrão SV: baixar sem headers, salvar).
  await sql.query(`
    CREATE TABLE IF NOT EXISTS library_reels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ig_url TEXT NOT NULL UNIQUE,
      short_code TEXT,
      author_handle TEXT,
      caption TEXT,
      thumb_url TEXT,
      likes_count INTEGER,
      views_count INTEGER,
      duration_seconds INTEGER,
      template_type TEXT,
      hook_pattern TEXT,
      tags JSONB,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      scraped_at TIMESTAMPTZ
    );
  `);
  console.log("[migrate] ✓ library_reels");

  await sql.query(`
    CREATE INDEX IF NOT EXISTS library_reels_template_idx
    ON library_reels (template_type, likes_count DESC);
  `);
  await sql.query(`
    CREATE INDEX IF NOT EXISTS library_reels_featured_idx
    ON library_reels (featured DESC, likes_count DESC);
  `);
  console.log("[migrate] ✓ library_reels indexes");

  // ────────────────────────────────────────────────────────────────────
  // AI Usage / Cost tracking (F4 — admin area, 2026-05-01)
  // ────────────────────────────────────────────────────────────────────
  // Logamos cada chamada cara (Apify scrape + Gemini Flash) com custo
  // estimado em USD. Usado pelo /admin/stats pra mostrar custo/mês,
  // breakdown por provider, breakdown por user.
  //
  // provider: 'apify' | 'gemini' | 'imagen'
  // operation: 'scrape' | 'analyze' | 'cache_hit' (cache_hit log com cost=0)
  // user_id NULL pra anônimos.
  await sql.query(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT,
      script_id UUID REFERENCES scripts(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      model TEXT,
      operation TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      success BOOLEAN NOT NULL DEFAULT TRUE,
      error_message TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("[migrate] ✓ ai_usage");

  await sql.query(`
    CREATE INDEX IF NOT EXISTS ai_usage_user_idx
    ON ai_usage (user_id, created_at DESC);
  `);
  await sql.query(`
    CREATE INDEX IF NOT EXISTS ai_usage_provider_idx
    ON ai_usage (provider, created_at DESC);
  `);
  await sql.query(`
    CREATE INDEX IF NOT EXISTS ai_usage_created_idx
    ON ai_usage (created_at DESC);
  `);
  console.log("[migrate] ✓ ai_usage indexes");

  // Tabela de eventos do webhook Stripe — idempotência.
  // Stripe retransmite em flapping de rede; sem dedup os handlers rodam 2x
  // (notificação duplicada, métrica inflada). Insert ON CONFLICT serve de
  // mutex distribuído por event.id.
  await sql.query(`
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      app TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log("[migrate] ✓ stripe_webhook_events");

  // ────────────────────────────────────────────────────────────────────
  // library_reels: cache de transcrição + análise pra evitar refazer
  // Gemini cada vez que um user paid clica num reel da biblioteca.
  // ────────────────────────────────────────────────────────────────────
  await sql.query(`
    ALTER TABLE library_reels
      ADD COLUMN IF NOT EXISTS transcript TEXT,
      ADD COLUMN IF NOT EXISTS analysis_json JSONB,
      ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS source_idea_id UUID,
      ADD COLUMN IF NOT EXISTS scene_frames JSONB
  `);
  await sql.query(`
    CREATE INDEX IF NOT EXISTS library_reels_source_idea_idx
      ON library_reels (source_idea_id) WHERE source_idea_id IS NOT NULL
  `);
  console.log("[migrate] ✓ library_reels: transcript + analysis_json + analyzed_at + source_idea_id");

  // ────────────────────────────────────────────────────────────────────
  // library_ideas: pautas/prompts de conteúdo (importadas do Notion
  // "100 Ideias pra viralizar" da Kaleidos). Diferente de library_reels
  // (que são reels reais com vídeo) — esses são apenas títulos/prompts.
  // ────────────────────────────────────────────────────────────────────
  await sql.query(`
    CREATE TABLE IF NOT EXISTS library_ideas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      notion_id TEXT UNIQUE,
      position INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      formato TEXT,
      tipo TEXT,
      piramide TEXT,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      source TEXT NOT NULL DEFAULT 'kaleidos-100',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Adiciona campos de enriquecimento (search_url, exemplos, how_to_adapt)
  // — extraídos dos children blocks da página Notion via loadPageChunk.
  await sql.query(`
    ALTER TABLE library_ideas
      ADD COLUMN IF NOT EXISTS search_query TEXT,
      ADD COLUMN IF NOT EXISTS search_url TEXT,
      ADD COLUMN IF NOT EXISTS example_urls JSONB,
      ADD COLUMN IF NOT EXISTS how_to_adapt TEXT,
      ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ
  `);
  await sql.query(`
    CREATE INDEX IF NOT EXISTS library_ideas_position_idx
    ON library_ideas (position)
  `);
  console.log("[migrate] ✓ library_ideas");

  // ────────────────────────────────────────────────────────────────────
  // user_profiles: perfil do criador pra adaptação contextualizada.
  // O @ Instagram + nicho + persona alimentam o prompt do Gemini quando
  // o user clica "Pegar pro meu perfil" num reel da biblioteca.
  // ────────────────────────────────────────────────────────────────────
  await sql.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      ig_handle TEXT,
      nicho TEXT,
      persona TEXT,
      objetivo_padrao TEXT,
      cta_padrao TEXT,
      bio_curta TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log("[migrate] ✓ user_profiles");

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
