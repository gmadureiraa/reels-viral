/**
 * Persistência híbrida de roteiros gerados.
 *
 * - **Logado** (Neon Auth ativo + JWT): persiste em Neon Postgres via
 *   `/api/scripts`. Sincroniza entre devices.
 * - **Anônimo** (sem auth): cai pra localStorage do browser. Limit 50.
 *
 * Quando o user faz login, os roteiros locais são migrados pro DB
 * automaticamente (`migrateLocalToDb` chamado depois do login bem-sucedido).
 */

import { getJwtToken, isAuthConfigured } from "./auth-client";
import type { AdaptResponse } from "./types";

const STORAGE_KEY = "rv:scripts:v1";
const MAX_ENTRIES = 50;

export interface SavedScript {
  id: string;
  savedAt: string;
  /** Tema digitado pelo user (pra mostrar no histórico). */
  tema: string;
  data: AdaptResponse;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

// ── Camada local (localStorage) ──────────────────────────────────────────────

function localList(): SavedScript[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedScript[];
  } catch {
    return [];
  }
}

function localSet(list: SavedScript[]): void {
  if (!isClient()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ── API pública (híbrida DB + localStorage) ──────────────────────────────────

/**
 * Salva um roteiro. Se user tá logado e DB tá disponível, vai pro Neon.
 * Caso contrário, cai pro localStorage. Retorna entry com id real (DB)
 * ou local-uuid.
 */
export async function saveScript(
  data: AdaptResponse,
  tema: string
): Promise<SavedScript | null> {
  if (!isClient()) return null;

  // Tenta DB se logado
  if (isAuthConfigured()) {
    const token = await getJwtToken();
    if (token) {
      try {
        const res = await fetch("/api/scripts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ tema, data }),
        });
        if (res.ok) {
          const body = (await res.json()) as { script: { id: string; createdAt: string } };
          return {
            id: body.script.id,
            savedAt: body.script.createdAt,
            tema,
            data,
          };
        }
      } catch (err) {
        console.warn("[rv:storage] DB save failed, falling back local:", err);
      }
    }
  }

  // Fallback local
  try {
    const list = localList();
    const entry: SavedScript = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      tema,
      data,
    };
    const next = [entry, ...list].slice(0, MAX_ENTRIES);
    localSet(next);
    return entry;
  } catch (err) {
    console.warn("[rv:storage] local save failed", err);
    return null;
  }
}

/**
 * Lista os roteiros do user. Logado → Neon. Anônimo → localStorage.
 */
export async function listScripts(): Promise<SavedScript[]> {
  if (!isClient()) return [];

  if (isAuthConfigured()) {
    const token = await getJwtToken();
    if (token) {
      try {
        const res = await fetch("/api/scripts", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const body = (await res.json()) as {
            scripts: Array<{
              id: string;
              tema: string;
              data: AdaptResponse;
              createdAt: string;
            }>;
          };
          return body.scripts.map((s) => ({
            id: s.id,
            savedAt: s.createdAt,
            tema: s.tema,
            data: s.data,
          }));
        }
      } catch (err) {
        console.warn("[rv:storage] DB list failed:", err);
      }
    }
  }

  return localList();
}

export async function getScript(id: string): Promise<SavedScript | null> {
  if (!isClient()) return null;

  if (isAuthConfigured()) {
    const token = await getJwtToken();
    if (token) {
      try {
        const res = await fetch(`/api/scripts/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const body = (await res.json()) as {
            script: {
              id: string;
              tema: string;
              data: AdaptResponse;
              createdAt: string;
            };
          };
          return {
            id: body.script.id,
            savedAt: body.script.createdAt,
            tema: body.script.tema,
            data: body.script.data,
          };
        }
      } catch (err) {
        console.warn("[rv:storage] DB get failed:", err);
      }
    }
  }

  return localList().find((s) => s.id === id) ?? null;
}

export async function deleteScript(id: string): Promise<void> {
  if (!isClient()) return;

  if (isAuthConfigured()) {
    const token = await getJwtToken();
    if (token) {
      try {
        await fetch(`/api/scripts/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        return;
      } catch (err) {
        console.warn("[rv:storage] DB delete failed:", err);
      }
    }
  }

  const next = localList().filter((s) => s.id !== id);
  localSet(next);
}

export function clearAllScripts(): void {
  if (!isClient()) return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Migra entries do localStorage pro DB. Chamar depois de login bem-sucedido.
 * Best-effort: se falhar, mantém local intacto.
 */
export async function migrateLocalToDb(): Promise<{ migrated: number; failed: number }> {
  if (!isClient() || !isAuthConfigured()) return { migrated: 0, failed: 0 };
  const token = await getJwtToken();
  if (!token) return { migrated: 0, failed: 0 };

  const local = localList();
  if (local.length === 0) return { migrated: 0, failed: 0 };

  let migrated = 0;
  let failed = 0;
  for (const entry of local) {
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tema: entry.tema, data: entry.data }),
      });
      if (res.ok) migrated++;
      else failed++;
    } catch {
      failed++;
    }
  }
  // Se migrou tudo, limpa local pra evitar duplicação na próxima session.
  if (failed === 0) clearAllScripts();
  return { migrated, failed };
}
