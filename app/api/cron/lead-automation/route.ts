/**
 * GET /api/cron/lead-automation — roda diariamente às 13h UTC (10h BRT)
 * e dispara emails da sequência de automação.
 *
 * Lógica time-based (idempotente via colunas *_sent_at):
 *  - Welcome (D+0): roda inline em /api/lead, NÃO aqui (precisa ser
 *    instant pro user receber em segundos).
 *  - Checkin (D+2): leads com welcome_sent_at entre 2-3 dias atrás
 *    e checkin_sent_at IS NULL.
 *  - Case study (D+4): mesma lógica, janela 4-5 dias.
 *  - Offer (D+7): janela 7-8 dias.
 *  - Re-engagement (D+14): janela 14-15 dias, último envio.
 *
 * Janela de 24h evita perder emails se cron falhar 1 dia. Mas dispara
 * só 1× por lead via WHERE *_sent_at IS NULL.
 *
 * Auth: Vercel injeta Authorization: Bearer ${CRON_SECRET} pra crons
 * declaradas em vercel.json. Header CRON_SECRET pra rejeitar chamadas
 * externas.
 */

import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { Resend } from "resend";
import {
  welcomeEmail,
  checkinEmail,
  caseStudyEmail,
  offerEmail,
  reEngagementEmail,
  FROM_ADDRESS,
} from "@/lib/email-templates";

export const runtime = "nodejs";
export const maxDuration = 60;

interface LeadRow {
  id: string;
  email: string;
  first_name: string | null;
  source_url: string | null;
  welcome_sent_at: string | null;
  checkin_sent_at: string | null;
  case_study_sent_at: string | null;
  offer_sent_at: string | null;
  reengagement_sent_at: string | null;
  converted_at: string | null;
  consent_marketing: boolean;
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://reels.kaleidos.com.br";

export async function GET(req: Request) {
  // Auth pro cron — Vercel manda Bearer ${CRON_SECRET} automaticamente.
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL missing" }, { status: 500 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 500 });
  }

  const sql = neon(process.env.DATABASE_URL);
  const resend = new Resend(process.env.RESEND_API_KEY);

  const counts = {
    checkin: 0,
    case_study: 0,
    offer: 0,
    reengagement: 0,
    failed: 0,
  };

  /**
   * Helper genérico — busca leads na janela e envia stage. Marca
   * `${stageColumn}_sent_at` em sucesso.
   */
  // P1-3 fix 2026-05-08: whitelist explícita pra usar em sql.unsafe.
  // Sem whitelist, qualquer string passada como stageColumn vira SQL
  // injection trivial (apesar dos callers internos hoje passarem só
  // strings hardcoded). Defesa em profundidade — bloqueia regressões
  // futuras se alguém aceitar stageColumn de input externo.
  const ALLOWED_STAGE_COLUMNS = new Set([
    "checkin_sent_at",
    "case_study_sent_at",
    "offer_sent_at",
    "reengagement_sent_at",
  ]);

  async function processStage(opts: {
    stage: keyof typeof counts;
    daysMin: number;
    daysMax: number;
    stageColumn: string;
    build: (lead: LeadRow) => { subject: string; html: string; text: string };
  }) {
    const { daysMin, daysMax, stageColumn } = opts;
    if (!ALLOWED_STAGE_COLUMNS.has(stageColumn)) {
      console.error(
        `[cron] stageColumn inválido: ${stageColumn} — abortando stage`,
      );
      return;
    }
    // Pega leads com welcome_sent_at na janela [daysMin, daysMax) dias
    // atrás, sem o stage atual enviado, com consent + sem conversão.
    const rows = (await sql.query(
      `SELECT id, email, source_url,
              welcome_sent_at, checkin_sent_at, case_study_sent_at,
              offer_sent_at, reengagement_sent_at, converted_at,
              consent_marketing,
              SPLIT_PART(email, '@', 1) AS first_name
       FROM leads
       WHERE consent_marketing = TRUE
         AND converted_at IS NULL
         AND welcome_sent_at IS NOT NULL
         AND welcome_sent_at <= NOW() - ($1 || ' days')::interval
         AND welcome_sent_at >  NOW() - ($2 || ' days')::interval
         AND ${stageColumn} IS NULL
       LIMIT 200`,
      [String(daysMin), String(daysMax)],
    )) as LeadRow[];

    for (const lead of rows) {
      const tpl = opts.build(lead);
      try {
        const sendRes = await resend.emails.send({
          from: FROM_ADDRESS,
          to: lead.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          tags: [
            { name: "stage", value: opts.stage },
            { name: "source", value: "reels-viral" },
          ],
        });
        if (sendRes.error) {
          console.warn(`[cron] ${opts.stage} send fail ${lead.email}:`, sendRes.error);
          counts.failed++;
          continue;
        }
        await sql`UPDATE leads SET ${sql.unsafe(stageColumn)} = NOW() WHERE id = ${lead.id}`;
        counts[opts.stage]++;
      } catch (err) {
        console.warn(`[cron] ${opts.stage} exception ${lead.email}:`, err);
        counts.failed++;
      }
    }
  }

  const unsubBase = (id: string) => `${SITE}/unsubscribe?id=${id}`;

  // D+2 — checkin "postou?"
  await processStage({
    stage: "checkin",
    daysMin: 2,
    daysMax: 3,
    stageColumn: "checkin_sent_at",
    build: (lead) =>
      checkinEmail({
        firstName: lead.first_name,
        postedYesUrl: `${SITE}/api/lead/feedback?id=${lead.id}&posted=yes`,
        postedNoUrl: `${SITE}/api/lead/feedback?id=${lead.id}&posted=no`,
        unsubscribeUrl: unsubBase(lead.id),
      }),
  });

  // D+4 — case study + soft offer
  await processStage({
    stage: "case_study",
    daysMin: 4,
    daysMax: 5,
    stageColumn: "case_study_sent_at",
    build: (lead) =>
      caseStudyEmail({
        firstName: lead.first_name,
        unsubscribeUrl: unsubBase(lead.id),
      }),
  });

  // D+7 — oferta assinatura
  await processStage({
    stage: "offer",
    daysMin: 7,
    daysMax: 8,
    stageColumn: "offer_sent_at",
    build: (lead) =>
      offerEmail({
        firstName: lead.first_name,
        offerUrl: `${SITE}/upgrade?promo=reels7d`,
        discountLabel: "30% off no 1º mês",
        unsubscribeUrl: unsubBase(lead.id),
      }),
  });

  // D+14 — re-engagement final
  await processStage({
    stage: "reengagement",
    daysMin: 14,
    daysMax: 15,
    stageColumn: "reengagement_sent_at",
    build: (lead) =>
      reEngagementEmail({
        firstName: lead.first_name,
        unsubscribeUrl: unsubBase(lead.id),
      }),
  });

  return NextResponse.json({ ok: true, ...counts });
}

/** welcomeEmail também exportado pra ser consumido em /api/lead (D+0). */
export { welcomeEmail };
