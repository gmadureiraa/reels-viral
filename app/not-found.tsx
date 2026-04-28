import Link from "next/link";

/**
 * 404 brutalist matching o design system. Next 16 App Router resolve
 * automaticamente quando route não existe.
 */
export default function NotFound() {
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
          maxWidth: 480,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            fontFamily:
              "var(--font-instrument), 'Instrument Serif', serif",
            fontSize: 96,
            lineHeight: 1,
            fontStyle: "italic",
            letterSpacing: "-0.04em",
          }}
        >
          404
        </div>
        <h1
          style={{
            fontSize: 22,
            lineHeight: 1.2,
            margin: 0,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Página não existe.
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "rgba(26,26,26,0.65)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          O link pode estar quebrado ou a rota foi removida. Volta pro
          início e cola um Reel pra começar.
        </p>
        <Link
          href="/"
          style={{
            alignSelf: "center",
            marginTop: 8,
            padding: "11px 22px",
            background: "var(--color-rv-ink, #1A1A1A)",
            color: "#FFFFFF",
            border: "1.5px solid var(--color-rv-ink, #1A1A1A)",
            boxShadow: "3px 3px 0 0 #FF3D2E",
            fontFamily:
              "var(--font-mono), 'Geist Mono', ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          ← Voltar pro início
        </Link>
      </div>
    </div>
  );
}
