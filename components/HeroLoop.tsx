"use client";

/**
 * HeroLoop — banda cinematográfica de 5s no topo do hero da landing.
 *
 * Visual gerado via Higgsfield (Kling 3.0 image-to-video) com vibe
 * "frames de filme dissolvendo em palavras / storyboard". Reforça o
 * conceito-chave do produto (engenharia reversa de reel → roteiro)
 * sem competir com a copy.
 *
 * Acessibilidade:
 *  - poster JPG mostra a 1ª frame estática enquanto o vídeo carrega
 *    e cobre o caso `prefers-reduced-motion: reduce` (autoPlay sai e
 *    o navegador exibe o poster fixo)
 *  - `aria-hidden` porque é decorativo — nenhum texto crítico mora aqui
 *  - sem áudio (renderizado com `sound off`)
 *  - lazy decode + preload metadata only
 *
 * Performance:
 *  - 1.4MB webm + 2MB mp4 fallback (5s @ 1920w, 24fps, slow preset)
 *  - poster webp 100KB + jpg fallback
 *  - reduzido a 24fps no encode pra economizar bytes
 */

import { useEffect, useRef, useState } from "react";

export default function HeroLoop() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Quando reduce-motion entra em curso depois do mount, pausa o vídeo
  // explicitamente em vez de só não dar autoPlay (alguns browsers seguem
  // tocando a sessão atual).
  useEffect(() => {
    if (reduceMotion && videoRef.current) {
      videoRef.current.pause();
    }
  }, [reduceMotion]);

  return (
    <div
      aria-hidden="true"
      style={{
        // Banda cinematográfica — alta o suficiente pra registrar
        // como "vídeo" mas baixa pra não roubar foco da headline + CTA.
        position: "relative",
        width: "100%",
        maxWidth: 980,
        margin: "0 auto 36px",
        aspectRatio: "16 / 5", // crop wide, foco no movimento
        overflow: "hidden",
        border: "1.5px solid var(--color-rv-ink)",
        boxShadow: "6px 6px 0 0 var(--color-rv-ink)",
        background: "var(--color-rv-cream)",
      }}
    >
      {reduceMotion ? (
        // Estático: respeita prefers-reduced-motion
        <picture>
          <source srcSet="/generated/hero-poster.webp" type="image/webp" />
          <img
            src="/generated/hero-poster.jpg"
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center 40%",
              display: "block",
            }}
          />
        </picture>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster="/generated/hero-poster.jpg"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 40%",
            display: "block",
          }}
        >
          <source src="/generated/hero-loop.webm" type="video/webm" />
          <source src="/generated/hero-loop.mp4" type="video/mp4" />
        </video>
      )}

      {/* Overlay sutil pra dar contraste à eyebrow REC do hero quando
          a banda for posicionada abaixo dele. Gradiente muito leve. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, transparent 0%, transparent 70%, color-mix(in srgb, var(--color-rv-paper) 35%, transparent) 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
