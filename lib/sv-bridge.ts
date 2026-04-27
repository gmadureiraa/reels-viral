/**
 * Bridge → Sequência Viral.
 *
 * O SV aceita brief via querystring quando o user abre /app/create:
 * `?source=<reel_url>&idea=<roteiro>&template=manifesto`. Quando o
 * Reels Viral termina um roteiro, oferecemos "Transformar em carrossel"
 * que pega o roteiro completo + reel original e abre o SV pré-populado.
 *
 * O SV faz o resto: o user só confirma e gera o carrossel.
 */

import type { AdaptResponse } from "./types";

const SV_BASE = "https://viral.kaleidos.com.br";

/**
 * Monta a URL do SV pra abrir um carrossel novo a partir desse roteiro.
 *
 * Estratégia: passamos o ROTEIRO COMPLETO + caption + reel original como
 * `idea` (texto livre que o SV usa pro briefing). O SV vai gerar 8-10
 * slides em cima desse texto, mantendo a essência mas em formato carrossel.
 */
export function buildSvCarouselUrl(data: AdaptResponse): string {
  const { source, script } = data;

  // Briefing pro SV: pegamos o título + hook + roteiro completo + caption.
  // O SV trata isso como "idea" (input livre) e gera o carrossel.
  const briefing = [
    `[Adaptado do Reel @${source.ownerUsername}: ${source.url}]`,
    "",
    `Título do meu reel: ${script.titulo}`,
    "",
    `Hook (0-3s): "${script.hook}"`,
    "",
    "Roteiro:",
    script.roteiroCompleto,
    "",
    "Caption do reel:",
    script.captionSugerida,
  ].join("\n");

  const params = new URLSearchParams();
  params.set("idea", briefing);
  // Manifesto é o template default editorial — combina bem com roteiros
  // adaptados de reels (ambos cinematográficos).
  params.set("template", "manifesto");
  params.set("source", "reels-viral");

  return `${SV_BASE}/app/create/new?${params.toString()}`;
}

export function openSvBridge(data: AdaptResponse): void {
  if (typeof window === "undefined") return;
  const url = buildSvCarouselUrl(data);
  window.open(url, "_blank", "noopener,noreferrer");
}
