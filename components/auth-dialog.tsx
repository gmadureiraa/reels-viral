"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { getAuthClient } from "@/lib/auth-client";

type Mode = "signin" | "signup";

export function AuthDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      toast.error("Email + senha (≥6 chars)");
      return;
    }
    setLoading(true);
    try {
      const client = await getAuthClient();
      const args = { email: email.trim(), password };
      const res =
        mode === "signin"
          ? await client.signIn.email(args)
          : await client.signUp.email({ ...args, name: name.trim() || undefined });
      if (res.error) {
        throw new Error(res.error.message || "Erro de auth");
      }
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 9, 8, 0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--color-rv-cream)",
          border: "1.5px solid var(--color-rv-ink)",
          boxShadow: "8px 8px 0 0 var(--color-rv-ink)",
          padding: "32px 32px 28px",
          position: "relative",
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
            background: "transparent",
            border: "1.5px solid var(--color-rv-line)",
            padding: 6,
            cursor: "pointer",
          }}
        >
          <X size={14} />
        </button>

        <div className="rv-eyebrow mb-3">
          <span className="rv-rec-dot" />
          {mode === "signin" ? "ENTRAR" : "CRIAR CONTA"}
        </div>
        <h2
          className="rv-display"
          style={{ fontSize: 32, lineHeight: 1.05, marginBottom: 6 }}
        >
          {mode === "signin" ? (
            <>
              Volta pra <em>casa</em>.
            </>
          ) : (
            <>
              Salva seus <em>roteiros</em>.
            </>
          )}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-rv-muted)",
            lineHeight: 1.45,
            marginBottom: 20,
          }}
        >
          {mode === "signin"
            ? "Tudo que você adaptou em qualquer device."
            : "Histórico sincronizado, exportação fácil, bridges com SV e Hunter."}
        </p>

        <div className="grid gap-3">
          {mode === "signup" && (
            <Field label="Nome (opcional)">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                style={inputStyle}
              />
            </Field>
          )}
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              autoFocus
              required
              style={inputStyle}
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "Mínimo 6 caracteres" : "••••••"}
              required
              minLength={6}
              style={inputStyle}
            />
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="rv-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--color-rv-muted)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {mode === "signin"
              ? "Ainda não tem conta? Criar →"
              : "← Já tem conta? Entrar"}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rv-btn rv-btn-rec"
            style={{ padding: "12px 18px", fontSize: 11 }}
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : null}
            {loading
              ? "Aguarde..."
              : mode === "signin"
                ? "Entrar →"
                : "Criar conta →"}
          </button>
        </div>
      </form>
    </div>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className="grid gap-1.5"
      style={{ gridTemplateColumns: "1fr" }}
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
      {children}
    </label>
  );
}
