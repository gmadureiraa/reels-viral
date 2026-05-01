"use client";

/**
 * /app — página principal do app interno (formulário de adaptar reel +
 * resultado). Auth gate vive no app/layout.tsx; aqui assumimos user logado.
 *
 * Header próprio removido — sidebar (em layout.tsx) faz a navegação.
 *
 * Detecta brief pendente em sessionStorage (vindo da landing /) e dispara
 * geração automaticamente.
 */

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Clipboard,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { isValidInstagramUrl } from "@/lib/utils";
import type { AdaptBrief, AdaptResponse } from "@/lib/types";
import { ResultView } from "@/components/result-view";
import { LoadingPipeline } from "@/components/loading-pipeline";
import { AuthDialog } from "@/components/auth-dialog";
import { QuotaBlockedModal } from "@/components/quota-blocked-modal";
import { useNeonSession, getJwtToken } from "@/lib/auth-client";

const OBJETIVOS: Array<{
  id: AdaptBrief["objetivo"];
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "leads", label: "Gerar leads", icon: <Target size={14} /> },
  { id: "produto", label: "Vender produto", icon: <Zap size={14} /> },
  {
    id: "seguidores",
    label: "Crescer seguidores",
    icon: <Users size={14} />,
  },
  {
    id: "engajamento",
    label: "Engajamento",
    icon: <TrendingUp size={14} />,
  },
];

/**
 * Gera ou recupera um device ID persistente no localStorage.
 * Usado como fingerprint adicional pra rate limit de usuários anônimos.
 * Dificulta abuse por troca de IP sem criar conta.
 */
function getOrCreateDeviceId(): string {
  const KEY = "rv_device_id";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const newId = crypto.randomUUID();
    localStorage.setItem(KEY, newId);
    return newId;
  } catch {
    // localStorage bloqueado (modo privado extremo) — retorna fallback vazio
    return "";
  }
}

// Persistência do form pendente em sessionStorage — sobrevive ao redirect
// OAuth do Google (que recarrega a página).
const PENDING_FORM_KEY = "rv_pending_brief";

interface PendingBrief {
  sourceUrl: string;
  tema: string;
  objetivo: AdaptBrief["objetivo"];
  cta: string;
  persona?: string;
  nicho?: string;
}

export default function Home() {
  const [step, setStep] = useState<"form" | "loading" | "result">("form");
  // Referência ao device ID — inicializado no useEffect pra evitar SSR mismatch
  const deviceIdRef = useRef<string>("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [tema, setTema] = useState("");
  const [objetivo, setObjetivo] =
    useState<AdaptBrief["objetivo"]>("seguidores");
  const [cta, setCta] = useState("");
  const [persona, setPersona] = useState("");
  const [nicho, setNicho] = useState("");
  const [result, setResult] = useState<AdaptResponse | null>(null);

  // Auth gate pra interceptar submit anônimo
  const session = useNeonSession();
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const pendingBriefRef = useRef<PendingBrief | null>(null);

  // Quota blocked (paywall) — abre quando API responde 402 quota_exceeded
  const [quotaBlock, setQuotaBlock] = useState<{
    used: number;
    limit: number;
    resetsAt: string;
  } | null>(null);

  // Primeiro nome do user (pra saudação no header)
  const userFirstName = (() => {
    const u = session.data?.user;
    if (!u) return "";
    if (u.name) return u.name.split(" ")[0];
    if (u.email) return u.email.split("@")[0].split(".")[0];
    return "";
  })();

  // Inicializa device ID no cliente (pós-hidratação)
  useEffect(() => {
    deviceIdRef.current = getOrCreateDeviceId();
  }, []);

  // Após login (incluindo redirect OAuth), restaura form pendente e dispara
  // a geração automaticamente.
  useEffect(() => {
    if (session.isPending || !session.data?.user) return;
    let pending: PendingBrief | null = pendingBriefRef.current;
    if (!pending && typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(PENDING_FORM_KEY);
        if (raw) pending = JSON.parse(raw) as PendingBrief;
      } catch {
        // ignore parse errors
      }
    }
    if (!pending) return;
    // Limpa antes de disparar pra evitar loop em re-renders
    pendingBriefRef.current = null;
    try {
      sessionStorage.removeItem(PENDING_FORM_KEY);
    } catch {
      /* noop */
    }
    // Restaura state visualmente e dispara geração
    setSourceUrl(pending.sourceUrl);
    setTema(pending.tema);
    setObjetivo(pending.objetivo);
    setCta(pending.cta);
    if (pending.persona) setPersona(pending.persona);
    if (pending.nicho) setNicho(pending.nicho);
    setShowAuthDialog(false);
    // Pequeno delay pra garantir que setState propagou antes do fetch
    window.setTimeout(() => {
      void runAdapt(pending);
    }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isPending, session.data?.user?.id]);

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && isValidInstagramUrl(text)) {
        setSourceUrl(text);
        toast.success("Link colado");
      } else {
        toast.error("Clipboard não tem URL de Reel válida");
      }
    } catch {
      toast.error("Não consegui ler o clipboard");
    }
  }

  /**
   * Executa a chamada à API com o brief. Pode ser disparado pelo submit
   * direto (user logado) ou pelo useEffect pós-login (auth wall completou).
   */
  async function runAdapt(brief: PendingBrief) {
    setStep("loading");
    setResult(null);

    // Timeout client-side @ 55s — o backend tem maxDuration 60s mas o
    // pipeline pode estourar. Com AbortController, ganhamos 5s de margem
    // pra fechar conexão e dar mensagem decente.
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 55_000);

    try {
      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (deviceIdRef.current) {
        reqHeaders["X-Device-Id"] = deviceIdRef.current;
      }
      // Manda JWT pro server saber o user real — sem isso a quota e o
      // rate-limit caem no trilho anônimo (paywall bypassado).
      const jwt = await getJwtToken();
      if (jwt) reqHeaders["Authorization"] = `Bearer ${jwt}`;

      const res = await fetch("/api/adapt-reel", {
        method: "POST",
        headers: reqHeaders,
        signal: controller.signal,
        body: JSON.stringify({
          sourceUrl: brief.sourceUrl.trim(),
          tema: brief.tema.trim(),
          objetivo: brief.objetivo,
          cta: brief.cta.trim(),
          persona: brief.persona?.trim() || undefined,
          nicho: brief.nicho?.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.status === 402 && data?.code === "quota_exceeded" && data?.quota) {
        // Limite mensal atingido — abre modal paywall
        setQuotaBlock({
          used: data.quota.used,
          limit: data.quota.limit,
          resetsAt: data.quota.resetsAt,
        });
        setStep("form");
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || "Falha desconhecida");
      }
      setResult(data as AdaptResponse);
      setStep("result");
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("aborted"));
      const msg = isAbort
        ? "Demorou demais (>55s). Esse Reel pode ser longo ou nossa fila tá pesada — tenta de novo em alguns segundos."
        : err instanceof Error
          ? err.message
          : "Erro desconhecido";
      toast.error(msg, { duration: isAbort ? 8000 : 4000 });
      setStep("form");
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidInstagramUrl(sourceUrl)) {
      toast.error("Cola um link de Reel/post Instagram válido");
      return;
    }
    if (tema.trim().length < 3) {
      toast.error("Descreve o tema do TEU vídeo (mínimo 3 chars)");
      return;
    }
    if (cta.trim().length < 2) {
      toast.error("Define o CTA — o que o user vai fazer?");
      return;
    }

    const brief: PendingBrief = {
      sourceUrl: sourceUrl.trim(),
      tema: tema.trim(),
      objetivo,
      cta: cta.trim(),
      persona: persona.trim() || undefined,
      nicho: nicho.trim() || undefined,
    };

    // ── LOGIN WALL ──────────────────────────────────────────────────────
    // Intercepta antes do fetch: se anônimo, persiste brief em sessionStorage
    // (sobrevive a redirect OAuth Google) + abre AuthDialog. Após login,
    // useEffect detecta sessão e dispara runAdapt automaticamente.
    if (!session.isPending && !session.data?.user) {
      pendingBriefRef.current = brief;
      try {
        sessionStorage.setItem(PENDING_FORM_KEY, JSON.stringify(brief));
      } catch {
        /* sessionStorage bloqueado — segue só com ref */
      }
      setShowAuthDialog(true);
      return;
    }

    // User logado: dispara direto
    void runAdapt(brief);
  }

  function handleReset() {
    setStep("form");
    setResult(null);
    setSourceUrl("");
    setTema("");
    setCta("");
    setPersona("");
    setNicho("");
  }

  return (
    <main className="min-h-dvh">

      <AnimatePresence mode="wait">
        {step === "form" && (
          <motion.section
            key="form"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mx-auto"
            style={{ maxWidth: 1180, padding: "60px 28px 100px" }}
          >
            {/* HEADER COMPACTO — substitui hero gigante (já vive na landing) */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 18,
                flexWrap: "wrap",
                marginBottom: 12,
              }}
            >
              <div>
                <span className="rv-eyebrow">
                  <span className="rv-rec-dot" /> NOVO REEL · ENGENHARIA REVERSA
                </span>
                <h1
                  className="rv-display mt-3"
                  style={{
                    fontSize: "clamp(32px, 4vw, 48px)",
                    lineHeight: 1.05,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Olá{userFirstName ? <>, <em>{userFirstName}</em></> : <em></em>}.
                  Cole o link e <em>adapta</em>.
                </h1>
              </div>
              <QuotaCard />
            </div>
            <p
              className="rv-mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--color-rv-muted)",
                marginBottom: 32,
              }}
            >
              Reel viral → análise estrutural → roteiro novo cena por cena
            </p>

            {/* FORM PRINCIPAL */}
            <form
              onSubmit={handleSubmit}
              className="mt-16"
              style={{
                background: "var(--color-rv-cream)",
                border: "1.5px solid var(--color-rv-ink)",
                boxShadow: "8px 8px 0 0 var(--color-rv-ink)",
                padding: "32px 32px 28px",
              }}
            >
              <div className="rv-eyebrow mb-3">
                <span className="rv-rec-dot" /> 01 · COLE O LINK DO REEL VIRAL
              </div>
              <div
                className="flex items-stretch gap-2"
                style={{
                  border: "1.5px solid var(--color-rv-ink)",
                  background: "white",
                }}
              >
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://www.instagram.com/reel/..."
                  spellCheck={false}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    padding: "16px 18px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 15,
                    color: "var(--color-rv-ink)",
                  }}
                />
                <button
                  type="button"
                  onClick={handlePaste}
                  className="flex items-center gap-2 px-4"
                  style={{
                    borderLeft: "1.5px solid var(--color-rv-ink)",
                    background: "var(--color-rv-paper)",
                    cursor: "pointer",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                  }}
                >
                  <Clipboard size={14} /> Colar
                </button>
              </div>

              <div className="mt-7 grid gap-5 grid-cols-1 sm:grid-cols-2">
                <div>
                  <label className="rv-eyebrow mb-2 block">
                    02 · O TEMA DO SEU VÍDEO
                  </label>
                  <textarea
                    value={tema}
                    onChange={(e) => setTema(e.target.value)}
                    rows={2}
                    placeholder="Ex: ferramenta IA pra editar fotos / consultoria fitness pra mães / newsletter de cripto..."
                    style={{
                      width: "100%",
                      border: "1.5px solid var(--color-rv-ink)",
                      background: "white",
                      padding: "12px 14px",
                      fontFamily: "var(--font-jakarta), sans-serif",
                      fontSize: 14,
                      lineHeight: 1.4,
                      resize: "none",
                      outline: "none",
                    }}
                  />
                </div>
                <div>
                  <label className="rv-eyebrow mb-2 block">04 · CTA DESEJADO</label>
                  <textarea
                    value={cta}
                    onChange={(e) => setCta(e.target.value)}
                    rows={2}
                    placeholder="Ex: comenta APP que mando o link / clica no link da bio / manda DM..."
                    style={{
                      width: "100%",
                      border: "1.5px solid var(--color-rv-ink)",
                      background: "white",
                      padding: "12px 14px",
                      fontFamily: "var(--font-jakarta), sans-serif",
                      fontSize: 14,
                      lineHeight: 1.4,
                      resize: "none",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              <div className="mt-6">
                <label className="rv-eyebrow mb-3 block">
                  03 · OBJETIVO PRINCIPAL
                </label>
                <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                  {OBJETIVOS.map((o) => {
                    const active = objetivo === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setObjetivo(o.id)}
                        className="flex items-center justify-center gap-2"
                        style={{
                          border: "1.5px solid var(--color-rv-ink)",
                          background: active
                            ? "var(--color-rv-ink)"
                            : "white",
                          color: active
                            ? "var(--color-rv-cream)"
                            : "var(--color-rv-ink)",
                          padding: "12px 10px",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          cursor: "pointer",
                          boxShadow: active
                            ? "3px 3px 0 0 var(--color-rv-rec)"
                            : "none",
                          transition: "all 120ms",
                        }}
                      >
                        {o.icon} {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 grid gap-5 grid-cols-1 sm:grid-cols-2">
                <div>
                  <label className="rv-eyebrow mb-2 block">
                    05 · PERSONA / PÚBLICO <span style={{ opacity: 0.6 }}>(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={persona}
                    onChange={(e) => setPersona(e.target.value)}
                    placeholder="Ex: criadores iniciantes 18-25 anos"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="rv-eyebrow mb-2 block">
                    06 · NICHO <span style={{ opacity: 0.6 }}>(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={nicho}
                    onChange={(e) => setNicho(e.target.value)}
                    placeholder="Ex: marketing digital, finanças, fitness..."
                    style={inputStyle}
                  />
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between gap-4">
                <p
                  className="rv-mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--color-rv-muted)",
                    maxWidth: 480,
                    lineHeight: 1.6,
                  }}
                >
                  ⚡ Pipeline: Apify scrape → Gemini transcreve & analisa → roteiro novo
                </p>
                <button type="submit" className="rv-btn rv-btn-rec">
                  <Sparkles size={14} /> Adaptar reel
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>

            {/* HOW IT WORKS */}
            <section className="mt-24">
              <div className="rv-eyebrow"><span className="rv-rec-dot" /> COMO FUNCIONA</div>
              <h2
                className="rv-display mt-3"
                style={{ fontSize: "clamp(34px, 4vw, 52px)" }}
              >
                Três passos. <em>Trinta segundos.</em>
              </h2>
              <div className="mt-10 grid gap-6 grid-cols-1 md:grid-cols-3">
                <Step
                  n="01"
                  title="Cola o link"
                  desc="Reel do TikTok/IG que viralizou. Pode ser seu, do concorrente, ou de qualquer criador grande do nicho."
                />
                <Step
                  n="02"
                  title="Define o briefing"
                  desc="Tema do TEU vídeo, objetivo (leads/produto/seguidor) e o CTA. A IA mantém a estrutura mas troca o conteúdo."
                />
                <Step
                  n="03"
                  title="Recebe o storyboard"
                  desc="Análise estrutural + roteiro cena por cena com tempo, visual, copy falada e nota de B-roll. Grava direto."
                />
              </div>
            </section>
          </motion.section>
        )}

        {step === "loading" && (
          <motion.section
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mx-auto"
            style={{ maxWidth: 720, padding: "120px 28px" }}
          >
            <LoadingPipeline />
          </motion.section>
        )}

        {step === "result" && result && (
          <motion.section
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mx-auto"
            style={{ maxWidth: 1280, padding: "40px 28px 100px" }}
          >
            {/* UnlockGate (email/whatsapp) removido 2026-05-01 — auth real
                Neon Auth substituiu o lead capture. Result é mostrado
                direto pra user logado (login wall fica antes do submit). */}
            <ResultView data={result} tema={tema} onReset={handleReset} />
          </motion.section>
        )}
      </AnimatePresence>

      {/* LOGIN WALL — abre quando user anônimo tenta gerar reel */}
      {showAuthDialog && (
        <AuthDialog
          title="Pra adaptar seu reel"
          subtitle="Cria conta em 10s e seu roteiro fica salvo. Plano free libera 3 reels/mês."
          onClose={() => setShowAuthDialog(false)}
          onSuccess={() => {
            // useEffect [session.data.user.id] detecta o user logado e
            // dispara runAdapt automaticamente. Aqui só refresh + close.
            session.refresh();
            setShowAuthDialog(false);
          }}
        />
      )}

      {/* PAYWALL — abre quando user logado free atinge limite mensal */}
      {quotaBlock && (
        <QuotaBlockedModal
          used={quotaBlock.used}
          limit={quotaBlock.limit}
          resetsAt={quotaBlock.resetsAt}
          onClose={() => setQuotaBlock(null)}
        />
      )}

    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid var(--color-rv-ink)",
  background: "white",
  padding: "12px 14px",
  fontFamily: "var(--font-jakarta), sans-serif",
  fontSize: 14,
  outline: "none",
};

// QuotaCard — mostra "X de Y reels usados este mês". Fetch silencioso.
// Free user vê CTA pra upgrade quando passa 50% da quota.
function QuotaCard() {
  const [quota, setQuota] = useState<{
    plan: string;
    used: number;
    limit: number;
    blocked: boolean;
  } | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const { getJwtToken } = await import("@/lib/auth-client");
        const jwt = await getJwtToken();
        const res = await fetch("/api/quota", {
          headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancel) setQuota(data);
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  if (!quota) return null;

  const ratio = quota.limit > 0 ? quota.used / quota.limit : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  let barColor = "var(--color-rv-ink)";
  if (ratio >= 0.9) barColor = "var(--color-rv-rec)";
  else if (ratio >= 0.7) barColor = "var(--color-rv-amber)";

  return (
    <div
      style={{
        background: "var(--color-rv-cream)",
        border: "1.5px solid var(--color-rv-ink)",
        boxShadow: "3px 3px 0 0 var(--color-rv-ink)",
        padding: "12px 16px",
        minWidth: 180,
      }}
    >
      <div className="rv-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--color-rv-muted)", marginBottom: 4 }}>
        Plano {quota.plan}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
        <span className="rv-display" style={{ fontSize: 22, lineHeight: 1 }}>
          {quota.used}
        </span>
        <span style={{ fontSize: 12, color: "var(--color-rv-muted)" }}>
          / {quota.limit} reels
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "var(--color-rv-soft)",
          border: "1px solid var(--color-rv-line)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.max(2, pct)}%`,
            height: "100%",
            background: barColor,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      {quota.plan === "free" && ratio >= 0.5 && (
        <a
          href="/app/precos"
          className="rv-mono"
          style={{
            display: "block",
            marginTop: 8,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--color-rv-rec)",
            textDecoration: "none",
          }}
        >
          → Subir pra Basic
        </a>
      )}
    </div>
  );
}

function BadgeStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        background: "var(--color-rv-cream)",
        border: "1.5px solid var(--color-rv-ink)",
        padding: "6px 12px",
      }}
    >
      <span
        className="rv-mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--color-rv-muted)",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        className="rv-mono"
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "var(--color-rv-ink)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div
      style={{
        background: "var(--color-rv-cream)",
        border: "1.5px solid var(--color-rv-ink)",
        padding: "28px 26px",
        boxShadow: "5px 5px 0 0 var(--color-rv-ink)",
      }}
    >
      <div
        className="rv-mono"
        style={{
          fontSize: 42,
          fontWeight: 700,
          color: "var(--color-rv-rec)",
          lineHeight: 1,
          marginBottom: 18,
        }}
      >
        {n}
      </div>
      <h3
        className="rv-display"
        style={{ fontSize: 26, lineHeight: 1.05, marginBottom: 10 }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--color-rv-muted)",
        }}
      >
        {desc}
      </p>
    </div>
  );
}

function StoryboardMockup() {
  return (
    <div className="relative">
      <div
        className="rv-card-916"
        style={{
          width: "100%",
          maxWidth: 280,
          marginLeft: "auto",
          background:
            "linear-gradient(180deg, #0A0908 0%, #1A1816 50%, #0A0908 100%)",
          color: "var(--color-rv-cream)",
        }}
      >
        <div
          className="absolute"
          style={{
            top: 14,
            left: 14,
            right: 14,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span className="rv-timecode">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--color-rv-rec)",
                animation: "rv-pulse 2s infinite",
              }}
            />
            REC · 00:00
          </span>
          <span
            className="rv-mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              opacity: 0.55,
            }}
          >
            01/06
          </span>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 28,
            left: 22,
            right: 22,
          }}
        >
          <div
            className="rv-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--color-rv-rec)",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            HOOK · 0–3s
          </div>
          <div
            className="rv-display"
            style={{
              fontSize: 28,
              lineHeight: 1.05,
              color: "var(--color-rv-cream)",
              fontStyle: "italic",
            }}
          >
            Acabei de fazer o que ninguém ousou.
          </div>
          <div
            className="mt-3 rv-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--color-rv-muted)",
            }}
          >
            B-ROLL: close rosto, cama, surpresa
          </div>
        </div>
      </div>

      <div
        className="absolute"
        style={{
          top: 30,
          left: -40,
          background: "var(--color-rv-rec)",
          color: "var(--color-rv-cream)",
          padding: "8px 14px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          boxShadow: "3px 3px 0 0 var(--color-rv-ink)",
          border: "1.5px solid var(--color-rv-ink)",
          transform: "rotate(-3deg)",
        }}
      >
        ✦ Cena 1 / 6
      </div>
    </div>
  );
}
