"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "rv-theme";

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

function applyTheme(next: Theme) {
  if (next === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // localStorage indisponível — segue em memória pela sessão.
  }
}

/**
 * Toggle de tema (light/dark).
 *
 * - Lê o tema atual via `document.documentElement.getAttribute('data-theme')`
 *   (setado pelo ThemeScript inline antes do paint, evita FOUC).
 * - Click alterna entre light e dark, salva em localStorage e atualiza o
 *   atributo no <html>.
 * - Antes da montagem renderiza um placeholder invisível com as mesmas
 *   dimensões pra não causar layout shift (e pra evitar SSR mismatch já que
 *   o tema só pode ser conhecido no client).
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Sincroniza com o atributo já setado pelo ThemeScript inline.
  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-theme") as Theme | null) ??
      "light";
    setTheme(current);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const btn = buttonRef.current;
    const doc = document as ViewTransitionDoc;

    // Sem View Transitions API (ou sem ref): troca direta.
    if (!btn || typeof doc.startViewTransition !== "function") {
      setTheme(next);
      applyTheme(next);
      return;
    }

    // Revelação circular a partir do centro do botão.
    const rect = btn.getBoundingClientRect();
    const root = document.documentElement;
    root.style.setProperty("--vt-x", `${((rect.left + rect.width / 2) / window.innerWidth) * 100}%`);
    root.style.setProperty("--vt-y", `${((rect.top + rect.height / 2) / window.innerHeight) * 100}%`);
    root.classList.add("vt-theme-toggling");

    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        setTheme(next);
        applyTheme(next);
      });
    });
    transition.finished.finally(() => root.classList.remove("vt-theme-toggling"));
  }

  // Placeholder pra evitar layout shift / mismatch (mesmas dimensões h-9 w-9).
  if (!mounted) {
    return <div aria-hidden="true" className="h-9 w-9 shrink-0" />;
  }

  const isDark = theme === "dark";

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggle}
      aria-label="Alternar tema"
      aria-pressed={isDark}
      title={isDark ? "Modo claro" : "Modo escuro"}
      className="h-9 w-9 shrink-0 inline-flex items-center justify-center border-[1.5px] border-[var(--color-rv-ink)] bg-[var(--color-rv-cream)] hover:bg-[var(--color-rv-soft)] transition-colors text-[var(--color-rv-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rv-rec)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-rv-paper)]"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
