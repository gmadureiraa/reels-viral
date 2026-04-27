/**
 * Persistência local de roteiros gerados — sem backend, só localStorage.
 *
 * MVP intencionalmente simples: só guarda o histórico no browser do user.
 * Quando ligarmos auth + Neon (P1), migramos pra DB persistido. Por
 * enquanto chega pra "deixei aberto, fechei sem querer, quero voltar".
 *
 * Schema versionado pra permitir migração depois.
 */

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

export function saveScript(
  data: AdaptResponse,
  tema: string
): SavedScript | null {
  if (!isClient()) return null;
  try {
    const list = listScripts();
    const entry: SavedScript = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      tema,
      data,
    };
    const next = [entry, ...list].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return entry;
  } catch (err) {
    console.warn("[rv:storage] save failed", err);
    return null;
  }
}

export function listScripts(): SavedScript[] {
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

export function getScript(id: string): SavedScript | null {
  return listScripts().find((s) => s.id === id) ?? null;
}

export function deleteScript(id: string): void {
  if (!isClient()) return;
  const next = listScripts().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearAllScripts(): void {
  if (!isClient()) return;
  localStorage.removeItem(STORAGE_KEY);
}
