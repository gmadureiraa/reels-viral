import { ImageResponse } from "next/og";

/**
 * OG image padrão (1200×630) usada em compartilhamento social
 * (Twitter/X, WhatsApp, LinkedIn, Discord, iMessage). Sem isso, o
 * preview do link `reels-viral.vercel.app` fica branco — produto
 * viral perde 100% do social proof.
 *
 * Next 16 App Router resolve `app/opengraph-image.tsx` em
 * /opengraph-image, e injeta as meta tags og:image automaticamente.
 */
export const alt = "Reels Viral — engenharia reversa de Reels virais";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FAFAFA",
          padding: 64,
          fontFamily: "system-ui",
          color: "#141414",
          position: "relative",
        }}
      >
        {/* Header: REC tag + brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontFamily: "monospace",
            fontSize: 16,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 14px",
              border: "2px solid #141414",
              background: "#D262B2",
              color: "#FFFFFF",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#FFFFFF",
              }}
            />
            REC
          </div>
          <span style={{ color: "#7A7A7A" }}>Reels Viral · Kaleidos</span>
        </div>

        {/* Centro: title bombástico */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.0,
              letterSpacing: "-0.035em",
              maxWidth: 980,
            }}
          >
            Cole um Reel viral.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.0,
              letterSpacing: "-0.035em",
              fontStyle: "italic",
              fontFamily: "serif",
              maxWidth: 980,
            }}
          >
            <span style={{ background: "#D262B2", color: "#FFFFFF", padding: "0 14px" }}>
              Recebe um roteiro novo.
            </span>
          </div>
        </div>

        {/* Footer: subline + URL */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 22,
            color: "#3A3A3A",
            lineHeight: 1.3,
          }}
        >
          <div style={{ maxWidth: 720, display: "flex" }}>
            Engenharia reversa: hook · promessa · demo · CTA cena por cena.
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontSize: 16,
              display: "flex",
            }}
          >
            reels.kaleidos.com.br
          </div>
        </div>
      </div>
    ),
    size
  );
}
