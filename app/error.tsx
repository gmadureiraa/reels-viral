"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary global do Reels Viral. Next 16 App Router resolve
 * `app/error.tsx` automaticamente em qualquer crash de page/component.
 *
 * Sem isso, qualquer throw em result-view (ex: scenes inválido vindo
 * do Gemini) virava tela em branco — user perdia 30s + créditos
 * Apify/Gemini sem entender o que aconteceu.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[rv] global error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--color-rv-cream, #F5F1E8)",
        color: "var(--color-rv-ink, #1A1A1A)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily:
          "var(--font-jakarta), 'Plus Jakarta Sans', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 540,
          width: "100%",
          padding: 32,
          background: "var(--color-rv-cream, #FFFFFF)",
          border: "1.5px solid var(--color-rv-ink, #1A1A1A)",
          boxShadow: "5px 5px 0 0 var(--color-rv-ink, #1A1A1A)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 11px",
            background: "var(--color-rv-rec, #FF3D2E)",
            color: "var(--color-rv-cream, #FFFFFF)",
            border: "1.5px solid var(--color-rv-ink, #1A1A1A)",
            fontFamily:
              "var(--font-mono), 'Geist Mono', ui-monospace, monospace",
            fontSize: 9.5,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 700,
            alignSelf: "flex-start",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--color-rv-cream, #FFFFFF)",
            }}
          />
          erro
        </span>

        <h1
          style={{
            fontFamily:
              "var(--font-instrument), 'Instrument Serif', serif",
            fontSize: 38,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            margin: 0,
            fontStyle: "italic",
          }}
        >
          Algo quebrou aqui.
        </h1>

        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.55,
            color: "var(--color-rv-muted, #5C5858)",
            margin: 0,
          }}
        >
          A análise não foi até o fim. Pode ter sido o Reel (privado, removido
          ou em formato estranho), nossa fila de processamento ou um descuido
          nosso. Tenta de novo em alguns segundos — se persistir, troca a URL.
        </p>

        {error.digest && (
          <code
            style={{
              fontFamily:
                "var(--font-mono), 'Geist Mono', ui-monospace, monospace",
              fontSize: 10.5,
              color: "var(--color-rv-muted, #5C5858)",
              padding: "6px 10px",
              background: "color-mix(in srgb, var(--color-rv-ink) 5%, transparent)",
              border: "1px dashed color-mix(in srgb, var(--color-rv-ink) 18%, transparent)",
              wordBreak: "break-all",
            }}
          >
            ref: {error.digest}
          </code>
        )}

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "11px 18px",
              background: "var(--color-rv-ink, #1A1A1A)",
              color: "var(--color-rv-cream, #FFFFFF)",
              border: "1.5px solid var(--color-rv-ink, #1A1A1A)",
              boxShadow: "3px 3px 0 0 var(--color-rv-rec, #FF3D2E)",
              fontFamily:
                "var(--font-mono), 'Geist Mono', ui-monospace, monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Tentar de novo →
          </button>
          <Link
            href="/"
            style={{
              padding: "11px 18px",
              background: "transparent",
              color: "var(--color-rv-ink, #1A1A1A)",
              border: "1.5px solid var(--color-rv-ink, #1A1A1A)",
              fontFamily:
                "var(--font-mono), 'Geist Mono', ui-monospace, monospace",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            ← Voltar pro início
          </Link>
        </div>
      </div>
    </div>
  );
}
