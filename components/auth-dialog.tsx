"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { getAuthClient } from "@/lib/auth-client";

type Mode = "signin" | "signup";

interface AuthDialogProps {
  onClose: () => void;
  onSuccess: () => void;
  /** Mensagem custom no header (ex: "Pra adaptar seu reel, cria uma conta"). */
  title?: string;
  /** Subtítulo abaixo do título (ex: "Roteiro fica salvo no seu painel"). */
  subtitle?: string;
}

export function AuthDialog({
  onClose,
  onSuccess,
  title,
  subtitle,
}: AuthDialogProps) {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      const client = await getAuthClient();
      // Better Auth redireciona pro provider OAuth e volta pro callbackURL.
      // Após retorno, sessão é hidratada e o useEffect do parent vai detectar
      // user logado e chamar onSuccess via refresh().
      const callbackURL =
        typeof window !== "undefined" ? window.location.href : "/";
      const res = await client.signIn.social({
        provider: "google",
        callbackURL,
      });
      if (res?.error) {
        throw new Error(res.error.message || "Falha no Google");
      }
      // Se chegou aqui sem redirect, a sessão já foi setada — sucesso direto.
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google indisponível");
      setGoogleLoading(false);
    }
  }

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
          style={{ fontSize: 28, lineHeight: 1.05, marginBottom: 6 }}
        >
          {title ? (
            title
          ) : mode === "signin" ? (
            <>
              Volta pra <em>casa</em>.
            </>
          ) : (
            <>
              Pra adaptar, <em>cria conta</em>.
            </>
          )}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-rv-muted)",
            lineHeight: 1.45,
            marginBottom: 18,
          }}
        >
          {subtitle ??
            (mode === "signin"
              ? "Tudo que você adaptou em qualquer device."
              : "Roteiro fica salvo, histórico sync, bridges com SV e Hunter.")}
        </p>

        {/* Google OAuth — botão primário, mais conversão que email/senha */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          className="rv-btn rv-btn-ghost"
          style={{
            width: "100%",
            padding: "12px 14px",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 14,
            background: "white",
          }}
        >
          {googleLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          {googleLoading ? "Conectando..." : "Continuar com Google"}
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "10px 0 16px",
          }}
        >
          <span style={{ flex: 1, height: 1, background: "var(--color-rv-line)" }} />
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
            ou com email
          </span>
          <span style={{ flex: 1, height: 1, background: "var(--color-rv-line)" }} />
        </div>

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

// Logo Google oficial — 4 cores. SVG inline pra evitar dependência externa.
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
