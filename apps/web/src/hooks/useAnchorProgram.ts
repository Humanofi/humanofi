// ========================================
// Humanofi — Anchor Program Hook
// ========================================
// Provides a typed Anchor Program instance for interacting
// with the Humanofi on-chain program from React components.

"use client";

import { useMemo } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import idl from "@/idl/humanofi.json";

// Program ID from the IDL
export const PROGRAM_ID = new PublicKey(idl.address);

// Token-2022 program ID
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

// Associated Token Program ID
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

// PDA seed constants (must match on-chain constants.rs)
export const SEEDS = {
  CURVE: Buffer.from("curve"),
  VAULT: Buffer.from("vault"),
  REWARDS: Buffer.from("rewards"),
  LIMITER: Buffer.from("limiter"),
  REWARD_STATE: Buffer.from("reward_state"),
} as const;

/**
 * Derive the Bonding Curve PDA for a given mint.
 */
export function deriveBondingCurvePDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.CURVE, mint.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derive the Creator Vault PDA for a given mint.
 */
export function deriveCreatorVaultPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.VAULT, mint.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derive the Reward Pool PDA for a given mint.
 */
export function deriveRewardPoolPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.REWARDS, mint.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derive the Purchase Limiter PDA for a wallet + mint pair.
 */
export function derivePurchaseLimiterPDA(
  wallet: PublicKey,
  mint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.LIMITER, wallet.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derive the Holder Reward State PDA.
 */
export function deriveRewardStatePDA(
  mint: PublicKey,
  holder: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEEDS.REWARD_STATE, mint.toBuffer(), holder.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Create an Anchor Provider from a wallet object.
 * The wallet must implement signTransaction and signAllTransactions.
 */
export function createAnchorProvider(
  connection: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: never) => Promise<never>;
    signAllTransactions: (txs: never[]) => Promise<never[]>;
  }
): AnchorProvider {
  return new AnchorProvider(connection, wallet as never, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
}

/**
 * Create a typed Humanofi Program instance.
 */
export function createHumanofiProgram(provider: AnchorProvider): Program {
  return new Program(idl as never, provider);
}

/**
 * React hook that provides the Humanofi Anchor program.
 * Returns null if wallet is not connected.
 */
export function useAnchorProgram(wallet: {
  publicKey: PublicKey | null;
  signTransaction?: (tx: never) => Promise<never>;
  signAllTransactions?: (txs: never[]) => Promise<never[]>;
} | null) {
  const connection = useMemo(() => {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://api.devnet.solana.com";
    return new Connection(rpcUrl, { commitment: "confirmed" });
  }, []);

  const program = useMemo(() => {
    if (
      !wallet?.publicKey ||
      !wallet.signTransaction ||
      !wallet.signAllTransactions
    ) {
      return null;
    }

    const provider = createAnchorProvider(connection, wallet as never);
    return createHumanofiProgram(provider);
  }, [connection, wallet]);

  return { program, connection };
}
