/**
 * Cost guard global — kill switch pra evitar runaway de custo Apify+Gemini.
 *
 * Lê SOFT_DAILY_CAP_USD (env var) e checa custo total do dia (UTC) na
 * tabela ai_usage. Se passou do cap:
 *  - Bloqueia geração pra users free + anônimos
 *  - Permite geração pra users pagantes (eles já pagam o produto)
 *  - Notifica via console.error pra admin investigar
 *
 * Se SOFT_DAILY_CAP_USD não setada, guard fica off (não bloqueia nada).
 *
 * Defaults sugeridos:
 *  - $5/dia: aceitável pro MVP (cap mensal ~$150 = trinta a fav)
 *  - $20/dia: produção saudável com 10-20 conversões pagas
 */

import { neon } from "@neondatabase/serverless";

const dbUrl = process.env.DATABASE_URL;

export interface CostGuardResult {
  allowed: boolean;
  reason?: "soft_cap_exceeded";
  spentTodayUsd: number;
  capUsd: number | null;
}

/**
 * Retorna se a geração deve prosseguir, dado o plano do user.
 * Free + anônimos param no cap. Pagantes nunca param (eles compraram cota).
 */
export async function checkCostGuard(
  isPaidUser: boolean,
): Promise<CostGuardResult> {
  const capRaw = process.env.SOFT_DAILY_CAP_USD;
  const capUsd = capRaw ? Number(capRaw) : null;

  // Sem cap configurado → guard off
  if (!capUsd || !Number.isFinite(capUsd) || capUsd <= 0) {
    return { allowed: true, spentTodayUsd: 0, capUsd: null };
  }

  // Pagantes sempre passam (já contribuem com receita pra cobrir cota)
  if (isPaidUser) {
    return { allowed: true, spentTodayUsd: 0, capUsd };
  }

  if (!dbUrl) {
    return { allowed: true, spentTodayUsd: 0, capUsd };
  }

  try {
    const sql = neon(dbUrl);
    const rows = (await sql`
      SELECT COALESCE(SUM(cost_usd), 0)::float AS spent
        FROM ai_usage
       WHERE created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
    `) as Array<{ spent: number }>;
    const spent = rows[0]?.spent ?? 0;

    if (spent >= capUsd) {
      console.error(
        `[cost-guard] DAILY CAP EXCEEDED: $${spent.toFixed(2)} / $${capUsd} — bloqueando free/anon até reset UTC`,
      );
      return {
        allowed: false,
        reason: "soft_cap_exceeded",
        spentTodayUsd: spent,
        capUsd,
      };
    }

    // Warn quando 80% do cap pra Gabriel intervir antes do hard stop
    if (spent >= capUsd * 0.8) {
      console.warn(
        `[cost-guard] aproximando cap: $${spent.toFixed(2)} / $${capUsd} (${Math.round((spent / capUsd) * 100)}%)`,
      );
    }

    return { allowed: true, spentTodayUsd: spent, capUsd };
  } catch (err) {
    // DB falha → libera (best-effort). Erro logado pra investigar.
    console.warn("[cost-guard] check falhou (libera):", err);
    return { allowed: true, spentTodayUsd: 0, capUsd };
  }
}
