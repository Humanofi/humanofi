# Humanofi — Web Application

> **Status: Beta · Devnet**

Next.js frontend and API layer for the Humanofi protocol.

## Stack

| Technology | Usage |
|------------|-------|
| **Next.js 16** | App Router, API Routes, SSR |
| **TypeScript** | Type safety |
| **Vanilla CSS** | Custom design system (brutaliste géométrique) |
| **Privy** | Wallet connection & embedded wallets |
| **Supabase JS** | Database, Storage, Realtime |
| **Anchor** | On-chain program interaction |

## Structure

```
src/
├── app/                    # App Router pages
│   ├── layout.tsx          # Root layout (fonts, providers)
│   ├── page.tsx            # Home — Explore creators
│   ├── create/             # Create your token (wizard)
│   ├── leaderboard/        # Rankings
│   ├── person/[id]/        # Creator profile page
│   └── api/                # API Routes
│       ├── auth/session/   # Privy → Supabase auth bridge
│       ├── creators/       # Creator CRUD
│       ├── identity/       # Didit KYC verification
│       ├── inner-circle/   # Posts, reactions, replies
│       ├── upload/         # Avatar + metadata upload
│       └── webhooks/       # Helius on-chain sync
│
├── components/             # React components
│   ├── Topbar.tsx          # Navigation bar
│   ├── Footer.tsx          # Footer
│   ├── PersonCard.tsx      # Creator card (grid)
│   ├── BondingCurveChart.tsx
│   └── layout/             # Providers (Privy, Wallet, Auth)
│
├── hooks/                  # Custom React hooks
│   ├── useHumanofi.ts      # Token operations (create, buy, sell)
│   ├── useAnchorProgram.ts # Anchor program connection
│   └── useSupabaseAuth.ts  # Privy ↔ Supabase session sync
│
├── lib/                    # Utilities
│   ├── supabase/client.ts  # Supabase client
│   └── solana/connection.ts # RPC connection
│
└── idl/                    # Anchor IDL
    └── humanofi.json
```

## Development

```bash
# From apps/web/
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` from the monorepo root to `apps/web/.env.local` and fill in your values. See the root README for details.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — Explore and discover creators |
| `/create` | 4-step wizard to create your personal token |
| `/leaderboard` | Creator rankings by market cap & holders |
| `/person/[id]` | Creator profile — stats, chart, inner circle |

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/session` | POST | Privy → Supabase session bridge |
| `/api/creators` | GET/POST | List or register creators |
| `/api/identity/verify` | POST | Start Didit KYC verification |
| `/api/identity/create-session` | POST | Create Didit session |
| `/api/identity/didit-webhook` | POST | Didit webhook callback |
| `/api/upload` | POST | Upload avatar + generate metadata JSON |
| `/api/inner-circle/[mint]/posts` | GET/POST | Inner circle feed |
| `/api/inner-circle/[mint]/react` | POST | Add reaction to a post |
| `/api/inner-circle/[mint]/reply` | POST | Reply to a post |
| `/api/webhooks` | POST | Helius on-chain event sync |
