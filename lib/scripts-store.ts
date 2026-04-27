/**
 * Persistência de roteiros adaptados — server-side, Neon Postgres.
 *
 * SERVER-ONLY. Importe só de rotas /api/*.
 *
 * Modelo: cada user logado tem N roteiros. Cache de scrape por shortCode
 * pra evitar pagar Apify duas vezes pelo mesmo Reel em <24h.
 */

import { requireSql } from "./db";
import type { AdaptResponse } from "./types";

export interface SavedScriptRow {
  id: string;
  userId: string;
  tema: string;
  titulo: string;
  hook: string | null;
  sourceUrl: string;
  sourceOwner: string | null;
  sourceShortCode: string | null;
  data: AdaptResponse;
  durationMs: number | null;
  createdAt: string;
}

const CACHE_TTL_HOURS = 24;

export async function saveScriptToDb(args: {
  userId: string;
  tema: string;
  data: AdaptResponse;
}): Promise<SavedScriptRow> {
  const sql = requireSql();
  const { userId, tema, data } = args;
  const rows = (await sql.query(
    `INSERT INTO scripts (
      user_id, tema, source_url, source_owner, source_short_code,
      titulo, hook, data, duration_ms
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
    RETURNING id, user_id, tema, source_url, source_owner, source_short_code,
              titulo, hook, data, duration_ms, created_at`,
    [
      userId,
      tema,
      data.source.url,
      data.source.ownerUsername ?? null,
      data.source.shortCode ?? null,
      data.script.titulo,
      data.script.hook ?? null,
      JSON.stringify(data),
      data.durationMs ?? null,
    ]
  )) as Array<{
    id: string;
    user_id: string;
    tema: string;
    source_url: string;
    source_owner: string | null;
    source_short_code: string | null;
    titulo: string;
    hook: string | null;
    data: AdaptResponse;
    duration_ms: number | null;
    created_at: string;
  }>;

  if (!rows.length) {
    throw new Error("INSERT não retornou linha");
  }
  return rowToScript(rows[0]);
}

export async function listScriptsForUser(
  userId: string,
  limit = 50
): Promise<SavedScriptRow[]> {
  const sql = requireSql();
  const rows = (await sql.query(
    `SELECT id, user_id, tema, source_url, source_owner, source_short_code,
            titulo, hook, data, duration_ms, created_at
     FROM scripts
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  )) as Array<Parameters<typeof rowToScript>[0]>;
  return rows.map(rowToScript);
}

export async function getScriptById(
  id: string,
  userId: string
): Promise<SavedScriptRow | null> {
  const sql = requireSql();
  const rows = (await sql.query(
    `SELECT id, user_id, tema, source_url, source_owner, source_short_code,
            titulo, hook, data, duration_ms, created_at
     FROM scripts
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [id, userId]
  )) as Array<Parameters<typeof rowToScript>[0]>;
  return rows.length > 0 ? rowToScript(rows[0]) : null;
}

export async function deleteScript(
  id: string,
  userId: string
): Promise<boolean> {
  const sql = requireSql();
  const rows = (await sql.query(
    `DELETE FROM scripts WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId]
  )) as Array<{ id: string }>;
  return rows.length > 0;
}

// ── Scrape cache ─────────────────────────────────────────────────────────────

export async function getCachedScrape(
  shortCode: string
): Promise<unknown | null> {
  const sql = requireSql();
  const rows = (await sql.query(
    `SELECT payload, created_at
     FROM scrape_cache
     WHERE short_code = $1
       AND created_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'
     LIMIT 1`,
    [shortCode]
  )) as Array<{ payload: unknown; created_at: string }>;
  return rows.length > 0 ? rows[0].payload : null;
}

export async function setCachedScrape(
  shortCode: string,
  payload: unknown
): Promise<void> {
  const sql = requireSql();
  await sql.query(
    `INSERT INTO scrape_cache (short_code, payload)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (short_code) DO UPDATE
     SET payload = EXCLUDED.payload, created_at = NOW()`,
    [shortCode, JSON.stringify(payload)]
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowToScript(row: {
  id: string;
  user_id: string;
  tema: string;
  source_url: string;
  source_owner: string | null;
  source_short_code: string | null;
  titulo: string;
  hook: string | null;
  data: AdaptResponse;
  duration_ms: number | null;
  created_at: string;
}): SavedScriptRow {
  return {
    id: row.id,
    userId: row.user_id,
    tema: row.tema,
    titulo: row.titulo,
    hook: row.hook,
    sourceUrl: row.source_url,
    sourceOwner: row.source_owner,
    sourceShortCode: row.source_short_code,
    data: row.data,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}
