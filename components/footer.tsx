import Link from "next/link";

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1.5px solid var(--color-rv-ink)",
        background: "var(--color-rv-cream)",
        padding: "32px 20px 24px",
        marginTop: 80,
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
          color: "var(--color-rv-muted)",
        }}
      >
        <div
          className="rv-mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "var(--color-rv-ink)",
          }}
        >
          Reels Viral · by Kaleidos Digital
        </div>

        <nav
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 20,
            alignItems: "center",
          }}
        >
          <Link
            href="/privacy"
            className="rv-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-rv-muted)",
              textDecoration: "none",
            }}
          >
            Privacidade
          </Link>
          <Link
            href="/terms"
            className="rv-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-rv-muted)",
              textDecoration: "none",
            }}
          >
            Termos
          </Link>
          <a
            href="https://kaleidos.com.br"
            target="_blank"
            rel="noreferrer"
            className="rv-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-rv-muted)",
              textDecoration: "none",
            }}
          >
            kaleidos.com.br ↗
          </a>
        </nav>
      </div>
    </footer>
  );
}
