/**
 * Admin guard helpers — server-side only.
 *
 * Pattern: ADMIN_EMAILS (comma-separated env var) lista emails com acesso.
 * Validação acontece no server, sempre via JWT. Client-side checks são só
 * pra UX (hide/show menu) — não são source of truth.
 */

import { getOptionalUserId } from "./server-auth";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Default — Gabriel sempre admin mesmo sem env var. Failsafe.
const DEFAULT_ADMINS = [
  "gf.madureira@hotmail.com",
  "gf.madureiraa@gmail.com",
];

const ALL_ADMINS = new Set([...ADMIN_EMAILS, ...DEFAULT_ADMINS]);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALL_ADMINS.has(email.toLowerCase().trim());
}

export interface AdminContext {
  userId: string;
  email: string;
}

/**
 * Valida que o request veio de um admin. Retorna `{ admin }` ou `{ response }`
 * (401/403). Usar em endpoints `/api/admin/*`.
 */
export async function requireAdmin(
  req: Request,
): Promise<{ admin: AdminContext } | { response: Response }> {
  const user = await getOptionalUserId(req);
  if (!user) {
    return {
      response: Response.json(
        { error: "Login necessário" },
        { status: 401 },
      ),
    };
  }
  if (!isAdminEmail(user.email)) {
    return {
      response: Response.json(
        { error: "Acesso restrito — admin apenas" },
        { status: 403 },
      ),
    };
  }
  return { admin: { userId: user.id, email: user.email ?? "" } };
}
