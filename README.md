# Reels Viral

> Engenharia reversa de Reels virais com IA. Cole o link, descubra a estrutura, refilme o seu — em 30 segundos.

Terceiro app do **combo viral Kaleidos**:

| App | URL | Foco |
|-----|-----|------|
| **Sequência Viral** | viral.kaleidos.com.br | Carrosseis virais Instagram |
| **Viral Hunter** | viral-hunter-phi.vercel.app | Descoberta de tendências (news + IG + HN + Reddit) |
| **Reels Viral** | (a deployar) | Roteiros de Reels/TikTok cena por cena |

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

```bash
# ── Pipeline ────────────────────────────────────────────────────────
APIFY_API_KEY=...                    # apify.com → Settings → API tokens
GEMINI_API_KEY=...                   # ai.google.dev → Get API key

# ── Neon Postgres ───────────────────────────────────────────────────
DATABASE_URL=...                     # connection string com pooler

# ── Neon Auth (Better Auth) ─────────────────────────────────────────
NEXT_PUBLIC_NEON_AUTH_URL=...        # endpoint pra signin/signup
NEON_AUTH_JWKS_URL=...               # JWKS pra validar JWT no server

# ── Stripe (paywall + subscriptions) ────────────────────────────────
STRIPE_SECRET_KEY=...                # mesma conta Stripe do SV
STRIPE_WEBHOOK_SECRET_RV=...         # gerado ao criar webhook endpoint

# ── Admin guard ─────────────────────────────────────────────────────
ADMIN_EMAILS=email1@x.com,email2@y.com  # comma-sep, opcional
                                     # default: gf.madureira@hotmail.com,
                                     # gf.madureiraa@gmail.com

# ── Cost guard global (kill switch — opcional) ──────────────────────
SOFT_DAILY_CAP_USD=20                # ex: $20/dia. Free + anon bloqueados
                                     # quando ai_usage do dia ≥ cap.
                                     # Pagantes seguem normal.

# ── LinkedIn scrape (DESATIVADO no Radar) ───────────────────────────
# ENABLE_LINKEDIN_SCRAPE=true        # só RV não usa, ignorar.
```

### Migration

```bash
DATABASE_URL=<prod> bun scripts/migrate.ts
# Cria tabelas: scripts, scrape_cache, leads, user_subscriptions,
# library_reels, ai_usage. Idempotente.
```

### Stripe webhook

URL: `https://<domínio>/api/stripe/webhook`
Eventos: `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`. Copiar Signing Secret pra
`STRIPE_WEBHOOK_SECRET_RV`.

### Deploy Vercel

Vercel Hobby tem limite de 60s no Node runtime. As 4 env vars acima
precisam estar configuradas em **Production** scope:

```bash
# Production env vars (adicionar pelo dashboard ou CLI)
vercel env add APIFY_API_KEY production
vercel env add GEMINI_API_KEY production
vercel env add DATABASE_URL production
vercel env add NEXT_PUBLIC_NEON_AUTH_URL production
vercel env add NEON_AUTH_JWKS_URL production
vercel env add NEXT_PUBLIC_NEON_DATA_API production

# Migration roda só uma vez (depois que DATABASE_URL tá no .env.local)
bun scripts/migrate.ts

# Deploy
vercel --prod
```

---

## Estrutura

```
app/
  page.tsx                       # / — landing pública (hero + input + Gerar)
  layout.tsx                     # root: fonts + metadata + Toaster + Footer
  globals.css                    # design system @theme

  app/                           # /app — app interno autenticado
    layout.tsx                   # sidebar fixed (cream+REC+ink) + auth gate
    page.tsx                     # /app — form completo + result inline
    biblioteca/page.tsx          # /app/biblioteca — galeria com paywall blur
    meus-roteiros/page.tsx       # /app/meus-roteiros — histórico
    meus-roteiros/[id]/page.tsx  # detalhe roteiro
    precos/page.tsx              # /app/precos — 3 planos + Stripe checkout
    admin/page.tsx               # /admin — KPIs + users + custos (admin only)

  api/
    adapt-reel/route.ts          # core: Apify + Gemini Flash (síncrono)
    quota/route.ts               # GET quota status pro client
    library/route.ts             # GET reels biblioteca (paywall server-side)
    admin/stats/route.ts         # GET payload completo do dashboard admin
    stripe/checkout/route.ts     # POST cria Stripe session
    stripe/webhook/route.ts      # eventos sub.* (filtra metadata.app=rv)

components/
  auth-dialog.tsx                # Login/Signup + Google OAuth
  quota-blocked-modal.tsx        # paywall ao bater limite mensal
  loading-pipeline.tsx           # progress animado durante pipeline
  result-view.tsx                # roteiro + storyboard cena-por-cena

lib/
  auth-client.ts                 # Neon Auth (Better Auth) lazy client
  server-auth.ts                 # JWT validation server-side
  admin.ts + admin-emails.ts     # ADMIN_EMAILS guard
  pricing.ts                     # PLANS_RV (free/basic/max) + helpers
  subscriptions.ts               # getUserSubscription + getQuotaStatus
  stripe.ts                      # SDK lazy (proxy)
  cost-tracking.ts               # logUsage + estimateGeminiCost
  cost-guard.ts                  # kill switch global (SOFT_DAILY_CAP_USD)
  apify.ts + gemini.ts           # provedores
  types.ts + utils.ts            # shared
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

### MVP (atual)
- [x] Adapt Reel (link → roteiro completo)
- [x] Análise estrutural (5 blocos)
- [x] Storyboard cena por cena com tempo, papel, visual, copy, B-roll
- [x] Caption sugerida + notas de produção
- [x] Copy-to-clipboard em todo lugar

### P1
- [ ] Auth (Neon Auth) + persistência (Neon Postgres)
- [ ] "Adaptar Criador" — input perfil IG, retorna padrões do criador
- [ ] Bridge → Sequência Viral (botão "transformar em carrossel")
- [ ] Voice clone usando `voice_samples` do SV
- [ ] Stripe billing (créditos por adaptação)

### P2
- [ ] Formatos do zero (Análise de Perfil, Tela Dividida, Tweet/Texto, Storytelling)
- [ ] Bridge → Viral Hunter (descobrir reels virais por nicho)
- [ ] Mobile-first storyboard (vertical scroll-snap 9:16)

---

## Briefing original

Documentação completa em `vault/02 - PROJETOS PESSOAIS/050 - REELS-VIRAL/`.

Inspiração: Reel @eduardomulkson `DXhfu8PkVVJ` (analisado em `/01 - REEL-FULMIO-ANALISE.md`).
