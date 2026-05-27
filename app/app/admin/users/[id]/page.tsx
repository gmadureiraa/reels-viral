"use client";

/**
 * /app/admin/users/[id] — drilldown completo do user pra admin.
 *
 * Mostra:
 *  - KPIs (reels total, custo total, plano, status)
 *  - Tabela últimos 100 scripts gerados (tema, source, duração)
 *  - Tabela últimos 100 ai_usage events (provider, custo, sucesso)
 *  - Ações: Gift Plan (basic/max + dias), Ban, Restore
 *
 * Acesso: requireAdmin no /api/admin/users/[id].
 */

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Gift, Ban, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getJwtToken } from "@/lib/auth-client";

interface UserDetail {
  userId: string;
  totalReels: number;
  totalCostUsd: number;
  subscription: {
    user_id: string;
    plan: string;
    status: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    created_at: string;
  } | null;
  scripts: Array<{
    id: string;
    tema: string;
    source_url: string;
    source_owner: string | null;
    titulo: string;
    duration_ms: number | null;
    created_at: string;
  }>;
  usage: Array<{
    id: string;
    provider: string;
    operation: string;
    cost_usd: number;
    duration_ms: number | null;
    success: boolean;
    created_at: string;
  }>;
}

export default function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: userId } = use(params);
  const [data, setData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const jwt = await getJwtToken();
      const res = await fetch(`/api/admin/users/${userId}`, {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
      });
      if (!res.ok) {
        toast.error(`Erro ${res.status}`);
        return;
      }
      const json = (await res.json()) as UserDetail;
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function performAction(
    action: "gift_plan" | "ban" | "restore",
    extra?: { plan?: string; days?: number },
  ) {
    setActionLoading(true);
    try {
      const jwt = await getJwtToken();
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha");
      toast.success(`Ação ${action} aplicada`);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading && !data) {
    return (
      <div style={{ padding: 60, display: "flex", justifyContent: "center" }}>
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }
  if (!data) return null;

  const fmtUsd = (n: number) => `$${n.toFixed(4)}`;

  return (
    <main style={{ padding: "26px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href="/app/admin"
          className="rv-mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--color-rv-ink)",
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={12} /> Voltar pro admin
        </Link>
      </div>

      <div className="rv-eyebrow" style={{ marginBottom: 6 }}>
        <span className="rv-rec-dot" /> ADMIN · USUÁRIO
      </div>
      <h1
        className="rv-display"
        style={{ fontSize: 32, lineHeight: 1.05, marginBottom: 4 }}
      >
        {data.userId.slice(0, 8)}…{data.userId.slice(-4)}
      </h1>
      <p
        className="rv-mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.14em",
          color: "var(--color-rv-muted)",
          marginBottom: 24,
        }}
      >
        {data.userId}
      </p>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <Kpi label="REELS TOTAL" value={String(data.totalReels)} />
        <Kpi label="CUSTO TOTAL" value={fmtUsd(data.totalCostUsd)} accent />
        <Kpi
          label="PLANO"
          value={data.subscription?.plan?.toUpperCase() ?? "FREE"}
        />
        <Kpi
          label="STATUS"
          value={data.subscription?.status ?? "active"}
        />
      </div>

      {/* Ações admin */}
      <Card title="Ações admin">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => void performAction("gift_plan", { plan: "basic", days: 30 })}
            className="rv-btn rv-btn-ghost"
            style={{ padding: "10px 14px", fontSize: 11 }}
          >
            <Gift size={12} /> Gift Basic 30d
          </button>
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => void performAction("gift_plan", { plan: "max", days: 30 })}
            className="rv-btn rv-btn-ghost"
            style={{ padding: "10px 14px", fontSize: 11 }}
          >
            <Gift size={12} /> Gift Max 30d
          </button>
          {data.subscription?.status === "banned" ? (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => void performAction("restore")}
              className="rv-btn rv-btn-ghost"
              style={{ padding: "10px 14px", fontSize: 11 }}
            >
              <RotateCcw size={12} /> Reativar
            </button>
          ) : (
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => {
                if (confirm("Banir esse usuário? Bloqueia geração de reels.")) {
                  void performAction("ban");
                }
              }}
              className="rv-btn"
              style={{
                padding: "10px 14px",
                fontSize: 11,
                background: "var(--color-rv-rec)",
                color: "var(--color-rv-cream)",
                border: "1.5px solid var(--color-rv-ink)",
              }}
            >
              <Ban size={12} /> Banir
            </button>
          )}
          {data.subscription?.stripe_customer_id && (
            <a
              href={`https://dashboard.stripe.com/customers/${data.subscription.stripe_customer_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rv-btn rv-btn-ghost"
              style={{ padding: "10px 14px", fontSize: 11, textDecoration: "none" }}
            >
              Stripe Dashboard ↗
            </a>
          )}
        </div>
      </Card>

      {/* Scripts */}
      <Card title={`Últimos roteiros (${data.scripts.length})`}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Tema</Th>
              <Th>@source</Th>
              <Th align="right">Duração</Th>
            </tr>
          </thead>
          <tbody>
            {data.scripts.map((s) => (
              <tr key={s.id}>
                <Td>{fmtDate(s.created_at)}</Td>
                <Td>
                  <div style={{ maxWidth: 360 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{s.titulo}</div>
                    <div style={{ fontSize: 11, color: "var(--color-rv-muted)" }}>
                      {s.tema}
                    </div>
                  </div>
                </Td>
                <Td>
                  {s.source_owner ? (
                    <a
                      href={s.source_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--color-rv-rec)", textDecoration: "none" }}
                    >
                      @{s.source_owner}
                    </a>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td align="right">
                  {s.duration_ms != null ? `${(s.duration_ms / 1000).toFixed(1)}s` : "—"}
                </Td>
              </tr>
            ))}
            {data.scripts.length === 0 && (
              <tr>
                <Td colSpan={4} muted>
                  Nenhum roteiro ainda.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Usage events */}
      <Card title={`Eventos de custo (${data.usage.length})`}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Provider</Th>
              <Th>Operação</Th>
              <Th align="right">Custo</Th>
              <Th align="right">Duração</Th>
              <Th>OK</Th>
            </tr>
          </thead>
          <tbody>
            {data.usage.map((u) => (
              <tr key={u.id}>
                <Td>{fmtDate(u.created_at)}</Td>
                <Td>
                  <span
                    className="rv-mono"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    {u.provider}
                  </span>
                </Td>
                <Td>{u.operation}</Td>
                <Td align="right">{fmtUsd(u.cost_usd)}</Td>
                <Td align="right">
                  {u.duration_ms != null ? `${(u.duration_ms / 1000).toFixed(1)}s` : "—"}
                </Td>
                <Td>{u.success ? "✓" : "✗"}</Td>
              </tr>
            ))}
            {data.usage.length === 0 && (
              <tr>
                <Td colSpan={6} muted>
                  Sem eventos de custo.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </main>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: "var(--color-rv-cream)",
        border: `1.5px solid ${accent ? "var(--color-rv-rec)" : "var(--color-rv-ink)"}`,
        boxShadow: accent
          ? "5px 5px 0 0 var(--color-rv-rec)"
          : "4px 4px 0 0 var(--color-rv-ink)",
        padding: "14px 16px",
      }}
    >
      <div
        className="rv-mono"
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--color-rv-muted)",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        className="rv-display"
        style={{ fontSize: 24, lineHeight: 1, letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--color-rv-cream)",
        border: "1.5px solid var(--color-rv-ink)",
        boxShadow: "4px 4px 0 0 var(--color-rv-ink)",
        marginBottom: 18,
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--color-rv-line)",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {title}
      </div>
      <div style={{ padding: 16, overflowX: "auto" }}>{children}</div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        textAlign: align ?? "left",
        padding: "10px 8px",
        borderBottom: "1.5px solid var(--color-rv-ink)",
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "var(--color-rv-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  muted,
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  muted?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      style={{
        textAlign: align ?? "left",
        padding: "10px 8px",
        borderBottom: "1px solid var(--color-rv-line)",
        fontSize: 12,
        color: muted ? "var(--color-rv-muted)" : "var(--color-rv-ink)",
      }}
    >
      {children}
    </td>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};
