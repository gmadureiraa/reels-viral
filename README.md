# Reels Viral

> Engenharia reversa de Reels virais com IA. Cole o link, descubra a estrutura, refilme o seu — em 30 segundos.

Terceiro app do **combo viral Kaleidos**:

| App | URL | Foco |
|-----|-----|------|
| **Sequência Viral** | viral.kaleidos.com.br | Carrosseis virais Instagram |
| **Radar Viral** | radar.kaleidos.com.br | Descoberta de tendências (IG + YouTube + TikTok + Threads + RSS + newsletter) |
| **Reels Viral** | reels-viral.vercel.app | Roteiros de Reels/TikTok cena por cena |

---

## Como funciona

```
Reel viral (link IG)
   │
   ▼   POST /api/adapt-reel
   │
   ├─ Apify scrape       → metadata + videoUrl
   ├─ Download MP4       → CDN do IG (~10MB)
   ├─ Gemini File API    → upload + ACTIVE state
   └─ Gemini 2.5 Flash   → JSON estruturado:
                           - analysis (estrutura, por que viralizou)
                           - script (titulo, hook, scenes[], caption, notas)
```

**Latência:** 25–45s end-to-end. `thinkingBudget: 0` no Gemini pra velocidade.

---

## Stack

- **Next.js 16** + **React 19** + **TypeScript strict**
- **Tailwind CSS 4** (zero JS config, `@theme` em CSS puro)
- **Bun** como runtime + package manager
- **Apify** `apify~instagram-scraper` pra scrape (compartilha key com SV)
- **Gemini 2.5 Flash** com `responseMimeType: "application/json"` + schema forçado
- **Framer Motion** + **Sonner** + **Lucide** pra UX

---

## Setup

```bash
cp .env.example .env.local
# preenche todas as keys (Apify, Gemini, Neon DB + Auth)

bun install
bun scripts/migrate.ts   # cria tabelas no Neon (idempotente)
bun dev
```

Abre `http://localhost:3000`.

### Env vars

A lista completa e comentada vive em [`.env.example`](./.env.example) — é a
fonte da verdade. Resumo dos grupos:

| Grupo | Vars | Obrigatório |
|-------|------|-------------|
| Pipeline | `APIFY_API_KEY`, `GEMINI_API_KEY` | sim |
| Neon Postgres | `DATABASE_URL` | sim (logado) |
| Neon Auth | `NEXT_PUBLIC_NEON_AUTH_URL`, `NEON_AUTH_JWKS_URL`, `NEON_AUTH_ISSUER`*, `NEON_AUTH_AUDIENCE`* | sim (login/paywall) |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET_RV`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_RV_BASIC_MONTH`, `STRIPE_PRICE_RV_MAX_MONTH` | billing |
| Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | recomendado em prod (rate-limit distribuído; sem isso cai pra Map in-memory) |
| Resend | `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` | emails/leads/automações |
| Crons | `CRON_SECRET` | autentica os 3 crons do `vercel.json` |
| Admin | `ADMIN_EMAILS` (CSV) | opcional |
| Kill switches | `RV_PIPELINE_DISABLED`, `SOFT_DAILY_CAP_USD` | opcional |
| Analytics | `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_GA_ID` | opcional |
| Site | `NEXT_PUBLIC_SITE_URL` | links de email/OG/redirect Stripe |

\* `NEON_AUTH_ISSUER` / `NEON_AUTH_AUDIENCE`: quando setados, o `jwtVerify`
fica strict (valida issuer/audience).

### Migration

```bash
DATABASE_URL=<prod> bun scripts/migrate.ts
# Cria tabelas: scripts, scrape_cache, leads, user_subscriptions,
# user_profiles, user_referrals, library_reels, library_ideas, ai_usage,
# stripe_webhook_events. Idempotente.
```

> **⚠️ ai_usage em prod (audit 2026-05-02):** se `ai_usage` não existir
> no Neon prod, `countReelsThisMonth()` em `lib/subscriptions.ts` cai
> pro fallback `scripts` — que é incrementado client-side e pode ser
> furado fechando a aba antes do save. **Resultado: paywall vazado.**
>
> Verificar prod (one-shot):
>
> ```bash
> # Pega DATABASE_URL de prod do Vercel
> vercel env pull .env.production --environment=production
>
> # Confirma que ai_usage existe + tem indexes
> bun --env-file=.env.production scripts/migrate.ts
> ```
>
> Output esperado: `[migrate] ✓ ai_usage` + `[migrate] ✓ ai_usage indexes`.
> Se aparecer `tabelas no schema public` listando `ai_usage`, está OK.
> Se der erro de permissão, rodar SQL direto no Neon SQL editor copiando
> o bloco `CREATE TABLE IF NOT EXISTS ai_usage (...)` de `scripts/migrate.ts`.

### Stripe webhook

URL: `https://<domínio>/api/stripe/webhook`
Eventos: `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`. Copiar Signing Secret pra
`STRIPE_WEBHOOK_SECRET_RV`.

### Deploy Vercel

As funções com `maxDuration: 60` (ex: `api/adapt-reel`) precisam de plano
com limite ≥ 60s — `vercel.json` já declara os limites por rota. Configurar
as env vars de `.env.example` em **Production** scope (pelo menos as
obrigatórias da tabela acima) antes do primeiro deploy:

```bash
# Production env vars (adicionar pelo dashboard ou via CLI)
vercel env add APIFY_API_KEY production
vercel env add GEMINI_API_KEY production
vercel env add DATABASE_URL production
vercel env add NEXT_PUBLIC_NEON_AUTH_URL production
vercel env add NEON_AUTH_JWKS_URL production
# ... + Stripe, Upstash, Resend, CRON_SECRET (ver .env.example)

# Migration roda só uma vez (depois que DATABASE_URL tá no .env.local)
bun scripts/migrate.ts

# Deploy
vercel --prod
```

**Crons (`vercel.json`):** `lead-automation` (13h UTC), `idle-5d` (13h UTC),
`power-user` (14h UTC). Todos validam o header `Authorization` contra
`CRON_SECRET`.

---

## Estrutura

Atualmente: **12 páginas** + **29 API routes**.

```
app/
  page.tsx                          # / — landing pública (hero + input + Gerar)
  privacy/page.tsx                  # /privacy
  terms/page.tsx                    # /terms
  layout.tsx                        # root: fonts + metadata + Toaster + Footer
  globals.css                       # design system @theme

  app/                              # /app — app interno autenticado
    layout.tsx                      # sidebar fixed (cream+REC+ink) + auth gate
    page.tsx                        # /app — form completo + result inline
    biblioteca/page.tsx             # /app/biblioteca — galeria com paywall blur
    meus-roteiros/page.tsx          # /app/meus-roteiros — histórico
    meus-roteiros/[id]/page.tsx     # /app/meus-roteiros/[id] — detalhe roteiro
    precos/page.tsx                 # /app/precos — 3 planos + Stripe checkout
    ajustes/page.tsx                # /app/ajustes — conta/assinatura
    ajustes/indicacoes/page.tsx     # /app/ajustes/indicacoes — Indique-e-Ganhe
    admin/page.tsx                  # /app/admin — KPIs + custos (admin only)
    admin/users/[id]/page.tsx       # /app/admin/users/[id] — detalhe de usuário

  api/                              # 29 route handlers
    adapt-reel/route.ts             # core: Apify + Gemini Flash (síncrono)
    hook-variations/route.ts        # variações de hook a partir de um roteiro
    quota/route.ts                  # GET quota status pro client
    img/route.ts                    # proxy de imagem (CDN IG sem CORS)
    scripts/route.ts, scripts/[id]  # CRUD de roteiros do usuário
    me/profile, me/subscription     # dados do usuário logado
    library/route.ts + [id] + frames + ideas + admin/*   # biblioteca pública/admin
    referrals/me + list + track     # programa Indique-e-Ganhe
    lead/route.ts + lead/feedback   # captura + feedback de leads
    unsubscribe/route.ts            # opt-out de emails
    auth/post-signup/route.ts       # hook pós-cadastro
    stripe/checkout + portal + webhook   # billing (webhook filtra metadata.app=rv)
    admin/stats + admin/users/[id]  # payloads do dashboard admin
    cron/lead-automation + idle-5d + power-user   # crons (Authorization: CRON_SECRET)

components/
  auth-dialog.tsx                   # Login/Signup + Google OAuth
  quota-blocked-modal.tsx           # paywall ao bater limite mensal
  loading-pipeline.tsx              # progress animado durante pipeline
  result-view.tsx                   # roteiro + storyboard cena-por-cena

lib/
  auth-client.ts                    # Neon Auth (Better Auth) lazy client
  server-auth.ts                    # JWT validation server-side
  admin.ts + admin-emails.ts        # ADMIN_EMAILS guard
  pricing.ts                        # PLANS_RV (free/basic/max) + helpers
  subscriptions.ts                  # getUserSubscription + getQuotaStatus
  rate-limit.ts                     # Upstash Ratelimit + fallback in-memory
  stripe.ts                         # SDK lazy (proxy)
  cost-tracking.ts                  # logUsage + estimateGeminiCost
  cost-guard.ts                     # kill switch global (SOFT_DAILY_CAP_USD)
  apify.ts + gemini.ts              # provedores
  types.ts + utils.ts               # shared
```

### Fluxo end-to-end

```
[/] landing
  └─ user cola URL + click "Gerar"
     ├─ sessionStorage["rv_pending_brief"] = { sourceUrl }
     ├─ se anônimo: AuthDialog (Email / Google)
     │              └─ pós-login: useEffect detecta → router.push("/app")
     └─ se logado: router.push("/app") direto

[/app] app interno
  └─ useEffect detecta pendingBrief no sessionStorage
     └─ pré-preenche form, user completa tema/CTA, click "Adaptar"
        ├─ getJwtToken → Authorization: Bearer
        ├─ POST /api/adapt-reel
        │   ├─ rate limit (anon 2/h, user 10/h)
        │   ├─ quota guard (free: 3/mês, basic: 30, max: 100) → 402
        │   ├─ cost guard global (SOFT_DAILY_CAP_USD) → 503
        │   ├─ Apify scrape (cache 24h por shortCode)
        │   ├─ Gemini 2.5 Flash analyze + script
        │   └─ logUsage (Apify + Gemini cost em ai_usage)
        └─ ResultView inline + saveScript no DB
```

---

## Design System

Coerência com combo viral mas com identidade própria:

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-rv-paper` | `#F5F1E8` | bg principal (cream celuloide) |
| `--color-rv-cream` | `#FBF7EE` | bg de cards |
| `--color-rv-ink` | `#0A0908` | texto + bordas brutalistas |
| `--color-rv-rec` | `#FF3D2E` | **acento principal** — coral REC |
| `--color-rv-rec-hot` | `#FF5947` | hover |
| `--color-rv-amber` | `#F0B33C` | secundário (promessa) |

- **Sans:** Plus Jakarta Sans (corpo)
- **Display:** Instrument Serif italic (headings dramáticos)
- **Mono:** Geist Mono (timestamps, kickers)

Brutalist shadow `4px 4px 0 0 ink` em buttons + cards.
Pulsing REC dot em todas as eyebrows e header.

---

## Roadmap

### Entregue
- [x] Adapt Reel (link → roteiro completo)
- [x] Análise estrutural + storyboard cena por cena (tempo, papel, visual, copy, B-roll)
- [x] Caption sugerida + notas de produção + copy-to-clipboard
- [x] Variações de hook (`/api/hook-variations`)
- [x] Auth (Neon Auth) + persistência (Neon Postgres)
- [x] Quota/paywall por plano (free 3 / basic 30 / max 100 reels/mês)
- [x] Stripe billing — checkout + customer portal + webhook
- [x] Biblioteca de reels (galeria pública + admin)
- [x] Programa Indique-e-Ganhe (referrals)
- [x] Dashboard admin (KPIs, custos, usuários)
- [x] Rate-limit distribuído (Upstash) + cost guard global
- [x] Automações de email por cron (lead-automation, idle-5d, power-user)
- [x] Bridge ← Radar Viral (landing aceita `?url=`/`?reel=`/`?topic=`)

### Próximo
- [ ] "Adaptar Criador" — input perfil IG, retorna padrões do criador
- [ ] Bridge → Sequência Viral (botão "transformar em carrossel")
- [ ] Voice clone usando `voice_samples` do SV
- [ ] Formatos do zero (Análise de Perfil, Tela Dividida, Tweet/Texto, Storytelling)
- [ ] Mobile-first storyboard (vertical scroll-snap 9:16)

---

## Briefing original

Documentação completa em `vault/02 - PROJETOS PESSOAIS/050 - REELS-VIRAL/`.

Inspiração: Reel @eduardomulkson `DXhfu8PkVVJ` (analisado em `/01 - REEL-FULMIO-ANALISE.md`).
