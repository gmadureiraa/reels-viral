/**
 * Email "Você ganhou R$ 25 em crédito" — disparado pelo webhook Stripe
 * quando uma indicação converte (referido pagou primeira fatura).
 *
 * Visual: cream + REC coral, alinhado com email-templates.ts. HTML inline
 * pra max compat com clients (Outlook, Gmail web, Apple Mail).
 *
 * From: `Reels Viral <reels@news.kaleidos.com.br>` (subdomínio verificado)
 * Reply-to: `madureira@kaleidosdigital.com`
 *
 * Template alias no Resend (se quiser usar Templates API): `reels-referral-converted-v1`.
 * Por padrão mandamos via emails.send com HTML inline pra garantir paridade
 * com os outros emails transacionais do app (welcome, checkin, etc).
 */

import { Resend } from "resend";

const REC_CORAL = "#FF3D2E";
const CREAM = "#F5F1E8";
const INK = "#1A1A1A";
const MUTED = "#7A7A7A";

const FROM_DEFAULT = "Reels Viral <reels@news.kaleidos.com.br>";
const REPLY_TO = "madureira@kaleidosdigital.com";

function formatBrl(cents: number): string {
  const v = cents / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(v);
}

interface ReferralConvertedProps {
  email: string;
  name?: string | null;
  rewardCents: number;
  totalCreditCents: number;
}

export function buildReferralConvertedEmail(p: ReferralConvertedProps) {
  const firstName = (p.name ?? p.email.split("@")[0] ?? "criador").split(" ")[0];
  const reward = formatBrl(p.rewardCents);
  const total = formatBrl(p.totalCreditCents);
  const SITE =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://reels.kaleidos.com.br";
  const referralsUrl = `${SITE}/app/ajustes/indicacoes`;

  const subject = "Você ganhou R$ 25 em crédito";
  const preheader = `Um amigo seu acabou de assinar o Reels Viral — ${reward} caíram no seu saldo.`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reels Viral</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${INK};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${CREAM};opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};padding:32px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border:1.5px solid ${INK};border-radius:0;box-shadow:6px 6px 0 0 ${INK}">
<tr><td style="padding:32px 32px 0">
  <div style="display:inline-flex;align-items:center;gap:8px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:#fff;background:${REC_CORAL};padding:6px 12px;border:1.5px solid ${INK}">
    <span style="display:inline-block;width:8px;height:8px;background:#fff;border-radius:50%"></span>
    INDIQUE E GANHE
  </div>
</td></tr>
<tr><td style="padding:24px 32px">
  <h1 style="font-family:-apple-system,sans-serif;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;margin:0 0 12px;color:${INK}">
    ${firstName}, você acabou de ganhar ${reward}.
  </h1>
  <p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 16px">
    Um amigo seu acabou de assinar o Reels Viral usando seu link de indicação. Como combinado, <strong>${reward}</strong> entraram no seu saldo agora.
  </p>
  <div style="margin:24px 0;padding:18px 20px;background:${CREAM};border-left:4px solid ${REC_CORAL};color:${INK};font-size:14px;line-height:1.5">
    <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:${MUTED};margin-bottom:6px">Crédito acumulado</div>
    <div style="font-size:24px;font-weight:800;letter-spacing:-0.02em">${total}</div>
    <div style="font-size:12px;color:${MUTED};margin-top:4px">vai abater automático na sua próxima fatura</div>
  </div>
  <div style="margin:24px 0">
    <a href="${referralsUrl}" style="display:inline-block;background:${INK};color:#fff;font-weight:700;padding:14px 24px;text-decoration:none;border:1.5px solid ${INK};box-shadow:4px 4px 0 0 ${REC_CORAL};font-size:13px;letter-spacing:0.04em;text-transform:uppercase">
      Ver minhas indicações →
    </a>
  </div>
  <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:24px 0 0">
    Continua valendo: cada amigo novo que assinar com seu link te dá <strong>${reward}</strong> de crédito. Sem limite de indicações, e os créditos acumulam.
  </p>
  <p style="font-size:14px;line-height:1.6;color:${INK};margin:24px 0 0">
    No flow,<br>
    <strong>Madureira</strong> · Reels Viral
  </p>
</td></tr>
<tr><td style="padding:24px 32px 32px;border-top:1px solid #eee;color:${MUTED};font-size:11px;line-height:1.5">
  Você está recebendo isso porque indicou alguém pelo programa Indique-e-Ganhe do <strong>Reels Viral</strong>.<br>
  <a href="${SITE}" style="color:${MUTED};text-decoration:underline">reels.kaleidos.com.br</a>
</td></tr>
</table>
<div style="font-family:-apple-system,sans-serif;color:${MUTED};font-size:11px;margin-top:16px">
  Kaleidos Digital · Brasil
</div>
</td></tr>
</table>
</body>
</html>`;

  const text = `${firstName}, você acabou de ganhar ${reward}.

Um amigo seu acabou de assinar o Reels Viral usando seu link de indicação. ${reward} entraram no seu saldo agora.

Crédito total acumulado: ${total} — vai abater automático na sua próxima fatura.

Ver minhas indicações: ${referralsUrl}

Continua valendo: cada amigo novo que assinar com seu link te dá ${reward}. Sem limite, créditos acumulam.

No flow,
Madureira · Reels Viral`;

  return { subject, html, text };
}

/**
 * Dispara o email de referral converted via Resend.
 * Best-effort, falha silenciosa.
 */
export async function sendReferralConverted(
  p: ReferralConvertedProps,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[referral-email] RESEND_API_KEY missing, skipping send");
    return;
  }
  try {
    const resend = new Resend(apiKey);
    const tpl = buildReferralConvertedEmail(p);
    const res = await resend.emails.send({
      from: FROM_DEFAULT,
      to: p.email,
      replyTo: REPLY_TO,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tags: [
        { name: "stage", value: "referral-converted" },
        { name: "source", value: "reels-viral" },
      ],
    });
    if (res.error) {
      console.warn("[referral-email] resend error:", res.error);
    }
  } catch (err) {
    console.warn("[referral-email] send failed:", err);
  }
}
