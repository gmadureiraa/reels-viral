/**
 * Grant a Reels Viral plan manually (bypass Stripe).
 *
 * Use case: comp/founder/test accounts que devem ter plano pago sem
 * passar pelo Stripe checkout.
 *
 * Usage:
 *   bun --env-file=.env.local scripts/grant-plan.ts <email> <plan> [--months=12]
 *
 * Examples:
 *   bun --env-file=.env.local scripts/grant-plan.ts gf.madureiraa@gmail.com max
 *   bun --env-file=.env.local scripts/grant-plan.ts foo@bar.com basic --months=6
 *
 * Idempotente: re-runs atualizam plan/period_end (não duplicam registro).
 */

import { neon } from "@neondatabase/serverless";
import { PLANS_RV, type PlanId } from "../lib/pricing";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL ausente — cheque .env.local");
  process.exit(1);
}

const sql = neon(url);

const args = process.argv.slice(2);
const email = args[0];
const plan = args[1] as PlanId | undefined;
const monthsArg = args.find((a) => a.startsWith("--months="));
const months = monthsArg ? parseInt(monthsArg.split("=")[1], 10) : 12;

if (!email || !plan) {
  console.error("Uso: bun --env-file=.env.local scripts/grant-plan.ts <email> <plan> [--months=N]");
  console.error(`Planos válidos: ${Object.keys(PLANS_RV).join(", ")}`);
  process.exit(1);
}

if (!(plan in PLANS_RV)) {
  console.error(`✗ Plano inválido: '${plan}'`);
  console.error(`Válidos: ${Object.keys(PLANS_RV).join(", ")}`);
  process.exit(1);
}

if (Number.isNaN(months) || months <= 0) {
  console.error(`✗ --months precisa ser inteiro positivo (recebeu: ${monthsArg})`);
  process.exit(1);
}

async function main() {
  console.log(`[grant-plan] procurando user com email '${email}'…`);

  const users = (await sql`
    SELECT id, email, name FROM neon_auth.user WHERE email = ${email} LIMIT 1
  `) as Array<{ id: string; email: string; name: string | null }>;

  if (users.length === 0) {
    console.error(`✗ User '${email}' não encontrado em neon_auth.user`);
    console.error("  Verifique se o user já fez signup no app.");
    process.exit(1);
  }

  const user = users[0];
  console.log(`[grant-plan] ✓ user encontrado: ${user.name ?? "(sem nome)"} · ${user.id}`);

  const existing = (await sql`
    SELECT plan, status, current_period_end::text
      FROM user_subscriptions WHERE user_id = ${user.id}
  `) as Array<{
    plan: string;
    status: string;
    current_period_end: string | null;
  }>;

  if (existing.length > 0) {
    const cur = existing[0];
    console.log(`[grant-plan] estado atual: plan=${cur.plan} · status=${cur.status} · expira=${cur.current_period_end ?? "—"}`);
  } else {
    console.log(`[grant-plan] sem registro — vai criar novo`);
  }

  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + months);

  await sql`
    INSERT INTO user_subscriptions (
      user_id, plan, status,
      current_period_start, current_period_end,
      cancel_at_period_end, updated_at
    )
    VALUES (
      ${user.id}, ${plan}, 'active',
      ${now.toISOString()}, ${end.toISOString()},
      false, NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      plan = EXCLUDED.plan,
      status = 'active',
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = false,
      updated_at = NOW()
  `;

  console.log(`[grant-plan] ✓ ${user.email} agora tem plano '${plan}' até ${end.toISOString().slice(0, 10)}`);

  const verify = (await sql`
    SELECT plan, status, current_period_start::text, current_period_end::text
      FROM user_subscriptions WHERE user_id = ${user.id}
  `) as Array<{
    plan: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
  }>;

  console.log("[grant-plan] verificação:", JSON.stringify(verify[0], null, 2));
}

main().catch((err) => {
  console.error("✗ erro:", err);
  process.exit(1);
});
