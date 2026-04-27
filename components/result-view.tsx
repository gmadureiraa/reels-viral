"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  ExternalLink,
  Film,
  Heart,
  MessageCircle,
  Play,
  Quote,
  RotateCcw,
} from "lucide-react";
import type { AdaptResponse, Scene } from "@/lib/types";
import { formatDuration, formatNumber } from "@/lib/utils";
import { downloadMarkdown } from "@/lib/export-markdown";
import { openSvBridge } from "@/lib/sv-bridge";
import { saveScript } from "@/lib/storage";

const PAPEL_LABELS: Record<Scene["papel"], string> = {
  hook: "HOOK",
  promessa: "PROMESSA",
  demo: "DEMONSTRAÇÃO",
  prova: "PROVA SOCIAL",
  transicao: "TRANSIÇÃO",
  cta: "CTA",
};

const PAPEL_COLORS: Record<Scene["papel"], string> = {
  hook: "var(--color-rv-rec)",
  promessa: "var(--color-rv-amber)",
  demo: "var(--color-rv-ink)",
  prova: "#6B6660",
  transicao: "#A8A29A",
  cta: "var(--color-rv-rec)",
};

export function ResultView({
  data,
  tema,
  onReset,
}: {
  data: AdaptResponse;
  tema?: string;
  onReset: () => void;
}) {
  const { source, analysis, script, durationMs } = data;
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Auto-save assim que monta — DB se logado, localStorage anônimo.
  useEffect(() => {
    if (saved) return;
    void (async () => {
      const entry = await saveScript(data, tema ?? script.titulo);
      if (entry) setSaved(true);
    })();
    // intencionalmente sem deps — só roda no mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCopy(label: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copiado`);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleDownload() {
    downloadMarkdown(data);
    toast.success("Markdown baixado");
  }

  function handleBridgeSv() {
    openSvBridge(data);
    toast.success("Abrindo Sequência Viral...");
  }

  return (
    <div className="space-y-12">
      {/* TOP STRIP — actions */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <button
          onClick={onReset}
          className="rv-btn rv-btn-ghost"
          style={{ padding: "8px 14px", fontSize: 10 }}
        >
          <ArrowLeft size={12} /> Adaptar outro reel
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rv-eyebrow" style={{ marginRight: 6 }}>
            <span className="rv-rec-dot" /> PRONTO · {(durationMs / 1000).toFixed(1)}s
            {saved && <span style={{ color: "var(--color-rv-muted)", fontWeight: 500, marginLeft: 6 }}>· salvo no histórico</span>}
          </span>
          <button
            onClick={handleDownload}
            className="rv-btn"
            style={{ padding: "8px 14px", fontSize: 10 }}
            title="Baixa um .md com toda a análise + roteiro"
          >
            <Download size={12} /> Markdown
          </button>
          <button
            onClick={handleBridgeSv}
            className="rv-btn rv-btn-rec"
            style={{ padding: "8px 14px", fontSize: 10 }}
            title="Abre o Sequência Viral pra transformar esse roteiro em carrossel Instagram"
          >
            <Film size={12} /> Virar carrossel
          </button>
        </div>
      </div>

      {/* HERO RESULT — fonte + estrutura */}
      <section
        className="grid gap-8"
        style={{ gridTemplateColumns: "0.95fr 1.05fr" }}
      >
        {/* Source card */}
        <div
          style={{
            background: "var(--color-rv-cream)",
            border: "1.5px solid var(--color-rv-ink)",
            boxShadow: "6px 6px 0 0 var(--color-rv-ink)",
            padding: "28px 28px 24px",
          }}
        >
          <div className="rv-eyebrow mb-3">
            <span className="rv-rec-dot" /> REEL ORIGINAL
          </div>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="rv-display"
            style={{
              fontSize: 30,
              lineHeight: 1.05,
              color: "var(--color-rv-ink)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            @{source.ownerUsername}
            <ExternalLink size={18} style={{ opacity: 0.5 }} />
          </a>
          {source.ownerFullName && (
            <div
              className="rv-mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "var(--color-rv-muted)",
                marginTop: 4,
              }}
            >
              {source.ownerFullName}
            </div>
          )}

          {source.caption && (
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: "var(--color-rv-muted)",
                marginTop: 18,
                paddingTop: 18,
                borderTop: "1px solid var(--color-rv-line)",
                whiteSpace: "pre-line",
              }}
            >
              {source.caption.slice(0, 220)}
              {source.caption.length > 220 ? "…" : ""}
            </p>
          )}

          <div
            className="grid gap-3 mt-5 pt-5"
            style={{
              gridTemplateColumns: "repeat(2, 1fr)",
              borderTop: "1px solid var(--color-rv-line)",
            }}
          >
            <Stat
              icon={<Play size={11} />}
              label="Plays"
              value={formatNumber(source.plays)}
            />
            <Stat
              icon={<Eye size={11} />}
              label="Views"
              value={formatNumber(source.views)}
            />
            <Stat
              icon={<Heart size={11} />}
              label="Likes"
              value={formatNumber(source.likes)}
            />
            <Stat
              icon={<MessageCircle size={11} />}
              label="Comments"
              value={formatNumber(source.comments)}
            />
            <Stat
              label="Duração"
              value={formatDuration(source.videoDuration)}
            />
            <Stat label="Cenas geradas" value={String(script.scenes.length)} />
          </div>
        </div>

        {/* Analysis card */}
        <div
          style={{
            background: "var(--color-rv-ink)",
            color: "var(--color-rv-cream)",
            border: "1.5px solid var(--color-rv-ink)",
            boxShadow: "6px 6px 0 0 var(--color-rv-rec)",
            padding: "28px 28px 24px",
          }}
        >
          <div
            className="rv-mono mb-3"
            style={{
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--color-rv-rec)",
              fontWeight: 700,
            }}
          >
            ✦ ANÁLISE ESTRUTURAL
          </div>
          <p
            className="rv-display"
            style={{
              fontSize: 22,
              lineHeight: 1.3,
              color: "var(--color-rv-cream)",
              fontStyle: "italic",
              marginBottom: 20,
            }}
          >
            “{analysis.resumo}”
          </p>

          <div className="rv-eyebrow mb-2" style={{ color: "var(--color-rv-amber)" }}>
            POR QUE VIRALIZOU
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {analysis.porQueViralizou.map((razao, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "rgba(245,241,232,0.85)",
                }}
              >
                <span
                  className="rv-mono"
                  style={{
                    fontSize: 11,
                    color: "var(--color-rv-rec)",
                    fontWeight: 800,
                    flexShrink: 0,
                    paddingTop: 1,
                  }}
                >
                  →
                </span>
                {razao}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ESTRUTURA DESMONTADA */}
      <section>
        <div className="rv-eyebrow mb-3">
          <span className="rv-rec-dot" /> ESTRUTURA DO REEL ORIGINAL · 5 BLOCOS
        </div>
        <h2
          className="rv-display mb-6"
          style={{ fontSize: "clamp(28px, 3.5vw, 44px)" }}
        >
          O <em>esqueleto</em> que vai pro seu reel.
        </h2>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
          {(["hook", "promessa", "demonstracao", "provaSocial", "cta"] as const).map(
            (key) => {
              const block = analysis.estrutura[key];
              const labelMap: Record<typeof key, string> = {
                hook: "HOOK · 0–3s",
                promessa: "PROMESSA",
                demonstracao: "DEMONSTRAÇÃO",
                provaSocial: "PROVA SOCIAL",
                cta: "CTA",
              };
              return (
                <div
                  key={key}
                  style={{
                    background: "var(--color-rv-cream)",
                    border: "1.5px solid var(--color-rv-ink)",
                    boxShadow: "3px 3px 0 0 var(--color-rv-ink)",
                    padding: "16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="rv-mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.2em",
                        color: "var(--color-rv-rec)",
                        fontWeight: 800,
                      }}
                    >
                      {labelMap[key]}
                    </span>
                    <span className="rv-timecode">{block.tempo}</span>
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: "var(--color-rv-ink)",
                      margin: 0,
                    }}
                  >
                    {block.texto}
                  </p>
                </div>
              );
            }
          )}
        </div>

        {analysis.padroesTransferiveis?.length > 0 && (
          <div
            className="mt-6"
            style={{
              background: "var(--color-rv-soft)",
              border: "1.5px solid var(--color-rv-ink)",
              padding: "20px 24px",
              borderRadius: 0,
            }}
          >
            <div className="rv-eyebrow mb-2">PADRÕES TRANSFERÍVEIS</div>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
            >
              {analysis.padroesTransferiveis.map((p, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "var(--color-rv-ink)",
                    paddingLeft: 14,
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      color: "var(--color-rv-rec)",
                      fontWeight: 800,
                    }}
                  >
                    +
                  </span>
                  {p}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* SCRIPT — TÍTULO + HOOK DESTACADO + ROTEIRO COMPLETO */}
      <section
        style={{
          background: "var(--color-rv-cream)",
          border: "1.5px solid var(--color-rv-ink)",
          boxShadow: "8px 8px 0 0 var(--color-rv-rec)",
          padding: "36px 36px 32px",
        }}
      >
        <div className="rv-eyebrow mb-3">
          <span className="rv-rec-dot" /> SEU NOVO REEL · ROTEIRO ADAPTADO
        </div>
        <h2
          className="rv-display"
          style={{
            fontSize: "clamp(34px, 4.5vw, 58px)",
            lineHeight: 1.02,
            marginBottom: 8,
          }}
        >
          {script.titulo}
        </h2>

        {/* HOOK destacado */}
        <div
          className="mt-6 flex items-start gap-4"
          style={{
            padding: "20px 22px",
            background: "var(--color-rv-ink)",
            color: "var(--color-rv-cream)",
            border: "1.5px solid var(--color-rv-ink)",
            position: "relative",
          }}
        >
          <Quote
            size={28}
            style={{ color: "var(--color-rv-rec)", flexShrink: 0, marginTop: 2 }}
          />
          <div style={{ flex: 1 }}>
            <div
              className="rv-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.22em",
                color: "var(--color-rv-rec)",
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              HOOK · 0–3s · O QUE VC FALA NO PRIMEIRO SEGUNDO
            </div>
            <p
              className="rv-display"
              style={{
                fontSize: 26,
                lineHeight: 1.15,
                color: "var(--color-rv-cream)",
                fontStyle: "italic",
                margin: 0,
              }}
            >
              "{script.hook}"
            </p>
          </div>
          <button
            onClick={() => handleCopy("Hook", script.hook)}
            className="rv-btn"
            style={{
              padding: "8px 12px",
              fontSize: 9,
              background: "var(--color-rv-cream)",
              color: "var(--color-rv-ink)",
              boxShadow: "2px 2px 0 0 var(--color-rv-rec)",
            }}
          >
            {copied === "Hook" ? <Check size={12} /> : <Copy size={12} />}
            {copied === "Hook" ? "Copiado" : "Copiar"}
          </button>
        </div>

        {/* Roteiro completo */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="rv-eyebrow">ROTEIRO COMPLETO · TEXTO CORRIDO</div>
            <button
              onClick={() => handleCopy("Roteiro", script.roteiroCompleto)}
              className="rv-btn"
              style={{ padding: "8px 12px", fontSize: 9 }}
            >
              {copied === "Roteiro" ? <Check size={12} /> : <Copy size={12} />}
              {copied === "Roteiro" ? "Copiado" : "Copiar tudo"}
            </button>
          </div>
          <pre
            style={{
              background: "white",
              border: "1.5px solid var(--color-rv-ink)",
              padding: "20px 22px",
              fontFamily: "var(--font-jakarta), sans-serif",
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              margin: 0,
              color: "var(--color-rv-ink)",
            }}
          >
            {script.roteiroCompleto}
          </pre>
        </div>
      </section>

      {/* STORYBOARD CENA POR CENA */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="rv-eyebrow">
              <span className="rv-rec-dot" /> STORYBOARD · {script.scenes.length} CENAS
            </div>
            <h2
              className="rv-display mt-2"
              style={{ fontSize: "clamp(28px, 3.5vw, 44px)" }}
            >
              Cena por <em>cena</em>. Pra gravar direto.
            </h2>
          </div>
          <div className="rv-scrubber" style={{ width: 220 }} />
        </div>

        <div className="mt-7 space-y-4">
          {script.scenes.map((scene) => (
            <SceneCard key={scene.n} scene={scene} />
          ))}
        </div>
      </section>

      {/* CAPTION + NOTAS DE PRODUÇÃO */}
      <section
        className="grid gap-6"
        style={{ gridTemplateColumns: "1.1fr 0.9fr" }}
      >
        <div
          style={{
            background: "var(--color-rv-cream)",
            border: "1.5px solid var(--color-rv-ink)",
            boxShadow: "5px 5px 0 0 var(--color-rv-ink)",
            padding: "26px 26px 22px",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="rv-eyebrow">
              <span className="rv-rec-dot" /> CAPTION SUGERIDA
            </div>
            <button
              onClick={() => handleCopy("Caption", script.captionSugerida)}
              className="rv-btn"
              style={{ padding: "6px 10px", fontSize: 9 }}
            >
              {copied === "Caption" ? <Check size={11} /> : <Copy size={11} />}
              {copied === "Caption" ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              whiteSpace: "pre-line",
              color: "var(--color-rv-ink)",
              margin: 0,
            }}
          >
            {script.captionSugerida}
          </p>
        </div>

        <div
          style={{
            background: "var(--color-rv-soft)",
            border: "1.5px solid var(--color-rv-ink)",
            padding: "26px 26px 22px",
          }}
        >
          <div className="rv-eyebrow mb-4">NOTAS DE PRODUÇÃO</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {script.notasProducao.map((nota, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <span
                  className="rv-mono"
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: "var(--color-rv-rec)",
                    flexShrink: 0,
                    paddingTop: 1,
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {nota}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA secundário */}
      <div className="flex items-center justify-center gap-3 pt-6">
        <button
          onClick={onReset}
          className="rv-btn rv-btn-rec"
        >
          <RotateCcw size={14} /> Adaptar outro reel
        </button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="rv-mono flex items-center gap-1.5"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--color-rv-muted)",
          fontWeight: 700,
        }}
      >
        {icon}
        {label}
      </div>
      <div
        className="rv-mono"
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "var(--color-rv-ink)",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SceneCard({ scene }: { scene: Scene }) {
  const [copied, setCopied] = useState(false);
  const accent = PAPEL_COLORS[scene.papel];

  function handleCopy() {
    navigator.clipboard.writeText(scene.copy);
    setCopied(true);
    toast.success(`Cena ${scene.n} copiada`);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="grid gap-0"
      style={{
        gridTemplateColumns: "60px 1fr",
        background: "var(--color-rv-cream)",
        border: "1.5px solid var(--color-rv-ink)",
        boxShadow: "4px 4px 0 0 var(--color-rv-ink)",
        overflow: "hidden",
      }}
    >
      {/* Numerator side bar */}
      <div
        style={{
          background: accent,
          color:
            scene.papel === "hook" ||
            scene.papel === "cta" ||
            scene.papel === "promessa"
              ? "var(--color-rv-cream)"
              : "var(--color-rv-cream)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 0",
          borderRight: "1.5px solid var(--color-rv-ink)",
        }}
      >
        <div
          className="rv-display"
          style={{ fontSize: 32, lineHeight: 1, fontStyle: "italic" }}
        >
          {String(scene.n).padStart(2, "0")}
        </div>
        <div
          className="rv-mono"
          style={{
            fontSize: 8,
            letterSpacing: "0.18em",
            marginTop: 6,
            opacity: 0.85,
            fontWeight: 700,
          }}
        >
          CENA
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 22px" }}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="rv-timecode">{scene.tempo}</span>
            <span
              className="rv-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.22em",
                fontWeight: 800,
                color: accent,
                padding: "3px 8px",
                border: `1.5px solid ${accent}`,
              }}
            >
              {PAPEL_LABELS[scene.papel]}
            </span>
          </div>
          <button
            onClick={handleCopy}
            className="rv-btn rv-btn-ghost"
            style={{
              padding: "5px 9px",
              fontSize: 8,
              boxShadow: "none",
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? "OK" : "Copiar copy"}
          </button>
        </div>

        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "1fr 1fr" }}
        >
          <div>
            <div
              className="rv-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-rv-muted)",
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              VISUAL
            </div>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--color-rv-ink)",
                margin: 0,
              }}
            >
              {scene.visual}
            </p>
          </div>
          <div>
            <div
              className="rv-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-rv-rec)",
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              COPY · O QUE VOCÊ FALA
            </div>
            <p
              className="rv-display"
              style={{
                fontSize: 16,
                lineHeight: 1.35,
                color: "var(--color-rv-ink)",
                margin: 0,
                fontStyle: "italic",
              }}
            >
              "{scene.copy}"
            </p>
          </div>
        </div>

        {scene.broll && (
          <div
            className="mt-3 pt-3"
            style={{ borderTop: "1px solid var(--color-rv-line)" }}
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
              B-ROLL ·{" "}
            </span>
            <span
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--color-rv-muted)",
              }}
            >
              {scene.broll}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
