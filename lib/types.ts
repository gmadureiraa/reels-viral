/**
 * Schema canônico de um roteiro adaptado pelo Reels Viral.
 *
 * Fluxo: Apify → metadata + videoUrl → Gemini transcreve + analisa →
 * gera novo roteiro adaptado ao briefing do user → retorna esse JSON.
 */

export type Objetivo = "leads" | "produto" | "seguidores" | "engajamento";

export interface AdaptBrief {
  /** URL do Reel viral de referência (Instagram). */
  sourceUrl: string;
  /**
   * Tema do vídeo do USER. Ex: "ferramenta de IA pra design", "newsletter
   * de cripto", "consultoria fitness". Diferença narrativa principal.
   */
  tema: string;
  objetivo: Objetivo;
  /**
   * CTA do user. Ex: "comenta APP", "clica no link da bio", "manda DM".
   */
  cta: string;
  /** Persona (opcional) — quem é o público alvo. */
  persona?: string;
  /** Nicho do user — ajuda na adaptação. */
  nicho?: string;
}

export interface SourceMeta {
  shortCode: string;
  url: string;
  ownerUsername: string;
  ownerFullName?: string;
  caption?: string;
  videoDuration?: number;
  views?: number;
  plays?: number;
  likes?: number;
  comments?: number;
  publishedAt?: string;
}

export interface SourceAnalysis {
  /** Resumo de 1 linha do conteúdo do reel original. */
  resumo: string;
  /** Por que isso viralizou — 2-3 razões concretas. */
  porQueViralizou: string[];
  /** Estrutura desmontada do roteiro original. */
  estrutura: {
    hook: { texto: string; tempo: string };
    promessa: { texto: string; tempo: string };
    demonstracao: { texto: string; tempo: string };
    provaSocial: { texto: string; tempo: string };
    cta: { texto: string; tempo: string };
  };
  /** Padrões transferíveis pra qualquer nicho. */
  padroesTransferiveis: string[];
}

export interface Scene {
  /** Número da cena (1-indexed). */
  n: number;
  /** Range temporal da cena no roteiro adaptado, ex: "00:00–00:03". */
  tempo: string;
  /** Função narrativa: hook, promessa, demo, prova, transição, cta. */
  papel:
    | "hook"
    | "promessa"
    | "demo"
    | "prova"
    | "transicao"
    | "cta";
  /** Visual: o que aparece em tela. */
  visual: string;
  /** Copy: texto falado / overlay text. */
  copy: string;
  /** B-roll necessário pra gravar essa cena. */
  broll?: string;
}

export interface AdaptedScript {
  /** Título sugerido pro novo Reel (sem hashtags). */
  titulo: string;
  /** Hook completo (0-3s) — o que o user fala primeiro. */
  hook: string;
  /** Roteiro completo em texto corrido pra leitura/colar. */
  roteiroCompleto: string;
  /** Storyboard cena por cena. */
  scenes: Scene[];
  /** Caption sugerida pro post. */
  captionSugerida: string;
  /** Notas de produção: dicas pra gravar bem. */
  notasProducao: string[];
}

export interface AdaptResponse {
  source: SourceMeta;
  analysis: SourceAnalysis;
  script: AdaptedScript;
  /** Tempo total da geração em ms. */
  durationMs: number;
  /** ID do script persistido (DB ou local) — usado pelo /api/lead pra
   *  vincular o lead ao roteiro gerado. Opcional pra anônimos. */
  scriptId?: string | null;
}
