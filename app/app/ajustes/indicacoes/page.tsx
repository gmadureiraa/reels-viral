"use client";

/**
 * /app/ajustes/indicacoes — programa Indique-e-Ganhe.
 *
 * Hero com link unico copiavel + 3 cards de stats + tabela de historico.
 * Visual cream + REC coral, alinhado com o resto do app.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Gift,
  Copy,
  Check,
  Share2,
  Users,
  Wallet,
  TrendingUp,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getJwtToken } from "@/lib/auth-client";

type MeResponse = {
  code: string;
  signupCount: number;
  conversionCount: number;
  totalCreditCents: number;
};

type ReferralItem = {
  id: string;
  email: string;
  status: "pending" | "signup" | "converted" | "expired";
  signupAt: string | null;
  conversionAt: string | null;
  rewardAmountCents: number;
  rewardApplied: boolean;
  createdAt: string;
};

const SITE_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL) ||
  "https://reels.kaleidos.com.br";

function formatBrl(cents: number): string {
  const v = cents / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(v);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function statusLabel(status: ReferralItem["status"]): {
  label: string;
  bg: string;
  fg: string;
} {
  switch (status) {
    case "converted":
      return {
        label: "Pago — crédito ativo",
        bg: "var(--color-rv-rec)",
        fg: "var(--color-rv-cream)",
      };
    case "signup":
      return {
        label: "Cadastrado",
        bg: "var(--color-rv-amber)",
        fg: "var(--color-rv-ink)",
      };
    case "pending":
      return {
        label: "Aguardando",
        bg: "var(--color-rv-soft)",
        fg: "var(--color-rv-ink)",
      };
    case "expired":
    default:
      return {
        label: "Expirado",
        bg: "transparent",
        fg: "var(--color-rv-muted)",
      };
  }
}

export default function IndicacoesPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [items, setItems] = useState<ReferralItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const jwt = await getJwtToken();
        if (!jwt) {
          setError("Faça login pra ver suas indicações.");
          setLoading(false);
          return;
        }
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        };
        const [meRes, listRes] = await Promise.all([
          fetch("/api/referrals/me", { headers }),
          fetch("/api/referrals/list", { headers }),
        ]);
        if (!meRes.ok) throw new Error(`me ${meRes.status}`);
        if (!listRes.ok) throw new Error(`list ${listRes.status}`);
        const meData = (await meRes.json()) as MeResponse;
        const listData = (await listRes.json()) as { items: ReferralItem[] };
        if (cancelled) return;
        setMe(meData);
        setItems(listData.items);
      } catch (e) {
        if (cancelled) return;
        console.error("[indicacoes] erro:", e);
        setError("Não consegui carregar suas indicações. Tenta de novo daqui a pouco.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const link = useMemo(() => {
    if (!me?.code) return "";
    return `${SITE_URL}/?ref=${me.code}`;
  }, [me]);

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error("Falhou copiar — tenta selecionar manualmente.");
    }
  }

  async function handleShare() {
    if (!link) return;
    const text = `Tô usando o Reels Viral pra fazer engenharia reversa de reels que viralizam — usa meu link e ganha 30% off no primeiro mês: ${link}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title: "Reels Viral",
          text,
          url: link,
        });
        return;
      } catch {
        /* user cancelled — fall through */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Mensagem copiada — cola onde quiser.");
    } catch {
      /* ignore */
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--color-rv-paper)",
        color: "var(--color-rv-ink)",
      }}
    >
      <section style={{ maxWidth: 880, margin: "0 auto", padding: "32px 24px 80px" }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 18 }}>
          <Link
            href="/app/ajustes"
            className="rv-mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--color-rv-muted)",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            <ArrowLeft size={12} /> Ajustes
          </Link>
        </div>

        {/* Header */}
        <header style={{ marginBottom: 32 }}>
          <div className="rv-eyebrow" style={{ marginBottom: 8 }}>
            <Gift size={14} /> INDIQUE E GANHE
          </div>
          <h1
            className="rv-display"
            style={{
              fontSize: 44,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              marginBottom: 12,
            }}
          >
            R$ 25 de crédito por <em>cada amigo</em> que assinar.
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "var(--color-rv-ink)",
              lineHeight: 1.55,
              maxWidth: 640,
            }}
          >
            Compartilhe seu link. Quem entra usando ele ganha{" "}
            <strong>30% off no primeiro mês</strong>. Quando o pagamento dele
            rola, <strong>R$ 25,00</strong> caem no seu saldo Stripe e abatem
            automaticamente na sua próxima fatura. Sem limite — pode acumular o
            quanto quiser.
          </p>
        </header>

        {/* Hero — link grande copiável */}
        {loading ? (
          <div
            style={{
              marginBottom: 32,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 22,
              border: "1.5px solid var(--color-rv-ink)",
              background: "var(--color-rv-cream)",
              boxShadow: "4px 4px 0 0 var(--color-rv-ink)",
            }}
          >
            <Loader2 size={16} className="rv-spin" />
            <span
              className="rv-mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--color-rv-muted)",
                fontWeight: 700,
              }}
            >
              Carregando seu link…
            </span>
          </div>
        ) : error ? (
          <div
            style={{
              marginBottom: 32,
              padding: 22,
              border: "1.5px solid var(--color-rv-rec)",
              background: "rgba(255,61,46,0.06)",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        ) : (
          me && (
            <div
              style={{
                marginBottom: 36,
                padding: "26px 28px",
                border: "2px solid var(--color-rv-ink)",
                background: "var(--color-rv-rec)",
                color: "var(--color-rv-cream)",
                boxShadow: "6px 6px 0 0 var(--color-rv-ink)",
              }}
            >
              <div
                className="rv-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  fontWeight: 800,
                  marginBottom: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--color-rv-cream)",
                  }}
                />
                Seu link de indicação
              </div>
              <div
                className="rv-mono"
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  marginBottom: 18,
                  wordBreak: "break-all",
                }}
              >
                {link}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button
                  onClick={handleCopy}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 18px",
                    background: "var(--color-rv-ink)",
                    color: "var(--color-rv-cream)",
                    border: "1.5px solid var(--color-rv-ink)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "3px 3px 0 0 rgba(0,0,0,0.25)",
                  }}
                >
                  {copied ? (
                    <>
                      <Check size={14} /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copiar link
                    </>
                  )}
                </button>
                <button
                  onClick={handleShare}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 18px",
                    background: "transparent",
                    color: "var(--color-rv-cream)",
                    border: "1.5px solid var(--color-rv-cream)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <Share2 size={14} /> Compartilhar
                </button>
              </div>
            </div>
          )
        )}

        {/* Stat cards */}
        {me && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
              marginBottom: 36,
            }}
          >
            <StatCard
              icon={<Users size={16} />}
              label="Indicados"
              value={String(me.signupCount)}
              hint="Cadastraram com seu link"
            />
            <StatCard
              icon={<TrendingUp size={16} />}
              label="Conversões"
              value={String(me.conversionCount)}
              hint="Pagaram primeira fatura"
            />
            <StatCard
              icon={<Wallet size={16} />}
              label="Meses grátis de Pro"
              value={
                me.conversionCount > 0
                  ? me.conversionCount === 1
                    ? "1 mês grátis"
                    : `${me.conversionCount} meses grátis`
                  : "0 meses"
              }
              hint={`= ${formatBrl(me.totalCreditCents)} em crédito Stripe (abate auto na próxima fatura)`}
              highlight
            />
          </div>
        )}

        {/* Tabela */}
        <section>
          <h2
            className="rv-display"
            style={{
              fontSize: 24,
              letterSpacing: "-0.01em",
              marginBottom: 12,
            }}
          >
            Histórico de indicações
          </h2>
          {!items || items.length === 0 ? (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                border: "1.5px dashed var(--color-rv-ink)",
                background: "rgba(10,9,8,0.02)",
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  color: "var(--color-rv-muted)",
                }}
              >
                Ainda sem indicações. Cola seu link em qualquer rede que você
                usa — cada amigo que assinar vale <strong>1 mês grátis de Pro</strong>.
              </p>
            </div>
          ) : (
            <div
              style={{
                border: "1.5px solid var(--color-rv-ink)",
                background: "var(--color-rv-cream)",
                boxShadow: "3px 3px 0 0 var(--color-rv-ink)",
                overflowX: "auto",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr
                    style={{
                      background: "var(--color-rv-ink)",
                      color: "var(--color-rv-paper)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: "11px 14px" }}>Quando</th>
                    <th style={{ padding: "11px 14px" }}>Email</th>
                    <th style={{ padding: "11px 14px" }}>Status</th>
                    <th style={{ padding: "11px 14px", textAlign: "right" }}>
                      Recompensa
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => {
                    const s = statusLabel(row.status);
                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderTop:
                            idx === 0 ? "none" : "1px solid rgba(10,9,8,0.08)",
                          fontSize: 13.5,
                        }}
                      >
                        <td style={{ padding: "12px 14px" }}>
                          {formatDate(
                            row.conversionAt || row.signupAt || row.createdAt,
                          )}
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                          }}
                        >
                          {row.email}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              padding: "3px 10px",
                              background: s.bg,
                              color: s.fg,
                              fontFamily: "var(--font-mono)",
                              fontSize: 9.5,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                              fontWeight: 700,
                            }}
                          >
                            {s.label}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "12px 14px",
                            textAlign: "right",
                            fontFamily: "var(--font-mono)",
                            fontSize: 13,
                            fontWeight: 700,
                            color:
                              row.status === "converted"
                                ? "var(--color-rv-ink)"
                                : "var(--color-rv-muted)",
                          }}
                        >
                          {row.rewardApplied
                            ? `+ ${formatBrl(row.rewardAmountCents)}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Regras */}
        <aside
          style={{
            marginTop: 36,
            padding: 22,
            border: "1.5px solid var(--color-rv-ink)",
            background: "rgba(10,9,8,0.03)",
          }}
        >
          <div
            className="rv-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--color-rv-muted)",
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            Como funciona
          </div>
          <ul
            style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: "var(--color-rv-ink)",
              paddingLeft: 0,
              listStyle: "none",
              margin: 0,
            }}
          >
            <li style={{ marginBottom: 8 }}>
              <strong>1.</strong> Seu amigo clica no seu link e usa o cupom{" "}
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  background: "var(--color-rv-rec)",
                  color: "var(--color-rv-cream)",
                  padding: "1px 6px",
                  borderRadius: 0,
                }}
              >
                AMIGOPRO30
              </code>{" "}
              — ele ganha 30% off no primeiro mês.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>2.</strong> Quando o pagamento dele cai, você ganha{" "}
              <strong>R$ 25 de crédito</strong> direto no Stripe.
            </li>
            <li style={{ marginBottom: 8 }}>
              <strong>3.</strong> Esse crédito abate automático na sua próxima
              fatura. Acumula sem teto — chame 10 amigos, pague 10 meses de
              menos.
            </li>
            <li>
              <strong>4.</strong> Auto-indicação não vale (a gente bloqueia).
              Link tem validade de 30 dias no navegador do convidado.
            </li>
          </ul>
        </aside>
      </section>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        padding: 18,
        border: "1.5px solid var(--color-rv-ink)",
        background: highlight ? "var(--color-rv-rec)" : "var(--color-rv-cream)",
        color: highlight ? "var(--color-rv-cream)" : "var(--color-rv-ink)",
        boxShadow: "3px 3px 0 0 var(--color-rv-ink)",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 9.5,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          fontWeight: 700,
          marginBottom: 8,
          color: highlight ? "var(--color-rv-cream)" : "var(--color-rv-ink)",
        }}
      >
        {icon} {label}
      </div>
      <div
        className="rv-display"
        style={{
          fontSize: 32,
          letterSpacing: "-0.02em",
          lineHeight: 1.05,
          color: highlight ? "var(--color-rv-cream)" : "var(--color-rv-ink)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 11.5,
          color: highlight ? "rgba(255,255,255,0.86)" : "var(--color-rv-muted)",
        }}
      >
        {hint}
      </div>
    </div>
  );
}
