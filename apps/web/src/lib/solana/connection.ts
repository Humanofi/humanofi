// ========================================
// Humanofi — Solana Connection
// ========================================

import { Connection, clusterApiUrl } from "@solana/web3.js";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  clusterApiUrl(
    (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "devnet" | "mainnet-beta") ||
      "devnet"
  );

/**
 * Solana JSON-RPC connection.
 * Uses Triton RPC in production, public endpoint in dev.
 */
export const connection = new Connection(RPC_URL, {
  commitment: "confirmed",
  confirmTransactionInitialTimeout: 60000,
});

/**
 * Get a connection with specific commitment level.
 * Use "finalized" for critical state reads (lock status, balances).
 */
export function getConnection(
  commitment: "processed" | "confirmed" | "finalized" = "confirmed"
) {
  return new Connection(RPC_URL, { commitment });
}
