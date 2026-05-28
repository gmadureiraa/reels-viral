import { ImageResponse } from "next/og";

/**
 * Favicon dinâmico do Reels Viral. Marca "RV" + bolinha accent rosa
 * Kaleidos (#D262B2) sobre branco Kaleidos (#FAFAFA). Alinhado ao rebrand.
 *
 * Next 16 App Router resolve `app/icon.tsx` automaticamente em
 * /favicon.ico e meta tags icon. Não precisa de declaração no layout.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAFAFA",
          color: "#141414",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: "-0.04em",
          fontFamily: "system-ui",
          position: "relative",
        }}
      >
        RV
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#D262B2",
          }}
        />
      </div>
    ),
    size
  );
}
