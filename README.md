# Humanofi

> **The first market where humans are the asset.**

A decentralized protocol on Solana where verified humans issue personal tokens backed by a proprietary AMM — the **Human Curve™**. Supporters buy tokens to invest in a person's reputation, access their token-gated **Inner Circle**, and profit from their growth.

[![License: UNLICENSED](https://img.shields.io/badge/License-UNLICENSED-red.svg)](./LICENSE)
[![Network: Devnet](https://img.shields.io/badge/Network-Devnet-orange.svg)](https://explorer.solana.com/?cluster=devnet)
[![Program ID](https://img.shields.io/badge/Program-4u14FtDE...je2pmQ-blue.svg)](https://explorer.solana.com/address/4u14FtDEdr1UqSXbwhDXDLi552Skm1TPodrtjKje2pmQ?cluster=devnet)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [The Human Curve™ — Protocol Math](#the-human-curve--protocol-math)
4. [On-Chain Program (Solana / Anchor)](#on-chain-program-solana--anchor)
5. [Database (Supabase)](#database-supabase)
6. [Frontend (Next.js 16)](#frontend-nextjs-16)
7. [API Routes](#api-routes)
8. [Security Model](#security-model)
9. [Getting Started](#getting-started)
10. [Environment Variables](#environment-variables)
11. [Deployment](#deployment)

---

## Overview

Humanofi solves the core failure of previous social token platforms: **anonymous creators with no accountability and no liquidity guarantees**. Every token on Humanofi is:

- **Biometrically KYC-verified** via Didit — one human = one token (enforced on-chain via `HIUID`)
- **Always liquid** — the bonding curve guarantees you can always buy or sell
- **Anti-rug protected** — creator tokens are locked for 1 year, with a Smart Sell Limiter (max 5% price impact / 30-day cooldown)
- **Flash-loan proof** — Token-2022 freeze authority prevents any wallet-to-wallet transfer

---

## Architecture

```
Humanofi/
├── programs/humanofi/          # Solana Anchor program (Rust)
│   └── src/
│       ├── lib.rs              # Program entry point + instruction routing
│       ├── constants.rs        # All protocol parameters (fees, limits, seeds)
│       ├── errors.rs           # Error codes (6000-6119)
│       ├── instructions/       # Core business logic
│       │   ├── create_token.rs # Token creation + Founder Buy
│       │   ├── buy.rs          # Buy from Human Curve™
│       │   ├── sell.rs         # Sell to Human Curve™
│       │   ├── claim_creator_fees.rs  # Creator fee vault claim
│       │   └── admin.rs        # Emergency freeze, suspend/unsuspend
│       ├── state/              # Account data structures
│       │   ├── bonding_curve.rs      # Core AMM state + all calculations
│       │   ├── creator_vault.rs      # Vesting + Sell Limiter tracker
│       │   ├── creator_fee_vault.rs  # Accumulated trading fees per creator
│       │   ├── protocol_config.rs    # ProtocolConfig PDA (emergency kill switch)
│       │   ├── protocol_vault.rs     # Protocol vault (dormant in v3.6)
│       │   └── purchase_limiter.rs   # Per-wallet purchase tracker (anti-snipe)
│       └── utils/              # Math helpers (ceil_div, isqrt, smart_sell_max)
│
├── apps/web/                   # Next.js 16 frontend
│   └── src/
│       ├── app/                # App Router pages + API routes
│       ├── components/         # React components
│       ├── lib/                # Utilities (Anchor client, Supabase, identicon)
│       └── idl/                # Humanofi IDL (auto-generated from anchor build)
│
├── supabase/                   # Database schema + Edge Functions
│   ├── schema.sql              # Reference schema (8 tables, RLS, triggers)
│   └── migrations/             # Ordered migration files
│
├── tests/                      # Anchor program tests (TypeScript + Mocha)
├── Anchor.toml                 # Anchor workspace config
└── package.json                # Monorepo workspace (npm workspaces)
```

---

## The Human Curve™ — Protocol Math

The Human Curve™ is a **constant-product AMM** — `x · y = k(t)` — with three proprietary innovations on top of Uniswap V2:

### 1. Depth Parameter (D)

Inspired by Curve Finance's amplification factor `A`, the Depth Parameter `D` gives the curve price depth *from day one*, even with minimal liquidity.

```
D = DEPTH_RATIO × V        (DEPTH_RATIO = 18, V = creator's initial SOL)
x₀ = D                     (initial x is depth only — no real SOL)
y₀ = 1,000,000 tokens      (fixed for all tokens, 6 decimals = 10^12 base units)
k₀ = x₀ × y₀
```

`D` is **immutable** after creation and **never withdrawable** — it only exists in the mathematical formula. This prevents price collapse at low liquidity.

### 2. k-Evolution (k-Deepening)

On every trade, 1% of the transaction is permanently locked into the curve as `fee_depth`. This increases `x` before the trade executes, growing `k` permanently:

```
k(t+1) ≥ k(t)   always
```

The curve's depth increases with volume — the more the token trades, the more **price-stable** it becomes.

### 3. Founder Buy

At token creation, the creator performs a **Founder Buy**: their initial liquidity `V` enters the curve at the initial price `P₀` (the lowest possible price). The creator receives ~5.1% of supply, locked for 1 year.

```
Founder Buy fee: 3% total
  → 2% to Protocol Treasury
  → 1% to k-deepening (stays in vault)
```

### 4. Asymmetric Fee Split (v3.7)

The fee split intentionally **rewards buying** (conviction) and **reduces returns on selling** (doubt):

| Trade Type    | Creator Vault | Protocol Treasury | k-Deepening | Total |
|---------------|:-------------:|:-----------------:|:-----------:|:-----:|
| Holder Buy    | **3%**        | 1%                | 1%          | 5%    |
| Holder Sell   | 1%            | **3%**            | 1%          | 5%    |
| Creator Sell  | 0% (self)     | **5%**            | 1%          | 6%    |
| Founder Buy   | 0% (self)     | 2%                | 1%          | 3%    |

Creator fees accumulate in a **Creator Fee Vault PDA** and are claimable every **15 days**.

### 5. Smart Sell Limiter

To prevent creators from crashing their own token:

- **Max 5% price impact** per creator sell transaction
- **30-day cooldown** between creator sells
- **1-year cliff lock** — creators cannot sell anything during Year 1

Holders have no sell restrictions.

### 6. Anti-Snipe Fair Launch

During the first **24 hours** after token creation, each wallet can hold a maximum of **50,000 tokens (5% of supply)**. After 24 hours, it's a free market.

---

## On-Chain Program (Solana / Anchor)

- **Program ID:** `4u14FtDEdr1UqSXbwhDXDLi552Skm1TPodrtjKje2pmQ`
- **Network:** Devnet (Mainnet pending audit)
- **Token Standard:** Token-2022 with `MetadataPointer` extension (on-chain metadata stored in the mint)
- **Framework:** Anchor 0.32.1

### Instructions

| Instruction | Caller | Description |
|---|---|---|
| `init_config` | Admin | One-time setup of ProtocolConfig PDA |
| `toggle_freeze` | Admin | Emergency freeze/unfreeze all protocol operations |
| `suspend_creator` | Admin | Suspend a creator (redirect fees, block sell/claim) |
| `unsuspend_creator` | Admin | Lift a creator suspension |
| `create_token` | Creator | Deploy new personal token + Founder Buy |
| `buy` | Any wallet | Buy tokens from the Human Curve™ |
| `sell` | Any holder | Sell tokens back to the Human Curve™ |
| `claim_creator_fees` | Creator | Claim accumulated SOL fees from CreatorFeeVault |

### PDA Accounts (per token)

| Account | Seeds | Description |
|---|---|---|
| `BondingCurve` | `["curve", mint]` | AMM state (x, y, k, reserves, TWAP) |
| `CreatorVault` | `["vault", mint]` | Vesting tracker + Sell Limiter state |
| `CreatorFeeVault` | `["creator_fees", mint]` | Accumulated creator fees (claimable) |
| `ProtocolVault` | `["protocol_vault", mint]` | Protocol vault (dormant in v3.6) |
| `PurchaseLimiter` | `["limiter", wallet, mint]` | Per-wallet purchase tracking (anti-snipe) |
| `ProtocolConfig` | `["protocol_config"]` | Global config + emergency kill switch |

### Token-2022 Architecture

Tokens are **frozen by default** immediately after being minted. Only the program (via the `BondingCurve` PDA as `freeze_authority`) can thaw/freeze:

```
Buy  → thaw ATA → mint tokens → freeze ATA
Sell → thaw ATA → burn tokens → freeze ATA (if balance > 0)
```

This makes tokens **untransferable outside of Humanofi**, closing all flash loan attack vectors.

---

## Database (Supabase)

### Tables

| Table | Description |
|---|---|
| `profiles` | All connected wallets (created on Privy login via `/api/auth/session`) |
| `verified_identities` | KYC-passed users — stores `HIUID` (deterministic SHA-256 hash), `wallet_address`, `country_code` |
| `creator_tokens` | Creator profiles — `mint_address`, `category`, `bio`, `socials`, `activity_score` (0-100) |
| `token_holders` | Holder balances per token — synced via Helius webhooks |
| `inner_circle_posts` | Creator posts (text, image, event, poll) — visible only to token holders |
| `inner_circle_reactions` | Emoji reactions on posts (6 emoji types, 1 per wallet per post) |
| `inner_circle_replies` | Text replies on posts |
| `creator_activity` | Activity log for computing Activity Score (posts, trades, claims) |

### Row Level Security

- All writes go through **server-side API routes** using the `SUPABASE_SERVICE_ROLE_KEY`
- `verified_identities` has no public access — only the server can read/write
- `creator_tokens` and `token_holders` are public read (for the Explore page)
- Inner Circle gating is enforced at the API level (not RLS)

### Storage Buckets

- `avatars` — Public profile photos (used as token image)
- `metadata` — Metaplex-standard JSON metadata files

---

## Frontend (Next.js 16)

- **Framework:** Next.js 16.2.3 (App Router)
- **React:** 19.2.4
- **Styling:** Vanilla CSS with design tokens (`globals.css` — ~10,000 lines)
- **Font:** Plus Jakarta Sans (Google Fonts, weights 400–800)
- **Auth:** Privy (`@privy-io/react-auth` v3) — supports wallet, email, social login
- **Charts:** Lightweight Charts v5
- **Animations:** Framer Motion

### Pages

| Route | Type | Description |
|---|---|---|
| `/` | Client | Homepage — hero, discover feed, leaderboard preview |
| `/explore` | Client | Screener — filter creators by category, score, price |
| `/create` | Client | Multi-step token creation wizard (KYC → token config → deploy) |
| `/leaderboard` | Client | Top creators ranked by activity score |
| `/feed` | Client (gated) | Cross-creator Inner Circle feed (holders only) |
| `/portfolio` | Client (gated) | My holdings dashboard |
| `/person/[mint]` | Client | Creator profile — trading panel, Inner Circle, stats dashboard |
| `/wallet` | Client (gated) | Embedded Privy wallet view |
| `/admin/dashboard` | Client (gated) | Protocol admin dashboard |
| `/how-it-works` | **Server (SEO)** | Educational landing page |
| `/for-creators` | **Server (SEO)** | Creator conversion landing page |
| `/for-investors` | **Server (SEO)** | Investor conversion landing page |

### SEO Infrastructure

- `robots.ts` — Blocks `/api/`, `/admin/`, `/wallet`, `/portfolio`
- `sitemap.ts` — Dynamic sitemap (static pages + all creator profiles from Supabase)
- `manifest.ts` — PWA manifest
- All pages have `Metadata` with title, description, OpenGraph, Twitter Card
- `/person/[mint]` uses `generateMetadata()` (server-side dynamic SEO per creator)
- JSON-LD: `Organization`, `WebSite`, `WebApplication` (root), `Person` + `Product` (per creator)

---

## API Routes

### Auth
| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/session` | POST | Sync Privy login → Supabase profile + JWT |

### Identity (KYC)
| Endpoint | Method | Description |
|---|---|---|
| `/api/identity/start` | POST | Start Didit KYC session |
| `/api/identity/status` | GET | Check KYC verification status |
| `/api/webhooks/didit` | POST | Didit webhook — generate HIUID on approval |

### Creators
| Endpoint | Method | Description |
|---|---|---|
| `/api/creators/[mint]` | GET | Get creator profile |
| `/api/creators/[mint]/stats` | GET | Get on-chain stats for creator |

### Drafts
| Endpoint | Method | Description |
|---|---|---|
| `/api/drafts` | GET/POST | Save/load token creation drafts |

### Trades
| Endpoint | Method | Description |
|---|---|---|
| `/api/trades/[mint]` | GET | Trade history for a token |
| `/api/webhooks/helius` | POST | Helius webhook — sync on-chain trades to Supabase |

### Inner Circle
| Endpoint | Method | Description |
|---|---|---|
| `/api/inner-circle/posts/[mint]` | GET/POST | Read/create posts (holder-gated) |
| `/api/inner-circle/reactions` | POST | Add/toggle emoji reaction |
| `/api/inner-circle/replies` | POST | Reply to a post |

### Drops
| Endpoint | Method | Description |
|---|---|---|
| `/api/drops/[mint]` | GET/POST | Creator drops management |

### Public Posts
| Endpoint | Method | Description |
|---|---|---|
| `/api/public-posts/[mint]` | GET | Public posts (non-gated previews) |

### Others
| Endpoint | Method | Description |
|---|---|---|
| `/api/explore` | GET | Paginated creator screener with filters |
| `/api/search` | GET | Global search (creators by name/symbol) |
| `/api/feed` | GET | Cross-creator feed for wallet holders |
| `/api/feed-events` | GET | SSE stream for real-time feed updates |
| `/api/holders/[mint]` | GET | Token holder list |
| `/api/portfolio` | GET | Holdings for a wallet address |
| `/api/profile` | GET/PATCH | User profile CRUD |
| `/api/engagement/sync` | POST | Sync Activity Score |
| `/api/price-snapshot` | POST | Store price snapshot for charting |
| `/api/upload` | POST | Upload avatar/metadata to Supabase Storage |
| `/api/admin/dashboard` | GET | Protocol analytics (admin only) |

---

## Security Model

| Threat | Mitigation |
|---|---|
| **Flash loans** | Tokens frozen by default — cannot be transferred. No flash loan vector. |
| **Bot MEV / sniping** | CPI Guard rejects program-to-program calls. 24h anti-snipe window (max 5% supply/wallet). |
| **Creator rug pull** | 1-year token lock. Smart Sell Limiter (5% impact max, 30-day cooldown). |
| **Fake creators** | Biometric KYC via Didit. HIUID = deterministic 1-per-human hash, checked on-chain. |
| **Protocol exploits** | Emergency freeze (`toggle_freeze`) blocks all operations. Creator suspension redirects all fees to treasury. |
| **Whale manipulation** | Anti-snipe window and k-deepening limit front-running. Slippage protection on all trades. |
| **Fee manipulation** | Fee calculations use `ceil_div` (rounds up). Treasury is a hardcoded constant `TREASURY_WALLET`. |

---

## Getting Started

### Prerequisites

- **Rust** ≥ 1.79, **Solana CLI** ≥ 1.18
- **Anchor CLI** 0.32.1: `cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked`
- **Node.js** ≥ 20, **npm** ≥ 10
- **Supabase CLI** (for local DB): `brew install supabase/tap/supabase`

### 1. Clone and install

```bash
git clone https://github.com/Humanofi/humanofi.git
cd humanofi
npm install
```

### 2. Configure environment

```bash
cp .env.example apps/web/.env.local
# Fill in all required values in apps/web/.env.local
```

See [Environment Variables](#environment-variables) for details.

### 3. Set up the database

```bash
# Push schema to your Supabase project
npm run db:migrate
```

Or run `supabase/schema.sql` directly in the Supabase SQL Editor.

### 4. Build and deploy the Solana program

```bash
# Local devnet
solana config set --url devnet
npm run program:build
npm run program:deploy

# Initialize ProtocolConfig PDA (one-time, admin wallet)
# Call init_config() from your admin wallet
```

### 5. Run the frontend

```bash
npm run dev
# → http://localhost:3000
```

### Running program tests

```bash
npm run program:test
# Compiles TypeScript → runs Mocha tests against localnet
```

---

## Environment Variables

Copy `.env.example` to `apps/web/.env.local` and fill in:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SOLANA_NETWORK` | `devnet` or `mainnet-beta` |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Your Helius/QuickNode RPC endpoint |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID (from privy.io) |
| `PRIVY_APP_SECRET` | Privy app secret (server-only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, bypasses RLS) |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret (for signing custom JWTs) |
| `DIDIT_API_KEY` | Didit KYC API key |
| `DIDIT_WORKFLOW_ID` | Didit biometric workflow ID |
| `DIDIT_WEBHOOK_SECRET` | HMAC secret for Didit webhook verification |
| `HELIUS_API_KEY` | Helius API key (for on-chain sync + webhooks) |
| `HELIUS_WEBHOOK_SECRET` | HMAC secret for Helius webhook verification |
| `HIUID_SECRET_PEPPER` | 64-char hex string for HIUID hash pepper (generate: `openssl rand -hex 32`) |
| `NEXT_PUBLIC_TREASURY_WALLET` | Protocol treasury public key |
| `NEXT_PUBLIC_BASE_URL` | Production URL (e.g. `https://humanofi.xyz`) |

---

## Deployment

The frontend is deployed on **Vercel** (see `vercel.json`). The Solana program is deployed on **Devnet**.

### Vercel deployment

```bash
# From root
vercel --prod
```

Make sure all environment variables are set in the Vercel dashboard.

### Program upgrade (Mainnet)

Before mainnet deployment:
1. Complete a full security audit of the Anchor program
2. Transfer `ProtocolConfig` authority to a **Squads multisig**
3. Verify the `TREASURY_WALLET` constant matches the multisig treasury

---

## License

UNLICENSED — All rights reserved. Humanofi is proprietary software.

See [LICENSE](./LICENSE) for details.

---

*Built on Solana · Token-2022 · Anchor 0.32.1 · Next.js 16 · Supabase*
