/**
 * Classifica reels da biblioteca em 1-3 categorias da taxonomia canônica.
 * Usa Gemini 2.5 Flash com response schema (1 chamada por reel, ~1.5s,
 * custo desprezível ~$0.0003/reel × 100 = $0.03 total).
 *
 * Lê: analysis_json (resumo + estrutura + porQueViralizou + padrões) +
 *     transcript + caption.
 * Escreve: library_reels.categories TEXT[].
 *
 * Idempotente: pula reels que já têm categories (a menos que --force).
 *
 * Usage:
 *   bun --env-file=.env.local scripts/classify-reels.ts          # pendentes
 *   bun --env-file=.env.local scripts/classify-reels.ts --force  # reclassifica todos
 */

import { neon } from "@neondatabase/serverless";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { SourceAnalysis } from "../lib/types";

const dbUrl = process.env.DATABASE_URL;
const geminiKey = process.env.GEMINI_API_KEY;
if (!dbUrl) {
  console.error("✗ DATABASE_URL ausente");
  process.exit(1);
}
if (!geminiKey) {
  console.error("✗ GEMINI_API_KEY ausente");
  process.exit(1);
}
const sql = neon(dbUrl);
const ai = new GoogleGenAI({ apiKey: geminiKey });

const force = process.argv.includes("--force");

export const REEL_CATEGORIES = [
  "Tutorial",
  "Storytelling",
  "Antes/Depois",
  "Lista",
  "Polêmica",
  "Bastidor",
  "Confessional",
  "Mito vs Verdade",
  "Demonstração",
  "Humor",
] as const;

export type ReelCategory = (typeof REEL_CATEGORIES)[number];

const CategorySchema = z.object({
  categories: z
    .array(z.enum(REEL_CATEGORIES))
    .min(1)
    .max(3),
  reasoning: z.string().max(1000),
});

const SYSTEM_PROMPT = `Você é um classificador de reels virais. Recebe metadata de um reel (resumo, estrutura, transcrição) e responde com 1 a 3 categorias da taxonomia abaixo.

📚 TAXONOMIA (escolha 1-3, prefira 2):

- **Tutorial** — Passo-a-passo, how-to, ensina técnica/processo concreto.
- **Storytelling** — História pessoal narrada em 1ª pessoa contínua.
- **Antes/Depois** — Transformação, evolução temporal explícita ("1 ano atrás vs hoje", glow-up).
- **Lista** — Contagem explícita ("3 razões", "X dicas", "top N").
- **Polêmica** — Opinião contrária, hot take, "ninguém fala disso", provoca posição.
- **Bastidor** — Dia na vida, behind the scenes, mostra o processo de trabalho.
- **Confessional** — Vulnerabilidade, depoimento íntimo, "vou te contar uma coisa", quebra a 4ª parede.
- **Mito vs Verdade** — Desmistifica crença comum, "todo mundo acha que X, mas...".
- **Demonstração** — Produto/serviço/resultado em ação visual concreta.
- **Humor** — Gag, joke, ironia, sátira como gancho principal.

Regras:
- Escolha as categorias que MELHOR CAPTURAM o que torna o reel funcional. NÃO marque tudo que aparece tangencialmente.
- Reels frequentemente combinam 2 categorias (ex: Tutorial+Lista, Storytelling+Confessional, Bastidor+Demonstração).
- Se o reel é claramente 1 coisa só, retorne 1 categoria.
- "reasoning": 1-2 frases explicando POR QUE essas categorias.

Responda APENAS o JSON no schema fornecido.`;

interface Row {
  id: string;
  caption: string | null;
  transcript: string | null;
  analysis_json: SourceAnalysis | null;
  categories: string[] | null;
}

async function classifyOne(row: Row): Promise<ReelCategory[] | null> {
  const a = row.analysis_json;
  if (!a) return null;

  const userBlock = `# REEL PRA CLASSIFICAR

## Resumo
${a.resumo}

## Estrutura
- Hook (${a.estrutura.hook.tempo}): "${a.estrutura.hook.texto}"
- Promessa (${a.estrutura.promessa.tempo}): "${a.estrutura.promessa.texto}"
- Demonstração (${a.estrutura.demonstracao.tempo}): "${a.estrutura.demonstracao.texto}"
- Prova social (${a.estrutura.provaSocial.tempo}): "${a.estrutura.provaSocial.texto}"
- CTA (${a.estrutura.cta.tempo}): "${a.estrutura.cta.texto}"

## Por que viralizou
${a.porQueViralizou.map((x) => "- " + x).join("\n")}

## Padrões transferíveis
${a.padroesTransferiveis.map((x) => "- " + x).join("\n")}

## Trecho do transcript (primeiras 500c)
${(row.transcript ?? "").slice(0, 500)}

# TAREFA

Classifique em 1-3 categorias. Devolva JSON.`;

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: userBlock }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      temperature: 0.3,
      topP: 0.9,
      maxOutputTokens: 512,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          categories: {
            type: "array",
            items: {
              type: "string",
              enum: [...REEL_CATEGORIES],
            },
            minItems: 1,
            maxItems: 3,
          },
          reasoning: { type: "string" },
        },
        required: ["categories", "reasoning"],
      },
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const text = result.text ?? "";
  const parsed = JSON.parse(text);
  const validation = CategorySchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(
      `Shape inválido: ${validation.error.issues[0]?.message}`,
    );
  }
  return validation.data.categories as ReelCategory[];
}

async function main() {
  const rows = (force
    ? ((await sql`
        SELECT id::text, caption, transcript, analysis_json, categories
          FROM library_reels
         WHERE analysis_json IS NOT NULL
         ORDER BY featured DESC, scraped_at DESC NULLS LAST
      `) as Row[])
    : ((await sql`
        SELECT id::text, caption, transcript, analysis_json, categories
          FROM library_reels
         WHERE analysis_json IS NOT NULL
           AND (categories IS NULL OR cardinality(categories) = 0)
         ORDER BY featured DESC, scraped_at DESC NULLS LAST
      `) as Row[]));

  console.log(`[classify] ${rows.length} reels pra classificar (force=${force})`);
  if (rows.length === 0) return;

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tag = `[${i + 1}/${rows.length}] ${r.id.slice(0, 8)}`;
    try {
      const cats = await classifyOne(r);
      if (!cats || cats.length === 0) {
        console.warn(`${tag} ⚠ sem categoria — skip`);
        fail++;
        continue;
      }
      await sql`
        UPDATE library_reels
           SET categories = ${cats}::text[]
         WHERE id = ${r.id}::uuid
      `;
      console.log(`${tag} ✓ [${cats.join(", ")}]`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} ✗`, msg);
      fail++;
    }
  }

  console.log(`\n[classify] terminou · ok=${ok} fail=${fail}`);

  // Distribuição final
  const dist = (await sql`
    SELECT cat, COUNT(*)::int AS n
      FROM library_reels, unnest(categories) AS cat
     WHERE categories IS NOT NULL
     GROUP BY cat
     ORDER BY n DESC
  `) as Array<{ cat: string; n: number }>;
  console.log("\n[classify] distribuição:");
  for (const d of dist) console.log(`  ${d.cat.padEnd(20)} ${d.n}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[classify] crashed:", err);
    process.exit(1);
  });
