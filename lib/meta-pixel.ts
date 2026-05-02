/**
 * Reels Viral — helpers Meta Pixel (client-side).
 *
 * O pixel base (id 1708595326965933) é injetado por <MetaPixel /> no
 * layout.tsx, então `window.fbq` está disponível em qualquer rota client.
 *
 * Eventos canônicos cobrem o funil:
 *  - Lead — signup (email/Google) anônimo virou conta. Topo do funil.
 *  - CompleteRegistration — primeiro reel adaptado com sucesso (ativação).
 *  - Subscribe — pós-Stripe checkout (Basic/Max). Conversão monetária.
 *
 * Todos os helpers viram no-op em SSR ou se o pixel ainda não carregou
 * (ex: bloqueador de anúncios). Sem throw, sem ruído — só pula.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function trackLead(contentName = "free_signup"): void {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", "Lead", { content_name: contentName });
}

export function trackCompleteRegistration(status = "first_reel"): void {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", "CompleteRegistration", { status });
}

export function trackSubscribe(value: number, plan: string): void {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", "Subscribe", {
    value,
    currency: "BRL",
    predicted_ltv: value * 12,
    content_name: `rv_${plan}`,
  });
}
