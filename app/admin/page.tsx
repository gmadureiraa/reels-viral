"use client";

/**
 * /admin — painel admin do Reels Viral.
 *
 * 4 tabs:
 *  - Overview: KPIs + série diária 30d
 *  - Usuários: tabela top 50 com plan/cost/última geração
 *  - Gerações: 50 scripts mais recentes com custo estimado
 *  - Assinaturas: lista de subs ativas + MRR
 *
 * Acesso: ADMIN_EMAILS (server validation em /api/admin/stats).
 * Client check é só pra UX — mostra "Acesso restrito" se non-admin.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CreditCard,
  DollarSign,
  Loader2,
  RefreshCw,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useNeonSession } from "@/lib/auth-client";
import { isAdminEmail } from "@/lib/admin-emails";
import { getJwtToken } from "@/lib/auth-client";

type TabId = "overview" | "users" | "generations" | "subscriptions";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <Activity size={13} /> },
  { id: "users", label: "Usuários", icon: <Users size={13} /> },
  { id: "generations", label: "Gerações", icon: <Zap size={13} /> },
  { id: "subscriptions", label: "Assinaturas", icon: <CreditCard size={13} /> },
];

interface AdminStats {
  summary: {
    totalUsers: number;
    totalReels: number;
    totalReels30d: number;
    totalCostUsd30d: number;
    cacheHits30d: number;
    apifyCalls30d: number;
    cacheHitRate30d: number;
  };
  planCounts: Record<string, number>;
  dailySeries: Array<{ day: string; reels: number; cost: number; new_users: number }>;
  providerBreakdown: Array<{
    provider: string;
    ops: number;
    cost: number;
    avg_duration_ms: number | null;
  }>;
  users: Array<{
    user_id: string;
    reels_total: number;
    reels_30d: number;
    cost_usd: number;
    last_at: string | null;
    plan: string | null;
    status: string | null;
    current_period_end: string | null;
    stripe_customer_id: string | null;
  }>;
  recentScripts: Array<{
    id: string;
    user_id: string;
    tema: string;
    source_url: string;
    source_owner: string | null;
    titulo: string;
    duration_ms: number | null;
    created_at: string;
    reel_cost_usd: number | null;
  }>;
  subscriptions: {
    activeCount: number;
    mrrBrl: number;
    mrrUsd: number;
    list: Array<{
      user_id: string;
      plan: string;
      status: string;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      created_at: string;
    }>;
  };
  generatedAt: string;
}

export default function AdminPage() {
  const session = useNeonSession();
  const [tab, setTab] = useState<TabId>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = useMemo(
    () => isAdminEmail(session.data?.user?.email),
    [session.data?.user?.email],
  );

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getJwtToken();
      const res = await fetch("/api/admin/stats", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403) {
        setError("Acesso restrito — admin apenas");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AdminStats;
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session.isPending) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, session.isPending]);

  if (session.isPending) {
    return (
      <main style={pageBg}>
        <div style={centeredLoader}>
          <Loader2 size={24} className="animate-spin" />
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main style={pageBg}>
        <div style={{ ...centeredLoader, flexDirection: "column", gap: 14 }}>
          <div className="rv-eyebrow">
            <span className="rv-rec-dot" /> ACESSO RESTRITO
          </div>
          <p style={{ color: "var(--color-rv-muted)", fontSize: 14 }}>
            Esse painel é só pra admin.
          </p>
          <Link href="/" className="rv-btn rv-btn-ghost" style={{ padding: "10px 16px" }}>
            <ArrowLeft size={12} /> Voltar
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={pageBg}>
      <header
        style={{
          padding: "16px 24px",
          borderBottom: "1.5px solid var(--color-rv-ink)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Link
            href="/"
            className="rv-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
              color: "var(--color-rv-ink)",
            }}
          >
            <ArrowLeft size={14} /> Voltar
          </Link>
          <div className="rv-eyebrow">
            <span className="rv-rec-dot" /> ADMIN · REELS VIRAL
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {stats?.generatedAt && (
            <span className="rv-mono" style={{ fontSize: 9, color: "var(--color-rv-muted)" }}>
              ATUALIZADO {fmtDateShort(stats.generatedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rv-btn rv-btn-ghost"
            style={{ padding: "8px 14px", fontSize: 10, letterSpacing: "0.16em" }}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </header>

      {/* TABS */}
      <div
        style={{
          padding: "16px 24px 0",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--color-rv-line)",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="rv-mono"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "10px 16px",
              background: "transparent",
              color: tab === t.id ? "var(--color-rv-ink)" : "var(--color-rv-muted)",
              border: "none",
              borderBottom: `2px solid ${tab === t.id ? "var(--color-rv-rec)" : "transparent"}`,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: -1,
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <section style={{ padding: "26px 24px 80px", maxWidth: 1280, margin: "0 auto" }}>
        {error && (
          <div
            style={{
              padding: 16,
              border: "1.5px solid var(--color-rv-rec)",
              background: "rgba(255, 61, 46, 0.08)",
              fontSize: 13,
              marginBottom: 18,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {loading && !stats && (
          <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}

        {stats && tab === "overview" && <OverviewTab stats={stats} />}
        {stats && tab === "users" && <UsersTab stats={stats} />}
        {stats && tab === "generations" && <GenerationsTab stats={stats} />}
        {stats && tab === "subscriptions" && <SubscriptionsTab stats={stats} />}
      </section>
    </main>
  );
}

// ─── OVERVIEW ──────────────────────────────────────────────────────────

function OverviewTab({ stats }: { stats: AdminStats }) {
  const maxReels = Math.max(...stats.dailySeries.map((d) => d.reels), 1);
  const maxCost = Math.max(...stats.dailySeries.map((d) => d.cost), 0.01);
  const totalSubs = stats.subscriptions.activeCount;
  const conversionRate =
    stats.summary.totalUsers > 0
      ? (totalSubs / stats.summary.totalUsers) * 100
      : 0;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* KPI cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <KpiCard
          label="USUÁRIOS"
          value={fmtNum(stats.summary.totalUsers)}
          hint={`${stats.planCounts.basic ?? 0} basic · ${stats.planCounts.max ?? 0} max`}
          icon={<Users size={16} />}
        />
        <KpiCard
          label="REELS GERADOS"
          value={fmtNum(stats.summary.totalReels)}
          hint={`${fmtNum(stats.summary.totalReels30d)} nos últimos 30d`}
          icon={<Zap size={16} />}
        />
        <KpiCard
          label="CUSTO 30D"
          value={fmtUsd(stats.summary.totalCostUsd30d)}
          hint={`~${fmtBrl(stats.summary.totalCostUsd30d * 5)}`}
          icon={<DollarSign size={16} />}
          accent
        />
        <KpiCard
          label="MRR"
          value={fmtBrl(stats.subscriptions.mrrBrl)}
          hint={`${stats.subscriptions.activeCount} subs ativas`}
          icon={<TrendingUp size={16} />}
        />
        <KpiCard
          label="CACHE HIT"
          value={`${(stats.summary.cacheHitRate30d * 100).toFixed(0)}%`}
          hint={`${stats.summary.cacheHits30d}/${stats.summary.apifyCalls30d} calls`}
          icon={<Activity size={16} />}
        />
        <KpiCard
          label="CONVERSÃO"
          value={`${conversionRate.toFixed(1)}%`}
          hint={`${totalSubs}/${stats.summary.totalUsers} pagantes`}
          icon={<TrendingUp size={16} />}
        />
      </div>

      {/* Daily chart 30d */}
      <Card title="Atividade últimos 30 dias">
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
          <BarChart
            label="Reels gerados/dia"
            data={stats.dailySeries.map((d) => ({ x: d.day, y: d.reels, raw: d.reels }))}
            color="var(--color-rv-ink)"
            max={maxReels}
            formatter={(v) => String(Math.round(v))}
          />
          <BarChart
            label="Custo/dia (USD)"
            data={stats.dailySeries.map((d) => ({ x: d.day, y: d.cost, raw: d.cost }))}
            color="var(--color-rv-rec)"
            max={maxCost}
            formatter={(v) => `$${v.toFixed(3)}`}
          />
        </div>
      </Card>

      {/* Provider breakdown */}
      <Card title="Custo por provider (30d)">
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Provider</Th>
              <Th align="right">Operações</Th>
              <Th align="right">Custo (USD)</Th>
              <Th align="right">Custo médio</Th>
              <Th align="right">Duração média</Th>
            </tr>
          </thead>
          <tbody>
            {stats.providerBreakdown.map((p) => (
              <tr key={p.provider}>
                <Td>
                  <span
                    className="rv-mono"
                    style={{
                      textTransform: "uppercase",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      fontSize: 11,
                    }}
                  >
                    {p.provider}
                  </span>
                </Td>
                <Td align="right">{fmtNum(p.ops)}</Td>
                <Td align="right">{fmtUsd(p.cost)}</Td>
                <Td align="right">{p.ops > 0 ? fmtUsd(p.cost / p.ops) : "—"}</Td>
                <Td align="right">
                  {p.avg_duration_ms != null ? `${(p.avg_duration_ms / 1000).toFixed(1)}s` : "—"}
                </Td>
              </tr>
            ))}
            {stats.providerBreakdown.length === 0 && (
              <tr>
                <Td colSpan={5} muted>
                  Sem dados ainda.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── USERS ─────────────────────────────────────────────────────────────

function UsersTab({ stats }: { stats: AdminStats }) {
  return (
    <Card title={`Top 50 usuários por geração (${stats.users.length})`}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>User ID</Th>
            <Th>Plano</Th>
            <Th align="right">Reels total</Th>
            <Th align="right">Reels 30d</Th>
            <Th align="right">Custo (USD)</Th>
            <Th>Última geração</Th>
            <Th>Período fim</Th>
          </tr>
        </thead>
        <tbody>
          {stats.users.map((u) => (
            <tr key={u.user_id}>
              <Td>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {u.user_id.slice(0, 8)}…{u.user_id.slice(-4)}
                </span>
              </Td>
              <Td>
                <PlanBadge plan={u.plan} status={u.status} />
              </Td>
              <Td align="right">{fmtNum(u.reels_total)}</Td>
              <Td align="right">{fmtNum(u.reels_30d)}</Td>
              <Td align="right">{fmtUsd(u.cost_usd)}</Td>
              <Td>{fmtDateShort(u.last_at)}</Td>
              <Td>{fmtDateShort(u.current_period_end)}</Td>
            </tr>
          ))}
          {stats.users.length === 0 && (
            <tr>
              <Td colSpan={7} muted>
                Nenhum usuário com gerações ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

// ─── GENERATIONS ───────────────────────────────────────────────────────

function GenerationsTab({ stats }: { stats: AdminStats }) {
  return (
    <Card title={`Últimas 50 gerações (${stats.recentScripts.length})`}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th>Quando</Th>
            <Th>User</Th>
            <Th>Tema</Th>
            <Th>Source @</Th>
            <Th align="right">Duração</Th>
            <Th align="right">Custo</Th>
          </tr>
        </thead>
        <tbody>
          {stats.recentScripts.map((s) => (
            <tr key={s.id}>
              <Td>{fmtDateShort(s.created_at)}</Td>
              <Td>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {s.user_id.slice(0, 8)}…
                </span>
              </Td>
              <Td>
                <div style={{ maxWidth: 320 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{s.titulo}</div>
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
                    style={{
                      color: "var(--color-rv-rec)",
                      textDecoration: "none",
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    @{s.source_owner}
                  </a>
                ) : (
                  "—"
                )}
              </Td>
              <Td align="right">
                {s.duration_ms != null
                  ? `${(s.duration_ms / 1000).toFixed(1)}s`
                  : "—"}
              </Td>
              <Td align="right">
                {s.reel_cost_usd != null && s.reel_cost_usd > 0
                  ? fmtUsd(s.reel_cost_usd)
                  : "—"}
              </Td>
            </tr>
          ))}
          {stats.recentScripts.length === 0 && (
            <tr>
              <Td colSpan={6} muted>
                Sem gerações ainda.
              </Td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

// ─── SUBSCRIPTIONS ─────────────────────────────────────────────────────

function SubscriptionsTab({ stats }: { stats: AdminStats }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <KpiCard
          label="ATIVAS"
          value={fmtNum(stats.subscriptions.activeCount)}
          icon={<CreditCard size={16} />}
        />
        <KpiCard
          label="MRR (BRL)"
          value={fmtBrl(stats.subscriptions.mrrBrl)}
          icon={<DollarSign size={16} />}
          accent
        />
        <KpiCard
          label="MRR (USD)"
          value={fmtUsd(stats.subscriptions.mrrUsd)}
          icon={<DollarSign size={16} />}
        />
      </div>

      <Card title="Assinaturas (basic + max)">
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Criado</Th>
              <Th>User</Th>
              <Th>Plano</Th>
              <Th>Status</Th>
              <Th>Período fim</Th>
              <Th>Cancelar?</Th>
            </tr>
          </thead>
          <tbody>
            {stats.subscriptions.list.map((s) => (
              <tr key={s.user_id}>
                <Td>{fmtDateShort(s.created_at)}</Td>
                <Td>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    {s.user_id.slice(0, 8)}…
                  </span>
                </Td>
                <Td>
                  <PlanBadge plan={s.plan} status={s.status} />
                </Td>
                <Td>
                  <StatusBadge status={s.status} />
                </Td>
                <Td>{fmtDateShort(s.current_period_end)}</Td>
                <Td>
                  {s.cancel_at_period_end ? (
                    <span style={{ color: "var(--color-rv-rec)", fontSize: 11, fontWeight: 700 }}>
                      ⚠ ao fim
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            ))}
            {stats.subscriptions.list.length === 0 && (
              <tr>
                <Td colSpan={6} muted>
                  Nenhuma assinatura ativa.
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── Componentes auxiliares ────────────────────────────────────────────

function KpiCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--color-rv-cream)",
        border: `1.5px solid ${accent ? "var(--color-rv-rec)" : "var(--color-rv-ink)"}`,
        boxShadow: accent
          ? "6px 6px 0 0 var(--color-rv-rec)"
          : "4px 4px 0 0 var(--color-rv-ink)",
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span
          className="rv-mono"
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--color-rv-muted)",
          }}
        >
          {label}
        </span>
        {icon && <span style={{ color: accent ? "var(--color-rv-rec)" : "var(--color-rv-ink)" }}>{icon}</span>}
      </div>
      <div
        className="rv-display"
        style={{
          fontSize: 28,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          marginBottom: hint ? 4 : 0,
        }}
      >
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: "var(--color-rv-muted)" }}>{hint}</div>
      )}
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
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--color-rv-line)",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </div>
      <div style={{ padding: 16, overflowX: "auto" }}>{children}</div>
    </div>
  );
}

function BarChart({
  label,
  data,
  color,
  max,
  formatter,
}: {
  label: string;
  data: Array<{ x: string; y: number; raw: number }>;
  color: string;
  max: number;
  formatter: (v: number) => string;
}) {
  const total = data.reduce((acc, d) => acc + d.raw, 0);
  const totalFmt = formatter(total);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span
          className="rv-mono"
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-rv-muted)",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Total: {totalFmt}</span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          height: 80,
          background: "var(--color-rv-soft)",
          padding: 6,
          border: "1px solid var(--color-rv-line)",
        }}
      >
        {data.map((d, i) => {
          const h = max > 0 ? Math.max(2, (d.y / max) * 68) : 2;
          return (
            <div
              key={i}
              title={`${d.x}: ${formatter(d.raw)}`}
              style={{
                flex: 1,
                height: h,
                background: color,
                opacity: d.y > 0 ? 1 : 0.15,
                minWidth: 4,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function PlanBadge({ plan, status }: { plan: string | null; status: string | null }) {
  const colorMap: Record<string, { bg: string; fg: string }> = {
    basic: { bg: "rgba(255, 61, 46, 0.12)", fg: "var(--color-rv-rec)" },
    max: { bg: "var(--color-rv-ink)", fg: "var(--color-rv-paper)" },
    free: { bg: "var(--color-rv-soft)", fg: "var(--color-rv-muted)" },
  };
  const effective = (status === "active" ? plan : "free") ?? "free";
  const c = colorMap[effective] ?? colorMap.free;
  return (
    <span
      className="rv-mono"
      style={{
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        padding: "3px 8px",
        background: c.bg,
        color: c.fg,
        border: "1px solid currentColor",
      }}
    >
      {effective}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const stat = status ?? "—";
  const isOk = stat === "active";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: isOk ? "#1a8a3a" : "var(--color-rv-rec)",
      }}
    >
      ● {stat}
    </span>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
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
  align?: "left" | "right" | "center";
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
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}

// ─── Format utils ──────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function fmtBrl(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ─── Inline styles ────────────────────────────────────────────────────

const pageBg: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--color-rv-paper)",
  color: "var(--color-rv-ink)",
};

const centeredLoader: React.CSSProperties = {
  minHeight: "60vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};
