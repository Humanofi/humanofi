# @humanofi/sdk — Client SDK

SDK TypeScript pour interagir avec le programme Anchor Humanofi déployé sur Solana.

## Installation

```bash
npm install @humanofi/sdk
```

## Usage

```typescript
import { HumanofiClient } from "@humanofi/sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";

// Initialize client
const connection = new Connection("https://your-triton-endpoint");
const provider = new AnchorProvider(connection, wallet, {});
const client = new HumanofiClient(provider);

// Create a personal token
const { mint, txSignature } = await client.createToken({
  name: "Alice",
  symbol: "ALICE",
  uri: "https://humanofi.com/metadata/alice.json",
  basePrice: 1_000_000,  // 0.001 SOL
  curveFactor: 1_000_000,
});

// Buy tokens
await client.buy({
  mint: aliceMint,
  solAmount: 0.1 * LAMPORTS_PER_SOL,
});

// Sell tokens
await client.sell({
  mint: aliceMint,
  tokenAmount: 100_000_000,
});

// Claim rewards
await client.claimRewards({ mint: aliceMint });

// Get bonding curve state
const curve = await client.getBondingCurve(aliceMint);
console.log(`Price: ${curve.currentPrice} lamports`);

// Get claimable rewards
const rewards = await client.getClaimableRewards(aliceMint, walletPubkey);
console.log(`Pending: ${rewards.pendingAmount} lamports`);
```

## API Reference

### `HumanofiClient`

| Method | Description |
|--------|-------------|
| `createToken(params)` | Crée un nouveau token personnel |
| `buy(params)` | Achète des tokens via la bonding curve |
| `sell(params)` | Vend des tokens et récupère du SOL |
| `claimRewards(params)` | Claim les rewards accumulés |
| `unlockTokens(params)` | Unlock les tokens créateur (après 12 mois) |
| `getBondingCurve(mint)` | Lit l'état de la bonding curve |
| `getCreatorVault(mint)` | Lit l'état du vault créateur |
| `getRewardPool(mint)` | Lit l'état du reward pool |
| `getClaimableRewards(mint, wallet)` | Calcule les rewards claimables |
| `getPurchaseLimits(mint, wallet)` | Lit les limites d'achat actuelles |
