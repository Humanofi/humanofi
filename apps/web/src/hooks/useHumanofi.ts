// ========================================
// Humanofi — Protocol Interaction Hook
// ========================================
// High-level hook wrapping all Anchor instructions
// with proper PDA derivation, error handling, and toast notifications.

"use client";

import { useCallback } from "react";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { toast } from "sonner";
import {
  useAnchorProgram,
  PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  deriveBondingCurvePDA,
  deriveCreatorVaultPDA,
  deriveRewardPoolPDA,
  derivePurchaseLimiterPDA,
  deriveRewardStatePDA,
} from "./useAnchorProgram";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";

interface WalletLike {
  publicKey: PublicKey | null;
  signTransaction?: (tx: never) => Promise<never>;
  signAllTransactions?: (txs: never[]) => Promise<never[]>;
}

/**
 * useHumanofi — Master hook for all protocol interactions.
 *
 * Usage:
 *   const { createToken, buyTokens, sellTokens, claimRewards } = useHumanofi(wallet);
 */
export function useHumanofi(wallet: WalletLike | null) {
  const { program, connection } = useAnchorProgram(wallet);

  // ─── CREATE TOKEN ───
  const createToken = useCallback(
    async (params: {
      name: string;
      symbol: string;
      basePrice: number; // in lamports
      slope: number;
      treasury: PublicKey;
    }) => {
      if (!program || !wallet?.publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      const mint = Keypair.generate();
      const [bondingCurve] = deriveBondingCurvePDA(mint.publicKey);
      const [creatorVault] = deriveCreatorVaultPDA(mint.publicKey);
      const [rewardPool] = deriveRewardPoolPDA(mint.publicKey);

      const creatorTokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const txPromise = program.methods
        .createToken(
          params.name,
          params.symbol,
          new BN(params.basePrice),
          new BN(params.slope)
        )
        .accountsStrict({
          creator: wallet.publicKey,
          mint: mint.publicKey,
          bondingCurve,
          creatorVault,
          rewardPool,
          creatorTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mint])
        .rpc();

      toast.promise(txPromise, {
        loading: "Creating your token on Solana...",
        success: (sig) => `Token created! Tx: ${sig.slice(0, 8)}...`,
        error: (err) => `Failed: ${parseAnchorError(err)}`,
      });

      const sig = await txPromise;
      return { signature: sig, mint: mint.publicKey };
    },
    [program, wallet]
  );

  // ─── BUY TOKENS ───
  const buyTokens = useCallback(
    async (params: {
      mint: PublicKey;
      solAmount: number; // in SOL (e.g. 0.5)
      creatorWallet: PublicKey;
      treasury: PublicKey;
    }) => {
      if (!program || !wallet?.publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      const lamports = Math.floor(params.solAmount * LAMPORTS_PER_SOL);
      const [bondingCurve] = deriveBondingCurvePDA(params.mint);
      const [rewardPool] = deriveRewardPoolPDA(params.mint);
      const [purchaseLimiter] = derivePurchaseLimiterPDA(
        wallet.publicKey,
        params.mint
      );

      const buyerTokenAccount = getAssociatedTokenAddressSync(
        params.mint,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const txPromise = program.methods
        .buy(new BN(lamports))
        .accountsStrict({
          buyer: wallet.publicKey,
          mint: params.mint,
          bondingCurve,
          rewardPool,
          purchaseLimiter,
          buyerTokenAccount,
          creatorWallet: params.creatorWallet,
          treasury: params.treasury,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.promise(txPromise, {
        loading: `Buying tokens for ${params.solAmount} SOL...`,
        success: (sig) => `Purchase confirmed! Tx: ${sig.slice(0, 8)}...`,
        error: (err) => `Buy failed: ${parseAnchorError(err)}`,
      });

      return txPromise;
    },
    [program, wallet]
  );

  // ─── SELL TOKENS ───
  const sellTokens = useCallback(
    async (params: {
      mint: PublicKey;
      tokenAmount: number; // raw token amount (with decimals)
      creatorWallet: PublicKey;
      treasury: PublicKey;
    }) => {
      if (!program || !wallet?.publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      const [bondingCurve] = deriveBondingCurvePDA(params.mint);
      const [rewardPool] = deriveRewardPoolPDA(params.mint);
      const [purchaseLimiter] = derivePurchaseLimiterPDA(
        wallet.publicKey,
        params.mint
      );

      const sellerTokenAccount = getAssociatedTokenAddressSync(
        params.mint,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const txPromise = program.methods
        .sell(new BN(params.tokenAmount))
        .accountsStrict({
          seller: wallet.publicKey,
          mint: params.mint,
          bondingCurve,
          rewardPool,
          purchaseLimiter,
          sellerTokenAccount,
          creatorWallet: params.creatorWallet,
          treasury: params.treasury,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.promise(txPromise, {
        loading: "Selling tokens...",
        success: (sig) => `Sold! Tx: ${sig.slice(0, 8)}...`,
        error: (err) => `Sell failed: ${parseAnchorError(err)}`,
      });

      return txPromise;
    },
    [program, wallet]
  );

  // ─── CLAIM REWARDS ───
  const claimRewards = useCallback(
    async (mint: PublicKey) => {
      if (!program || !wallet?.publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      const [rewardPool] = deriveRewardPoolPDA(mint);
      const [holderRewardState] = deriveRewardStatePDA(mint, wallet.publicKey);

      const holderTokenAccount = getAssociatedTokenAddressSync(
        mint,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const txPromise = program.methods
        .claimRewards()
        .accountsStrict({
          holder: wallet.publicKey,
          mint,
          rewardPool,
          holderRewardState,
          holderTokenAccount,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      toast.promise(txPromise, {
        loading: "Claiming rewards...",
        success: (sig) => `Rewards claimed! Tx: ${sig.slice(0, 8)}...`,
        error: (err) => `Claim failed: ${parseAnchorError(err)}`,
      });

      return txPromise;
    },
    [program, wallet]
  );

  // ─── FETCH BONDING CURVE STATE ───
  const fetchBondingCurve = useCallback(
    async (mint: PublicKey) => {
      if (!program) return null;
      const [pda] = deriveBondingCurvePDA(mint);
      try {
        const account = await (program.account as Record<string, { fetch: (addr: PublicKey) => Promise<unknown> }>)
          .bondingCurve.fetch(pda);
        return account;
      } catch {
        return null;
      }
    },
    [program]
  );

  return {
    createToken,
    buyTokens,
    sellTokens,
    claimRewards,
    fetchBondingCurve,
    program,
    connection,
    connected: !!wallet?.publicKey,
    publicKey: wallet?.publicKey ?? null,
  };
}

// ─── Error Parser ───
function parseAnchorError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message: string }).message;
    // Extract custom program error messages
    const match = msg.match(/Custom program error: 0x([0-9a-fA-F]+)/);
    if (match) {
      const code = parseInt(match[1], 16);
      return ERROR_MAP[code] || `Program error (${code})`;
    }
    // Check for common wallet errors
    if (msg.includes("User rejected")) return "Transaction cancelled by user.";
    if (msg.includes("insufficient")) return "Insufficient balance.";
    return msg.length > 120 ? msg.slice(0, 120) + "..." : msg;
  }
  return "Unknown error";
}

// Map Anchor error codes to human messages (from errors.rs)
const ERROR_MAP: Record<number, string> = {
  6000: "Token name must be 1-32 characters.",
  6001: "Token symbol must be 1-10 characters.",
  6002: "Base price must be greater than zero.",
  6003: "Curve factor must be greater than zero.",
  6004: "Bonding curve is not active.",
  6005: "Insufficient SOL for this purchase.",
  6006: "Insufficient token balance to sell.",
  6007: "Amount too small — price is zero.",
  6008: "Math overflow in bonding curve.",
  6009: "Insufficient reserve in bonding curve.",
  6010: "Purchase exceeds daily limit.",
  6011: "Amount must be greater than zero.",
  6012: "Creator tokens are still locked.",
  6013: "Creator tokens already unlocked.",
  6014: "Only the creator can unlock.",
  6015: "No rewards available.",
  6016: "Must hold tokens to claim rewards.",
  6017: "Fee calculation overflow.",
  6018: "Transfer blocked — trade via Humanofi only.",
  6019: "Invalid mint.",
  6020: "Token amount must be greater than zero.",
};
