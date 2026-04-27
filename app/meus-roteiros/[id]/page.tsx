"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ResultView } from "@/components/result-view";
import { getScript, type SavedScript } from "@/lib/storage";

export default function ScriptDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [entry, setEntry] = useState<SavedScript | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const id = params?.id;
    if (typeof id !== "string") return;
    void (async () => {
      const e = await getScript(id);
      setEntry(e);
      setHydrated(true);
    })();
  }, [params?.id]);

  if (!hydrated) {
    return (
      <main className="min-h-dvh">
        <div
          className="mx-auto rv-shimmer"
          style={{ maxWidth: 1180, height: 600, marginTop: 80 }}
        />
      </main>
    );
  }

  if (!entry) {
    return (
      <main className="min-h-dvh">
        <div
          className="mx-auto"
          style={{ maxWidth: 720, padding: "120px 28px", textAlign: "center" }}
        >
          <h1
            className="rv-display"
            style={{ fontSize: 48, marginBottom: 12 }}
          >
            Roteiro não <em>encontrado</em>.
          </h1>
          <p
            style={{
              color: "var(--color-rv-muted)",
              fontSize: 15,
              marginBottom: 28,
            }}
          >
            Talvez tenha sido apagado, ou está em outro browser. O histórico fica salvo localmente nesse dispositivo.
          </p>
          <Link href="/meus-roteiros" className="rv-btn">
            <ArrowLeft size={12} /> Voltar pro histórico
          </Link>
        </div>
      </main>
    );
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
            href="/meus-roteiros"
            className="rv-btn rv-btn-ghost"
            style={{ padding: "8px 14px", fontSize: 10 }}
          >
            <ArrowLeft size={12} /> Histórico
          </Link>
          <div className="rv-eyebrow">
            <span className="rv-rec-dot" /> ROTEIRO SALVO ·{" "}
            {new Date(entry.savedAt).toLocaleDateString("pt-BR")}
          </div>
        </div>
      </header>

      <section
        className="mx-auto"
        style={{ maxWidth: 1280, padding: "40px 28px 100px" }}
      >
        <ResultView
          data={entry.data}
          tema={entry.tema}
          onReset={() => router.push("/")}
        />
      </section>
    </main>
  );
}
