"use client";

/**
 * /app/biblioteca — feed unificado de inspiração viral.
 *
 * Mistura num único grid:
 *  - REELS ANALISADOS: vídeos reais (hormozi, etc) com transcript +
 *    análise gerada pelo Gemini. Click abre modal completo.
 *  - PAUTAS: 101 ideias da Kaleidos importadas do Notion. Click leva
 *    pro /app com `tema = título` + perfil do user pre-preenchido.
 *
 * Free user: tudo borrado + watermark "Pro" + CTA pra assinar.
 * Paid user: feed misto, filtros por tipo, search, paywall só de reels
 * é mantido pra detalhe (transcript+análise).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Heart,
  Lock,
  Sparkles,
  Play,
  Eye,
  Loader2,
  Search,
  X,
  ExternalLink,
  ChevronDown,
  Settings as SettingsIcon,
  Lightbulb,
  Film,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { useNeonSession, getJwtToken } from "@/lib/auth-client";
import type { SourceAnalysis, Objetivo } from "@/lib/types";

const PENDING_FORM_KEY = "rv_pending_brief";

interface SourceIdeaRef {
  id: string;
  position: number;
  title: string;
}

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
  sourceIdea?: SourceIdeaRef | null;
}

interface SceneFrame {
  label: string;
  papel: string;
  tempo: string;
  startSec: number;
  texto: string;
  dataUrl: string;
}

interface LibraryReelDetail {
  id: string;
  igUrl: string;
  shortCode: string | null;
  authorHandle: string | null;
  caption: string | null;
  thumbUrl: string | null;
  likesCount: number | null;
  viewsCount: number | null;
  durationSeconds: number | null;
  templateType: string | null;
  hookPattern: string | null;
  featured: boolean;
  transcript: string | null;
  analysis: SourceAnalysis | null;
  analyzedAt: string | null;
  sourceIdea?: SourceIdeaRef | null;
  sceneFrames?: SceneFrame[] | null;
}

interface ApiResponse {
  reels: LibraryReel[];
  unlocked: boolean;
}

interface LibraryIdea {
  id: string;
  position: number;
  title: string;
  formato: string | null;
  tipo: string | null;
  piramide: string | null;
  featured: boolean;
  searchQuery: string | null;
  searchUrl: string | null;
  exampleUrls: string[];
  howToAdapt: string | null;
}

interface IdeasResponse {
  ideas: LibraryIdea[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

type KindFilter = "all" | "reels" | "ideias";

// Tipo unificado pra renderizar reels + ideias no mesmo grid
type FeedItem =
  | { kind: "reel"; data: LibraryReel; sortKey: number }
  | { kind: "idea"; data: LibraryIdea; sortKey: number };

interface UserProfile {
  igHandle: string | null;
  nicho: string | null;
  persona: string | null;
  objetivoPadrao: Objetivo | null;
  ctaPadrao: string | null;
}

const TEMPLATES: Array<{ id: string; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "hook_face_cam", label: "Hook face-cam" },
  { id: "transition", label: "Transição" },
  { id: "duet", label: "Dueto" },
  { id: "pov", label: "POV" },
  { id: "tutorial", label: "Tutorial" },
];

// Placeholder quando biblioteca tá vazia / borrada
const PLACEHOLDER_REELS: LibraryReel[] = Array.from({ length: 8 }, (_, i) => ({
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


function thumbProxy(url: string | null): string | null {
  if (!url) return null;
  return `/api/img?u=${encodeURIComponent(url)}`;
}

export default function LibraryPage() {
  const router = useRouter();
  useNeonSession();
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [reels, setReels] = useState<LibraryReel[]>([]);
  const [ideas, setIdeas] = useState<LibraryIdea[]>([]);
  const [ideasTotal, setIdeasTotal] = useState(0);
  const [showAllIdeas, setShowAllIdeas] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedReel, setSelectedReel] = useState<LibraryReel | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Filtra reels client-side por search query
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

  // Filtra ideias client-side por search
  const filteredIdeas = useMemo(() => {
    if (!search.trim()) return ideas;
    const q = search.toLowerCase();
    return ideas.filter((i) =>
      [i.title, i.formato ?? "", i.tipo ?? "", i.piramide ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [ideas, search]);

  // Feed unificado — reels primeiro (têm thumb visual), depois pautas.
  // Featured de cada lado vai pro topo dentro do próprio bloco.
  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    if (kindFilter === "all" || kindFilter === "reels") {
      filteredReels.forEach((r, idx) => {
        items.push({
          kind: "reel",
          data: r,
          sortKey: (r.featured ? 0 : 1) * 1000 + idx,
        });
      });
    }
    if (kindFilter === "all" || kindFilter === "ideias") {
      filteredIdeas.forEach((i) => {
        items.push({
          kind: "idea",
          data: i,
          sortKey: 10_000 + (i.featured ? 0 : 1) * 1000 + i.position,
        });
      });
    }
    return items.sort((a, b) => a.sortKey - b.sortKey);
  }, [filteredReels, filteredIdeas, kindFilter]);

  const reelCountVisible = filteredReels.length;
  const ideaCountVisible = filteredIdeas.length;

  // Carrega perfil do user (pra usar no botão "Pegar pro meu perfil")
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const jwt = await getJwtToken();
        if (!jwt) return;
        const res = await fetch("/api/me/profile", {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as UserProfile;
        if (!cancelled) setProfile(data);
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Carrega reels + ideias em paralelo (feed unificado)
  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    const reelsParams = new URLSearchParams();
    if (filter !== "all") reelsParams.set("template", filter);
    reelsParams.set("limit", "60");
    const ideasLimit = showAllIdeas ? 101 : 16;
    (async () => {
      try {
        const jwt = await getJwtToken();
        const reelsHeaders = jwt ? { Authorization: `Bearer ${jwt}` } : undefined;
        const [reelsRes, ideasRes] = await Promise.all([
          fetch(`/api/library?${reelsParams.toString()}`, { headers: reelsHeaders }),
          fetch(`/api/library/ideas?limit=${ideasLimit}`),
        ]);
        const reelsData = (await reelsRes.json()) as ApiResponse;
        const ideasData = (await ideasRes.json()) as IdeasResponse;
        if (cancelled) return;
        const reelsList =
          reelsData.reels.length > 0 ? reelsData.reels : PLACEHOLDER_REELS;
        setReels(reelsList);
        setUnlocked(Boolean(reelsData.unlocked));
        setIdeas(ideasData.ideas ?? []);
        setIdeasTotal(ideasData.total ?? 0);
      } catch {
        if (cancelled) return;
        setReels(PLACEHOLDER_REELS);
        setIdeas([]);
        setUnlocked(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, showAllIdeas]);

  function handleAdaptIdea(idea: LibraryIdea) {
    if (!profile?.nicho || !profile?.persona) {
      toast.error(
        "Preenche teu perfil em Ajustes primeiro pra adaptar com contexto.",
        {
          action: {
            label: "Ajustes",
            onClick: () => router.push("/app/ajustes"),
          },
        },
      );
      return;
    }
    try {
      sessionStorage.setItem(
        PENDING_FORM_KEY,
        JSON.stringify({
          sourceUrl: "",
          tema: idea.title,
          objetivo: profile.objetivoPadrao ?? "seguidores",
          cta: profile.ctaPadrao ?? "",
          persona: profile.persona ?? "",
          nicho: profile.nicho ?? "",
          autoRun: false,
        }),
      );
    } catch {
      /* sessionStorage bloqueado */
    }
    router.push("/app");
  }

  function handleAdaptWithProfile(detail: LibraryReelDetail) {
    if (!detail.igUrl) return;
    if (!profile?.nicho || !profile?.persona) {
      toast.error(
        "Preenche teu perfil em Ajustes primeiro pra adaptar com contexto.",
        {
          action: {
            label: "Ajustes",
            onClick: () => router.push("/app/ajustes"),
          },
        },
      );
      return;
    }
    try {
      sessionStorage.setItem(
        PENDING_FORM_KEY,
        JSON.stringify({
          sourceUrl: detail.igUrl,
          tema: detail.templateType
            ? `Adaptação de ${detail.templateType.replace(/_/g, " ")} pro meu nicho`
            : "Adaptação pro meu nicho",
          objetivo: profile.objetivoPadrao ?? "seguidores",
          cta: profile.ctaPadrao ?? "",
          persona: profile.persona ?? "",
          nicho: profile.nicho ?? "",
          autoRun: false,
        }),
      );
    } catch {
      /* sessionStorage bloqueado */
    }
    router.push("/app");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--color-rv-paper)",
        color: "var(--color-rv-ink)",
      }}
    >
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 80px" }}>
        <div style={{ marginBottom: 20 }}>
          <h1
            className="rv-display"
            style={{ fontSize: 36, lineHeight: 1.05, marginBottom: 8 }}
          >
            Biblioteca <em>viral</em>.
          </h1>
          <p style={{ fontSize: 14, color: "var(--color-rv-muted)", maxWidth: 680 }}>
            Reels reais com transcrição + análise misturados com pautas
            testadas. Clica num reel pra ver a engenharia reversa, ou numa
            pauta pra usar como tema do teu próximo vídeo (adaptado com tua
            voz definida em <Link href="/app/ajustes" style={{ color: "var(--color-rv-rec)", textDecoration: "underline" }}>Ajustes</Link>).
          </p>
        </div>

        {/* Chip filter Tudo / Reels / Pautas */}
        <div
          role="tablist"
          aria-label="Tipo de biblioteca"
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {(
            [
              { id: "all" as const, label: "Tudo", icon: Sparkles, count: reels.length + ideas.length },
              { id: "reels" as const, label: "Reels analisados", icon: Film, count: reels.length },
              { id: "ideias" as const, label: "Pautas", icon: Lightbulb, count: ideas.length },
            ]
          ).map((t) => {
            const active = kindFilter === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setKindFilter(t.id)}
                className="rv-mono"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "9px 14px",
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  background: active ? "var(--color-rv-ink)" : "white",
                  color: active ? "white" : "var(--color-rv-ink)",
                  border: "1.5px solid var(--color-rv-ink)",
                  cursor: "pointer",
                  boxShadow: active ? "3px 3px 0 0 var(--color-rv-rec)" : "none",
                  transition: "all 0.12s",
                }}
              >
                <Icon size={12} />
                {t.label}
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "1px 6px",
                    background: active
                      ? "rgba(255,255,255,0.18)"
                      : "var(--color-rv-soft)",
                    color: active ? "white" : "var(--color-rv-muted)",
                    letterSpacing: "0.08em",
                  }}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Banner perfil incompleto */}
        {unlocked && profile && (!profile.nicho || !profile.persona) && (
          <div
            style={{
              background: "rgba(255, 61, 46, 0.06)",
              border: "1.5px solid var(--color-rv-rec)",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <SettingsIcon size={16} color="var(--color-rv-rec)" />
              <span style={{ fontSize: 13, color: "var(--color-rv-ink)" }}>
                Configura @ + nicho + persona em <strong>Ajustes</strong> pra
                adaptar reels com contexto do teu perfil.
              </span>
            </div>
            <Link
              href="/app/ajustes"
              className="rv-btn rv-btn-rec"
              style={{ padding: "9px 14px", fontSize: 11, whiteSpace: "nowrap" }}
            >
              Ir pra ajustes →
            </Link>
          </div>
        )}

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
              placeholder="Busca por handle, caption, pauta ou hook…"
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

        {/* Filtros de template — relevantes só pros reels */}
        {(kindFilter === "reels" || kindFilter === "all") && (
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
        )}

        {/* Loading */}
        {loading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: 60,
              color: "var(--color-rv-muted)",
            }}
          >
            <Loader2 size={24} className="rv-spin" />
          </div>
        )}

        {/* Feed unificado: reels + ideias */}
        {!loading && (
          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 8,
                filter: unlocked ? "none" : "blur(14px)",
                pointerEvents: unlocked ? "auto" : "none",
                userSelect: unlocked ? "auto" : "none",
                transition: "filter 0.3s ease",
              }}
            >
              {feed.map((item) =>
                item.kind === "reel" ? (
                  <ReelCard
                    key={`reel-${item.data.id}`}
                    reel={item.data}
                    unlocked={unlocked}
                    onClick={() => setSelectedReel(item.data)}
                  />
                ) : (
                  <IdeaCard
                    key={`idea-${item.data.id}`}
                    idea={item.data}
                    onAdapt={handleAdaptIdea}
                  />
                ),
              )}
            </div>

            {/* Load more pautas */}
            {unlocked &&
              !showAllIdeas &&
              kindFilter !== "reels" &&
              ideaCountVisible < ideasTotal && (
                <div
                  style={{ display: "flex", justifyContent: "center", marginTop: 22 }}
                >
                  <button
                    type="button"
                    onClick={() => setShowAllIdeas(true)}
                    className="rv-btn rv-btn-ghost"
                    style={{
                      padding: "11px 20px",
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <ChevronDown size={13} /> Ver todas as {ideasTotal} pautas
                  </button>
                </div>
              )}

            {/* Resumo do que está sendo exibido */}
            {unlocked && (
              <div
                className="rv-mono"
                style={{
                  textAlign: "center",
                  marginTop: 18,
                  fontSize: 10,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--color-rv-muted)",
                }}
              >
                Exibindo {feed.length} {feed.length === 1 ? "item" : "itens"} ·{" "}
                {kindFilter === "ideias" ? 0 : reelCountVisible} reel
                {reelCountVisible === 1 ? "" : "s"} ·{" "}
                {kindFilter === "reels" ? 0 : ideaCountVisible} pauta
                {ideaCountVisible === 1 ? "" : "s"}
              </div>
            )}

            {/* Paywall overlay */}
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
                    {reels.length}+ reels virais com transcript, análise e
                    template mapeado. Disponível no plano Basic (R$ 14,90/mês).
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

      {selectedReel && (
        <ReelDetailModal
          reel={selectedReel}
          onClose={() => setSelectedReel(null)}
          onAdapt={handleAdaptWithProfile}
          profileReady={Boolean(profile?.nicho && profile?.persona)}
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
  const proxiedThumb = unlocked ? thumbProxy(reel.thumb_url) : null;
  const cardContent = (
    <>
      <div
        style={{
          aspectRatio: "9 / 16",
          background: proxiedThumb
            ? `url(${proxiedThumb}) center/cover`
            : "linear-gradient(135deg, #2a1a14, #4a2a1f, #1a1a1a)",
          position: "relative",
          overflow: "hidden",
        }}
      >
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
              zIndex: 2,
            }}
          >
            ⭐ TOP
          </div>
        )}
        {/* Badge tipo */}
        <div
          className="rv-mono"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(10, 9, 8, 0.85)",
            color: "white",
            fontSize: 8,
            fontWeight: 800,
            letterSpacing: "0.14em",
            padding: "3px 6px",
            zIndex: 2,
            backdropFilter: "blur(4px)",
          }}
        >
          REEL
        </div>
        {/* Badge "Pauta de origem" */}
        {reel.sourceIdea && unlocked && (
          <div
            className="rv-mono"
            title={reel.sourceIdea.title}
            style={{
              position: "absolute",
              bottom: 38,
              left: 8,
              background: "var(--color-rv-rec)",
              color: "white",
              fontSize: 8,
              fontWeight: 800,
              letterSpacing: "0.14em",
              padding: "3px 6px",
              zIndex: 2,
              maxWidth: "calc(100% - 16px)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            PAUTA #{String(reel.sourceIdea.position).padStart(3, "0")}
          </div>
        )}
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

// ─── Modal detalhe ─────────────────────────────────────────────────

function ReelDetailModal({
  reel,
  onClose,
  onAdapt,
  profileReady,
}: {
  reel: LibraryReel;
  onClose: () => void;
  onAdapt: (detail: LibraryReelDetail) => void;
  profileReady: boolean;
}) {
  const [detail, setDetail] = useState<LibraryReelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fmt = (n: number | null | undefined): string => {
    if (n == null) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const jwt = await getJwtToken();
        const res = await fetch(`/api/library/${reel.id}`, {
          headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? `Erro ${res.status}`);
          return;
        }
        setDetail(data.reel as LibraryReelDetail);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erro");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reel.id]);

  const proxiedThumb = thumbProxy(detail?.thumbUrl ?? reel.thumb_url);

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
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 20,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 760,
          background: "var(--color-rv-cream)",
          border: "1.5px solid var(--color-rv-ink)",
          boxShadow: "10px 10px 0 0 var(--color-rv-rec)",
          padding: 0,
          position: "relative",
          marginTop: "max(2vh, 16px)",
          marginBottom: "max(2vh, 16px)",
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

        {/* Thumb */}
        <div
          style={{
            aspectRatio: "16 / 9",
            maxHeight: 280,
            background: proxiedThumb
              ? `url(${proxiedThumb}) center/cover`
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
          {/* Origem (se vier de uma pauta) */}
          {(detail?.sourceIdea ?? reel.sourceIdea) && (
            <div
              style={{
                background: "rgba(255, 61, 46, 0.06)",
                border: "1px solid var(--color-rv-rec)",
                borderLeft: "4px solid var(--color-rv-rec)",
                padding: "10px 14px",
                marginBottom: 16,
              }}
            >
              <div
                className="rv-mono"
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--color-rv-rec)",
                  marginBottom: 4,
                }}
              >
                Pauta de origem · #
                {String(
                  (detail?.sourceIdea ?? reel.sourceIdea)!.position,
                ).padStart(3, "0")}
              </div>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.45,
                  color: "var(--color-rv-ink)",
                }}
              >
                {(detail?.sourceIdea ?? reel.sourceIdea)!.title}
              </p>
            </div>
          )}

          <div className="rv-eyebrow" style={{ marginBottom: 8 }}>
            <span className="rv-rec-dot" />
            {reel.template_type?.replace(/_/g, " ").toUpperCase() ?? "REEL VIRAL"}
          </div>
          <h2
            className="rv-display"
            style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 14 }}
          >
            {reel.author_handle ?? "@viral_creator"}
          </h2>

          {/* Métricas */}
          <div
            style={{
              display: "flex",
              gap: 18,
              marginBottom: 22,
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

          {loading && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 10,
                padding: 40,
                color: "var(--color-rv-muted)",
                fontSize: 12,
              }}
            >
              <Loader2 size={16} className="rv-spin" />
              {detail?.analyzedAt ? "Carregando…" : "Analisando reel (~30s)…"}
            </div>
          )}

          {error && (
            <div
              style={{
                background: "rgba(255, 61, 46, 0.08)",
                border: "1px solid var(--color-rv-rec)",
                padding: "12px 14px",
                marginBottom: 16,
                fontSize: 12,
                color: "var(--color-rv-ink)",
              }}
            >
              {error}
            </div>
          )}

          {detail?.analysis && (
            <>
              {/* Resumo */}
              <Section title="Resumo">
                <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--color-rv-ink)" }}>
                  {detail.analysis.resumo}
                </p>
              </Section>

              {/* Cenas (frames extraídos via ffmpeg) */}
              {detail.sceneFrames && detail.sceneFrames.length > 0 && (
                <Section title="Cenas-chave">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${detail.sceneFrames.length}, 1fr)`,
                      gap: 6,
                    }}
                  >
                    {detail.sceneFrames.map((frame) => (
                      <div
                        key={frame.papel}
                        style={{
                          background: "var(--color-rv-ink)",
                          border: "1.5px solid var(--color-rv-ink)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            aspectRatio: "9 / 16",
                            background: `url(${frame.dataUrl}) center/cover`,
                          }}
                        >
                          <div
                            className="rv-mono"
                            style={{
                              position: "absolute",
                              top: 6,
                              left: 6,
                              background: "rgba(10,9,8,0.85)",
                              color: "white",
                              fontSize: 8,
                              fontWeight: 800,
                              letterSpacing: "0.12em",
                              padding: "2px 5px",
                            }}
                          >
                            {frame.label.toUpperCase()}
                          </div>
                          <div
                            className="rv-mono"
                            style={{
                              position: "absolute",
                              bottom: 6,
                              left: 6,
                              right: 6,
                              background: "rgba(10,9,8,0.85)",
                              color: "white",
                              fontSize: 8,
                              fontWeight: 700,
                              letterSpacing: "0.1em",
                              padding: "2px 5px",
                              textAlign: "center",
                            }}
                          >
                            {frame.tempo}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p
                    style={{
                      fontSize: 10,
                      color: "var(--color-rv-muted)",
                      marginTop: 6,
                      lineHeight: 1.4,
                    }}
                  >
                    5 frames extraídos do vídeo nos timestamps de cada cena
                    narrativa.
                  </p>
                </Section>
              )}

              {/* Estrutura */}
              <Section title="Estrutura">
                <div style={{ display: "grid", gap: 8 }}>
                  {(
                    [
                      ["Hook", detail.analysis.estrutura.hook],
                      ["Promessa", detail.analysis.estrutura.promessa],
                      ["Demonstração", detail.analysis.estrutura.demonstracao],
                      ["Prova social", detail.analysis.estrutura.provaSocial],
                      ["CTA", detail.analysis.estrutura.cta],
                    ] as const
                  ).map(([label, block]) => (
                    <div
                      key={label}
                      style={{
                        background: "white",
                        border: "1px solid var(--color-rv-line)",
                        borderLeft: "3px solid var(--color-rv-rec)",
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          justifyContent: "space-between",
                          marginBottom: 4,
                          gap: 8,
                        }}
                      >
                        <span
                          className="rv-mono"
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "var(--color-rv-ink)",
                          }}
                        >
                          {label}
                        </span>
                        <span
                          className="rv-mono"
                          style={{
                            fontSize: 9,
                            color: "var(--color-rv-muted)",
                          }}
                        >
                          {block.tempo}
                        </span>
                      </div>
                      <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-rv-ink)" }}>
                        {block.texto}
                      </p>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Por que viralizou */}
              <Section title="Por que viralizou">
                <ul style={{ display: "grid", gap: 6, paddingLeft: 18 }}>
                  {detail.analysis.porQueViralizou.map((why, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        color: "var(--color-rv-ink)",
                      }}
                    >
                      {why}
                    </li>
                  ))}
                </ul>
              </Section>

              {/* Padrões transferíveis */}
              <Section title="Padrões transferíveis">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {detail.analysis.padroesTransferiveis.map((p, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 11,
                        padding: "5px 9px",
                        background: "var(--color-rv-soft)",
                        border: "1px solid var(--color-rv-line)",
                        color: "var(--color-rv-ink)",
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </Section>

              {/* Transcript */}
              {detail.transcript && (
                <Section title="Transcrição">
                  <div
                    style={{
                      background: "white",
                      border: "1px solid var(--color-rv-line)",
                      padding: "12px 14px",
                      fontSize: 12.5,
                      lineHeight: 1.6,
                      color: "var(--color-rv-ink)",
                      whiteSpace: "pre-wrap",
                      maxHeight: 280,
                      overflowY: "auto",
                    }}
                  >
                    {detail.transcript}
                  </div>
                </Section>
              )}
            </>
          )}

          {/* Caption */}
          {(detail?.caption || reel.caption) && (
            <Section title="Caption original">
              <p
                style={{
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: "var(--color-rv-muted)",
                  whiteSpace: "pre-line",
                }}
              >
                {(detail?.caption ?? reel.caption ?? "")}
              </p>
            </Section>
          )}

          {/* Ações */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
            <button
              type="button"
              onClick={() => detail && onAdapt(detail)}
              disabled={!detail || loading}
              className="rv-btn rv-btn-rec"
              style={{
                flex: "1 1 280px",
                padding: "14px 16px",
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                opacity: !detail || loading ? 0.6 : 1,
              }}
            >
              <Sparkles size={13} />
              {profileReady ? "Pegar pro meu perfil" : "Pegar pra adaptar"}
            </button>
            {(detail?.igUrl || reel.ig_url) && (
              <a
                href={detail?.igUrl ?? reel.ig_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rv-btn rv-btn-ghost"
                style={{
                  padding: "14px 16px",
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
  );
}

// ─── Card de Ideia ─────────────────────────────────────────────────

function IdeaCard({
  idea,
  onAdapt,
}: {
  idea: LibraryIdea;
  onAdapt: (idea: LibraryIdea) => void;
}) {
  const examplesCount = idea.exampleUrls?.length ?? 0;
  const sourceLabel = idea.searchUrl?.includes("tiktok")
    ? "TikTok"
    : idea.searchUrl?.includes("instagram")
      ? "Instagram"
      : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onAdapt(idea)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAdapt(idea);
        }
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 0,
        textAlign: "left",
        background: "var(--color-rv-cream)",
        border: "1.5px solid var(--color-rv-ink)",
        cursor: "pointer",
        position: "relative",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translate(-2px, -2px)";
        e.currentTarget.style.boxShadow = "4px 4px 0 0 var(--color-rv-rec)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translate(0, 0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Bloco superior — proporção 9/16 igual reel pra alinhar grid */}
      <div
        style={{
          aspectRatio: "9 / 16",
          background:
            "repeating-linear-gradient(135deg, var(--color-rv-cream) 0 12px, var(--color-rv-soft) 12px 24px)",
          position: "relative",
          padding: "18px 16px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          borderBottom: "1.5px solid var(--color-rv-ink)",
        }}
      >
        {/* Badge tipo */}
        <div
          className="rv-mono"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "var(--color-rv-ink)",
            color: "white",
            fontSize: 8,
            fontWeight: 800,
            letterSpacing: "0.14em",
            padding: "3px 6px",
            zIndex: 2,
          }}
        >
          PAUTA
        </div>

        {idea.featured && (
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
              zIndex: 2,
            }}
          >
            ⭐ TOP
          </div>
        )}

        <div
          className="rv-mono"
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--color-rv-rec)",
            marginTop: 24,
          }}
        >
          #{String(idea.position).padStart(3, "0")}
        </div>

        <p
          style={{
            fontSize: 15,
            lineHeight: 1.4,
            color: "var(--color-rv-ink)",
            fontWeight: 600,
            display: "-webkit-box",
            WebkitLineClamp: 6,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {idea.title}
        </p>

        <div
          className="rv-mono"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--color-rv-rec)",
          }}
        >
          Adaptar <ArrowRight size={11} />
        </div>
      </div>

      {/* Footer com tags + meta */}
      <div
        style={{
          padding: "8px 10px",
          background: "var(--color-rv-cream)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          minHeight: 38,
        }}
      >
        {idea.formato && (
          <span
            style={{
              fontSize: 10,
              padding: "3px 7px",
              background: "var(--color-rv-soft)",
              color: "var(--color-rv-ink)",
            }}
          >
            {idea.formato}
          </span>
        )}
        {idea.tipo && (
          <span
            style={{
              fontSize: 10,
              padding: "3px 7px",
              background: "var(--color-rv-soft)",
              color: "var(--color-rv-ink)",
            }}
          >
            {idea.tipo}
          </span>
        )}
        {idea.piramide && (
          <span
            style={{
              fontSize: 10,
              padding: "3px 7px",
              background: "var(--color-rv-soft)",
              color: "var(--color-rv-ink)",
            }}
          >
            {idea.piramide}
          </span>
        )}
        {!idea.formato && !idea.tipo && !idea.piramide && (
          <span
            className="rv-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-rv-muted)",
            }}
          >
            kaleidos · 100 ideias
          </span>
        )}
        {(sourceLabel || examplesCount > 0) && (
          <span style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
            {sourceLabel && (
              <a
                href={idea.searchUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                title={`Buscar exemplos no ${sourceLabel}`}
                className="rv-mono"
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  padding: "3px 7px",
                  background: "var(--color-rv-ink)",
                  color: "white",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Search size={9} />
                {sourceLabel}
              </a>
            )}
            {examplesCount > 0 && (
              <span
                className="rv-mono"
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  padding: "3px 7px",
                  background: "var(--color-rv-rec)",
                  color: "white",
                }}
                title={`${examplesCount} exemplos curados`}
              >
                {examplesCount} ex
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        className="rv-mono"
        style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--color-rv-muted)",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
