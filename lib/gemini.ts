/**
 * Gemini 2.5 Flash — recebe um vídeo MP4 + briefing do user e devolve:
 *  - análise do reel original (estrutura, por que viralizou)
 *  - roteiro novo adaptado ao tema/objetivo/CTA do user
 *  - storyboard cena por cena
 *
 * Estratégia de envio do vídeo (otimizada pra Vercel Hobby cap de 60s):
 *  - <20MB: usa `inlineData` direto (base64). Pula upload/wait, ganha
 *    5-15s de latência. Reels de IG quase sempre <12MB pra <2min.
 *  - ≥20MB: usa File API com upload + polling de ACTIVE state.
 *
 * thinkingBudget=0 mantém a velocidade alta.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import type {
  AdaptBrief,
  AdaptedScript,
  SourceAnalysis,
} from "./types";

const MODEL_ID = "gemini-2.5-flash";
/** Limite oficial do Gemini pra inlineData. Acima usa File API. */
const INLINE_DATA_THRESHOLD = 20 * 1024 * 1024;

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing");
  return {
    fileManager: new GoogleAIFileManager(key),
    genAI: new GoogleGenerativeAI(key),
  };
}

/**
 * Faz upload do vídeo pro Gemini e espera ficar ACTIVE.
 * Retorna a URI pra usar em generateContent.
 */
async function uploadAndWait(
  fileManager: GoogleAIFileManager,
  videoBytes: ArrayBuffer
): Promise<string> {
  // GoogleAIFileManager.uploadFile aceita File-like ou path string.
  // Como temos ArrayBuffer, salvamos em /tmp pra passar path.
  const tmpPath = `/tmp/rv-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.mp4`;
  const { writeFile, unlink } = await import("node:fs/promises");
  await writeFile(tmpPath, Buffer.from(videoBytes));

  try {
    const upload = await fileManager.uploadFile(tmpPath, {
      mimeType: "video/mp4",
      displayName: `rv-${Date.now()}`,
    });

    let f = await fileManager.getFile(upload.file.name);
    let waited = 0;
    while (f.state === FileState.PROCESSING && waited < 60_000) {
      await new Promise((r) => setTimeout(r, 2500));
      waited += 2500;
      f = await fileManager.getFile(upload.file.name);
    }
    if (f.state !== FileState.ACTIVE) {
      throw new Error(`Gemini file not ACTIVE (state: ${f.state})`);
    }
    return upload.file.uri;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

const SYSTEM_INSTRUCTION = `Você é o "Adaptador Viral", o melhor analista de conteúdo curto (Reels/TikTok) em português brasileiro do mundo.

Sua missão: pegar um Reel viral, dissecar O QUE fez ele viralizar, e gerar um Reel NOVO que aplica a mesma estrutura ao briefing do usuário, sem soar plágio.

Princípios:
- Português brasileiro coloquial, direto, com cadência de fala (não escrita).
- Hook obrigatório nos primeiros 3 segundos. Evite "Hoje eu vou te ensinar...". Use ganchos concretos: número, surpresa, contradição, promessa específica.
- Frase curta. Verbo forte. Concretude > abstração.
- Sem emojis no roteiro falado. Emojis só na caption do post.
- O roteiro adaptado deve ter ~80% do tempo do original e replicar a CADÊNCIA de cortes (não só copiar texto).
- O CTA do user precisa estar no final, integrado naturalmente.
- B-roll precisa ser gravável: descreva o que filmar, não termos abstratos.

NUNCA invente métricas, depoimentos ou casos do user. Só use o que está no briefing.`;

/**
 * Schema do JSON de resposta. Forçado via responseSchema do Gemini.
 */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    analysis: {
      type: "object",
      properties: {
        resumo: { type: "string" },
        porQueViralizou: {
          type: "array",
          items: { type: "string" },
        },
        estrutura: {
          type: "object",
          properties: {
            hook: {
              type: "object",
              properties: {
                texto: { type: "string" },
                tempo: { type: "string" },
              },
              required: ["texto", "tempo"],
            },
            promessa: {
              type: "object",
              properties: {
                texto: { type: "string" },
                tempo: { type: "string" },
              },
              required: ["texto", "tempo"],
            },
            demonstracao: {
              type: "object",
              properties: {
                texto: { type: "string" },
                tempo: { type: "string" },
              },
              required: ["texto", "tempo"],
            },
            provaSocial: {
              type: "object",
              properties: {
                texto: { type: "string" },
                tempo: { type: "string" },
              },
              required: ["texto", "tempo"],
            },
            cta: {
              type: "object",
              properties: {
                texto: { type: "string" },
                tempo: { type: "string" },
              },
              required: ["texto", "tempo"],
            },
          },
          required: [
            "hook",
            "promessa",
            "demonstracao",
            "provaSocial",
            "cta",
          ],
        },
        padroesTransferiveis: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "resumo",
        "porQueViralizou",
        "estrutura",
        "padroesTransferiveis",
      ],
    },
    script: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        hook: { type: "string" },
        roteiroCompleto: { type: "string" },
        scenes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              n: { type: "integer" },
              tempo: { type: "string" },
              papel: {
                type: "string",
                enum: [
                  "hook",
                  "promessa",
                  "demo",
                  "prova",
                  "transicao",
                  "cta",
                ],
              },
              visual: { type: "string" },
              copy: { type: "string" },
              broll: { type: "string" },
            },
            required: ["n", "tempo", "papel", "visual", "copy"],
          },
        },
        captionSugerida: { type: "string" },
        notasProducao: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "titulo",
        "hook",
        "roteiroCompleto",
        "scenes",
        "captionSugerida",
        "notasProducao",
      ],
    },
  },
  required: ["analysis", "script"],
};

export interface AdaptResult {
  analysis: SourceAnalysis;
  script: AdaptedScript;
}

export async function adaptReelWithGemini(
  videoBytes: ArrayBuffer,
  brief: AdaptBrief,
  sourceCaption: string | undefined
): Promise<AdaptResult> {
  const { fileManager, genAI } = getClient();

  // Pra arquivos <20MB usamos inlineData (base64) direto. Pula o
  // upload+wait do File API que costumava custar 5-15s de latência.
  // Reel típico de IG (60-90s, 720p) fica entre 8-15MB.
  const useInline = videoBytes.byteLength < INLINE_DATA_THRESHOLD;
  const inlineData = useInline
    ? Buffer.from(videoBytes).toString("base64")
    : null;
  const fileUri = useInline ? null : await uploadAndWait(fileManager, videoBytes);

  const briefingBlock = `# BRIEFING DO USUÁRIO (o NOVO reel)

- **Tema central:** ${brief.tema}
- **Objetivo:** ${labelObjetivo(brief.objetivo)}
- **CTA desejado:** ${brief.cta}
${brief.persona ? `- **Persona/público:** ${brief.persona}` : ""}
${brief.nicho ? `- **Nicho:** ${brief.nicho}` : ""}

# CAPTION ORIGINAL DO REEL (pra contexto)

${sourceCaption || "(sem caption)"}

# TAREFA

1. **ANALYSIS** — Analise o reel anexado. Identifique a estrutura: hook, promessa, demo, prova, CTA. Extraia os trechos com timestamps. Liste 3-5 razões pelas quais ele viralizou. Liste 4-6 padrões transferíveis pra qualquer nicho.

2. **SCRIPT** — Gere um Reel NOVO de duração similar ao original, aplicando os mesmos padrões mas adaptado ao briefing acima. Storyboard cena a cena com tempo, papel, visual concreto (gravável), copy falada/overlay e nota de B-roll.

   - Hook nos primeiros 3s, com sintaxe de fala brasileira.
   - O roteiro completo deve poder ser lido e gravado direto, sem instruções de palco entre frases.
   - Caption sugerida em PT-BR com emojis e CTA do user.
   - Notas de produção: 3-5 dicas práticas (luz, enquadramento, ritmo de corte).

Devolva APENAS o JSON no schema fornecido. Sem prefácio, sem markdown.`;

  const model = genAI.getGenerativeModel({
    model: MODEL_ID,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      // @ts-expect-error — responseSchema é suportado mas tipo do SDK ainda não tem
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const videoPart = inlineData
    ? {
        inlineData: {
          mimeType: "video/mp4",
          data: inlineData,
        },
      }
    : {
        fileData: {
          mimeType: "video/mp4",
          fileUri: fileUri as string,
        },
      };

  const result = await model.generateContent([videoPart, { text: briefingBlock }]);

  const text = result.response.text();
  let parsed: AdaptResult;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Gemini retornou JSON inválido (${text.length} chars): ${text.slice(0, 200)}`
    );
  }

  // Sanity check: scenes tem que ter ao menos 4
  if (!parsed.script?.scenes || parsed.script.scenes.length < 4) {
    throw new Error(
      `Roteiro com poucas cenas (${parsed.script?.scenes?.length ?? 0})`
    );
  }

  return parsed;
}

function labelObjetivo(o: AdaptBrief["objetivo"]): string {
  switch (o) {
    case "leads":
      return "Gerar leads (capturar contato)";
    case "produto":
      return "Vender um produto/serviço";
    case "seguidores":
      return "Crescer seguidores";
    case "engajamento":
      return "Engajamento (comments, saves, shares)";
  }
}
