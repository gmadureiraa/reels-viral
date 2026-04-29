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

// Migração 28/04: @google/generative-ai (deprecated) → @google/genai (SDK
// novo unificado). Mesma capacidade de inlineData + Files API. SV já roda
// nesse SDK em prod — paridade entre produtos do combo.
import { GoogleGenAI } from "@google/genai";
import type {
  AdaptBrief,
  AdaptedScript,
  SourceAnalysis,
} from "./types";

const MODEL_ID = "gemini-2.5-flash";
/** Limite oficial do Gemini pra inlineData. Acima usa File API. */
const INLINE_DATA_THRESHOLD = 20 * 1024 * 1024;

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing");
  return new GoogleGenAI({ apiKey: key });
}

/**
 * Faz upload do vídeo pro Gemini Files API e espera ficar ACTIVE.
 * Retorna a URI pra usar em generateContent. Agora via SDK novo.
 */
async function uploadAndWait(
  ai: GoogleGenAI,
  videoBytes: ArrayBuffer
): Promise<string> {
  // SDK novo aceita Blob/File diretamente. Tratamos ArrayBuffer com Blob
  // pra evitar gravar em /tmp (frágil em cold-start). Mais seguro que
  // versão anterior que usava `node:fs/promises`.
  const blob = new Blob([videoBytes], { type: "video/mp4" });
  const upload = await ai.files.upload({
    file: blob,
    config: {
      mimeType: "video/mp4",
      displayName: `rv-${Date.now()}`,
    },
  });

  let f = await ai.files.get({ name: upload.name as string });
  let waited = 0;
  while (f.state === "PROCESSING" && waited < 60_000) {
    await new Promise((r) => setTimeout(r, 2500));
    waited += 2500;
    f = await ai.files.get({ name: upload.name as string });
  }
  if (f.state !== "ACTIVE") {
    throw new Error(`Gemini file not ACTIVE (state: ${f.state})`);
  }
  return upload.uri as string;
}

const SYSTEM_INSTRUCTION = `Você é o "Adaptador Viral" — pega um Reel viral existente e gera um Reel NOVO que **REPLICA A ESTRUTURA NARRATIVA EXATA** do original mas com o conteúdo adaptado ao briefing do usuário.

🔒 REGRA #1 INVIOLÁVEL — FIDELIDADE ESTRUTURAL

O reel anexado é a REFERÊNCIA SAGRADA. Você NÃO pode improvisar uma estrutura nova. Você NÃO pode pular direto pra venda. Você DEVE espelhar o original beat por beat.

Pra cada cena do original, você gera UMA cena equivalente no novo reel — mesma função narrativa, mesmo ritmo emocional, mesma duração aproximada. Se o original começa com cena íntima de bastidor, você começa com cena íntima de bastidor (adaptada). Se o original conta uma história pessoal antes de mostrar produto, você conta uma história pessoal antes de mostrar produto. Se o original tem 4 segundos de pausa antes do clímax, você tem 4 segundos de pausa antes do clímax.

❌ ERRO COMUM A EVITAR: "tema = vendas → roteiro = pitch direto". NÃO. Se o original NÃO é pitch direto, o seu também não é. Replique o JEITO de chegar até a venda — não atalhe.

🔒 REGRA #2 — ADAPTAÇÃO É SÓ DE CONTEÚDO

O QUE muda: nicho, exemplos, números, casos, palavras específicas, CTA final.
O QUE NÃO muda: ordem das cenas, tom emocional de cada cena, tempo aproximado de cada bloco, recursos narrativos (analogias, contradições, revelações), abertura, fechamento, ritmo.

Exemplo prático: se o original abre com "Acabei de abrir o olho, tô na cama ainda e tô com vontade de criar um app", e o user é de fitness, o seu novo reel abre com "Acabei de acordar, antes do café, e tô vendo essa cena que mudou meu treino" — mesma estrutura íntima/pessoal, mesma sensação de bastidor, mesma sintaxe de fala. NÃO troca por "Hoje vou te ensinar 3 dicas pra emagrecer" — isso é uma estrutura completamente diferente.

🔒 REGRA #3 — REPLIQUE A CADÊNCIA DE CORTES

Conte os cortes do original. Se ele tem 12 cortes em 60s, seu novo reel tem 12 cortes em 60s. A duração aproximada de cada bloco é parte do código viral — perdeu isso, perdeu o ritmo.

🔒 REGRA #4 — IDIOMA E TOM

Português brasileiro coloquial, com cadência de fala (não de escrita). Use o tom emocional EXATO do original: se o original é íntimo/contemplativo, o seu é íntimo/contemplativo. Se é energético/punchy, é energético/punchy. Se é provocador/ousado, é provocador/ousado.

❌ Não normalize pra "guru de marketing motivacional". Cada reel viral tem uma voz específica — preserve.

🔒 REGRA #5 — CONTEÚDO

- Frase curta. Verbo forte. Concretude > abstração.
- Sem emojis no roteiro falado. Emojis só na caption do post.
- B-roll gravável: descreva o que FILMAR, não conceitos abstratos.
- NUNCA invente métricas, depoimentos ou casos do user. Só use o que está no briefing.
- O CTA do user vai onde o CTA original estava — não antes, não depois.

🔒 REGRA #6 — VOCÊ NÃO É UM COPYWRITER DE VENDAS

Você é um ENGENHEIRO REVERSO de viralidade. Sua tarefa é decifrar o código de um reel que funcionou e replicar esse código com novo conteúdo. Pense como um músico fazendo cover de uma música: a melodia é a mesma, a letra muda. Não vire um compositor original.

Se o reel original passa 40 segundos contando uma história antes de chegar no produto, o seu também passa 40 segundos contando uma história antes de chegar no produto. Pular esses 40 segundos = pular o motivo do reel ter viralizado.`;

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
  const ai = getClient();

  // Pra arquivos <20MB usamos inlineData (base64) direto. Pula o
  // upload+wait do File API que costumava custar 5-15s de latência.
  // Reel típico de IG (60-90s, 720p) fica entre 8-15MB.
  const useInline = videoBytes.byteLength < INLINE_DATA_THRESHOLD;
  const inlineData = useInline
    ? Buffer.from(videoBytes).toString("base64")
    : null;
  const fileUri = useInline ? null : await uploadAndWait(ai, videoBytes);

  const briefingBlock = `# REEL DE REFERÊNCIA (anexado)

Esse reel é a SUA REFERÊNCIA SAGRADA. Você vai espelhar a estrutura dele beat por beat. Caption original (contexto):

> ${sourceCaption || "(sem caption)"}

# BRIEFING DO USUÁRIO — só pra trocar o conteúdo, NÃO pra mudar a estrutura

- **Tema do meu reel:** ${brief.tema}
- **Objetivo:** ${labelObjetivo(brief.objetivo)}
- **CTA desejado (vai onde o CTA original estava):** ${brief.cta}
${brief.persona ? `- **Persona/público:** ${brief.persona}` : ""}
${brief.nicho ? `- **Nicho:** ${brief.nicho}` : ""}

⚠️ ATENÇÃO: o "tema" acima NÃO é uma instrução pra escrever um pitch sobre esse tema. É uma indicação de QUAL conteúdo substituir nas cenas existentes. A estrutura, ritmo, tom emocional, cadência de cortes — TUDO isso vem do reel anexado.

# TAREFA EM 2 PARTES

## PARTE 1 — ANALYSIS (engenharia reversa do reel anexado)

Disseque o reel anexado de forma CONCRETA, não genérica:

- **resumo**: 1 frase descrevendo o reel (não o tema, mas O QUE ELE FAZ — ex: "criador conta uma história pessoal de fracasso → tese → demo passo-a-passo do produto").
- **estrutura**: identifique TIMESTAMP exato de cada bloco com a frase EXATA falada (cite literalmente). Cada bloco deve ter texto + tempo no formato "00:00–00:08".
- **porQueViralizou**: 3-5 razões NÃO-ÓBVIAS. Não diga "o hook é forte"; diga *POR QUE* aquele hook específico funciona (ex: "começa em 1ª pessoa íntima — quebra a 4ª parede de criador-no-pedestal e gera proximidade imediata").
- **padroesTransferiveis**: 4-6 mecanismos narrativos transferíveis (ex: "história pessoal antes do produto", "contradição com o senso comum no minuto 1", "depoimento implícito via auto-referência: 'esse vídeo foi feito com a ferramenta'").

## PARTE 2 — SCRIPT (espelho com novo conteúdo)

Replique CADA cena do reel original com novo conteúdo adaptado ao briefing. Mesma quantidade de cenas, mesma duração aproximada por cena, mesmo papel narrativo.

**Como pensar:** olhe a cena 1 do original. Pergunte: "Qual a função narrativa dela?" (ex: "abertura íntima de bastidor", "revelação de problema", "punchline de prova"). Depois escreva uma cena 1 nova com a MESMA função, mas usando o tema/nicho do briefing.

NUNCA pule cenas pra "ir direto à venda". Se o original demora 40s contando história antes de mostrar o produto, o seu também demora 40s.

Pra cada cena, devolva:
- **n**: número (1-indexed)
- **tempo**: range no formato "00:00–00:03"
- **papel**: hook | promessa | demo | prova | transicao | cta
- **visual**: O QUE FILMAR. Concreto, gravável. Ex: "Close de rosto na cama, luz natural fraca de manhã, expressão sonolenta" — NÃO "cena introdutória abstrata"
- **copy**: a frase EXATA que o user fala em voz, em PT-BR coloquial com sintaxe de fala. Espelhe o ritmo da cena equivalente do original
- **broll**: dica de filmagem (ângulo, movimento, prop)

Outros campos:
- **titulo**: título descritivo do reel (não vai aparecer falado — só pro user identificar)
- **hook**: a frase exata da primeira cena (espelho do hook original com novo conteúdo)
- **roteiroCompleto**: TODAS as falas concatenadas em texto corrido, do jeito que o user vai gravar. Sem instruções de palco. Só fala.
- **captionSugerida**: caption pro post em PT-BR, espelhando o tom da caption original. Pode ter emojis. Termina com o CTA do briefing.
- **notasProducao**: 3-5 dicas práticas (luz, enquadramento, ritmo de corte) específicas pra esse reel — não genéricas.

Devolva APENAS o JSON no schema fornecido. Sem prefácio, sem markdown.`;

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

  // SDK novo: chamada via ai.models.generateContent. systemInstruction
  // vai dentro de config. Output text vem direto em result.text (sem
  // .response.text()).
  const result = await ai.models.generateContent({
    model: MODEL_ID,
    contents: [
      {
        role: "user",
        parts: [videoPart, { text: briefingBlock }],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.85,
      topP: 0.95,
      // 8192 truncava o JSON quando o storyboard tinha 8-10 cenas com
      // visual + copy + broll detalhados (~11k chars). 16384 cobre P99.
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      // thinkingBudget=0 mantém latência baixa.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const text = result.text ?? "";
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
