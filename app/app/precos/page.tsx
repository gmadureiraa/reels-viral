"use client";

/**
 * Página /precos — 3 planos lado a lado (Free / Basic / Max).
 *
 * Click em "Assinar" → POST /api/stripe/checkout → redireciona pro Stripe
 * Checkout. Volta com ?payment=success ou ?payment=cancelled na home.
 *
 * Usuário anônimo é interceptado pelo AuthDialog antes do checkout (mesma
 * estratégia do login wall do form principal).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, ArrowLeft, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PLANS_RV, type PlanId } from "@/lib/pricing";
import { useNeonSession, getJwtToken } from "@/lib/auth-client";
import { AuthDialog } from "@/components/auth-dialog";
import { getStoredReferralCode } from "@/lib/referral-client";

type PaidPlanId = Exclude<PlanId, "free">;

interface SubscriptionInfo {
  plan: PlanId;
  status: string;
  isPaid: boolean;
  hasStripeCustomer: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export default function PricingPage() {
  const session = useNeonSession();
  const [loadingPlan, setLoadingPlan] = useState<PaidPlanId | null>(null);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PaidPlanId | null>(null);
  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null);

  // Busca plano atual quando user logado
  useEffect(() => {
    if (!session.data?.user) {
      setSubInfo(null);
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const jwt = await getJwtToken();
        const res = await fetch("/api/me/subscription", {
          headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
        });
        if (!res.ok) return;
        const data = (await res.json()) as SubscriptionInfo;
        if (!cancel) setSubInfo(data);
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      cancel = true;
    };
  }, [session.data?.user?.id]);

  async function handleSubscribe(planId: PaidPlanId) {
    if (!session.data?.user) {
      // Anônimo — abre login wall e guarda plano pendente
      setPendingPlan(planId);
      setShowAuthDialog(true);
      return;
    }
    setLoadingPlan(planId);
    try {
      const jwt = await getJwtToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
      // Programa Indique-e-Ganhe — passa o referral code do localStorage
      // (se houver) pro backend registrar a indicacao + propagar pra
      // metadata da Stripe session.
      const referralCode = getStoredReferralCode();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers,
        body: JSON.stringify({
          planId,
          ...(referralCode ? { referralCode } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Falha ao criar checkout");
      }
      window.location.href = data.url as string;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
      setLoadingPlan(null);
    }
  }

  async function handleOpenPortal() {
    setLoadingPortal(true);
    try {
      const jwt = await getJwtToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (jwt) headers["Authorization"] = `Bearer ${jwt}`;
      const res = await fetch("/api/stripe/portal", { method: "POST", headers });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Falha ao abrir portal");
      }
      window.location.href = data.url as string;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
      setLoadingPortal(false);
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
      <header
        style={{
          padding: "20px 28px",
          borderBottom: "1.5px solid var(--color-rv-ink)",
        }}
      >
        <Link
          href="/app"
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
          <ArrowLeft size={14} />
          Voltar
        </Link>
      </header>

      <section
        style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 28px 100px" }}
      >
        <div style={{ textAlign: "center", marginBottom: 50 }}>
          <div className="rv-eyebrow" style={{ justifyContent: "center", marginBottom: 12 }}>
            <span className="rv-rec-dot" /> PLANOS
          </div>
          <h1
            className="rv-display"
            style={{ fontSize: 48, lineHeight: 1.05, marginBottom: 14 }}
          >
            Adapte reels <em>virais</em>
            <br />
            sem reinventar a roda.
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "var(--color-rv-muted)",
              maxWidth: 560,
              margin: "0 auto",
              lineHeight: 1.5,
            }}
          >
            Cole o link, escolha tema e CTA. IA devolve roteiro completo,
            storyboard cena por cena e biblioteca de templates virais.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
          }}
        >
          {(["free", "basic", "max"] as PlanId[]).map((planId) => {
            const isCurrent = subInfo?.plan === planId;
            const isFree = planId === "free";
            const isLoading = loadingPlan === planId;

            // CTA depende do estado da sub:
            //  - Plano atual + has Stripe customer (basic/max) → "Gerenciar"
            //  - Plano atual + sem stripe (free) → "Plano atual" disabled
            //  - Outro plano + user já paga → "Trocar pra X"
            //  - Outro plano + user free → "Assinar X"
            let ctaLabel = isFree ? "Plano atual" : `Assinar ${PLANS_RV[planId].name}`;
            let onClick: () => void = () => {
              if (!isFree) void handleSubscribe(planId as PaidPlanId);
            };
            let disabled = isFree;
            let loading = isLoading;

            if (isCurrent && !isFree && subInfo?.hasStripeCustomer) {
              ctaLabel = loadingPortal ? "Aguarde..." : "Gerenciar";
              onClick = () => void handleOpenPortal();
              disabled = false;
              loading = loadingPortal;
            } else if (isCurrent && isFree) {
              ctaLabel = "Plano atual";
              disabled = true;
            } else if (subInfo?.isPaid && !isCurrent && !isFree) {
              ctaLabel = isLoading ? "Aguarde..." : `Trocar pra ${PLANS_RV[planId].name}`;
            }

            // Highlighted: basic é sempre o destaque visual ("MAIS POPULAR"),
            // EXCETO quando o user já tem max ativo (aí max ganha o destaque)
            const highlighted =
              subInfo?.plan === "max"
                ? planId === "max"
                : planId === "basic";

            return (
              <PlanCard
                key={planId}
                planId={planId}
                highlighted={highlighted}
                isCurrent={isCurrent}
                ctaLabel={ctaLabel}
                loading={loading}
                disabled={disabled}
                onSubscribe={onClick}
                cancelAtPeriodEnd={
                  isCurrent ? Boolean(subInfo?.cancelAtPeriodEnd) : false
                }
                periodEnd={isCurrent ? subInfo?.currentPeriodEnd ?? null : null}
              />
            );
          })}
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: 36,
            fontSize: 12,
            color: "var(--color-rv-muted)",
          }}
        >
          Cobrança recorrente mensal · Cancele quando quiser · Stripe BR ·
          Pagamento por cartão (PIX em breve)
        </p>
      </section>

      {showAuthDialog && (
        <AuthDialog
          title="Cria conta pra assinar"
          subtitle="Em 10s sua conta tá pronta e você volta direto pro checkout."
          onClose={() => {
            setShowAuthDialog(false);
            setPendingPlan(null);
          }}
          onSuccess={() => {
            setShowAuthDialog(false);
            session.refresh();
            // Após login, dispara o checkout pro plano pendente
            if (pendingPlan) {
              window.setTimeout(() => {
                void handleSubscribe(pendingPlan);
              }, 200);
            }
          }}
        />
      )}
    </main>
  );
}

function PlanCard({
  planId,
  highlighted,
  isCurrent,
  ctaLabel,
  loading,
  disabled,
  onSubscribe,
  cancelAtPeriodEnd,
  periodEnd,
}: {
  planId: PlanId;
  highlighted: boolean;
  isCurrent?: boolean;
  ctaLabel: string;
  loading?: boolean;
  disabled?: boolean;
  onSubscribe: () => void;
  cancelAtPeriodEnd?: boolean;
  periodEnd?: string | null;
}) {
  const plan = PLANS_RV[planId];
  const priceFormatted =
    plan.priceMonthly === 0
      ? "Grátis"
      : `R$ ${(plan.priceMonthly / 100).toFixed(2).replace(".", ",")}`;
  const anchor =
    "priceAnchor" in plan && plan.priceAnchor
      ? `R$ ${(plan.priceAnchor / 100).toFixed(2).replace(".", ",")}`
      : null;
  const periodEndDate = periodEnd
    ? new Date(periodEnd).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
      })
    : null;

  return (
    <div
      style={{
        background: "var(--color-rv-cream)",
        border: `1.5px solid ${
          isCurrent
            ? "var(--color-rv-ink)"
            : highlighted
              ? "var(--color-rv-rec)"
              : "var(--color-rv-ink)"
        }`,
        boxShadow: isCurrent
          ? "12px 12px 0 0 var(--color-rv-amber)"
          : highlighted
            ? "10px 10px 0 0 var(--color-rv-rec)"
            : "6px 6px 0 0 var(--color-rv-ink)",
        padding: "28px 26px 26px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {isCurrent && (
        <div
          className="rv-mono"
          style={{
            position: "absolute",
            top: -12,
            left: 16,
            background: "var(--color-rv-amber)",
            color: "var(--color-rv-ink)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            padding: "5px 10px",
          }}
        >
          ✓ Plano atual
        </div>
      )}
      {highlighted && !isCurrent && (
        <div
          className="rv-mono"
          style={{
            position: "absolute",
            top: -12,
            right: 16,
            background: "var(--color-rv-rec)",
            color: "white",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            padding: "5px 10px",
          }}
        >
          Mais popular
        </div>
      )}

      <div className="rv-eyebrow" style={{ marginBottom: 8, marginTop: isCurrent ? 6 : 0 }}>
        {plan.name.toUpperCase()}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <span
          className="rv-display"
          style={{ fontSize: 36, lineHeight: 1, letterSpacing: "-0.02em" }}
        >
          {priceFormatted}
        </span>
        {plan.priceMonthly > 0 && (
          <span style={{ fontSize: 13, color: "var(--color-rv-muted)" }}>/mês</span>
        )}
      </div>
      {anchor && (
        <div style={{ fontSize: 12, color: "var(--color-rv-muted)", marginBottom: 18 }}>
          de <s>{anchor}</s>
        </div>
      )}
      {!anchor && <div style={{ height: 18 }} />}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "12px 0 22px",
          display: "grid",
          gap: 10,
          flex: 1,
        }}
      >
        {plan.features.map((feat, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            <Check
              size={14}
              style={{
                flexShrink: 0,
                marginTop: 2,
                color: highlighted ? "var(--color-rv-rec)" : "var(--color-rv-ink)",
              }}
              strokeWidth={2.5}
            />
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSubscribe}
        disabled={disabled || loading}
        className={
          isCurrent
            ? "rv-btn rv-btn-ghost"
            : highlighted
              ? "rv-btn rv-btn-rec"
              : "rv-btn rv-btn-ghost"
        }
        style={{
          width: "100%",
          padding: "12px 16px",
          fontSize: 12,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        {loading && <Loader2 size={12} className="animate-spin" />}
        {isCurrent && !disabled && <Settings size={12} />}
        {!isCurrent && !disabled && !loading && planId !== "free" && <Sparkles size={12} />}
        {ctaLabel}
      </button>

      {/* Mostra info de renovação/cancelamento pra plano atual */}
      {isCurrent && periodEndDate && (
        <p
          className="rv-mono"
          style={{
            marginTop: 10,
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: cancelAtPeriodEnd ? "var(--color-rv-rec)" : "var(--color-rv-muted)",
            textAlign: "center",
          }}
        >
          {cancelAtPeriodEnd
            ? `⚠ Cancela em ${periodEndDate}`
            : `Renova em ${periodEndDate}`}
        </p>
      )}
    </div>
  );
}
