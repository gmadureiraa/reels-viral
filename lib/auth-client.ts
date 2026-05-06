/**
 * Neon Auth client — lazy load.
 *
 * O pacote `@neondatabase/auth` pesa ~85KB gzip. Carregamos via dynamic
 * import só quando o user clica login/signup ou abre `/meus-roteiros`.
 * Visitantes da landing nunca pagam esse overhead.
 *
 * Pattern espelha viral-hunter/src/lib/auth-client.ts.
 *
 * 2026-05-01 — bump pra 0.3.0-beta + getJwtToken via getSession() (o
 * proxy do Better Auth converte client.getJWTToken() em POST /get-j-w-t-token
 * 404). Ver memo radar P0 hotfix 30/04.
 */

"use client";

import { useEffect, useState } from "react";

const NEON_AUTH_URL = process.env.NEXT_PUBLIC_NEON_AUTH_URL ?? "";

export function isAuthConfigured(): boolean {
  return Boolean(NEON_AUTH_URL && NEON_AUTH_URL.startsWith("http"));
}

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface SessionState {
  data: { user: SessionUser } | null;
  isPending: boolean;
}

interface SignInResult {
  error?: { message?: string } | null;
}

interface SocialSignInArgs {
  provider: "google";
  callbackURL?: string;
}

export interface NeonAuthClient {
  signIn: {
    email: (args: {
      email: string;
      password: string;
    }) => Promise<SignInResult>;
    social: (args: SocialSignInArgs) => Promise<SignInResult>;
  };
  signUp: {
    email: (args: {
      email: string;
      password: string;
      name?: string;
    }) => Promise<SignInResult>;
  };
  signOut: () => Promise<unknown>;
  // Better Auth: getSession devolve user + session.token no mesmo payload.
  getSession: () => Promise<{
    data?: {
      user?: { id: string; email?: string; name?: string | null };
      session?: { token?: string };
    };
  } | null>;
}

let cachedClient: NeonAuthClient | null = null;
let pendingPromise: Promise<NeonAuthClient> | null = null;

export async function getAuthClient(): Promise<NeonAuthClient> {
  if (cachedClient) return cachedClient;
  if (pendingPromise) return pendingPromise;
  pendingPromise = (async () => {
    const [{ createAuthClient }, { BetterAuthReactAdapter }] =
      await Promise.all([
        import("@neondatabase/auth"),
        import("@neondatabase/auth/react/adapters"),
      ]);
    const client = createAuthClient(NEON_AUTH_URL, {
      adapter: BetterAuthReactAdapter(),
    }) as unknown as NeonAuthClient;
    cachedClient = client;
    return client;
  })();
  try {
    return await pendingPromise;
  } finally {
    pendingPromise = null;
  }
}

/**
 * Pega o JWT atual do user logado pra mandar como `Authorization: Bearer`
 * em chamadas /api. Retorna null se não logado.
 *
 * IMPORTANTE: NÃO chamar `client.getJWTToken()` direto. O Better Auth
 * client é um Proxy e converte qualquer método inexistente em request
 * HTTP kebab-case (`getJWTToken` → POST `/get-j-w-t-token` que 404).
 * O endpoint correto é `/get-session` que devolve token dentro do
 * payload da session.
 */
export async function getJwtToken(): Promise<string | null> {
  if (!isAuthConfigured()) return null;
  try {
    const client = await getAuthClient();
    const session = await client.getSession();
    return session?.data?.session?.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Sign-out completo e idempotente.
 *
 * Histórico do bug (mesmo do Radar Viral): `client.signOut()` sozinho deixa
 * resíduos:
 *  - cache em memória do Better Auth (BETTER_AUTH_METHODS_CACHE) sobrevive
 *    entre rotas SPA porque é singleton de módulo
 *  - localStorage `better-auth.message` (broadcast channel) fica com
 *    SIGN_IN antigo, fazendo outras tabs reaproveitarem sessão
 *  - flags `rv:scripts:v1`, `rv_ref_code`, etc. continuam, dando impressão
 *    de "logado" no próximo signin
 *  - cookie cross-origin pode demorar pra invalidar — landing redirecionava
 *    pra /app antes do `getSession()` retornar null
 *
 * Fix: aguarda signOut, força clear de TUDO local, descarta o cliente
 * cacheado e faz hard navigation com flag `?signed_out=1` que a landing
 * usa pra suprimir auto-redirect por alguns segundos.
 */
export async function signOutAndReset(): Promise<void> {
  // 1. Tenta sign-out remoto (deleta cookie + sessão no DB)
  if (isAuthConfigured()) {
    try {
      const client = await getAuthClient();
      await client.signOut();
    } catch {
      // Se falhar (network, etc.), seguimos com clear local — melhor
      // sair localmente do que deixar o user preso.
    }
  }

  // 2. Descarta cliente cacheado pra forçar nova instância
  cachedClient = null;
  pendingPromise = null;

  if (typeof window !== "undefined") {
    // 3. Limpa qualquer chave de auth/Better-Auth/Reels Viral do
    //    localStorage. Better Auth usa `better-auth.message` pro broadcast
    //    channel — limpar evita que eventos antigos tipo SIGN_IN sejam
    //    replayed pra outras tabs após o reload.
    //    Reels Viral usa prefixes `rv:` (scripts/migration) e `rv_` (ref
    //    code, device id, pending brief, first reel flag).
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (
          key.startsWith("better-auth") ||
          key.startsWith("rv_") ||
          key.startsWith("rv:") ||
          key.startsWith("reels-") ||
          key === "neon-auth-session" ||
          key === "ba-session"
        ) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) window.localStorage.removeItem(key);
    } catch {
      /* localStorage bloqueado, segue */
    }

    // 4. Limpa sessionStorage também (oauth verifier, pending flags,
    //    migration flag)
    try {
      window.sessionStorage.clear();
    } catch {
      /* ignore */
    }

    // 5. Hard navigation com flag pra landing suprimir auto-redirect.
    //    `replace` (não `assign`) pra que o back-button não volte pra /app.
    window.location.replace("/?signed_out=1");
  }
}

/**
 * Hook simples baseado em getSession() — load 1x ao montar.
 * Refresh manual via `refresh()` depois de sign-in/sign-out.
 */
export function useNeonSession(): SessionState & { refresh: () => void } {
  // Audit fix react-hooks/set-state-in-effect: estado inicial respeita
  // se auth está configurado. Se não estiver, isPending arranca em
  // false direto — evita setState dentro do useEffect.
  const initialPending = isAuthConfigured();
  const [state, setState] = useState<SessionState>({
    data: null,
    isPending: initialPending,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!isAuthConfigured()) return;
    let cancel = false;
    void (async () => {
      try {
        const client = await getAuthClient();
        const sess = await client.getSession();
        if (cancel) return;
        const user = sess?.data?.user;
        if (user) {
          setState({
            data: {
              user: {
                id: user.id,
                email: user.email ?? "",
                name: user.name ?? null,
              },
            },
            isPending: false,
          });
        } else {
          setState({ data: null, isPending: false });
        }
      } catch {
        if (!cancel) setState({ data: null, isPending: false });
      }
    })();
    return () => {
      cancel = true;
    };
  }, [version]);

  return { ...state, refresh: () => setVersion((v) => v + 1) };
}
