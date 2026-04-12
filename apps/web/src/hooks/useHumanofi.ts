// ========================================
// Humanofi — Protocol Interaction Hook (v2 — Human Curve™)
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

function deriveProtocolVaultPDA(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_vault"), mint.toBuffer()],
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
      uri: string; // metadata JSON URL (contains image, etc.)
      initialLiquidity: number; // in lamports
      treasury: PublicKey;
    }) => {
      if (!program || !publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      // Debug: log wallet and balance
      try {
        const bal = await program.provider.connection.getBalance(publicKey);
        console.log(`[Humanofi] createToken — wallet=${publicKey.toBase58()}, balance=${bal / 1e9} SOL, rpc=${program.provider.connection.rpcEndpoint}`);
      } catch (e) {
        console.error("[Humanofi] Failed to check balance:", e);
      }

      const mint = Keypair.generate();
      const [bondingCurve] = deriveBondingCurvePDA(mint.publicKey);
      const [creatorVault] = deriveCreatorVaultPDA(mint.publicKey);
      const [rewardPool] = deriveRewardPoolPDA(mint.publicKey);
      const [protocolVault] = deriveProtocolVaultPDA(mint.publicKey);

      const txPromise = program.methods
        .createToken(
          params.name,
          params.symbol,
          params.uri,
          new BN(params.initialLiquidity)
        )
        .accountsStrict({
          creator: publicKey,
          mint: mint.publicKey,
          bondingCurve,
          creatorVault,
          rewardPool,
          protocolVault,
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
      minTokensOut?: number; // slippage protection (0 = no check)
    }) => {
      if (!program || !publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      const lamports = Math.floor(params.solAmount * LAMPORTS_PER_SOL);
      const [bondingCurve] = deriveBondingCurvePDA(params.mint);
      const [rewardPool] = deriveRewardPoolPDA(params.mint);
      const [protocolVault] = deriveProtocolVaultPDA(params.mint);
      const [purchaseLimiter] = derivePurchaseLimiterPDA(publicKey, params.mint);

      const buyerTokenAccount = getAssociatedTokenAddressSync(
        params.mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Creator's ATA for Merit Reward (12.6%)
      const creatorTokenAccount = getAssociatedTokenAddressSync(
        params.mint,
        params.creatorWallet,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Protocol's ATA for Merit Fee (1.4%) — authority = bonding_curve PDA
      const protocolTokenAccount = getAssociatedTokenAddressSync(
        params.mint,
        bondingCurve,
        true, // allowOwnerOffCurve = true (PDA is owner)
        TOKEN_2022_PROGRAM_ID
      );

      const txPromise = program.methods
        .buy(
          new BN(lamports),
          new BN(params.minTokensOut || 0) // slippage protection
        )
        .accountsStrict({
          buyer: publicKey,
          mint: params.mint,
          bondingCurve,
          rewardPool,
          protocolVault,
          purchaseLimiter,
          buyerTokenAccount,
          creatorTokenAccount,
          protocolTokenAccount,
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
      minSolOut?: number; // slippage protection (0 = no check)
    }) => {
      if (!program || !publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      const [bondingCurve] = deriveBondingCurvePDA(params.mint);
      const [rewardPool] = deriveRewardPoolPDA(params.mint);
      const [holderRewardState] = deriveRewardStatePDA(params.mint, publicKey);

      const sellerTokenAccount = getAssociatedTokenAddressSync(
        params.mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Check if seller is creator → include creator_vault
      const isCreator = publicKey.equals(params.creatorWallet);
      const [creatorVaultPda] = deriveCreatorVaultPDA(params.mint);

      const txPromise = program.methods
        .sell(
          new BN(params.tokenAmount),
          new BN(params.minSolOut || 0) // slippage protection
        )
        .accountsStrict({
          seller: publicKey,
          mint: params.mint,
          bondingCurve,
          rewardPool,
          holderRewardState,
          creatorVault: isCreator ? creatorVaultPda : (null as unknown as PublicKey),
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
      if (!program) {
        console.warn("[Humanofi] fetchBondingCurve: program not ready");
        return null;
      }
      const [pda] = deriveBondingCurvePDA(mint);
      try {
        const account = await (program.account as Record<string, { fetch: (addr: PublicKey) => Promise<unknown> }>)
          .bondingCurve.fetch(pda);
        return account;
      } catch (err) {
        console.error("[Humanofi] fetchBondingCurve FAILED for", mint.toBase58(), err);
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

    // ALWAYS log the full error to console for debugging
    console.error("[Humanofi] Raw error:", msg);

    // Extract custom program error messages
    const match = msg.match(/Custom program error: 0x([0-9a-fA-F]+)/);
    if (match) {
      const code = parseInt(match[1], 16);
      return ERROR_MAP[code] || `Program error (${code})`;
    }
    // Extract AnchorError format: "Error Code: XXX"
    const anchorMatch = msg.match(/Error Code: (\w+)/);
    if (anchorMatch) {
      const errorName = anchorMatch[1];
      return NAMED_ERROR_MAP[errorName] || errorName;
    }
    // Check for common wallet/network errors
    if (msg.includes("User rejected")) return "Transaction cancelled.";
    // Check simulation errors FIRST (they may contain "insufficient" as a substring)
    if (msg.includes("Simulation failed"))
      return extractSimError(msg);
    if (msg.includes("no record of a prior credit"))
      return "Wallet has no SOL on this network — fund your wallet on Devnet.";
    if (msg.includes("insufficient funds"))
      return "Insufficient SOL — Top up your wallet.";
    if (msg.includes("blockhash")) return "Transaction expired — Please try again.";
    return msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
  }
  return "Unknown error";
}

/** Extract the most useful part from simulation error messages */
function extractSimError(msg: string): string {
  if (msg.includes("no record of a prior credit"))
    return "Insufficient balance — Top up your wallet with SOL.";
  if (msg.includes("InsufficientSol"))
    return "Not enough SOL in the bonding curve.";
  if (msg.includes("SlippageExceeded"))
    return "Price moved — try again with a higher slippage tolerance.";
  if (msg.includes("SellImpactExceeded"))
    return "Sell would impact price too much — reduce the amount.";
  if (msg.includes("CreatorVestingLocked"))
    return "Your tokens are locked for Year 1.";
  if (msg.includes("CreatorSellCooldown"))
    return "Cooldown active — wait 30 days between sells.";
  // Generic simulation fail
  const innerMatch = msg.match(/Message: (.+?)(\.|$)/);
  if (innerMatch) return innerMatch[1];
  return "Simulation failed — Check your balance.";
}

// Map Anchor error codes to human messages
// MUST match the EXACT order in errors.rs — Anchor assigns 6000 + enum index
const ERROR_MAP: Record<number, string> = {
  6000: "Token name must be 1–32 characters.",
  6001: "Token symbol must be 1–10 characters.",
  6002: "This token is no longer active.",
  6003: "Insufficient SOL for this purchase.",
  6004: "Not enough tokens to sell.",
  6005: "Amount too small — price would be zero.",
  6006: "Math overflow error.",
  6007: "Insufficient reserve in bonding curve.",
  6008: "Pool depleted — no more tokens available.",
  6009: "Purchase amount must be greater than zero.",
  6010: "Creator tokens locked — Year 1 is a hard lock.",
  6011: "Sell would impact price > 5% — reduce the amount.",
  6012: "Cooldown active — wait 30 days between creator sells.",
  6013: "Unauthorized — only the creator can perform this action.",
  6014: "No rewards available to claim.",
  6015: "You must hold tokens to claim rewards.",
  6016: "Fee calculation error.",
  6017: "Transfer blocked — Trade via Humanofi only.",
  6018: "Bots not allowed — only direct wallet transactions.",
  6019: "Invalid mint.",
  6020: "Token amount must be greater than zero.",
  6021: "Engagement data expired — must be from this month.",
  6022: "Insufficient engagement — Minimum actions required this month.",
  6023: "Unauthorized oracle.",
  6024: "Initial liquidity below minimum.",
  6025: "Initial liquidity above maximum.",
  6026: "Invalid treasury wallet.",
  6027: "Invalid epoch.",
  6028: "Slippage exceeded — received less than minimum.",
};

// Map Anchor error names for "Error Code: XXX" format
const NAMED_ERROR_MAP: Record<string, string> = {
  InsufficientSolAmount: "Insufficient SOL for this purchase.",
  InsufficientTokenBalance: "Not enough tokens to sell.",
  InsufficientReserve: "Insufficient reserve in bonding curve.",
  CurveNotActive: "This token is no longer active.",
  MathOverflow: "Math overflow error.",
  InvalidTreasury: "Invalid treasury.",
  InvalidEpoch: "Invalid epoch.",
  ExcessiveInitialLiquidity: "Initial liquidity too high.",
  InsufficientInitialLiquidity: "Initial liquidity below minimum.",
  SlippageExceeded: "Price moved — try again with higher slippage tolerance.",
  CreatorVestingLocked: "Your tokens are locked for Year 1.",
  SellImpactExceeded: "Sell would impact price > 5% — reduce amount.",
  CreatorSellCooldown: "Cooldown active — wait 30 days between sells.",
  PoolDepleted: "Pool depleted — no more tokens available.",
  UnauthorizedCreator: "Only the creator can perform this action.",
  CpiGuard: "Transaction blocked — bots not allowed.",
  EngagementExpired: "Engagement data expired — sync again this month.",
  InsufficientEngagement: "Not enough engagement this month to claim rewards.",
  UnauthorizedOracle: "Unauthorized oracle call.",
  ZeroAmount: "Amount must be greater than zero.",
  ZeroPurchaseAmount: "Purchase amount must be greater than zero.",
  PriceCalculationZero: "Amount too small — price would be zero.",
  FeeOverflow: "Fee calculation error.",
};
