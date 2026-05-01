"use client";

/**
 * /biblioteca — galeria de reels virais estilo Instagram.
 *
 * Free user: tudo borrado + watermark "Pro" + CTA pra assinar.
 * Paid user: liberado + filtros por template_type.
 *
 * Quando biblioteca tá vazia (pré-seed Apify), mostra placeholders
 * borrados gerados client-side pra hint visual do que vem.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Heart,
  Lock,
  Sparkles,
  Play,
  Eye,
  Loader2,
} from "lucide-react";
import { useNeonSession, getJwtToken } from "@/lib/auth-client";
import { AuthBar } from "@/components/auth-bar";

interface LibraryReel {
  id: string;
  ig_url: string;
  short_code: string | null;
  author_handle: string | null;
  caption: string | null;
  thumb_url: string | null;
  likes_count: number | null;
  views_count: number | null;
  duration_seconds: number | null;
  template_type: string | null;
  hook_pattern: string | null;
  featured: boolean;
}

interface ApiResponse {
  reels: LibraryReel[];
  unlocked: boolean;
}

const TEMPLATES: Array<{ id: string; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "hook_face_cam", label: "Hook face-cam" },
  { id: "transition", label: "Transição" },
  { id: "duet", label: "Dueto" },
  { id: "pov", label: "POV" },
  { id: "tutorial", label: "Tutorial" },
];

// Placeholder quando biblioteca tá vazia — números fake pra hint visual.
const PLACEHOLDER_REELS: LibraryReel[] = Array.from({ length: 12 }, (_, i) => ({
  id: `placeholder-${i}`,
  ig_url: "",
  short_code: null,
  author_handle: null,
  caption: null,
  thumb_url: null,
  likes_count: 50_000 + Math.round(Math.random() * 800_000),
  views_count: 200_000 + Math.round(Math.random() * 3_000_000),
  duration_seconds: 15 + Math.round(Math.random() * 45),
  template_type: TEMPLATES[1 + (i % (TEMPLATES.length - 1))].id,
  hook_pattern: null,
  featured: i < 3,
}));

export default function LibraryPage() {
  useNeonSession(); // hydrate session pra AuthBar mostrar estado correto
  const [reels, setReels] = useState<LibraryReel[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("template", filter);
    let cancelled = false;
    (async () => {
      try {
        // JWT necessário pra /api/library reconhecer plano Basic/Max e
        // liberar a biblioteca destravada (sem token, cai em getOptionalUserId
        // → null → biblioteca borrada mesmo pra usuário pagante).
        const jwt = await getJwtToken();
        const res = await fetch(`/api/library?${params.toString()}`, {
          headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
        });
        const data = (await res.json()) as ApiResponse;
        if (cancelled) return;
        setReels(data.reels.length > 0 ? data.reels : PLACEHOLDER_REELS);
        setUnlocked(Boolean(data.unlocked));
      } catch {
        if (cancelled) return;
        setReels(PLACEHOLDER_REELS);
        setUnlocked(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--color-rv-paper)",
        color: "var(--color-rv-ink)",
      }}
    >
      <header
        style={{
          padding: "18px 28px",
          borderBottom: "1.5px solid var(--color-rv-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/app"
          className="rv-mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            textDecoration: "none",
            color: "var(--color-rv-ink)",
          }}
        >
          <ArrowLeft size={14} />
          Voltar
        </Link>
        <div className="rv-eyebrow">
          <span className="rv-rec-dot" /> BIBLIOTECA · REELS VIRAIS
        </div>
        <AuthBar />
      </header>

      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div style={{ marginBottom: 20 }}>
          <h1
            className="rv-display"
            style={{ fontSize: 36, lineHeight: 1.05, marginBottom: 8 }}
          >
            Reels que <em>bombaram</em>.
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-rv-muted)", maxWidth: 640 }}>
            Curadoria manual + métricas reais. Cada reel tem template
            mapeado (hook, transição, dueto…) pra você adaptar com seu tema
            em segundos.
          </p>
        </div>

        {/* Filtros */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 24,
            overflowX: "auto",
            paddingBottom: 4,
            opacity: unlocked ? 1 : 0.5,
            pointerEvents: unlocked ? "auto" : "none",
          }}
        >
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className="rv-mono"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "8px 14px",
                background:
                  filter === t.id ? "var(--color-rv-ink)" : "transparent",
                color: filter === t.id ? "white" : "var(--color-rv-ink)",
                border: "1.5px solid var(--color-rv-ink)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: 60,
              color: "var(--color-rv-muted)",
            }}
          >
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}

        {/* Grid mockup IG (3 cols desktop, 2 mobile) */}
        {!loading && (
          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 6,
                filter: unlocked ? "none" : "blur(14px)",
                pointerEvents: unlocked ? "auto" : "none",
                userSelect: unlocked ? "auto" : "none",
                transition: "filter 0.3s ease",
              }}
            >
              {reels.map((reel) => (
                <ReelCard key={reel.id} reel={reel} unlocked={unlocked} />
              ))}
            </div>

            {/* Paywall overlay — aparece quando NÃO unlocked */}
            {!unlocked && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: "max(15vh, 80px)",
                  pointerEvents: "auto",
                }}
              >
                <div
                  style={{
                    background: "var(--color-rv-cream)",
                    border: "1.5px solid var(--color-rv-ink)",
                    boxShadow: "10px 10px 0 0 var(--color-rv-rec)",
                    padding: "28px 32px",
                    maxWidth: 440,
                    width: "calc(100% - 32px)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      background: "var(--color-rv-rec)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 14px",
                    }}
                  >
                    <Lock size={22} />
                  </div>
                  <div className="rv-eyebrow" style={{ justifyContent: "center", marginBottom: 8 }}>
                    <span className="rv-rec-dot" /> RECURSO PRO
                  </div>
                  <h2
                    className="rv-display"
                    style={{ fontSize: 26, lineHeight: 1.1, marginBottom: 8 }}
                  >
                    Desbloqueie a <em>biblioteca</em>.
                  </h2>
                  <p
                    style={{
                      fontSize: 13,
                      color: "var(--color-rv-muted)",
                      lineHeight: 1.5,
                      marginBottom: 18,
                    }}
                  >
                    {reels.length}+ reels virais com template mapeado, métricas
                    reais e link pro original. Disponível no plano Basic
                    (R$ 14,90/mês).
                  </p>
                  <Link
                    href="/app/precos"
                    className="rv-btn rv-btn-rec"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      fontSize: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      textDecoration: "none",
                    }}
                  >
                    <Sparkles size={13} />
                    Ver planos →
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function ReelCard({ reel, unlocked }: { reel: LibraryReel; unlocked: boolean }) {
  const fmt = (n: number | null): string => {
    if (n == null) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
  };
  const cardContent = (
    <>
      <div
        style={{
          aspectRatio: "9 / 16",
          background:
            reel.thumb_url && unlocked
              ? `url(${reel.thumb_url}) center/cover`
              : "linear-gradient(135deg, #2a1a14, #4a2a1f, #1a1a1a)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Featured badge */}
        {reel.featured && (
          <div
            className="rv-mono"
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              background: "var(--color-rv-rec)",
              color: "white",
              fontSize: 8,
              fontWeight: 800,
              letterSpacing: "0.14em",
              padding: "3px 6px",
            }}
          >
            ⭐ TOP
          </div>
        )}
        {/* Play icon center */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "rgba(0,0,0,0.45)",
            borderRadius: "50%",
            width: 48,
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Play size={20} color="white" fill="white" />
        </div>
        {/* Bottom overlay com métricas */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "10px 8px 6px",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            fontSize: 11,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Heart size={12} fill="white" />
            <span style={{ fontWeight: 700 }}>{fmt(reel.likes_count)}</span>
          </div>
          {reel.views_count != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, opacity: 0.85 }}>
              <Eye size={11} />
              <span style={{ fontWeight: 700 }}>{fmt(reel.views_count)}</span>
            </div>
          )}
        </div>
      </div>
      {/* Caption mini */}
      <div
        style={{
          padding: "8px 10px",
          background: "var(--color-rv-cream)",
          borderTop: "1px solid var(--color-rv-line)",
        }}
      >
        <div
          className="rv-mono"
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--color-rv-rec)",
            marginBottom: 2,
          }}
        >
          {reel.template_type?.replace(/_/g, " ") ?? "—"}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-rv-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {reel.author_handle ?? "@viral_creator"}
        </div>
      </div>
    </>
  );

  if (unlocked && reel.ig_url) {
    return (
      <a
        href={reel.ig_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "block",
          border: "1.5px solid var(--color-rv-ink)",
          background: "var(--color-rv-cream)",
          textDecoration: "none",
          color: "inherit",
          transition: "transform 0.15s ease",
        }}
        className="hover:-translate-y-0.5"
      >
        {cardContent}
      </a>
    );
  }
  return (
    <div
      style={{
        border: "1.5px solid var(--color-rv-ink)",
        background: "var(--color-rv-cream)",
      }}
    >
      {cardContent}
    </div>
  );
}
