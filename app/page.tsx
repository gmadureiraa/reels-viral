"use client";

/**
 * / — landing pública. Hero com input do reel + botão "Gerar".
 *
 * Fluxo:
 *  1. User cola URL Instagram + click "Gerar reel viral"
 *  2. Salva pendingBrief mínimo em sessionStorage
 *  3. Abre AuthDialog (login/Google)
 *  4. Após auth → redirect /app que detecta pendingBrief e dispara geração
 *
 * Se já logado, click direto manda pra /app com o brief.
 *
 * Observação: o brief que sai daqui é minimalista (só sourceUrl). O form
 * completo (tema, objetivo, CTA) acontece dentro de /app — ali user pode
 * preencher antes de gerar. Pra manter UX simples na landing, "Gerar"
 * apenas cola URL e abre o app pré-preenchido.
 */

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import ThemeToggle from "@/components/ThemeToggle";
import {
  ArrowRight,
  Clipboard,
  Sparkles,
  Zap,
  Library,
  Film,
  ShieldCheck,
} from "lucide-react";
import { isValidInstagramUrl } from "@/lib/utils";
import { useNeonSession } from "@/lib/auth-client";
import { AuthDialog } from "@/components/auth-dialog";
import { trackSubscribe } from "@/lib/meta-pixel";
import { PLANS_RV, type PlanId } from "@/lib/pricing";

const PENDING_FORM_KEY = "rv_pending_brief";

// useSearchParams precisa de Suspense boundary no App Router (Next 16) ou
// o prerender estático do `/` quebra. Wrapper ao redor do componente real.
export default function LandingPage() {
  return (
    <Suspense fallback={null}>
      <LandingPageInner />
    </Suspense>
  );
}

function LandingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useNeonSession();
  const [sourceUrl, setSourceUrl] = useState("");
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  // Suprime auto-redirect pra /app logo após signOut. Sem essa guarda, se
  // o cookie cross-origin demora pra invalidar (ou se o cache do Better
  // Auth ainda tem a sessão antiga em alguma tab), o user clicava "Sair"
  // e caía de volta no /app instantaneamente. Quando `?signed_out=1` está
  // na URL ou flag em sessionStorage, ignoramos o redirect e limpamos a
  // flag depois de 5s.
  const [suppressRedirect, setSuppressRedirect] = useState(() => {
    if (typeof window === "undefined") return false;
    if (searchParams.get("signed_out") === "1") return true;
    try {
      return window.sessionStorage.getItem("rv_suppress_redirect") === "1";
    } catch {
      return false;
    }
  });

  // Se voltou pra "/" com ?login=required (vindo do app sem auth), abre o
  // dialog automaticamente e mostra mensagem amigável.
  useEffect(() => {
    if (searchParams.get("login") === "required") {
      setShowAuthDialog(true);
    }
    if (searchParams.get("signed_out") === "1") {
      setSuppressRedirect(true);
      try {
        window.sessionStorage.setItem("rv_suppress_redirect", "1");
      } catch {
        /* ignore */
      }
      // Limpa o param da URL pra não ficar visível
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("signed_out");
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch {
        /* ignore */
      }
      // Libera o redirect depois de 5s — tempo suficiente pra cookie/cache
      // serem invalidados e novos signins funcionarem normal.
      const timer = setTimeout(() => {
        setSuppressRedirect(false);
        try {
          window.sessionStorage.removeItem("rv_suppress_redirect");
        } catch {
          /* ignore */
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Bridge do Radar Viral — detecta ?url=/?source=/?reel= (link IG) e ?topic=
  // (texto livre). Pre-popula input de URL quando dá, ou salva tema em
  // sessionStorage pra o /app consumir. Logado: redireciona direto pro /app.
  // Limpa URL após consumir pra evitar re-disparo em refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawUrl =
      searchParams.get("url") ??
      searchParams.get("source") ??
      searchParams.get("reel");
    const rawTopic = searchParams.get("topic");
    if (!rawUrl && !rawTopic) return;

    let consumed = false;
    let pendingSourceUrl = "";
    let pendingTema = "";

    if (rawUrl && isValidInstagramUrl(rawUrl)) {
      pendingSourceUrl = rawUrl.trim();
      setSourceUrl(pendingSourceUrl);
      consumed = true;
    }
    if (rawTopic) {
      pendingTema = rawTopic.trim();
      consumed = true;
    }

    if (consumed) {
      // Salva brief em sessionStorage pro /app pegar (logado vai direto;
      // anônimo cai no AuthDialog e brief sobrevive ao redirect OAuth).
      try {
        sessionStorage.setItem(
          PENDING_FORM_KEY,
          JSON.stringify({
            sourceUrl: pendingSourceUrl,
            tema: pendingTema,
            objetivo: "seguidores",
            cta: "",
            // Bridge do Radar: só pre-popula. User revisa e clica gerar.
            autoRun: false,
          }),
        );
      } catch {
        /* sessionStorage bloqueado */
      }

      // Limpa params da URL (mantém pathname e outros params como ?login=).
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete("url");
      cleaned.searchParams.delete("source");
      cleaned.searchParams.delete("reel");
      cleaned.searchParams.delete("topic");
      window.history.replaceState(
        {},
        "",
        cleaned.pathname + (cleaned.search ? cleaned.search : ""),
      );

      // Bridge só com ?topic= (sem URL): a landing só tem campo URL, então
      // tema iria ser sobrescrito quando user submeter o form. Manda direto
      // pra /app que tem o form completo (auth gate cobre anônimo via
      // ?login=required, sessionStorage sobrevive).
      if (!pendingSourceUrl && pendingTema) {
        router.replace("/app");
      }
    }
  }, [searchParams, router]);

  // Stripe success → dispara Subscribe pixel + limpa URL pra não duplicar
  // em refresh. Roda antes do redirect-pra-/app (que tbm reage ao session
  // user) — usar sessionStorage como fence em caso do redirect ser mais rápido.
  useEffect(() => {
    if (searchParams.get("payment") !== "success") return;
    const planParam = searchParams.get("plan");
    const FENCE_KEY = "rv_subscribe_fired";
    try {
      if (sessionStorage.getItem(FENCE_KEY)) return;
      sessionStorage.setItem(FENCE_KEY, "1");
    } catch {
      /* sessionStorage indisponível, deixa rolar */
    }
    if (planParam && planParam in PLANS_RV) {
      const plan = PLANS_RV[planParam as PlanId];
      // priceMonthly em centavos BRL → converte pra unidade real (R$).
      trackSubscribe(plan.priceMonthly / 100, planParam);
    }
    // Limpa URL pra evitar re-fire em refresh (mesmo com fence acima é
    // melhor não deixar o param persistente).
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("payment");
      url.searchParams.delete("plan");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams]);

  // Se user logar enquanto na landing, manda direto pro app.
  // Quando `suppressRedirect` está ativo (recém saiu via signOutAndReset),
  // bloqueamos esse redirect por ~5s pra dar tempo do cookie cross-origin
  // invalidar e evitar loop de "Sair → cai de volta no /app".
  useEffect(() => {
    if (suppressRedirect) return;
    if (!session.isPending && session.data?.user) {
      router.replace("/app");
    }
  }, [session.isPending, session.data?.user, router, suppressRedirect]);

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && isValidInstagramUrl(text)) {
        setSourceUrl(text);
        toast.success("Link colado");
      } else {
        toast.error("Clipboard não tem URL de Reel válida");
      }
    } catch {
      toast.error("Não consegui ler o clipboard");
    }
  }

  function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidInstagramUrl(sourceUrl)) {
      toast.error("Cola um link de Reel/post Instagram válido");
      return;
    }

    // Salva brief mínimo em sessionStorage — /app detecta e abre form
    // já com sourceUrl preenchido, esperando user completar tema + CTA.
    try {
      sessionStorage.setItem(
        PENDING_FORM_KEY,
        JSON.stringify({
          sourceUrl: sourceUrl.trim(),
          tema: "",
          objetivo: "seguidores",
          cta: "",
        }),
      );
    } catch {
      /* sessionStorage bloqueado */
    }

    if (session.data?.user && !suppressRedirect) {
      // Logado: vai direto pro app
      router.push("/app");
      return;
    }

    // Anônimo (ou recém-deslogado com cache stale): abre login wall.
    // Pós-login, useEffect acima manda pro /app.
    setShowAuthDialog(true);
  }

  return (
    <main style={{ minHeight: "100dvh", background: "var(--color-rv-paper)" }}>
      {/* HEADER MINI */}
      <header
        style={{
          padding: "18px 28px",
          borderBottom: "1.5px solid var(--color-rv-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            color: "var(--color-rv-ink)",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--color-rv-rec)",
              boxShadow: "0 0 8px var(--color-rv-rec)",
            }}
          />
          <span
            className="rv-display"
            style={{ fontSize: 24, lineHeight: 1, letterSpacing: "-0.02em" }}
          >
            Reels <em>Viral</em>
          </span>
        </Link>
        <nav style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <ThemeToggle />
          <Link
            href="/app/precos"
            className="rv-btn rv-btn-ghost"
            style={{ padding: "8px 14px", fontSize: 10, letterSpacing: "0.16em" }}
          >
            Planos
          </Link>
          {/* Quando `suppressRedirect` está ativo (recém saiu), priorizamos
              o botão "Entrar" mesmo se a sessão ainda aparecer cacheada,
              pra UX coerente com o sign-out que acabou de acontecer. */}
          {session.data?.user && !suppressRedirect ? (
            <Link
              href="/app"
              className="rv-btn rv-btn-rec"
              style={{ padding: "8px 14px", fontSize: 10, letterSpacing: "0.16em" }}
            >
              Abrir app →
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setShowAuthDialog(true)}
              className="rv-btn rv-btn-ghost"
              style={{ padding: "8px 14px", fontSize: 10, letterSpacing: "0.16em" }}
            >
              Entrar
            </button>
          )}
        </nav>
      </header>

      {/* HERO */}
      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "80px 28px 60px",
          textAlign: "center",
        }}
      >
        <div className="rv-eyebrow" style={{ justifyContent: "center", marginBottom: 18 }}>
          <span className="rv-rec-dot" /> ENGENHARIA REVERSA · IA
        </div>
        <h1
          className="rv-display"
          style={{
            // Mobile: 36px (cabe em 360px sem letras cortadas).
            // Desktop: até 88px com clamp + 7vw responsivo.
            fontSize: "clamp(36px, 7vw, 88px)",
            lineHeight: 0.98,
            letterSpacing: "-0.02em",
            marginBottom: 24,
          }}
        >
          O reel <em>viraliza</em>.<br />
          Você descobre <em>como</em>.<br />
          Refilma{" "}
          <span style={{ color: "var(--color-rv-rec)" }}>seu.</span>
        </h1>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.55,
            color: "var(--color-rv-muted)",
            maxWidth: 580,
            margin: "0 auto 40px",
          }}
        >
          Cole o link de qualquer Reel viral. A IA dissecca a estrutura
          (hook, promessa, demo, CTA) em 30s e devolve um{" "}
          <strong style={{ color: "var(--color-rv-ink)" }}>
            roteiro novo cena por cena
          </strong>{" "}
          no SEU nicho — gravável direto, sem soar plágio.
        </p>

        {/* INPUT + GERAR — ação principal */}
        <form
          onSubmit={handleGenerate}
          style={{
            maxWidth: 720,
            margin: "0 auto",
            background: "var(--color-rv-cream)",
            border: "1.5px solid var(--color-rv-ink)",
            boxShadow: "8px 8px 0 0 var(--color-rv-ink)",
            padding: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 0,
              flexWrap: "wrap",
            }}
          >
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://www.instagram.com/reel/..."
              spellCheck={false}
              style={{
                flex: "1 1 320px",
                border: "none",
                outline: "none",
                background: "transparent",
                padding: "16px 18px",
                fontFamily: "var(--font-mono)",
                fontSize: 15,
                color: "var(--color-rv-ink)",
                minWidth: 200,
              }}
            />
            <button
              type="button"
              onClick={handlePaste}
              aria-label="Colar link do clipboard"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-rv-soft)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--color-rv-paper)";
              }}
              style={{
                padding: "0 16px",
                background: "var(--color-rv-paper)",
                border: "none",
                borderLeft: "1.5px solid var(--color-rv-ink)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "var(--color-rv-ink)",
                transition: "background 0.12s",
              }}
            >
              <Clipboard size={13} /> Colar
            </button>
            <button
              type="submit"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-rv-rec-hot)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--color-rv-rec)";
              }}
              style={{
                padding: "16px 24px",
                background: "var(--color-rv-rec)",
                color: "var(--color-rv-cream)",
                border: "none",
                borderLeft: "1.5px solid var(--color-rv-ink)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: 8,
                whiteSpace: "nowrap",
                transition: "background 0.12s",
              }}
            >
              <Sparkles size={13} /> Gerar reel viral
              <ArrowRight size={13} />
            </button>
          </div>
        </form>

        <p
          className="rv-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--color-rv-muted)",
            marginTop: 18,
          }}
        >
          ⚡ Grátis · 3 reels/mês · Sem cartão
        </p>
      </section>

      {/* SOCIAL PROOF / STATS */}
      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "20px 28px 60px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 18,
        }}
      >
        <StatBlock
          icon={<Zap size={20} />}
          title="< 30s"
          desc="Análise estrutural completa: hook, demo, CTA, padrões transferíveis."
        />
        <StatBlock
          icon={<Film size={20} />}
          title="Cena × cena"
          desc="Storyboard com tempo, visual, copy falada e nota de B-roll. Pronto pra gravar."
        />
        <StatBlock
          icon={<Library size={20} />}
          title="Biblioteca PRO"
          desc="Reels virais com template mapeado. Filtra por hook, transição, dueto."
        />
      </section>

      {/* COMO FUNCIONA */}
      <section
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "60px 28px 80px",
        }}
      >
        <div className="rv-eyebrow">
          <span className="rv-rec-dot" /> COMO FUNCIONA
        </div>
        <h2
          className="rv-display"
          style={{
            fontSize: "clamp(34px, 4vw, 52px)",
            marginTop: 12,
            marginBottom: 36,
          }}
        >
          Três passos. <em>Trinta segundos.</em>
        </h2>
        <div
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}
        >
          <Step
            n="01"
            title="Cola o link"
            desc="Reel do TikTok/IG que viralizou. Pode ser seu, do concorrente, ou de qualquer criador grande do nicho."
          />
          <Step
            n="02"
            title="Define o briefing"
            desc="Tema do TEU vídeo, objetivo (leads/produto/seguidor) e o CTA. A IA mantém a estrutura mas troca o conteúdo."
          />
          <Step
            n="03"
            title="Recebe o storyboard"
            desc="Análise estrutural + roteiro cena por cena com tempo, visual, copy falada e nota de B-roll. Grava direto."
          />
        </div>
      </section>

      {/* CTA FINAL */}
      <section
        style={{
          background: "var(--color-rv-ink)",
          color: "var(--color-rv-paper)",
          padding: "60px 28px",
          textAlign: "center",
        }}
      >
        <div
          className="rv-eyebrow"
          style={{ justifyContent: "center", color: "color-mix(in srgb, var(--color-rv-paper) 72%, transparent)" }}
        >
          <span className="rv-rec-dot" /> COMECE AGORA
        </div>
        <h2
          className="rv-display"
          style={{
            fontSize: "clamp(34px, 4vw, 52px)",
            marginTop: 12,
            marginBottom: 24,
            color: "var(--color-rv-paper)",
          }}
        >
          Seu próximo reel viral <em>já existe</em>.
          <br />
          Só falta refilmar com sua cara.
        </h2>
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            window.setTimeout(() => {
              const input = document.querySelector<HTMLInputElement>('input[type="url"]');
              input?.focus();
            }, 400);
          }}
          className="rv-btn rv-btn-rec"
          style={{ padding: "14px 22px", fontSize: 12 }}
        >
          <Sparkles size={14} /> Gerar meu primeiro reel
          <ArrowRight size={14} />
        </button>
        <p
          style={{
            fontSize: 12,
            color: "color-mix(in srgb, var(--color-rv-paper) 72%, transparent)",
            marginTop: 18,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <ShieldCheck size={12} /> Sem cartão · Cancele quando quiser ·
          Plano grátis vitalício
        </p>
      </section>

      {/* AUTH DIALOG — abre via "Gerar" anônimo ou ?login=required */}
      {showAuthDialog && (
        <AuthDialog
          title="Cria conta pra gerar"
          subtitle="É grátis: 3 reels/mês. Login Google em 1 click."
          onClose={() => setShowAuthDialog(false)}
          onSuccess={() => {
            setShowAuthDialog(false);
            session.refresh();
            // useEffect [session.data.user] redireciona pra /app automaticamente
          }}
        />
      )}
    </main>
  );
}

// ─── Componentes auxiliares ────────────────────────────────────────────

function StatBlock({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-rv-cream)",
        border: "1.5px solid var(--color-rv-ink)",
        boxShadow: "4px 4px 0 0 var(--color-rv-ink)",
        padding: "22px 24px",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          background: "var(--color-rv-ink)",
          color: "var(--color-rv-paper)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        {icon}
      </div>
      <div
        className="rv-display"
        style={{ fontSize: 24, lineHeight: 1, marginBottom: 6 }}
      >
        {title}
      </div>
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.45,
          color: "var(--color-rv-muted)",
        }}
      >
        {desc}
      </p>
    </div>
  );
}

function Step({
  n,
  title,
  desc,
}: {
  n: string;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-rv-cream)",
        border: "1.5px solid var(--color-rv-ink)",
        padding: "24px 26px",
        position: "relative",
      }}
    >
      <span
        className="rv-mono"
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.18em",
          color: "var(--color-rv-rec)",
        }}
      >
        {n}
      </span>
      <h3
        className="rv-display"
        style={{ fontSize: 24, lineHeight: 1.05, marginTop: 4, marginBottom: 8 }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.5,
          color: "var(--color-rv-muted)",
        }}
      >
        {desc}
      </p>
    </div>
  );
}
