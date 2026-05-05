/**
 * Resend integration — contacts/audience + tags pra automação de leads.
 *
 * Uso: depois do user submeter o gate de email+telefone, sincroniza no
 * Resend audience "Reels Viral" com tags semânticas (objetivo, tema,
 * source). A automação de envio (welcome → check-in → offer → churn)
 * roda em broadcasts agendados ou triggers no painel Resend.
 *
 * Env vars:
 *   - RESEND_API_KEY: re_xxxxx (server-side only, sem NEXT_PUBLIC_)
 *   - RESEND_AUDIENCE_ID: id da audience "Reels Viral" (criada no painel
 *     Resend — settings → audiences → "Reels Viral" → copy id)
 *
 * Falha silenciosa: se Resend cair ou key faltar, lead segue salvo no
 * Neon. Não bloqueia o unlock do roteiro pro user.
 */

import { Resend } from "resend";

let cached: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (cached) return cached;
  cached = new Resend(key);
  return cached;
}

export interface ResendLeadInput {
  email: string;
  /** Nome (opcional) — default: parte antes do @ do email. */
  firstName?: string | null;
  /** Telefone (não vai pro Resend, só pro Neon — Resend não tem campo phone). */
  phone?: string | null;
  /** Tags pra segmentação no Resend (broadcast/automação). */
  tags?: Array<{ name: string; value: string }>;
}

export interface ResendLeadResult {
  ok: boolean;
  contactId?: string;
  error?: string;
}

/**
 * Cria ou atualiza um contact na audience "Reels Viral".
 *
 * Resend não tem `upsert` — tenta create primeiro, se conflict (already
 * exists) faz update. Retorna o contactId pra persistir no Neon.
 */
export async function upsertLeadInAudience(
  input: ResendLeadInput,
): Promise<ResendLeadResult> {
  const client = getClient();
  if (!client) {
    return { ok: false, error: "RESEND_API_KEY missing" };
  }
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!audienceId) {
    return { ok: false, error: "RESEND_AUDIENCE_ID missing" };
  }

  const firstName =
    input.firstName?.trim() || input.email.split("@")[0] || "Reels Viral User";

  try {
    const res = await client.contacts.create({
      audienceId,
      email: input.email.toLowerCase().trim(),
      firstName,
      unsubscribed: false,
    });
    if (res.error) {
      // Se já existe, busca pelo email pra retornar id consistente.
      const msg = res.error.message ?? "";
      if (msg.toLowerCase().includes("already exists") || res.error.name === "validation_error") {
        return await findExistingContact(client, audienceId, input.email);
      }
      return { ok: false, error: msg };
    }
    return { ok: true, contactId: res.data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

async function findExistingContact(
  client: Resend,
  audienceId: string,
  email: string,
): Promise<ResendLeadResult> {
  try {
    // Resend permite GET por email diretamente.
    const got = await client.contacts.get({
      audienceId,
      email: email.toLowerCase().trim(),
    });
    if (got.error) return { ok: false, error: got.error.message };
    return { ok: true, contactId: got.data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/**
 * Dispara um event customizado no Resend (fire-and-forget).
 *
 * Eventos sao usados como triggers de automacao no painel Resend
 * (ex: reels.upgraded → manda email de boas-vindas pro plano pago).
 *
 * Falha silenciosa: se Resend cair ou key faltar, segue o jogo. Nao
 * bloqueia handler do webhook nem fluxo de signup.
 *
 * Endpoint nao tem SDK ainda — chamada via fetch direto.
 */
export async function fireResendEvent(
  name: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await fetch("https://api.resend.com/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, data }),
    });
  } catch (e) {
    console.warn("[resend event] failed:", name, e);
  }
}
