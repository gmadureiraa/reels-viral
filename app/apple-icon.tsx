import { ImageResponse } from "next/og";

/**
 * Apple touch icon (180×180) — versão maior do RV mark pra
 * iPhone home screen quando user salva o site.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 96,
          letterSpacing: "-0.05em",
          fontFamily: "system-ui",
          position: "relative",
          border: "8px solid #141414",
        }}
      >
        RV
        <div
          style={{
            position: "absolute",
            top: 24,
            right: 24,
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "#D262B2",
          }}
        />
      </div>
    ),
    size
  );
}
