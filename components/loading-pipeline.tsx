"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const STAGES = [
  { label: "Puxando o reel via Apify", duration: 6_500 },
  { label: "Baixando o vídeo do CDN", duration: 4_500 },
  { label: "Subindo pro Gemini", duration: 5_000 },
  { label: "Transcrevendo o áudio", duration: 8_000 },
  { label: "Disseccando estrutura", duration: 6_000 },
  { label: "Adaptando ao seu briefing", duration: 8_000 },
];

export function LoadingPipeline() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (stage >= STAGES.length - 1) return;
    const t = setTimeout(
      () => setStage((s) => s + 1),
      STAGES[stage].duration
    );
    return () => clearTimeout(t);
  }, [stage]);

  return (
    <div
      style={{
        background: "var(--color-rv-cream)",
        border: "1.5px solid var(--color-rv-ink)",
        boxShadow: "8px 8px 0 0 var(--color-rv-ink)",
        padding: "44px 38px 36px",
      }}
    >
      <div className="flex items-center gap-3 mb-2">
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "var(--color-rv-rec)",
            animation: "rv-pulse 1.4s infinite",
          }}
        />
        <span
          className="rv-mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "var(--color-rv-rec)",
          }}
        >
          REC · GERANDO ROTEIRO
        </span>
      </div>
      <h2
        className="rv-display"
        style={{
          fontSize: 38,
          lineHeight: 1.05,
          marginBottom: 32,
        }}
      >
        Disseccando o reel<br />
        <em>e remontando o seu.</em>
      </h2>

      {/* Pipeline stages */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {STAGES.map((s, i) => {
          const done = i < stage;
          const active = i === stage;
          return (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 0",
                borderBottom:
                  i < STAGES.length - 1
                    ? "1px solid var(--color-rv-line)"
                    : "none",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  border: "1.5px solid var(--color-rv-ink)",
                  background: done
                    ? "var(--color-rv-ink)"
                    : active
                    ? "var(--color-rv-rec)"
                    : "transparent",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                {done && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    style={{
                      position: "absolute",
                      top: 1,
                      left: 1,
                      color: "var(--color-rv-cream)",
                    }}
                  >
                    <path
                      d="M2 6.5 L5 9 L10 3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="square"
                      fill="none"
                    />
                  </svg>
                )}
                {active && (
                  <motion.span
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "var(--color-rv-rec-hot)",
                    }}
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                )}
              </div>
              <span
                className="rv-mono"
                style={{
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  color: done
                    ? "var(--color-rv-muted)"
                    : active
                    ? "var(--color-rv-ink)"
                    : "var(--color-rv-muted)",
                  textDecoration: done ? "line-through" : "none",
                  letterSpacing: "0.02em",
                }}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ul>

      <div
        className="mt-7 rv-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--color-rv-muted)",
          lineHeight: 1.6,
        }}
      >
        ⚠ Cada reel leva ~30–45s. Não fecha a aba.
      </div>
    </div>
  );
}
