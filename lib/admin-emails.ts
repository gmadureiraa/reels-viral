/**
 * Lista de admin emails — duplicada com lib/admin.ts (server) pra permitir
 * client-side check de UX (esconder menu admin pra non-admin).
 *
 * IMPORTANTE: este check NÃO é source of truth. O server (`requireAdmin`
 * em lib/admin.ts) é quem realmente bloqueia. Aqui é só pra evitar
 * mostrar UI inalcançável.
 */

const DEFAULT_ADMINS = new Set([
  "gf.madureira@hotmail.com",
  "gf.madureiraa@gmail.com",
]);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return DEFAULT_ADMINS.has(email.toLowerCase().trim());
}
