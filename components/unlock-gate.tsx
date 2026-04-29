"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Phone, Sparkles, Lock } from "lucide-react";
import { toast } from "sonner";
import type { AdaptResponse } from "@/lib/types";

const STORAGE_KEY = "rv:unlocked-emails";

/**
 * Gate de email+telefone que envolve o ResultView.
 *
 * Como funciona:
 *  - Mostra preview blurred do roteiro (hook visível, resto borrado)
 *  - Form pede email + telefone obrigatórios
 *  - Submit chama POST /api/lead com contexto (scriptId, sourceUrl, tema, objetivo)
 *  - Em sucesso: marca email no localStorage (rv:unlocked-emails)
 *    e libera children. Próxima geração com mesmo email pula gate.
 *  - Acessibility: form tem labels, errors visíveis, focus management.
 */

interface UnlockGateProps {
  data: AdaptResponse;
  tema: string;
  objetivo: string;
  sourceUrl: string;
  scriptId?: string | null;
  children: React.ReactNode;
}

function readUnlockedEmails(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr.map((e) => e.toLowerCase()) : []);
  } catch {
    return new Set();
  }
}

function persistUnlockedEmail(email: string) {
  if (typeof window === "undefined") return;
  try {
    const cur = readUnlockedEmails();
    cur.add(email.toLowerCase());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(cur)));
  } catch {
    /* ignore */
  }
}

export function UnlockGate(props: UnlockGateProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  // Hidrata: se localStorage tem ANY email, libera. UX simples — não
  // exige que seja exatamente o email do user atual (1 unlock = vale
  // pra próximas geraçoes nesse browser).
  useEffect(() => {
    const set = readUnlockedEmails();
    if (set.size > 0) setUnlocked(true);
  }, []);

  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()),
    [email],
  );
  const phoneValid = useMemo(
    () => /^[+\d\s\-()]{8,}$/.test(phone.trim()),
    [phone],
  );
  const canSubmit = emailValid && phoneValid && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          phone: phone.trim(),
          scriptId: props.scriptId ?? undefined,
          sourceUrl: props.sourceUrl,
          objetivo: props.objetivo,
          tema: props.tema,
          consentMarketing: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao salvar contato");
      }
      persistUnlockedEmail(email);
      setUnlocked(true);
      toast.success("Roteiro liberado! Te mandei uma cópia no email também.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (unlocked) return <>{props.children}</>;

  // Hook do roteiro pra preview (1 frase visível, resto blurred).
  const hookPreview =
    props.data.script?.hook ?? props.data.script?.titulo ?? "Seu roteiro está pronto";

  return (
    <div className="relative">
      {/* Preview blurred do conteúdo real — visual de "tem coisa boa atrás". */}
      <div
        aria-hidden
        className="pointer-events-none select-none"
        style={{ filter: "blur(8px)", opacity: 0.55 }}
      >
        {props.children}
      </div>

      {/* Overlay com form de captura. Posicionado absoluto sobre o blur. */}
      <div
        className="absolute inset-0 flex items-start justify-center"
        style={{ paddingTop: 64 }}
      >
        <div
          className="w-full max-w-[520px] mx-4"
          style={{
            background: "var(--color-rv-cream, #F5F1E8)",
            border: "1.5px solid var(--color-rv-ink, #1A1A1A)",
            boxShadow: "6px 6px 0 0 var(--color-rv-ink, #1A1A1A)",
            padding: "32px 28px",
          }}
        >
          <div
            className="inline-flex items-center gap-2 mb-4 px-2.5 py-1.5"
            style={{
              background: "#FF3D2E",
              color: "#fff",
              border: "1.5px solid var(--color-rv-ink, #1A1A1A)",
              fontFamily: "var(--font-mono), monospace",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            <Lock size={11} /> Quase lá
          </div>
          <h2
            className="font-bold mb-2"
            style={{
              fontSize: 26,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: "var(--color-rv-ink, #1A1A1A)",
            }}
          >
            Seu roteiro tá pronto.
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "var(--color-rv-muted, #7A7A7A)",
              lineHeight: 1.55,
              marginBottom: 20,
            }}
          >
            Cola email e WhatsApp pra liberar o roteiro completo. Mando uma
            cópia no email também — assim você não perde se fechar a aba.
          </p>

          {/* Hook preview — teaser do que tá liberando. */}
          <div
            className="mb-6"
            style={{
              padding: "14px 16px",
              background: "#fff",
              border: "1px solid rgba(26,26,26,0.15)",
              fontFamily: "var(--font-instrument, serif)",
              fontStyle: "italic",
              fontSize: 16,
              lineHeight: 1.4,
              color: "var(--color-rv-ink, #1A1A1A)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#FF3D2E",
                marginBottom: 6,
                fontStyle: "normal",
              }}
            >
              Hook
            </div>
            &ldquo;{hookPreview}&rdquo;
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--color-rv-muted, #7A7A7A)",
                }}
              >
                <Mail size={10} className="inline mr-1" /> Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="seu@email.com"
                style={{
                  padding: "12px 14px",
                  fontSize: 16,
                  background: "#fff",
                  border: `1.5px solid ${
                    touched && email && !emailValid ? "#FF3D2E" : "var(--color-rv-ink, #1A1A1A)"
                  }`,
                  outline: 0,
                  fontFamily: "inherit",
                  color: "var(--color-rv-ink, #1A1A1A)",
                }}
                autoComplete="email"
              />
              {touched && email && !emailValid && (
                <span style={{ fontSize: 11, color: "#FF3D2E" }}>
                  Email inválido
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--color-rv-muted, #7A7A7A)",
                }}
              >
                <Phone size={10} className="inline mr-1" /> WhatsApp
              </span>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="+55 11 90000-0000"
                style={{
                  padding: "12px 14px",
                  fontSize: 16,
                  background: "#fff",
                  border: `1.5px solid ${
                    touched && phone && !phoneValid ? "#FF3D2E" : "var(--color-rv-ink, #1A1A1A)"
                  }`,
                  outline: 0,
                  fontFamily: "inherit",
                  color: "var(--color-rv-ink, #1A1A1A)",
                }}
                autoComplete="tel"
              />
              {touched && phone && !phoneValid && (
                <span style={{ fontSize: 11, color: "#FF3D2E" }}>
                  Telefone inválido
                </span>
              )}
            </label>

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                marginTop: 8,
                padding: "14px 20px",
                background: canSubmit ? "var(--color-rv-ink, #1A1A1A)" : "#888",
                color: "#fff",
                border: "1.5px solid var(--color-rv-ink, #1A1A1A)",
                boxShadow: canSubmit ? "4px 4px 0 0 #FF3D2E" : "none",
                fontFamily: "var(--font-mono), monospace",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                cursor: canSubmit ? "pointer" : "not-allowed",
                transition: "transform 0.1s ease",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Sparkles size={13} />
              {submitting ? "Liberando…" : "Liberar roteiro"}
            </button>

            <p
              style={{
                fontSize: 11,
                color: "var(--color-rv-muted, #7A7A7A)",
                lineHeight: 1.5,
                marginTop: 4,
              }}
            >
              Sem spam. Manda 1 email/semana com casos reais e dicas. Cancela em
              1 clique. Veja a{" "}
              <a
                href="/privacidade"
                target="_blank"
                rel="noopener"
                style={{ color: "var(--color-rv-ink, #1A1A1A)", textDecoration: "underline" }}
              >
                política de privacidade
              </a>
              .
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
