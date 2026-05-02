"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, X, Type, Gauge, FlipHorizontal2 } from "lucide-react";

interface TeleprompterProps {
  text: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Teleprompter overlay full-screen.
 * - Texto grande, fundo escuro, alto contraste pra ler gravando.
 * - Auto-scroll com velocidade ajustável (px/s).
 * - Atalhos: Espaço = play/pause, ↑/↓ = speed, +/- = fontSize, Esc = fechar.
 * - Mirror horizontal pra usar com espelho físico (rig de teleprompter).
 */
export function Teleprompter({ text, open, onClose }: TeleprompterProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60); // px/s
  const [fontSize, setFontSize] = useState(48);
  const [mirror, setMirror] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  // Reset scroll quando abre
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      setPlaying(false);
    }
  }, [open]);

  // Loop de auto-scroll via requestAnimationFrame (mais suave que setInterval)
  useEffect(() => {
    if (!playing || !open) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    function tick(timestamp: number) {
      if (!scrollRef.current) return;
      if (lastTickRef.current === 0) lastTickRef.current = timestamp;
      const delta = (timestamp - lastTickRef.current) / 1000;
      lastTickRef.current = timestamp;

      const el = scrollRef.current;
      el.scrollTop += speed * delta;

      // Para automaticamente no fim
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
        setPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    lastTickRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, open]);

  // Atalhos de teclado
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSpeed((s) => Math.min(300, s + 10));
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSpeed((s) => Math.max(10, s - 10));
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setFontSize((f) => Math.min(120, f + 4));
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setFontSize((f) => Math.max(20, f - 4));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleReset() {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setPlaying(false);
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0A0A0A",
        display: "flex",
        flexDirection: "column",
        color: "#F5F1E8",
      }}
      role="dialog"
      aria-label="Teleprompter"
      aria-modal="true"
    >
      {/* Top bar com controles */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid rgba(245,241,232,0.1)",
          flexShrink: 0,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pausar" : "Reproduzir"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              background: "var(--color-rv-rec, #FF3D2E)",
              color: "white",
              border: "none",
              borderRadius: 4,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.04em",
              cursor: "pointer",
              fontFamily: "var(--font-jakarta), sans-serif",
            }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
            {playing ? "PAUSAR" : "REPRODUZIR"}
          </button>
          <button
            onClick={handleReset}
            aria-label="Voltar pro início"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 14px",
              background: "transparent",
              color: "#F5F1E8",
              border: "1px solid rgba(245,241,232,0.2)",
              borderRadius: 4,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--font-jakarta), sans-serif",
            }}
          >
            <RotateCcw size={14} />
            Voltar
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {/* Velocidade */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "rgba(245,241,232,0.7)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            <Gauge size={14} />
            <input
              type="range"
              min={10}
              max={300}
              step={10}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ width: 100 }}
              aria-label="Velocidade do teleprompter"
            />
            <span style={{ minWidth: 50 }}>{speed} px/s</span>
          </div>

          {/* Tamanho fonte */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "rgba(245,241,232,0.7)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            <Type size={14} />
            <input
              type="range"
              min={20}
              max={120}
              step={2}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              style={{ width: 80 }}
              aria-label="Tamanho da fonte"
            />
            <span style={{ minWidth: 36 }}>{fontSize}px</span>
          </div>

          {/* Mirror */}
          <button
            onClick={() => setMirror((m) => !m)}
            aria-label="Espelhar texto"
            aria-pressed={mirror}
            title="Espelhar (pra rig de teleprompter)"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              background: mirror ? "rgba(255,61,46,0.2)" : "transparent",
              color: "#F5F1E8",
              border: `1px solid ${mirror ? "var(--color-rv-rec, #FF3D2E)" : "rgba(245,241,232,0.2)"}`,
              borderRadius: 4,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "var(--font-jakarta), sans-serif",
            }}
          >
            <FlipHorizontal2 size={14} />
            Espelhar
          </button>

          <button
            onClick={onClose}
            aria-label="Fechar teleprompter"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: 10,
              background: "transparent",
              color: "#F5F1E8",
              border: "1px solid rgba(245,241,232,0.2)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Texto rolando */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "40vh 8vw 60vh", // padding top/bottom grande pra texto começar centralizado
          scrollBehavior: "auto", // auto pra animação suave via RAF
          transform: mirror ? "scaleX(-1)" : "none",
        }}
      >
        <pre
          style={{
            fontFamily: "var(--font-jakarta), sans-serif",
            fontSize: `${fontSize}px`,
            lineHeight: 1.4,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "#F5F1E8",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            textAlign: "center",
            maxWidth: "1200px",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {text}
        </pre>
      </div>

      {/* Hint atalhos */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 10,
          fontFamily: "var(--font-mono), monospace",
          color: "rgba(245,241,232,0.4)",
          letterSpacing: "0.05em",
          pointerEvents: "none",
        }}
      >
        ESPAÇO play · ↑↓ velocidade · +/− tamanho · ESC fechar
      </div>
    </div>
  );
}
