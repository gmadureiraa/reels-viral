/**
 * POST /api/lead — captura lead após user submeter email+telefone no gate
 * de unlock do roteiro.
 *
 * Fluxo:
 *  1. Valida payload (zod)
 *  2. UPSERT em `leads` table (Neon) — email é unique
 *  3. Sincroniza com Resend audience "Reels Viral" (best-effort)
 *  4. Devolve `{ ok: true, leadId }` pro client
 *
 * Não bloqueia unlock se Resend falhar — Neon save é o que importa pra
 * recuperar lead depois. Resend é canal de envio.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";
import { Resend } from "resend";
import { upsertLeadInAudience } from "@/lib/resend";
import { welcomeEmail, FROM_ADDRESS } from "@/lib/email-templates";

export const runtime = "nodejs";
export const maxDuration = 10;

const BodySchema = z.object({
  email: z.string().email().max(200),
  phone: z
    .string()
    .min(8)
    .max(40)
    .regex(/^[+\d\s\-()]+$/, "Telefone inválido"),
  firstName: z.string().max(80).optional(),
  // Contexto do roteiro pra tag downstream
  scriptId: z.string().uuid().optional(),
  sourceUrl: z.string().url().optional(),
  objetivo: z.enum(["leads", "produto", "seguidores", "engajamento"]).optional(),
  tema: z.string().max(280).optional(),
  consentMarketing: z.boolean(),
});

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL missing no servidor" },
      { status: 500 },
    );
  }

  let parsed;
  try {
    const body = await req.json();
    parsed = BodySchema.parse(body);
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues.map((i) => i.message).join(", ") : "Invalid body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const sql = neon(process.env.DATABASE_URL);
  const tags = [
    { name: "source", value: "reels-viral" },
    parsed.objetivo
      ? { name: "objetivo", value: parsed.objetivo }
      : null,
    parsed.tema
      ? { name: "tema_slug", value: slugifyTema(parsed.tema) }
      : null,
  ].filter(Boolean) as Array<{ name: string; value: string }>;

  // UPSERT no Neon — se email já existe, atualiza phone/contexto e
  // mantém id antigo. updated_at refletindo última submissão.
  const rows = (await sql`
    INSERT INTO leads (
      email, phone, first_script_id, source_url, objetivo, tema, tags, consent_marketing
    )
    VALUES (
      ${parsed.email.toLowerCase()},
      ${parsed.phone},
      ${parsed.scriptId ?? null},
      ${parsed.sourceUrl ?? null},
      ${parsed.objetivo ?? null},
      ${parsed.tema ?? null},
      ${JSON.stringify(tags)},
      ${parsed.consentMarketing}
    )
    ON CONFLICT (email) DO UPDATE SET
      phone = EXCLUDED.phone,
      first_script_id = COALESCE(leads.first_script_id, EXCLUDED.first_script_id),
      source_url = COALESCE(leads.source_url, EXCLUDED.source_url),
      objetivo = COALESCE(EXCLUDED.objetivo, leads.objetivo),
      tema = COALESCE(EXCLUDED.tema, leads.tema),
      tags = EXCLUDED.tags,
      consent_marketing = EXCLUDED.consent_marketing,
      updated_at = NOW()
    RETURNING id, resend_contact_id
  `) as Array<{ id: string; resend_contact_id: string | null }>;

  const lead = rows[0];

  // Resend sync (best-effort — não bloqueia resposta).
  let resendContactId: string | undefined;
  if (parsed.consentMarketing) {
    const resendRes = await upsertLeadInAudience({
      email: parsed.email,
      firstName: parsed.firstName ?? null,
      phone: parsed.phone,
      tags,
    });
    if (resendRes.ok && resendRes.contactId) {
      resendContactId = resendRes.contactId;
      // Atualiza Neon com id pro Resend (idempotente).
      try {
        await sql`
          UPDATE leads SET resend_contact_id = ${resendContactId}
          WHERE id = ${lead.id}
        `;
      } catch (err) {
        console.warn("[lead] update resend_contact_id failed:", err);
      }
    } else if (!resendRes.ok) {
      console.warn("[lead] Resend sync falhou:", resendRes.error);
    }
  }

  // Welcome email D+0 — só envia se ainda não foi enviado (rows.welcome_sent_at).
  // Best-effort: falha não bloqueia unlock. Marca welcome_sent_at em sucesso.
  if (parsed.consentMarketing && process.env.RESEND_API_KEY) {
    try {
      const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://reels.kaleidos.com.br";
      const scriptUrl = parsed.scriptId
        ? `${SITE}/app/meus-roteiros/${parsed.scriptId}`
        : `${SITE}/app/meus-roteiros`;
      const resend = new Resend(process.env.RESEND_API_KEY);
      const tpl = welcomeEmail({
        firstName: parsed.firstName ?? null,
        scriptUrl,
        unsubscribeUrl: `${SITE}/unsubscribe?id=${lead.id}`,
      });
      const sendRes = await resend.emails.send({
        from: FROM_ADDRESS,
        to: parsed.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
        tags: [
          { name: "stage", value: "welcome" },
          { name: "source", value: "reels-viral" },
        ],
      });
      if (!sendRes.error) {
        await sql`UPDATE leads SET welcome_sent_at = NOW() WHERE id = ${lead.id}`;
      } else {
        console.warn("[lead] welcome email error:", sendRes.error);
      }
    } catch (err) {
      console.warn("[lead] welcome send exception:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    leadId: lead.id,
    resendContactId: resendContactId ?? lead.resend_contact_id,
  });
}

/** Slug pequeno pro tema virar tag legível (kebab-case, max 60 chars). */
function slugifyTema(tema: string): string {
  return tema
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
