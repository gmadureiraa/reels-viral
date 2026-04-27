/**
 * Neon Postgres client (HTTP, sem WebSocket — funciona em Vercel Functions).
 *
 * ⚠️ SERVER-ONLY. NUNCA importe esse módulo em código client (`"use client"`).
 * O DATABASE_URL não tem prefixo NEXT_PUBLIC_, então não vai pro bundle.
 *
 * Uso típico em rotas:
 *   import { sql } from "@/lib/db";
 *   const rows = await sql`select * from scripts where user_id = ${userId}`;
 */

import { neon, neonConfig } from "@neondatabase/serverless";

// Em Edge runtime o fetch precisa estar disponível — neon-serverless usa
// fetch global. Em Node 18+/Vercel Functions já vem por padrão.
neonConfig.fetchConnectionCache = true;

const databaseUrl = process.env.DATABASE_URL;

export const sql = databaseUrl ? neon(databaseUrl) : null;

export function isDbConfigured(): boolean {
  return Boolean(databaseUrl && databaseUrl.startsWith("postgresql://"));
}

/**
 * Garante que o `sql` está configurado — usa em rotas que dependem do DB
 * pra retornar 503 cedo em vez de explodir com TypeError.
 */
export function requireSql() {
  if (!sql) {
    throw new Error(
      "DATABASE_URL não configurado no servidor. App roda em modo guest (localStorage)."
    );
  }
  return sql;
}
