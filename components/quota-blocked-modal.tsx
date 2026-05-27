"use client";

/**
 * Modal mostrado quando user logado free atinge o limite mensal de reels.
 * API /adapt-reel responde 402 com `{ error, code: 'quota_exceeded', quota }`.
 * Client detecta o code e abre esse modal em vez de mostrar toast genérico.
 */

import { useEffect } from "react";
import { X, Sparkles, Lock } from "lucide-react";
import Link from "next/link";

interface QuotaBlockedModalProps {
  used: number;
  limit: number;
  resetsAt: string;
  onClose: () => void;
}

export function QuotaBlockedModal({
  used,
  limit,
  resetsAt,
  onClose,
}: QuotaBlockedModalProps) {
  const resetDate = new Date(resetsAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });

  // Esc fecha o modal (paywall pattern).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 9, 8, 0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Limite mensal atingido"
        style={{
          width: "100%",
          maxWidth: 480,
          background: "var(--color-rv-cream)",
          border: "1.5px solid var(--color-rv-ink)",
          boxShadow: "10px 10px 0 0 var(--color-rv-rec)",
          padding: "32px 32px 28px",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "transparent",
            border: "1.5px solid var(--color-rv-line)",
            padding: 6,
            cursor: "pointer",
          }}
        >
          <X size={14} />
        </button>

        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 0,
            background: "var(--color-rv-rec)",
            color: "var(--color-rv-cream)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 18,
          }}
        >
          <Lock size={22} />
        </div>

        <div className="rv-eyebrow" style={{ marginBottom: 8 }}>
          <span className="rv-rec-dot" /> LIMITE ATINGIDO
        </div>
        <h2
          className="rv-display"
          style={{ fontSize: 30, lineHeight: 1.05, marginBottom: 10 }}
        >
          Você usou {used} de {limit}{" "}
          <em>reels grátis</em>.
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--color-rv-muted)",
            lineHeight: 1.5,
            marginBottom: 22,
          }}
        >
          Reset automático em <strong>{resetDate}</strong>. Pra continuar agora,
          escolha um plano com mais reels e biblioteca desbloqueada.
        </p>

        <div
          style={{
            background: "var(--color-rv-soft)",
            border: "1px solid var(--color-rv-line)",
            padding: "14px 16px",
            marginBottom: 20,
            display: "grid",
            gap: 10,
          }}
        >
          <Row label="Pro" price="R$ 14,90/mês" detail="30 reels + biblioteca" />
          <div style={{ height: 1, background: "var(--color-rv-line)" }} />
          <Row label="Max" price="R$ 49,90/mês" detail="100 reels + tudo" />
        </div>

        <Link
          href="/app/precos"
          className="rv-btn rv-btn-rec"
          style={{
            width: "100%",
            padding: "13px 16px",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            textDecoration: "none",
          }}
        >
          <Sparkles size={13} />
          Ver planos e assinar →
        </Link>
      </div>
    </div>
  );
}

function Row({
  label,
  price,
  detail,
}: {
  label: string;
  price: string;
  detail: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div>
        <div className="rv-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-rv-muted)" }}>{detail}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-rv-ink)" }}>{price}</div>
    </div>
  );
}
