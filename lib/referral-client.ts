/**
 * Referral capture client-side (Reels Viral).
 *
 * Como funciona:
 *  1) Em qualquer pagina, se URL tem `?ref=CODE`, salvamos no localStorage
 *     com timestamp. Janela: 30 dias (depois disso, expira e ignora).
 *  2) No signup e no checkout, lemos o codigo e enviamos pro backend.
 *  3) Apos signup com sucesso, chamamos `/api/referrals/track` com Authorization
 *     bearer pra registrar a indicacao.
 *  4) Limpamos o storage so apos sucesso confirmado de tracking
 *     (se /track falhar, mantemos pra retry no proximo SIGNED_IN).
 *
 * Prefix `rv_` (Reels Viral) — não confunde com `sv_` (Sequência Viral)
 * caso o user use os dois apps no mesmo browser.
 */

const STORAGE_KEY = "rv_ref_code";
const TIMESTAMP_KEY = "rv_ref_code_at";
const TRACKED_FLAG = "rv_ref_code_tracked";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export function captureReferralFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (!ref || !ref.trim()) return null;
    const clean = ref.trim().slice(0, 64); // sanity cap
    saveReferralCode(clean);
    return clean;
  } catch {
    return null;
  }
}

export function saveReferralCode(code: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
    window.localStorage.setItem(TIMESTAMP_KEY, String(Date.now()));
    // Reseta flag de tracked — code novo precisa ser trackeado de novo.
    window.localStorage.removeItem(TRACKED_FLAG);
  } catch {
    /* ignore */
  }
}

export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const code = window.localStorage.getItem(STORAGE_KEY);
    if (!code) return null;
    const tsRaw = window.localStorage.getItem(TIMESTAMP_KEY);
    const ts = tsRaw ? Number(tsRaw) : 0;
    if (!ts || Date.now() - ts > MAX_AGE_MS) {
      // Expirou — limpa.
      clearReferralCode();
      return null;
    }
    return code;
  } catch {
    return null;
  }
}

export function clearReferralCode() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(TIMESTAMP_KEY);
    window.localStorage.removeItem(TRACKED_FLAG);
  } catch {
    /* ignore */
  }
}

export function markReferralTracked() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRACKED_FLAG, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function wasReferralTracked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage.getItem(TRACKED_FLAG);
  } catch {
    return false;
  }
}

/**
 * Tenta registrar a indicacao no backend. Idempotente e silencioso em falha.
 * Chamar logo apos signup confirmado (com session valida).
 */
export async function trackReferral(
  accessToken: string,
  referralCode: string,
): Promise<boolean> {
  try {
    const res = await fetch("/api/referrals/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ referralCode }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return !!data.ok;
  } catch {
    return false;
  }
}
