"use client";

/**
 * /app/biblioteca — galeria de reels virais estilo Instagram.
 *
 * Free user: tudo borrado + watermark "Pro" + CTA pra assinar.
 * Paid user: liberado + filtros (template + search por handle/caption) +
 * click num reel abre detalhe com botão "Adaptar este reel" (preenche
 * pendingBrief no sessionStorage + redirect /app).
 *
 * Quando biblioteca tá vazia (pré-seed Apify), mostra placeholders
 * borrados gerados client-side pra hint visual do que vem.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  Lock,
  Sparkles,
  Play,
  Eye,
  Loader2,
  Search,
  X,
  ExternalLink,
} from "lucide-react";
import { useNeonSession, getJwtToken } from "@/lib/auth-client";

const PENDING_FORM_KEY = "rv_pending_brief";

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
  const router = useRouter();
  useNeonSession();
  const [reels, setReels] = useState<LibraryReel[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedReel, setSelectedReel] = useState<LibraryReel | null>(null);

  // Filtra client-side por search query (handle, caption, hook).
  const filteredReels = useMemo(() => {
    if (!search.trim()) return reels;
    const q = search.toLowerCase();
    return reels.filter((r) => {
      const fields = [
        r.author_handle ?? "",
        r.caption ?? "",
        r.hook_pattern ?? "",
        r.template_type ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return fields.includes(q);
    });
  }, [reels, search]);

  function handleAdaptReel(reel: LibraryReel) {
    if (!reel.ig_url) return;
    try {
      sessionStorage.setItem(
        PENDING_FORM_KEY,
        JSON.stringify({
          sourceUrl: reel.ig_url,
          tema: "",
          objetivo: "seguidores",
          cta: "",
        }),
      );
    } catch {
      /* sessionStorage bloqueado */
    }
    router.push("/app");
  }

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
      {/* Header simplificado — sidebar do /app/layout cuida da navegação */}
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

        {/* Search input */}
        {unlocked && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              marginBottom: 16,
              border: "1.5px solid var(--color-rv-ink)",
              background: "white",
              maxWidth: 460,
            }}
          >
            <Search
              size={14}
              style={{ marginLeft: 14, color: "var(--color-rv-muted)" }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Busca por handle, caption ou hook…"
              spellCheck={false}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                padding: "10px 12px",
                fontFamily: "var(--font-jakarta), sans-serif",
                fontSize: 13,
                color: "var(--color-rv-ink)",
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Limpar busca"
                style={{
                  border: "none",
                  background: "transparent",
                  padding: "8px 12px",
                  cursor: "pointer",
                  color: "var(--color-rv-muted)",
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

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
              {filteredReels.map((reel) => (
                <ReelCard
                  key={reel.id}
                  reel={reel}
                  unlocked={unlocked}
                  onClick={() => setSelectedReel(reel)}
                />
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

      {/* Modal detalhe do reel — abre ao clicar num card */}
      {selectedReel && (
        <ReelDetailModal
          reel={selectedReel}
          onClose={() => setSelectedReel(null)}
          onAdapt={() => {
            handleAdaptReel(selectedReel);
            setSelectedReel(null);
          }}
        />
      )}
    </main>
  );
}

function ReelCard({
  reel,
  unlocked,
  onClick,
}: {
  reel: LibraryReel;
  unlocked: boolean;
  onClick: () => void;
}) {
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
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          border: "1.5px solid var(--color-rv-ink)",
          background: "var(--color-rv-cream)",
          color: "inherit",
          cursor: "pointer",
          textAlign: "left",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translate(-2px, -2px)";
          e.currentTarget.style.boxShadow = "4px 4px 0 0 var(--color-rv-ink)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translate(0, 0)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {cardContent}
      </button>
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

// ─── Modal detalhe do reel ────────────────────────────────────────────

function ReelDetailModal({
  reel,
  onClose,
  onAdapt,
}: {
  reel: LibraryReel;
  onClose: () => void;
  onAdapt: () => void;
}) {
  const fmt = (n: number | null): string => {
    if (n == null) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
  };
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 9, 8, 0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          background: "var(--color-rv-cream)",
          border: "1.5px solid var(--color-rv-ink)",
          boxShadow: "10px 10px 0 0 var(--color-rv-rec)",
          padding: 0,
          position: "relative",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "white",
            border: "1.5px solid var(--color-rv-line)",
            padding: 6,
            cursor: "pointer",
            zIndex: 1,
          }}
        >
          <X size={14} />
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 0 }}>
          {/* Thumb / preview */}
          <div
            style={{
              aspectRatio: "9 / 16",
              maxHeight: 360,
              background: reel.thumb_url
                ? `url(${reel.thumb_url}) center/cover`
                : "linear-gradient(135deg, #2a1a14, #4a2a1f, #1a1a1a)",
              position: "relative",
              borderBottom: "1.5px solid var(--color-rv-ink)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                background: "rgba(0,0,0,0.55)",
                borderRadius: "50%",
                width: 64,
                height: 64,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Play size={28} color="white" fill="white" />
            </div>
          </div>

          <div style={{ padding: "24px 28px 26px" }}>
            <div className="rv-eyebrow" style={{ marginBottom: 8 }}>
              <span className="rv-rec-dot" />
              {reel.template_type?.replace(/_/g, " ").toUpperCase() ?? "REEL VIRAL"}
            </div>
            <h2
              className="rv-display"
              style={{ fontSize: 26, lineHeight: 1.1, marginBottom: 14 }}
            >
              {reel.author_handle ?? "@viral_creator"}
            </h2>

            {/* Metricas */}
            <div
              style={{
                display: "flex",
                gap: 18,
                marginBottom: 18,
                flexWrap: "wrap",
                fontSize: 13,
                color: "var(--color-rv-muted)",
              }}
            >
              <span>
                <Heart size={12} style={{ display: "inline", marginRight: 4 }} />
                <strong style={{ color: "var(--color-rv-ink)" }}>
                  {fmt(reel.likes_count)}
                </strong>{" "}
                likes
              </span>
              {reel.views_count != null && (
                <span>
                  <Eye size={12} style={{ display: "inline", marginRight: 4 }} />
                  <strong style={{ color: "var(--color-rv-ink)" }}>
                    {fmt(reel.views_count)}
                  </strong>{" "}
                  views
                </span>
              )}
              {reel.duration_seconds != null && (
                <span>
                  <strong style={{ color: "var(--color-rv-ink)" }}>
                    {reel.duration_seconds}s
                  </strong>{" "}
                  duração
                </span>
              )}
            </div>

            {/* Hook pattern */}
            {reel.hook_pattern && (
              <div
                style={{
                  background: "var(--color-rv-soft)",
                  border: "1px solid var(--color-rv-line)",
                  borderLeft: "3px solid var(--color-rv-rec)",
                  padding: "10px 14px",
                  marginBottom: 16,
                }}
              >
                <div
                  className="rv-mono"
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--color-rv-muted)",
                    marginBottom: 4,
                  }}
                >
                  Hook
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.45, color: "var(--color-rv-ink)" }}>
                  &ldquo;{reel.hook_pattern}&rdquo;
                </p>
              </div>
            )}

            {/* Caption preview (truncada) */}
            {reel.caption && (
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--color-rv-muted)",
                  marginBottom: 22,
                  whiteSpace: "pre-line",
                }}
              >
                {reel.caption.length > 280
                  ? `${reel.caption.slice(0, 280)}…`
                  : reel.caption}
              </p>
            )}

            {/* Ações */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onAdapt}
                className="rv-btn rv-btn-rec"
                style={{
                  flex: "1 1 240px",
                  padding: "13px 16px",
                  fontSize: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Sparkles size={13} />
                Adaptar este reel
              </button>
              {reel.ig_url && (
                <a
                  href={reel.ig_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rv-btn rv-btn-ghost"
                  style={{
                    padding: "13px 16px",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    textDecoration: "none",
                  }}
                >
                  <ExternalLink size={12} />
                  Ver no Instagram
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
