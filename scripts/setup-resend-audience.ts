/**
 * Setup script — cria audience "Reels Viral" no Resend.
 *
 * Idempotente: lista audiences existentes, se "Reels Viral" já existe
 * só devolve o id pra adicionar no .env.local. Se não existe, cria.
 *
 * Rodar: `bun scripts/setup-resend-audience.ts`
 */

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("RESEND_API_KEY missing — add to .env.local");
  process.exit(1);
}

const resend = new Resend(apiKey);
const AUDIENCE_NAME = "Reels Viral";

async function main() {
  console.log("[resend] checking existing audiences…");
  const list = await resend.audiences.list();
  if (list.error) {
    console.error("[resend] list failed:", list.error);
    process.exit(1);
  }

  console.log("[resend] audiences existentes:");
  for (const a of list.data?.data ?? []) {
    console.log(`  • ${a.id}  ${a.name}`);
  }

  const existing = list.data?.data?.find((a) => a.name === AUDIENCE_NAME);
  if (existing) {
    console.log(`\n[resend] ✓ "${AUDIENCE_NAME}" já existe: ${existing.id}`);
    console.log(`\nAdd to .env.local + Vercel:\n  RESEND_AUDIENCE_ID=${existing.id}\n`);
    return;
  }

  console.log(`[resend] creating audience "${AUDIENCE_NAME}"…`);
  const created = await resend.audiences.create({ name: AUDIENCE_NAME });
  if (created.error) {
    console.error("[resend] create failed:", created.error);
    process.exit(1);
  }

  console.log(`[resend] ✓ created: ${created.data?.id}`);
  console.log(`\nAdd to .env.local + Vercel:\n  RESEND_AUDIENCE_ID=${created.data?.id}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[resend] failed:", err);
    process.exit(1);
  });
