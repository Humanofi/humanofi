// ========================================
// Humanofi — Protocol Interaction Hook
// ========================================
// High-level hook wrapping all Anchor instructions
// with proper PDA derivation, error handling, and toast notifications.
//
// Now uses useHumanofiProgram() internally — no wallet prop needed.

"use client";

import { useCallback } from "react";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { toast } from "sonner";
import { BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useHumanofiProgram, PROGRAM_ID } from "./useHumanofiProgram";

// Re-export for consumers
export { PROGRAM_ID };

// ─── Token-2022 constants ───
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// ─── PDA derivers ───
function deriveBondingCurvePDA(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), mint.toBuffer()],
    PROGRAM_ID
  );
}

function deriveCreatorVaultPDA(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), mint.toBuffer()],
    PROGRAM_ID
  );
}

function deriveRewardPoolPDA(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("rewards"), mint.toBuffer()],
    PROGRAM_ID
  );
}

function derivePurchaseLimiterPDA(buyer: PublicKey, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("limiter"), buyer.toBuffer(), mint.toBuffer()],
    PROGRAM_ID
  );
}

function deriveRewardStatePDA(mint: PublicKey, holder: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reward_state"), mint.toBuffer(), holder.toBuffer()],
    PROGRAM_ID
  );
}

const ENGAGEMENT_EPOCH_DURATION = 2_592_000; // 30 days in seconds

function deriveEngagementRecordPDA(mint: PublicKey, holder: PublicKey) {
  const epoch = Math.floor(Date.now() / 1000 / ENGAGEMENT_EPOCH_DURATION);
  const epochBytes = Buffer.alloc(8);
  epochBytes.writeBigUInt64LE(BigInt(epoch));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("engagement"), mint.toBuffer(), holder.toBuffer(), epochBytes],
    PROGRAM_ID
  );
}

/**
 * useHumanofi — Master hook for all protocol interactions.
 *
 * No wallet prop needed — uses useHumanofiProgram() internally.
 *
 * Usage:
 *   const { createToken, buyTokens, connected, publicKey } = useHumanofi();
 */
export function useHumanofi() {
  const { program, connection, publicKey, walletAddress, connected } = useHumanofiProgram();

  // ─── CREATE TOKEN ───
  const createToken = useCallback(
    async (params: {
      name: string;
      symbol: string;
      basePrice: number; // in lamports
      slope: number;
      initialLiquidity: number; // in lamports
      treasury: PublicKey;
    }) => {
      if (!program || !publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      const mint = Keypair.generate();
      const [bondingCurve] = deriveBondingCurvePDA(mint.publicKey);
      const [creatorVault] = deriveCreatorVaultPDA(mint.publicKey);
      const [rewardPool] = deriveRewardPoolPDA(mint.publicKey);

      const creatorTokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const txPromise = program.methods
        .createToken(
          params.name,
          params.symbol,
          new BN(params.basePrice),
          new BN(params.slope),
          new BN(params.initialLiquidity)
        )
        .accountsStrict({
          creator: publicKey,
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
    [program, publicKey]
  );

  // ─── BUY TOKENS ───
  const buyTokens = useCallback(
    async (params: {
      mint: PublicKey;
      solAmount: number; // in SOL (e.g. 0.5)
      creatorWallet: PublicKey;
      treasury: PublicKey;
    }) => {
      if (!program || !publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      const lamports = Math.floor(params.solAmount * LAMPORTS_PER_SOL);
      const [bondingCurve] = deriveBondingCurvePDA(params.mint);
      const [rewardPool] = deriveRewardPoolPDA(params.mint);
      const [purchaseLimiter] = derivePurchaseLimiterPDA(publicKey, params.mint);

      const buyerTokenAccount = getAssociatedTokenAddressSync(
        params.mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const txPromise = program.methods
        .buy(new BN(lamports))
        .accountsStrict({
          buyer: publicKey,
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
    [program, publicKey]
  );

  // ─── SELL TOKENS ───
  const sellTokens = useCallback(
    async (params: {
      mint: PublicKey;
      tokenAmount: number; // raw token amount (with decimals)
      creatorWallet: PublicKey;
      treasury: PublicKey;
    }) => {
      if (!program || !publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      const [bondingCurve] = deriveBondingCurvePDA(params.mint);
      const [rewardPool] = deriveRewardPoolPDA(params.mint);
      const [purchaseLimiter] = derivePurchaseLimiterPDA(publicKey, params.mint);

      const sellerTokenAccount = getAssociatedTokenAddressSync(
        params.mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const txPromise = program.methods
        .sell(new BN(params.tokenAmount))
        .accountsStrict({
          seller: publicKey,
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
    [program, publicKey]
  );

  // ─── CLAIM REWARDS (ENGAGEMENT-GATED) ───
  const claimRewards = useCallback(
    async (mint: PublicKey) => {
      if (!program || !publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      // Step 1: Sync engagement on-chain via oracle API
      toast.loading("Syncing engagement...", { id: "engagement-sync" });
      try {
        const syncRes = await fetch("/api/engagement/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-wallet-address": publicKey.toBase58() },
          body: JSON.stringify({ mint: mint.toBase58() }),
        });
        const syncData = await syncRes.json();
        toast.dismiss("engagement-sync");

        if (!syncRes.ok) {
          toast.error(syncData.error || "Engagement sync failed");
          return null;
        }
      } catch {
        toast.dismiss("engagement-sync");
        toast.error("Failed to sync engagement");
        return null;
      }

      // Step 2: Now claim on-chain (engagement record exists)
      const [rewardPool] = deriveRewardPoolPDA(mint);
      const [holderRewardState] = deriveRewardStatePDA(mint, publicKey);
      const [engagementRecord] = deriveEngagementRecordPDA(mint, publicKey);

      const holderTokenAccount = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const epoch = Math.floor(Date.now() / 1000 / ENGAGEMENT_EPOCH_DURATION);

      const txPromise = program.methods
        .claimRewards(new BN(epoch))
        .accountsStrict({
          holder: publicKey,
          mint,
          rewardPool,
          holderRewardState,
          engagementRecord,
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
    [program, publicKey]
  );

  // ─── FETCH ENGAGEMENT STATUS ───
  const fetchEngagement = useCallback(
    async (mint: string) => {
      if (!walletAddress) return null;
      try {
        const res = await fetch(
          `/api/engagement/sync?wallet=${walletAddress}&mint=${mint}`
        );
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    [walletAddress]
  );

  // ─── CHECK-IN (engagement fallback if creator is inactive) ───
  const checkIn = useCallback(
    async (mint: string) => {
      if (!walletAddress) {
        toast.error("Connect your wallet first.");
        return null;
      }

      try {
        const res = await fetch(`/api/inner-circle/${mint}/checkin`, {
          method: "POST",
          headers: { "x-wallet-address": walletAddress },
        });
        const data = await res.json();

        if (res.status === 429) {
          const next = new Date(data.nextAvailable);
          toast.info(`Already checked in. Next: ${next.toLocaleString()}`);
          return null;
        }

        if (!res.ok) {
          toast.error(data.error || "Check-in failed");
          return null;
        }

        toast.success("✅ Check-in recorded!");
        return data;
      } catch {
        toast.error("Check-in failed");
        return null;
      }
    },
    [walletAddress]
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
    checkIn,
    fetchBondingCurve,
    fetchEngagement,
    program,
    connection,
    connected,
    publicKey,
    walletAddress,
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
  6021: "Engagement record expired — must be from current month.",
  6022: "Insufficient engagement — minimum 4 actions required this month.",
  6023: "Unauthorized oracle.",
};
