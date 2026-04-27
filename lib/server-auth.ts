/**
 * Validação server-side do JWT do Neon Auth via JWKS.
 *
 * Usado nas rotas /api/* pra extrair `userId` confiável quando o request
 * vem com `Authorization: Bearer <jwt>`. Em rotas que aceitam guests,
 * `getOptionalUserId` retorna null silenciosamente.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const JWKS_URL = process.env.NEON_AUTH_JWKS_URL;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!JWKS_URL) return null;
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(JWKS_URL));
  }
  return jwks;
}

export interface AuthedUser {
  id: string;
  email?: string;
  name?: string;
}

/**
 * Extrai e valida o JWT do header Authorization. Retorna null se ausente,
 * inválido ou JWKS não configurado.
 */
export async function getOptionalUserId(
  req: Request
): Promise<AuthedUser | null> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  if (!token) return null;

  const jwksClient = getJwks();
  if (!jwksClient) return null;

  try {
    const { payload } = await jwtVerify(token, jwksClient);
    return parsePayload(payload);
  } catch {
    return null;
  }
}

/**
 * Variante que retorna 401 Response se não autenticado. Use em endpoints
 * que requerem login obrigatório.
 */
export async function requireUserId(
  req: Request
): Promise<{ user: AuthedUser } | { response: Response }> {
  const user = await getOptionalUserId(req);
  if (!user) {
    return {
      response: Response.json(
        { error: "Login necessário pra essa ação." },
        { status: 401 }
      ),
    };
  }
  return { user };
}

function parsePayload(payload: JWTPayload): AuthedUser | null {
  const sub = payload.sub;
  if (!sub) return null;
  return {
    id: sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
  };
}
