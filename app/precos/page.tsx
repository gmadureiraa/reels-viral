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

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PLANS_RV, type PlanId } from "@/lib/pricing";
import { useNeonSession } from "@/lib/auth-client";
import { AuthDialog } from "@/components/auth-dialog";

type PaidPlanId = Exclude<PlanId, "free">;

export default function PricingPage() {
  const session = useNeonSession();
  const [loadingPlan, setLoadingPlan] = useState<PaidPlanId | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PaidPlanId | null>(null);

  async function handleSubscribe(planId: PaidPlanId) {
    if (!session.data?.user) {
      // Anônimo — abre login wall e guarda plano pendente
      setPendingPlan(planId);
      setShowAuthDialog(true);
      return;
    }
    setLoadingPlan(planId);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
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
          <PlanCard
            planId="free"
            highlighted={false}
            ctaLabel="Plano atual"
            disabled
            onSubscribe={() => {}}
          />
          <PlanCard
            planId="basic"
            highlighted
            ctaLabel={loadingPlan === "basic" ? "Aguarde..." : "Assinar Basic"}
            loading={loadingPlan === "basic"}
            onSubscribe={() => void handleSubscribe("basic")}
          />
          <PlanCard
            planId="max"
            highlighted={false}
            ctaLabel={loadingPlan === "max" ? "Aguarde..." : "Assinar Max"}
            loading={loadingPlan === "max"}
            onSubscribe={() => void handleSubscribe("max")}
          />
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
  ctaLabel,
  loading,
  disabled,
  onSubscribe,
}: {
  planId: PlanId;
  highlighted: boolean;
  ctaLabel: string;
  loading?: boolean;
  disabled?: boolean;
  onSubscribe: () => void;
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

  return (
    <div
      style={{
        background: "var(--color-rv-cream)",
        border: `1.5px solid ${highlighted ? "var(--color-rv-rec)" : "var(--color-rv-ink)"}`,
        boxShadow: highlighted
          ? "10px 10px 0 0 var(--color-rv-rec)"
          : "6px 6px 0 0 var(--color-rv-ink)",
        padding: "28px 26px 26px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {highlighted && (
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

      <div className="rv-eyebrow" style={{ marginBottom: 8 }}>
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
        className={highlighted ? "rv-btn rv-btn-rec" : "rv-btn rv-btn-ghost"}
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
        {ctaLabel}
      </button>
    </div>
  );
}
