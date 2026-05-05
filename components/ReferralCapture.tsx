"use client";

import { useEffect } from "react";
import { captureReferralFromUrl } from "@/lib/referral-client";

/**
 * Captura `?ref=CODE` da URL no primeiro mount do client. Salva no
 * localStorage com TTL 30 dias. Componente plugado no root layout pra
 * funcionar em qualquer rota (landing, /app/*) sem depender do auth state.
 *
 * Render: nada. Side-effect only.
 */
export function ReferralCapture() {
  useEffect(() => {
    captureReferralFromUrl();
  }, []);
  return null;
}

export default ReferralCapture;
