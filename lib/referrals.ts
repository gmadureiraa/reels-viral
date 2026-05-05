/**
 * Sistema de referral — helpers server-side (Reels Viral).
 *
 * Mecanica:
 *   - Pro referido (convidado): cupom Stripe AMIGOPRO30 (30% off 1o mes).
 *     O cupom em si vive no Stripe Dashboard como `promotion_code` global,
 *     compartilhado com Sequência Viral. Aqui apenas registramos a indicacao.
 *   - Pro referrer (quem indicou): 1 mês grátis de Pro em customer.balance no
 *     Stripe (= valor do Pro mensal) quando o referido paga primeira fatura.
 *     Abate auto na próxima cobrança. Acumula sem limite.
 *
 * Diferencas vs SV:
 *   - Postgres direto via @neondatabase/serverless (sem Supabase).
 *   - user_id é TEXT (Better Auth) em vez de UUID (Supabase auth.uid()).
 *   - Email de referrer + name vem de `neon_auth.user` (schema separado).
 *   - Acumulador `referral_credits_cents` vive em `user_profiles` (estendida).
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { stripe } from "@/lib/stripe";
import { fireResendEvent } from "@/lib/resend";
import { sendReferralConverted } from "@/lib/referral-email";
import { PLANS_RV } from "@/lib/pricing";

/**
 * Recompensa = preço cheio de 1 mês do Pro. Hoje RV usa 'basic' como nome
 * do tier pago principal — quando padronizar pra 'pro' isso ainda funciona
 * (basta atualizar a chave). Importado de PLANS_RV pra ficar em sync.
 *
 * UI mostra "1 mês grátis de Pro" — credit BRL é só o mecanismo Stripe.
 */
export const REFERRAL_REWARD_CENTS: number = PLANS_RV.basic.priceMonthly;
export const REFERRAL_REWARD_LABEL = "1 mês grátis de Pro" as const;

/**
 * Tipo do client neon (sql tagged template).
 *
 * `neon(url)` retorna `NeonQueryFunction<false, false>` por padrão (sem
 * arrayMode / sem fullResults). Usamos esse mesmo shape pra que callers
 * que constroem o sql direto não precisem castar.
 */
export type Sql = NeonQueryFunction<false, false>;

/**
 * Gera codigo de referral baseado no nome.
 *   "Gabriel Madureira" -> "GABRIEL-X8K2"
 *   ""                  -> "USER-X8K2"
 *
 * Slug: primeira palavra do nome em uppercase, ASCII-only, max 12 chars.
 * Sufixo: 4 chars random alfa-num (sem 0/1/O/I pra evitar confusao visual).
 */
const SAFE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSuffix(len = 4): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)];
  }
  return out;
}

function nameSlug(name: string | null | undefined): string {
  const raw = (name || "").trim().split(/\s+/)[0] || "USER";
  // Remove acentos e caracteres nao-ASCII, mantem so [A-Z0-9].
  const ascii = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return (ascii || "USER").slice(0, 12);
}

export function generateReferralCode(name: string | null | undefined): string {
  return `${nameSlug(name)}-${randomSuffix()}`;
}

/**
 * Busca/gera o codigo do user. Garante unicidade tentando ate 5x — colisao
 * em codigo random de ~33^4 (~1.2M) com base de users <100k e
 * extremamente improvavel, mas o loop fecha o caso degenerado.
 *
 * UPSERT em user_profiles. Se a row de profile nao existir ainda, cria com
 * apenas o referral_code preenchido (campos de criador podem ser editados
 * depois em /app/ajustes).
 */
export async function getOrCreateReferralCode(
  sql: Sql,
  userId: string,
  userName?: string | null,
): Promise<string | null> {
  // Le profile atual.
  const rows = (await sql`
    SELECT referral_code FROM user_profiles WHERE user_id = ${userId} LIMIT 1
  `) as Array<{ referral_code: string | null }>;

  if (rows[0]?.referral_code) return rows[0].referral_code;

  // Pega name do neon_auth.user se nao foi passado (fallback pra slug).
  let nameForSlug = userName ?? null;
  if (!nameForSlug) {
    try {
      const u = (await sql`
        SELECT name FROM neon_auth.user WHERE id = ${userId} LIMIT 1
      `) as Array<{ name: string | null }>;
      nameForSlug = u[0]?.name ?? null;
    } catch {
      // schema neon_auth pode nao ter grant — segue com USER-XXXX.
    }
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode(nameForSlug);

    // Checa colisao primeiro (case-insensitive).
    const exists = (await sql`
      SELECT 1 FROM user_profiles
       WHERE lower(referral_code) = lower(${code})
       LIMIT 1
    `) as Array<unknown>;
    if (exists.length > 0) continue;

    // UPSERT — cria linha se nao existir, ou seta referral_code se ainda
    // estiver NULL. Race-safe: se outro request setou um codigo entre
    // o select acima e o upsert, ON CONFLICT preserva o existente
    // graças ao COALESCE.
    try {
      await sql`
        INSERT INTO user_profiles (user_id, referral_code, updated_at)
        VALUES (${userId}, ${code}, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          referral_code = COALESCE(user_profiles.referral_code, EXCLUDED.referral_code),
          updated_at = NOW()
      `;
    } catch (err) {
      console.warn("[referrals] upsert referral_code falhou, retry:", err);
      continue;
    }

    // Re-le pra cobrir race onde outro request setou primeiro.
    const reread = (await sql`
      SELECT referral_code FROM user_profiles WHERE user_id = ${userId} LIMIT 1
    `) as Array<{ referral_code: string | null }>;
    return reread[0]?.referral_code ?? code;
  }

  console.error("[referrals] falha gerando codigo unico apos 5 tentativas");
  return null;
}

/**
 * Resolve o userId do referrer a partir de um codigo. Case-insensitive.
 * Retorna null se nao encontrou. Junta com neon_auth.user pra pegar
 * email + name (uteis pro email transacional).
 */
export async function findReferrerByCode(
  sql: Sql,
  code: string,
): Promise<{ userId: string; email: string | null; name: string | null } | null> {
  if (!code || !code.trim()) return null;
  const trimmed = code.trim();

  const rows = (await sql`
    SELECT p.user_id, u.email, u.name
      FROM user_profiles p
      LEFT JOIN neon_auth.user u ON u.id = p.user_id
     WHERE lower(p.referral_code) = lower(${trimmed})
     LIMIT 1
  `) as Array<{ user_id: string; email: string | null; name: string | null }>;

  if (rows.length === 0) return null;
  return {
    userId: rows[0].user_id,
    email: rows[0].email,
    name: rows[0].name,
  };
}

/**
 * Registra signup com referral. Insere uma linha em `user_referrals` com
 * status='signup'. Idempotente por (referrer, referred_user_id):
 * se ja existe linha pro mesmo par, nao duplica (apenas atualiza status
 * pending → signup quando faz sentido).
 *
 * Auto-referral guard: se referrer == referred, retorna sem inserir.
 */
export async function recordReferralSignup(args: {
  sql: Sql;
  referralCode: string;
  referredEmail: string;
  referredUserId: string;
}): Promise<{ ok: boolean; referrerUserId?: string; reason?: string }> {
  const { sql, referralCode, referredEmail, referredUserId } = args;
  const referrer = await findReferrerByCode(sql, referralCode);
  if (!referrer) return { ok: false, reason: "referrer_not_found" };

  if (referrer.userId === referredUserId) {
    return { ok: false, reason: "self_referral_blocked" };
  }

  // Idempotencia: se ja existe linha pra esse referred_user, atualiza ao
  // inves de duplicar (pending → signup).
  const existing = (await sql`
    SELECT id, status FROM user_referrals
     WHERE referrer_user_id = ${referrer.userId}
       AND referred_user_id = ${referredUserId}
     LIMIT 1
  `) as Array<{ id: string; status: string }>;

  if (existing.length > 0) {
    if (existing[0].status === "pending") {
      await sql`
        UPDATE user_referrals
           SET status = 'signup', signup_at = NOW()
         WHERE id = ${existing[0].id}
      `;
    }
    return { ok: true, referrerUserId: referrer.userId };
  }

  try {
    await sql`
      INSERT INTO user_referrals (
        referrer_user_id, referred_email, referred_user_id,
        referral_code, status, signup_at
      )
      VALUES (
        ${referrer.userId}, ${referredEmail.toLowerCase().trim()},
        ${referredUserId}, ${referralCode.trim()},
        'signup', NOW()
      )
      ON CONFLICT (referrer_user_id, referred_user_id) DO NOTHING
    `;
  } catch (err) {
    console.error("[referrals] insert signup falhou:", err);
    return { ok: false, reason: "insert_failed" };
  }

  return { ok: true, referrerUserId: referrer.userId };
}

/**
 * Aplica recompensa quando o referido paga. Chamado no webhook de
 * checkout.session.completed. Idempotente — se a linha ja foi marcada
 * `reward_applied`, nao credita de novo.
 *
 * Steps:
 *  1) Acha a linha user_referrals pelo referredUserId (status signup ou pending).
 *  2) Busca stripe_customer_id do referrer (em user_subscriptions).
 *  3) Cria customer.balanceTransaction de -2500 BRL (negativo = credito).
 *  4) Marca referral como converted + reward_applied=true.
 *  5) Incrementa user_profiles.referral_credits_cents do referrer (info).
 *  6) Dispara evento Resend e email transacional.
 */
export async function applyReferralReward(args: {
  sql: Sql;
  referredUserId: string;
  stripeSessionId?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const { sql, referredUserId, stripeSessionId } = args;

  const refRows = (await sql`
    SELECT id, referrer_user_id, reward_applied, status
      FROM user_referrals
     WHERE referred_user_id = ${referredUserId}
       AND status IN ('pending', 'signup')
     ORDER BY created_at ASC
     LIMIT 1
  `) as Array<{
    id: string;
    referrer_user_id: string;
    reward_applied: boolean;
    status: string;
  }>;

  if (refRows.length === 0) {
    // Nao tem indicacao pra esse user — fluxo normal, nao e erro.
    return { ok: false, reason: "no_referral" };
  }
  const referral = refRows[0];
  if (referral.reward_applied) {
    return { ok: false, reason: "already_applied" };
  }

  const referrerUserId = referral.referrer_user_id;

  // Stripe customer do referrer vem de user_subscriptions (criado quando
  // o user fez checkout — qualquer plano pago tem customer associado).
  // Tambem buscamos email + name via neon_auth.user pro email transacional
  // e o acumulador atual via user_profiles.
  const refDetails = (await sql`
    SELECT
      us.stripe_customer_id,
      u.email AS user_email,
      u.name  AS user_name,
      COALESCE(p.referral_credits_cents, 0) AS credits_cents
    FROM neon_auth.user u
    LEFT JOIN user_subscriptions us ON us.user_id = u.id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE u.id = ${referrerUserId}
    LIMIT 1
  `) as Array<{
    stripe_customer_id: string | null;
    user_email: string | null;
    user_name: string | null;
    credits_cents: number;
  }>;

  const referrerStripeCustomer = refDetails[0]?.stripe_customer_id ?? null;
  const referrerEmail = refDetails[0]?.user_email ?? null;
  const referrerName = refDetails[0]?.user_name ?? null;
  const currentCredits = refDetails[0]?.credits_cents ?? 0;

  if (!referrerStripeCustomer) {
    // Marca converted mas reward_applied=false; admin pode reprocessar
    // manualmente quando o referrer fizer checkout (e ganhar customer_id).
    console.warn(
      "[referrals] referrer sem stripe_customer_id — registrando indicacao mas sem credito Stripe imediato:",
      referrerUserId,
    );
    await sql`
      UPDATE user_referrals
         SET status = 'converted',
             conversion_at = NOW(),
             stripe_session_id = ${stripeSessionId ?? null},
             reward_amount_cents = ${REFERRAL_REWARD_CENTS}
       WHERE id = ${referral.id}
    `;
    return { ok: false, reason: "referrer_no_stripe_customer" };
  }

  // Aplica credito no Stripe customer balance.
  // Negative amount em customer balance = credito (Stripe paga o user).
  // Doc: https://stripe.com/docs/api/customer_balance_transactions/create
  try {
    await stripe.customers.createBalanceTransaction(referrerStripeCustomer, {
      amount: -REFERRAL_REWARD_CENTS,
      currency: "brl",
      description: `Indique e ganhe — 1 mês grátis de Pro (referral ${referral.id})`,
      metadata: {
        referralId: referral.id,
        referrerUserId,
        referredUserId,
        source: "rv_referral_program",
        app: "rv",
      },
    });
  } catch (err) {
    console.error("[referrals] falha criando balanceTransaction Stripe:", err);
    return { ok: false, reason: "stripe_balance_tx_failed" };
  }

  // Marca referral como converted.
  try {
    await sql`
      UPDATE user_referrals
         SET status = 'converted',
             conversion_at = NOW(),
             stripe_session_id = ${stripeSessionId ?? null},
             reward_amount_cents = ${REFERRAL_REWARD_CENTS},
             reward_applied = TRUE,
             reward_applied_at = NOW()
       WHERE id = ${referral.id}
    `;
  } catch (err) {
    console.error("[referrals] update referral falhou apos credito:", err);
    // O credito ja foi aplicado no Stripe; deixa fluxo seguir mesmo assim.
  }

  // Atualiza acumulador (info) no profile do referrer.
  // INSERT ... ON CONFLICT pra criar a row de profile se nao existir.
  const newTotal = currentCredits + REFERRAL_REWARD_CENTS;
  try {
    await sql`
      INSERT INTO user_profiles (user_id, referral_credits_cents, updated_at)
      VALUES (${referrerUserId}, ${newTotal}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        referral_credits_cents = ${newTotal},
        updated_at = NOW()
    `;
  } catch (err) {
    console.warn("[referrals] update referral_credits_cents falhou:", err);
  }

  // Email transacional + evento Resend (fire-and-forget).
  if (referrerEmail) {
    try {
      await sendReferralConverted({
        email: referrerEmail,
        name: referrerName,
        rewardCents: REFERRAL_REWARD_CENTS,
        totalCreditCents: newTotal,
      });
    } catch (err) {
      console.warn("[referrals] sendReferralConverted falhou:", err);
    }
    await fireResendEvent("reels.referral.converted", {
      email: referrerEmail,
      user_id: referrerUserId,
      reward_cents: REFERRAL_REWARD_CENTS,
      total_credit_cents: newTotal,
      referred_user_id: referredUserId,
    });
  }

  return { ok: true };
}
