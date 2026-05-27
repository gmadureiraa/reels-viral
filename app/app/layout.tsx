"use client";

/**
 * Layout do app interno (/app/*).
 *
 * Sidebar fixed à esquerda (estilo SV) com nav items + plan card +
 * sign out. Mobile: drawer aberto via hamburger no header mobile.
 *
 * Cores RV: ink (sidebar bg), paper (sidebar text), REC coral (active).
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isValidInstagramUrl } from "@/lib/utils";
import {
  PlusCircle,
  History,
  Library,
  Sparkles,
  Shield,
  LogOut,
  Menu,
  X,
  CreditCard,
  Gift,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  useNeonSession,
  isAuthConfigured,
  signOutAndReset,
} from "@/lib/auth-client";
import { useLoginMigration } from "@/lib/storage";
import { isAdminEmail } from "@/lib/admin-emails";
import ThemeToggle from "@/components/ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: typeof PlusCircle;
  badge?: string;
}

/**
 * Sidebar nav split em 2 grupos (igual SV):
 *   - PRIMARY (topo): features principais — Adaptar reel, Meus roteiros, Biblioteca
 *   - SECONDARY (rodapé, antes do user card): Indique e ganhe, Ajustes, Planos
 */
const PRIMARY_NAV: NavItem[] = [
  { href: "/app", label: "Adaptar reel", icon: PlusCircle },
  { href: "/app/meus-roteiros", label: "Meus roteiros", icon: History },
  { href: "/app/biblioteca", label: "Biblioteca", icon: Library, badge: "PRO" },
];

const SECONDARY_NAV: NavItem[] = [
  { href: "/app/ajustes/indicacoes", label: "Indique e ganhe", icon: Gift },
  { href: "/app/ajustes", label: "Ajustes", icon: SettingsIcon },
  { href: "/app/precos", label: "Planos", icon: CreditCard },
];

const ADMIN_NAV_ITEM: NavItem = {
  href: "/app/admin",
  label: "Admin",
  icon: Shield,
  badge: "DEV",
};

/**
 * Captura ?url=/?topic= via useSearchParams. Wrappped em <Suspense>
 * pelo AppLayout pra não bailout o build estático no Next 16/Turbopack.
 * Sem isso, o admin/precos não pre-renderizam.
 */
function SearchParamsBridge() {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawUrl =
      searchParams.get("url") ??
      searchParams.get("source") ??
      searchParams.get("reel");
    const rawTopic = searchParams.get("topic");
    if (!rawUrl && !rawTopic) return;

    const sourceUrl =
      rawUrl && isValidInstagramUrl(rawUrl) ? rawUrl.trim() : "";
    const tema = rawTopic ? rawTopic.trim() : "";

    if (sourceUrl || tema) {
      try {
        sessionStorage.setItem(
          "rv_pending_brief",
          JSON.stringify({
            sourceUrl,
            tema,
            objetivo: "seguidores",
            cta: "",
            autoRun: false,
          }),
        );
      } catch {
        /* sessionStorage bloqueado */
      }
    }
  }, [searchParams]);
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useNeonSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-migra histórico anônimo (localStorage) → DB Neon assim que o
  // user fica logado. Cobre todos os caminhos: AuthBar, AuthDialog do
  // landing, AuthDialog do /app, e Google OAuth callback. Idempotente.
  useLoginMigration();

  // Auth gate: se não logado e auth está configurado, manda pra landing
  // (a landing tem o login wall).
  useEffect(() => {
    if (!isAuthConfigured()) return;
    if (session.isPending) return;
    if (!session.data?.user) {
      router.replace("/?login=required");
    }
  }, [session.isPending, session.data?.user, router]);

  const closeDrawer = () => setMobileOpen(false);

  // Esc fecha o drawer mobile + trava o scroll do body enquanto aberto.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  if (session.isPending) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-rv-paper)",
        }}
      >
        <div
          className="rv-mono"
          style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--color-rv-muted)" }}
        >
          CARREGANDO…
        </div>
      </div>
    );
  }

  // Sem usuário: redirect já disparado, render placeholder
  if (!session.data?.user) return null;

  const isAdmin = isAdminEmail(session.data.user.email);
  // Admin entra no PRIMARY (debug/operação). SECONDARY (Indique/Ajustes/Planos)
  // sempre fica no rodapé do sidebar pra ficar visualmente separado.
  const primaryItems = isAdmin ? [...PRIMARY_NAV, ADMIN_NAV_ITEM] : PRIMARY_NAV;
  const secondaryItems = SECONDARY_NAV;

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--color-rv-paper)",
      }}
    >
      <Suspense fallback={null}>
        <SearchParamsBridge />
      </Suspense>

      {/* Sidebar desktop (fixed à esquerda) */}
      <aside
        className="rv-sidebar-desktop"
        style={{
          width: 232,
          flexShrink: 0,
          background: "var(--color-rv-ink)",
          color: "var(--color-rv-paper)",
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <SidebarContent
          pathname={pathname}
          primaryItems={primaryItems}
          secondaryItems={secondaryItems}
          userEmail={session.data.user.email}
          userName={session.data.user.name}
          onNavigate={closeDrawer}
        />
      </aside>

      {/* Sidebar mobile (drawer) */}
      {mobileOpen && (
        <div
          onClick={closeDrawer}
          className="rv-sidebar-mobile-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,9,8,0.55)",
            zIndex: 60,
          }}
        />
      )}
      <aside
        className="rv-sidebar-mobile"
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        aria-hidden={!mobileOpen}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          width: 232,
          background: "var(--color-rv-ink)",
          color: "var(--color-rv-paper)",
          transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.2s ease",
          zIndex: 70,
          visibility: mobileOpen ? "visible" : "hidden",
        }}
      >
        <SidebarContent
          pathname={pathname}
          primaryItems={primaryItems}
          secondaryItems={secondaryItems}
          userEmail={session.data.user.email}
          userName={session.data.user.name}
          onNavigate={closeDrawer}
          showCloseButton
          onClose={closeDrawer}
        />
      </aside>

      {/* Conteúdo */}
      <main style={{ flex: 1, minWidth: 0 }}>
        {/* Header mobile com hamburger */}
        <header
          className="rv-app-mobile-header"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: "var(--color-rv-paper)",
            borderBottom: "1.5px solid var(--color-rv-ink)",
          }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={mobileOpen}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-rv-soft)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
            style={{
              border: "1.5px solid var(--color-rv-ink)",
              padding: 8,
              cursor: "pointer",
              background: "transparent",
              transition: "background 0.12s",
            }}
          >
            <Menu size={16} />
          </button>
          <div className="rv-eyebrow">
            <span className="rv-rec-dot" /> REELS VIRAL
          </div>
          <ThemeToggle />
        </header>

        <div>{children}</div>
      </main>

      <style jsx global>{`
        @media (max-width: 1023px) {
          .rv-sidebar-desktop {
            display: none !important;
          }
        }
        @media (min-width: 1024px) {
          .rv-sidebar-mobile,
          .rv-sidebar-mobile-backdrop,
          .rv-app-mobile-header {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

// ─── Sidebar content (desktop + drawer) ─────────────────────────────

function SidebarContent({
  pathname,
  primaryItems,
  secondaryItems,
  userEmail,
  userName,
  onNavigate,
  showCloseButton,
  onClose,
}: {
  pathname: string;
  primaryItems: NavItem[];
  secondaryItems: NavItem[];
  userEmail: string;
  userName: string | null | undefined;
  onNavigate: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}) {
  // Helper que renderiza um link de nav. Reusado pelo PRIMARY e pelo
  // SECONDARY pra manter consistência visual sem duplicar JSX.
  function renderNavLink({ href, label, icon: Icon, badge }: NavItem) {
    const active =
      href === "/app"
        ? pathname === "/app"
        : href === "/app/ajustes"
          ? pathname === "/app/ajustes"
          : pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        onMouseEnter={(e) => {
          if (active) return;
          e.currentTarget.style.background =
            "color-mix(in srgb, var(--color-rv-paper) 10%, transparent)";
          e.currentTarget.style.color = "var(--color-rv-paper)";
        }}
        onMouseLeave={(e) => {
          if (active) return;
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color =
            "color-mix(in srgb, var(--color-rv-paper) 78%, transparent)";
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 10px",
          background: active ? "var(--color-rv-rec)" : "transparent",
          color: active
            ? "var(--color-rv-cream)"
            : "color-mix(in srgb, var(--color-rv-paper) 78%, transparent)",
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 600,
          textDecoration: "none",
          boxShadow: active ? "2px 2px 0 0 rgba(0,0,0,0.3)" : "none",
          transition: "background 0.12s, color 0.12s",
        }}
      >
        <Icon size={15} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
        {badge && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 800,
              letterSpacing: "0.08em",
              padding: "1px 6px",
              background: active
                ? "rgba(0,0,0,0.18)"
                : "var(--color-rv-rec)",
              color: "var(--color-rv-cream)",
            }}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  }

  const handleSignOut = async () => {
    // signOutAndReset: aguarda /sign-out remoto, descarta cliente cacheado,
    // limpa localStorage (better-auth.*, rv:*, rv_*) e sessionStorage,
    // depois faz window.location.replace("/?signed_out=1"). A flag suprime
    // o auto-redirect da landing por ~5s, evitando que o user caia de
    // volta em /app caso o cookie cross-origin demore pra invalidar.
    await signOutAndReset();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "22px 18px 20px",
        overflowY: "auto",
      }}
    >
      {/* Brand + close (mobile) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 18,
          marginBottom: 14,
          borderBottom: "1px solid color-mix(in srgb, var(--color-rv-paper) 16%, transparent)",
        }}
      >
        <Link
          href="/app"
          onClick={onNavigate}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            color: "var(--color-rv-paper)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--color-rv-rec)",
              boxShadow: "0 0 8px var(--color-rv-rec)",
            }}
          />
          <span
            className="rv-display"
            style={{ fontSize: 22, lineHeight: 1, letterSpacing: "-0.02em" }}
          >
            Reels <em>Viral</em>
          </span>
        </Link>
        {!showCloseButton && <ThemeToggle />}
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "color-mix(in srgb, var(--color-rv-paper) 75%, transparent)",
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* CTA: Adaptar novo (mesma rota do início) */}
      <Link
        href="/app"
        onClick={onNavigate}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "11px 14px",
          marginBottom: 16,
          background: "var(--color-rv-rec)",
          color: "var(--color-rv-cream)",
          border: "1.5px solid var(--color-rv-paper)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          fontWeight: 800,
          textDecoration: "none",
          boxShadow: "3px 3px 0 0 rgba(255,255,255,0.18)",
        }}
      >
        <Sparkles size={13} /> Adaptar reel
      </Link>

      {/* Section label */}
      <div
        style={{
          padding: "8px 4px 6px",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "color-mix(in srgb, var(--color-rv-paper) 62%, transparent)",
          fontWeight: 700,
        }}
      >
        Workspace
      </div>

      {/* Primary nav (workspace) */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {primaryItems.map(renderNavLink)}
      </nav>

      {/* Spacer flexível empurra SECONDARY pra base */}
      <div style={{ flex: 1, minHeight: 24 }} />

      {/* Secondary nav (rodapé): Indique e ganhe, Ajustes, Planos. Visualmente
          separado do PRIMARY com section label e divider sutil. */}
      <div
        style={{
          padding: "8px 4px 6px",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "color-mix(in srgb, var(--color-rv-paper) 62%, transparent)",
          fontWeight: 700,
          borderTop: "1px solid color-mix(in srgb, var(--color-rv-paper) 16%, transparent)",
          marginTop: 12,
          paddingTop: 14,
        }}
      >
        Conta
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
        {secondaryItems.map(renderNavLink)}
      </nav>

      {/* User card + sign out */}
      <div
        style={{
          padding: "12px 12px",
          border: "1px solid color-mix(in srgb, var(--color-rv-paper) 22%, transparent)",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "color-mix(in srgb, var(--color-rv-paper) 62%, transparent)",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          Logado
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-rv-paper)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={userEmail}
        >
          {userName ?? userEmail.split("@")[0]}
        </div>
        <div
          style={{
            fontSize: 10,
            color: "color-mix(in srgb, var(--color-rv-paper) 68%, transparent)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {userEmail}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleSignOut()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "9px 12px",
          background: "transparent",
          color: "color-mix(in srgb, var(--color-rv-paper) 70%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-rv-paper) 18%, transparent)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          fontWeight: 700,
          cursor: "pointer",
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--color-rv-paper)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "color-mix(in srgb, var(--color-rv-paper) 70%, transparent)";
        }}
      >
        <LogOut size={11} /> Sair
      </button>
    </div>
  );
}
