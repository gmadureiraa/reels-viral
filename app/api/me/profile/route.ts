/**
 * GET /api/me/profile — perfil do user logado.
 * PUT /api/me/profile — atualiza perfil do user logado.
 *
 * Perfil = @ Instagram + nicho + persona + objetivo padrão + CTA padrão.
 * Usado pra adaptar reels da biblioteca direto pro perfil do user, sem
 * precisar preencher form a cada vez.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";
import { requireUserId } from "@/lib/server-auth";

export const runtime = "nodejs";

interface ProfileRow {
  user_id: string;
  ig_handle: string | null;
  nicho: string | null;
  persona: string | null;
  objetivo_padrao: string | null;
  cta_padrao: string | null;
  bio_curta: string | null;
  updated_at: string;
}

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  return neon(url);
}

export async function GET(req: Request) {
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT user_id, ig_handle, nicho, persona, objetivo_padrao,
             cta_padrao, bio_curta, updated_at::text
        FROM user_profiles
       WHERE user_id = ${auth.user.id}
       LIMIT 1
    `) as ProfileRow[];

    if (rows.length === 0) {
      return NextResponse.json({
        igHandle: null,
        nicho: null,
        persona: null,
        objetivoPadrao: null,
        ctaPadrao: null,
        bioCurta: null,
      });
    }
    const r = rows[0];
    return NextResponse.json({
      igHandle: r.ig_handle,
      nicho: r.nicho,
      persona: r.persona,
      objetivoPadrao: r.objetivo_padrao,
      ctaPadrao: r.cta_padrao,
      bioCurta: r.bio_curta,
    });
  } catch (err) {
    console.error("[/api/me/profile GET] failed:", err);
    return NextResponse.json({ error: "Falha ao carregar perfil" }, { status: 500 });
  }
}

const PutSchema = z.object({
  igHandle: z.string().trim().min(1).max(64).nullable().optional(),
  nicho: z.string().trim().max(120).nullable().optional(),
  persona: z.string().trim().max(280).nullable().optional(),
  objetivoPadrao: z.enum(["leads", "produto", "seguidores", "engajamento"]).nullable().optional(),
  ctaPadrao: z.string().trim().max(280).nullable().optional(),
  bioCurta: z.string().trim().max(500).nullable().optional(),
});

function normalizeIgHandle(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Remove @ inicial e URL prefix se user colar perfil completo
  return trimmed
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/\/+$/, "")
    .replace(/^@/, "");
}

export async function PUT(req: Request) {
  const auth = await requireUserId(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const igHandle = normalizeIgHandle(data.igHandle);
  const nicho = data.nicho?.trim() || null;
  const persona = data.persona?.trim() || null;
  const objetivoPadrao = data.objetivoPadrao || null;
  const ctaPadrao = data.ctaPadrao?.trim() || null;
  const bioCurta = data.bioCurta?.trim() || null;

  try {
    const sql = getSql();
    await sql`
      INSERT INTO user_profiles (
        user_id, ig_handle, nicho, persona,
        objetivo_padrao, cta_padrao, bio_curta, updated_at
      )
      VALUES (
        ${auth.user.id}, ${igHandle}, ${nicho}, ${persona},
        ${objetivoPadrao}, ${ctaPadrao}, ${bioCurta}, NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        ig_handle = EXCLUDED.ig_handle,
        nicho = EXCLUDED.nicho,
        persona = EXCLUDED.persona,
        objetivo_padrao = EXCLUDED.objetivo_padrao,
        cta_padrao = EXCLUDED.cta_padrao,
        bio_curta = EXCLUDED.bio_curta,
        updated_at = NOW()
    `;
    return NextResponse.json({
      ok: true,
      profile: {
        igHandle,
        nicho,
        persona,
        objetivoPadrao,
        ctaPadrao,
        bioCurta,
      },
    });
  } catch (err) {
    console.error("[/api/me/profile PUT] failed:", err);
    return NextResponse.json({ error: "Falha ao salvar" }, { status: 500 });
  }
}
