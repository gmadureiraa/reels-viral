"use client";

import { useState } from "react";
import { LogIn, LogOut, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import {
  getAuthClient,
  isAuthConfigured,
  useNeonSession,
} from "@/lib/auth-client";
import { migrateLocalToDb } from "@/lib/storage";
import { AuthDialog } from "./auth-dialog";

export function AuthBar() {
  const { data, isPending, refresh } = useNeonSession();
  const [open, setOpen] = useState(false);

  if (!isAuthConfigured()) {
    return null; // app roda em modo guest se não configurado
  }

  if (isPending) {
    return (
      <span
        className="rv-mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--color-rv-muted)",
          padding: "8px 14px",
        }}
      >
        ...
      </span>
    );
  }

  if (!data) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="rv-btn rv-btn-ghost"
          style={{ padding: "8px 14px", fontSize: 10 }}
        >
          <LogIn size={12} /> Entrar
        </button>
        {open && (
          <AuthDialog
            onClose={() => setOpen(false)}
            onSuccess={async () => {
              setOpen(false);
              refresh();
              toast.success("Logado.");
              // Migra histórico anônimo (localStorage) → DB Neon do user
              // recém-logado. Sem isso, user perdia tudo que tinha analisado
              // antes de criar conta. Comentário em lib/storage.ts:9 já
              // prometia esse hook — só faltava chamar.
              try {
                const result = await migrateLocalToDb();
                if (result.migrated > 0) {
                  toast.success(
                    `${result.migrated} ${
                      result.migrated === 1 ? "análise migrada" : "análises migradas"
                    } pra sua conta.`
                  );
                }
              } catch (err) {
                console.warn("[auth-bar] migrate local→db falhou:", err);
              }
            }}
          />
        )}
      </>
    );
  }

  const initials = (data.user.email || data.user.name || "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <span
        className="flex items-center gap-2"
        style={{
          padding: "6px 10px 6px 6px",
          border: "1.5px solid var(--color-rv-ink)",
          background: "var(--color-rv-cream)",
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            background: "var(--color-rv-ink)",
            color: "var(--color-rv-cream)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          {initials}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--color-rv-ink)",
            maxWidth: 140,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {data.user.email}
        </span>
      </span>
      <button
        onClick={async () => {
          try {
            const client = await getAuthClient();
            await client.signOut();
            refresh();
            toast.success("Saiu.");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erro");
          }
        }}
        className="rv-btn rv-btn-ghost"
        style={{ padding: "8px 12px", fontSize: 10 }}
        title="Sair"
      >
        <LogOut size={12} />
      </button>
    </div>
  );
}
