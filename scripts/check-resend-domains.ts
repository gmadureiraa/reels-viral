/**
 * Lista domínios configurados no Resend (verifica se kaleidos.com.br
 * está pronto pra mandar de reels@kaleidos.com.br).
 *
 * Rodar: `bun scripts/check-resend-domains.ts`
 */

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("RESEND_API_KEY missing");
  process.exit(1);
}

const resend = new Resend(apiKey);

async function main() {
  const list = await resend.domains.list();
  if (list.error) {
    console.error("[resend] domains.list failed:", list.error);
    process.exit(1);
  }

  const domains = list.data?.data ?? [];
  if (domains.length === 0) {
    console.log("[resend] nenhum domínio configurado.");
    console.log("\nPróximos passos:");
    console.log("  1. resend.domains.create({ name: 'kaleidos.com.br' })");
    console.log("  2. Adicionar registros DKIM/SPF no DNS (Cloudflare/Registro)");
    console.log("  3. Verificar no painel Resend ou via SDK");
    return;
  }

  console.log(`[resend] ${domains.length} domínio(s):\n`);
  for (const d of domains) {
    console.log(`  ${d.status === "verified" ? "✓" : "✗"} ${d.name}`);
    console.log(`    id: ${d.id}`);
    console.log(`    status: ${d.status}`);
    console.log(`    region: ${d.region ?? "-"}`);
    console.log(`    created: ${d.created_at ?? "-"}`);
    console.log("");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[resend] failed:", err);
    process.exit(1);
  });
