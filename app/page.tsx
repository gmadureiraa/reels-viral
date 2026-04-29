"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Clipboard,
  Film,
  History,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { isValidInstagramUrl } from "@/lib/utils";
import type { AdaptBrief, AdaptResponse } from "@/lib/types";
import { ResultView } from "@/components/result-view";
import { UnlockGate } from "@/components/unlock-gate";
import { LoadingPipeline } from "@/components/loading-pipeline";
import { AuthBar } from "@/components/auth-bar";

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

  // Inicializa device ID no cliente (pós-hidratação)
  useEffect(() => {
    deviceIdRef.current = getOrCreateDeviceId();
  }, []);

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

    setStep("loading");
    setResult(null);

    // Timeout client-side @ 55s — o backend tem maxDuration 60s mas o
    // pipeline pode estourar (Apify lento + File API upload + Gemini).
    // Sem AbortController, fetch ficava pendurado até o Vercel cortar
    // 504 às 60s e o user via toast genérico. Com timeout próprio,
    // ganhamos 5s de margem pra fechar conexão e dar mensagem decente.
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 55_000);

    try {
      const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (deviceIdRef.current) {
        reqHeaders["X-Device-Id"] = deviceIdRef.current;
      }

      const res = await fetch("/api/adapt-reel", {
        method: "POST",
        headers: reqHeaders,
        signal: controller.signal,
        body: JSON.stringify({
          sourceUrl: sourceUrl.trim(),
          tema: tema.trim(),
          objetivo,
          cta: cta.trim(),
          persona: persona.trim() || undefined,
          nicho: nicho.trim() || undefined,
        }),
      });

      const data = await res.json();
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
      {/* TOP NAV — sutil, brutalist */}
      <header
        style={{
          borderBottom: "1.5px solid var(--color-rv-ink)",
          background: "var(--color-rv-paper)",
        }}
      >
        <div
          className="mx-auto flex items-center justify-between"
          style={{ maxWidth: 1280, padding: "18px 28px" }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 36,
                height: 36,
                background: "var(--color-rv-ink)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <span
                className="rv-mono"
                style={{
                  color: "var(--color-rv-cream)",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                }}
              >
                RV
              </span>
              <span
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--color-rv-rec)",
                  animation: "rv-pulse 2s infinite",
                }}
              />
            </div>
            <div>
              <div
                className="rv-display"
                style={{ fontSize: 22, lineHeight: 1 }}
              >
                Reels <em>Viral</em>
              </div>
              <div
                className="rv-mono"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "var(--color-rv-muted)",
                  marginTop: 2,
                }}
              >
                Combo Viral · 03/03
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/meus-roteiros"
              className="rv-btn rv-btn-ghost"
              style={{
                padding: "8px 14px",
                fontSize: 10,
                letterSpacing: "0.18em",
              }}
            >
              <History size={12} /> Meus roteiros
            </Link>
            <a
              href="https://viral.kaleidos.com.br"
              target="_blank"
              rel="noreferrer"
              className="rv-btn rv-btn-ghost"
              style={{
                padding: "8px 14px",
                fontSize: 10,
                letterSpacing: "0.18em",
              }}
            >
              <Film size={12} /> Sequência Viral
            </a>
            <AuthBar />
          </div>
        </div>
      </header>

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
            {/* HERO */}
            <div className="grid gap-12 grid-cols-1 md:grid-cols-[1.1fr_0.9fr]">
              <div>
                <span className="rv-eyebrow">
                  <span className="rv-rec-dot" /> ENGENHARIA REVERSA · IA
                </span>
                <h1
                  className="rv-display mt-5"
                  style={{
                    fontSize: "clamp(48px, 6.4vw, 86px)",
                    lineHeight: 0.96,
                  }}
                >
                  O reel viraliza. <br />
                  Você descobre <em>como</em>. <br />
                  E refilma <span style={{ color: "var(--color-rv-rec)" }}>seu.</span>
                </h1>
                <p
                  className="mt-6"
                  style={{
                    fontSize: 17,
                    lineHeight: 1.55,
                    color: "var(--color-rv-muted)",
                    maxWidth: 540,
                  }}
                >
                  Cole o link de qualquer Reel viral. A IA dissecca a estrutura
                  (hook, promessa, demo, CTA) em 30 segundos e devolve um
                  <strong style={{ color: "var(--color-rv-ink)" }}>
                    {" "}
                    roteiro novo cena por cena
                  </strong>{" "}
                  no SEU nicho — gravável direto, sem soar plágio.
                </p>

                <div
                  className="mt-8 flex items-center gap-3"
                  style={{ flexWrap: "wrap" }}
                >
                  <BadgeStat label="Análise estrutural" value="< 30s" />
                  <BadgeStat label="Storyboard" value="cena × cena" />
                  <BadgeStat label="Stack" value="Gemini 2.5" />
                </div>
              </div>

              {/* MOCKUP DE STORYBOARD */}
              <div className="hidden md:block">
                <StoryboardMockup />
              </div>
            </div>

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
            <UnlockGate
              data={result}
              tema={tema}
              objetivo={objetivo}
              sourceUrl={sourceUrl}
              scriptId={result.scriptId ?? null}
            >
              <ResultView data={result} tema={tema} onReset={handleReset} />
            </UnlockGate>
          </motion.section>
        )}
      </AnimatePresence>

      {/* FOOTER */}
      <footer
        style={{
          borderTop: "1.5px solid var(--color-rv-ink)",
          background: "var(--color-rv-soft)",
        }}
      >
        <div
          className="mx-auto flex flex-wrap items-center justify-between gap-4"
          style={{ maxWidth: 1280, padding: "22px 28px" }}
        >
          <div
            className="rv-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-rv-muted)",
            }}
          >
            REELS VIRAL · 2026 · KALEIDOS
          </div>
          <div className="flex gap-5">
            <a
              href="https://viral.kaleidos.com.br"
              target="_blank"
              rel="noreferrer"
              className="rv-mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-rv-ink)",
              }}
            >
              SEQUÊNCIA VIRAL ↗
            </a>
            <a
              href="https://viral-hunter-phi.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="rv-mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-rv-ink)",
              }}
            >
              VIRAL HUNTER ↗
            </a>
          </div>
        </div>
      </footer>
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
