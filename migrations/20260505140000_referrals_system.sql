-- 20260505140000_referrals_system.sql
-- Sistema de referral pro Reels Viral.
--
-- Mecânica:
--   - Pro referido (convidado): cupom Stripe AMIGOPRO30 (30% off no 1º mês),
--     criado manualmente no Stripe Dashboard (cupom global). Esse arquivo
--     não cria o cupom — só registra a indicação.
--   - Pro referrer (quem indicou): R$ 25,00 em customer.balance no Stripe
--     quando o referido paga primeira fatura. Acumula sem limite.
--
-- ⚠️ Neon (não Supabase) — usamos `neon_auth.user` (Better Auth) como
-- fonte de truth dos users. user_id é TEXT (não UUID).
--
-- Idempotente — todas as alterações usam IF NOT EXISTS / DROP IF EXISTS.

-- ============================================================
-- USER_PROFILES — referral_code unico + acumulador de creditos
-- ============================================================
-- A tabela user_profiles já existe (criada em scripts/migrate.ts pra perfil
-- de criador). Estendemos com referral_code + acumulador de créditos.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS referral_credits_cents INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_referral_code_unique
  ON user_profiles ((lower(referral_code)))
  WHERE referral_code IS NOT NULL;

-- ============================================================
-- USER_REFERRALS — historico de cada indicacao
-- ============================================================
-- Sem FK pra neon_auth.user (schema separado, não dá pra REFERENCE
-- cross-schema sem grants extras). user_id é TEXT pra bater com
-- user_subscriptions.user_id.
CREATE TABLE IF NOT EXISTS user_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id TEXT NOT NULL,
  referred_email TEXT NOT NULL,
  referred_user_id TEXT,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signup', 'converted', 'expired')),
  signup_at TIMESTAMPTZ,
  conversion_at TIMESTAMPTZ,
  stripe_session_id TEXT,
  reward_amount_cents INTEGER NOT NULL DEFAULT 0,
  reward_applied BOOLEAN NOT NULL DEFAULT FALSE,
  reward_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_referrals_referrer_idx
  ON user_referrals (referrer_user_id);
CREATE INDEX IF NOT EXISTS user_referrals_code_idx
  ON user_referrals (referral_code);
CREATE INDEX IF NOT EXISTS user_referrals_status_idx
  ON user_referrals (status);
CREATE INDEX IF NOT EXISTS user_referrals_referred_user_idx
  ON user_referrals (referred_user_id);

-- Idempotência por par (referrer, referred_user). Permite ON CONFLICT no insert.
CREATE UNIQUE INDEX IF NOT EXISTS user_referrals_pair_unique
  ON user_referrals (referrer_user_id, referred_user_id)
  WHERE referred_user_id IS NOT NULL;
