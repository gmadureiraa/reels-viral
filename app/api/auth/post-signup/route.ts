/**
 * POST /api/auth/post-signup
 *
 * Hook server-side disparado pelo client logo apos signup bem-sucedido
 * (Google OAuth ou email/senha). Mantem RESEND_API_KEY fora do bundle
 * client.
 *
 * Faz duas coisas (best-effort, fire-and-forget pro user):
 *  1. Upsert do contact na audience "Reels Viral" com tags signup/free
 *  2. Fire `reels.signup` event pra trigger automacao (welcome paid path
 *     diferente do lead-gate)
 *
 * Idempotente: pode ser chamado N vezes pro mesmo user sem efeito
 * colateral negativo (Resend audience trata dup como update).
 *
 * Quirk Google OAuth via Better Auth: o client.signIn.social redireciona
 * pro provider e volta no callbackURL. O dispatch desse hook acontece
 * no parent quando o useNeonSession() detecta user logado pela primeira
 * vez na sessao do browser. Ver components/auth-dialog.tsx + hook em
 * useNeonSession() pra trigger de fato (TODO consumer).
 *
 * Segurança (P0 fix 2026-05-08): exige Bearer JWT do Neon Auth e
 * confere `payload.email === body.email` (case-insensitive trim) pra
 * impedir email bombing / envenenamento da audience Resend.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertLeadInAudience, fireResendEvent } from "@/lib/resend";
import { requireUserId } from "@/lib/server-auth";
import { captureServerEvent } from "@/lib/posthog-server";

export const runtime = "nodejs";
export const maxDuration = 10;

const BodySchema = z.object({
  email: z.string().email().max(200),
  name: z.string().max(120).optional().nullable(),
  /** "google" | "email" — propaga pra event payload pra segmentacao. */
  method: z.enum(["google", "email"]).optional(),
});

export async function POST(req: Request) {
  // 0. Auth obrigatória — só user logado dispara hook do próprio signup.
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;

  let parsed;
  try {
    const body = await req.json();
    parsed = BodySchema.parse(body);
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues.map((i) => i.message).join(", ")
        : "Invalid body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const email = parsed.email.toLowerCase().trim();
  const firstName = parsed.name?.trim() || null;
  const method = parsed.method ?? "email";

  // Confere email do body x email do JWT — protege contra um user logado
  // disparar hook com email arbitrário. Fail-closed se JWT não traz email.
  const tokenEmail = (auth.user.email ?? "").toLowerCase().trim();
  if (!tokenEmail || tokenEmail !== email) {
    return NextResponse.json(
      { error: "email do body não confere com a sessão." },
      { status: 403 }
    );
  }

  // 1. Audience sync (best-effort)
  const tags = [
    { name: "source", value: "signup" },
    { name: "plan", value: "free" },
    { name: "method", value: method },
  ];
  const resendRes = await upsertLeadInAudience({
    email,
    firstName,
    tags,
  });
  if (!resendRes.ok) {
    console.warn("[post-signup] audience sync failed:", resendRes.error);
  }

  // 2. Event trigger (fire-and-forget)
  await fireResendEvent("reels.signup", {
    email,
    first_name: firstName,
    source: "signup",
    plan: "free",
    method,
  });

  await captureServerEvent(auth.user.id, "user_signed_up", {
    method,
    email,
    plan: "free",
  });

  return NextResponse.json({
    ok: true,
    contactId: resendRes.contactId,
  });
}
