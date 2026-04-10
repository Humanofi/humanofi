<p align="center">
  <img src="./apps/web/public/Logo_noire.png" alt="Humanofi Logo" width="280">
</p>

<p align="center">
  <strong>The first market where humans are the asset.</strong>
</p>

<p align="center">
  <a href="https://humanofi.xyz"><strong>humanofi.xyz</strong></a> (Coming Soon)
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Beta%20·%20Devnet-blue?style=for-the-badge" alt="Beta Devnet Status" />
  <img src="https://img.shields.io/badge/Network-Solana-black?style=for-the-badge&logo=solana" alt="Solana" />
  <img src="https://img.shields.io/badge/Hackathon-Colosseum-orange?style=for-the-badge" alt="Colosseum" />
  <img src="https://img.shields.io/badge/License-BSL%201.1-red?style=for-the-badge" alt="BSL 1.1 License" />
</p>

---

> *« Tu ne soutiens pas un projet, un meme ou une idée. Tu soutiens une personne. »*

## What is Humanofi?

Humanofi is a decentralized protocol on **Solana** that creates a market for human potential. Each verified individual can issue a personal token — tied to their real identity — that represents their reputation, ideas, journey, and future.

Supporters who believe in someone can acquire their token, access their **private inner circle**, and if they were right to believe — see the value of that trust grow over time.

### Why Humanofi?

- 🧬 **1 Human = 1 Token** — biometric identity verification (Didit), impossible to create duplicates.
- 🔒 **12-month creator lock** — creators can't sell on their holders, enforced by smart contract.
- 💰 **Automatic rent** — 2% transaction fees split automatically: 50% creator, 30% holders (claim model), 20% protocol.
- 📊 **Activity Score** — multi-dimensional scoring (regularity + engagement) — holders act as the jury.
- 🛡️ **Anti-manipulation** — enforced by Token-2022 Transfer Hooks and freeze authorities.

## Architecture

Our stack is fully optimized for speed, security, and true on-chain ownership while providing a Web2-level user experience.

- **Frontend**: Next.js 15 (App Router), React, Tailwind, Framer Motion
- **Smart Contracts**: Anchor framework on Solana
- **Token Standard**: Token-2022
- **Database / Backend**: Supabase (PostgreSQL, RLS)
- **Auth & Wallets**: Privy (Web3 embedded wallets & standard Solana wallets)
- **Identity (KYC)**: Didit Protocol

## Project Structure

This repository contains the public-facing source code for the Colosseum Hackathon.

```
humanofi/
├── apps/
│   └── web/                    # Next.js 15 — frontend + API routes
├── programs/
│   └── humanofi/               # Anchor program (Solana smart contract)
├── packages/                   # Shared TypeScript / Rust crates
├── supabase/                   # SQL migrations and configuration
├── tests/                      # Integration & E2E tests
└── LICENSE                     # Business Source License 1.1
```

*(Note: Internal architecture documentation and sensitive deployment scripts are omitted from this public repository.)*

## Getting Started (Local Development)

### Prerequisites

- Node.js ≥ 20.x
- Rust ≥ 1.75 + Anchor CLI ≥ 0.30
- Solana CLI ≥ 1.18

### Installation

```bash
# Clone the repository
git clone https://github.com/Humanofi/humanofi.git
cd humanofi

# Install dependencies
npm install

# Set up environment variables
cp .env.example apps/web/.env.local
# Fill in your variables in apps/web/.env.local

# Start the frontend
cd apps/web && npm run dev
```

## Security & Audits

Humanofi takes security seriously. As this is currently a **Beta on Devnet**, the smart contracts have **not yet been audited**. Do not deploy these contracts to mainnet with real funds until a formal audit is completed by a recognized security firm (planned post-hackathon).

## License

This project is licensed under the **Business Source License 1.1 (BSL 1.1)**.

- **Allowed**: Reading, studying, and testing the software on local or development networks (devnet/testnet) for educational and evaluation purposes (e.g., Colosseum Hackathon judges and community).
- **Prohibited**: Deploying this software to a mainnet blockchain or operating a commercial service based on this software without explicit written permission.

The license will eventually convert to an open-source license (Apache 2.0). See the `LICENSE` file for full details.

---

<p align="center">
  <strong>Built with ❤️ for the Solana ecosystem.</strong>
</p>
