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

```
# APIs externas
APIFY_API_KEY=...                    # apify.com → Settings → API tokens
GEMINI_API_KEY=...                   # ai.google.dev → Get API key

# Neon Postgres
DATABASE_URL=...                     # connection string com pooler

# Neon Auth (Better Auth)
NEXT_PUBLIC_NEON_AUTH_URL=...        # endpoint pra signin/signup
NEON_AUTH_JWKS_URL=...               # JWKS pra validar JWT no server

# Neon Data API (opcional, não usado ainda)
NEXT_PUBLIC_NEON_DATA_API=...
```

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
  api/adapt-reel/route.ts   # core endpoint — pipeline síncrono Apify+Gemini
  page.tsx                   # landing + form + 3-state machine (form/loading/result)
  layout.tsx                 # fonts (Plus Jakarta + Instrument Serif + Geist Mono)
  globals.css                # design system @theme (cream + REC coral + ink)

components/
  loading-pipeline.tsx       # 6-stage progress com checkmarks animados
  result-view.tsx            # análise + estrutura + storyboard cena-por-cena

lib/
  apify.ts                   # fetchInstagramPost + downloadReelVideo
  gemini.ts                  # adaptReelWithGemini (file upload + structured output)
  types.ts                   # AdaptBrief, AdaptResponse, Scene, etc
  utils.ts                   # extractShortCode, isValidInstagramUrl, formatNumber
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
