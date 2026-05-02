"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Eye, Heart, Play, Trash2 } from "lucide-react";
import {
  type SavedScript,
  clearAllScripts,
  deleteScript,
  listScripts,
} from "@/lib/storage";
import { formatNumber } from "@/lib/utils";
import { AuthBar } from "@/components/auth-bar";
import { useNeonSession, isAuthConfigured } from "@/lib/auth-client";

export default function MyScriptsPage() {
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const { data: session } = useNeonSession();
  const isLogged = isAuthConfigured() && !!session;

  useEffect(() => {
    void (async () => {
      const list = await listScripts();
      setScripts(list);
      setHydrated(true);
    })();
  }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Apagar esse roteiro? Não dá pra desfazer.")) return;
    await deleteScript(id);
    const list = await listScripts();
    setScripts(list);
    toast.success("Roteiro apagado");
  }

  function handleClearAll() {
    if (!confirm("Apagar TODOS os roteiros do histórico?")) return;
    clearAllScripts();
    setScripts([]);
    toast.success("Histórico limpo");
  }

  return (
    <main className="min-h-dvh">
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
          <Link
            href="/app"
            className="rv-btn rv-btn-ghost"
            style={{ padding: "8px 14px", fontSize: 10 }}
          >
            <ArrowLeft size={12} /> Voltar
          </Link>
          <div className="flex items-center gap-3">
            <span className="rv-eyebrow">
              <span className="rv-rec-dot" /> HISTÓRICO
            </span>
            <AuthBar />
          </div>
        </div>
      </header>

      <section
        className="mx-auto"
        style={{ maxWidth: 1180, padding: "60px 28px 100px" }}
      >
        <h1
          className="rv-display"
          style={{
            fontSize: "clamp(40px, 5.5vw, 72px)",
            lineHeight: 0.96,
          }}
        >
          Meus <em>roteiros</em>.
        </h1>
        <p
          className="mt-4"
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--color-rv-muted)",
            maxWidth: 580,
          }}
        >
          {isLogged
            ? "Tudo que você adaptou aqui — salvo na sua conta. Sincroniza entre dispositivos quando você loga no mesmo email."
            : "Tudo que você adaptou aqui — guardado no localStorage do browser. Não persiste entre dispositivos. Cria uma conta pra sincronizar."}
        </p>

        {!hydrated ? (
          <div className="mt-12 rv-shimmer" style={{ height: 240 }} />
        ) : scripts.length === 0 ? (
          <div
            className="mt-12 flex flex-col items-center justify-center"
            style={{
              padding: "80px 40px",
              background: "var(--color-rv-cream)",
              border: "1.5px dashed var(--color-rv-ink)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "var(--color-rv-rec)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 22,
              }}
            >
              <Play size={22} color="white" />
            </div>
            <h2
              className="rv-display"
              style={{ fontSize: 28, marginBottom: 8 }}
            >
              Nenhum roteiro ainda.
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--color-rv-muted)",
                marginBottom: 22,
              }}
            >
              Cola um link de Reel viral e adapta. Os roteiros salvam aqui automaticamente.
            </p>
            <Link href="/app" className="rv-btn rv-btn-rec">
              Adaptar primeiro reel →
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-12 flex items-center justify-between">
              <span className="rv-eyebrow">
                {scripts.length} ROTEIRO{scripts.length === 1 ? "" : "S"}
              </span>
              <button
                onClick={handleClearAll}
                className="rv-btn rv-btn-ghost"
                style={{ padding: "6px 12px", fontSize: 9 }}
              >
                <Trash2 size={11} /> Limpar tudo
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              {scripts.map((s) => (
                <ScriptCard
                  key={s.id}
                  script={s}
                  onDelete={(e) => handleDelete(s.id, e)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function ScriptCard({
  script,
  onDelete,
}: {
  script: SavedScript;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const { data } = script;
  const date = new Date(script.savedAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <Link
      href={`/app/meus-roteiros/${script.id}`}
      style={{
        display: "block",
        background: "var(--color-rv-cream)",
        border: "1.5px solid var(--color-rv-ink)",
        boxShadow: "4px 4px 0 0 var(--color-rv-ink)",
        padding: "22px 26px",
        textDecoration: "none",
        color: "inherit",
        transition: "transform 120ms, box-shadow 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translate(-2px, -2px)";
        e.currentTarget.style.boxShadow = "6px 6px 0 0 var(--color-rv-rec)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translate(0,0)";
        e.currentTarget.style.boxShadow = "4px 4px 0 0 var(--color-rv-ink)";
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span
              className="rv-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-rv-rec)",
                fontWeight: 800,
              }}
            >
              ★ @{data.source.ownerUsername}
            </span>
            <span
              className="rv-mono"
              style={{
                fontSize: 9,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--color-rv-muted)",
              }}
            >
              · {date}
            </span>
          </div>
          <h3
            className="rv-display"
            style={{
              fontSize: 26,
              lineHeight: 1.05,
              marginBottom: 6,
            }}
          >
            {data.script.titulo}
          </h3>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--color-rv-muted)",
              margin: 0,
            }}
          >
            <strong style={{ color: "var(--color-rv-ink)" }}>Tema:</strong>{" "}
            {script.tema}
          </p>
        </div>
        <button
          onClick={onDelete}
          aria-label="Apagar"
          style={{
            background: "transparent",
            border: "1.5px solid var(--color-rv-line)",
            padding: 8,
            cursor: "pointer",
            color: "var(--color-rv-muted)",
            flexShrink: 0,
            transition: "all 120ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--color-rv-rec)";
            e.currentTarget.style.color = "var(--color-rv-rec)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-rv-line)";
            e.currentTarget.style.color = "var(--color-rv-muted)";
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <div
        className="mt-4 pt-4 flex items-center gap-5 flex-wrap"
        style={{ borderTop: "1px solid var(--color-rv-line)" }}
      >
        <Stat icon={<Play size={11} />} value={formatNumber(data.source.plays)} label="plays" />
        <Stat icon={<Eye size={11} />} value={formatNumber(data.source.views)} label="views" />
        <Stat icon={<Heart size={11} />} value={formatNumber(data.source.likes)} label="likes" />
        <Stat
          value={`${data.script.scenes.length} cenas`}
          label="storyboard"
        />
        <span
          className="rv-mono ml-auto"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--color-rv-rec)",
            fontWeight: 700,
          }}
        >
          ABRIR →
        </span>
      </div>
    </Link>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon?: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <span
      className="rv-mono flex items-center gap-1.5"
      style={{
        fontSize: 11,
        letterSpacing: "0.06em",
        color: "var(--color-rv-ink)",
      }}
    >
      {icon}
      <strong style={{ fontWeight: 700 }}>{value}</strong>
      <span style={{ color: "var(--color-rv-muted)", marginLeft: 2 }}>
        {label}
      </span>
    </span>
  );
}
