// ========================================
// Humanofi — Protocol Interaction Hook (v3.7)
// ========================================
// High-level hook wrapping all Anchor instructions
// with proper PDA derivation, error handling, and toast notifications.
//
// v3.7 changes:
//   - Merit Reward REMOVED: buyer gets 100% of tokens
//   - Founder Buy: creator gets tokens at P₀ during creation
//   - Holder buy fees: 3% creator vault + 1% protocol + 1% depth (5%)
//   - Holder sell fees: 1% creator vault + 3% protocol + 1% depth (5%)
//   - Creator sell: 5% protocol + 1% depth (6%, no self-fee)
//   - Removed creatorTokenAccount/protocolTokenAccount from buy

"use client";

import { useCallback } from "react";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { toast } from "sonner";
import { BN, AnchorProvider } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { usePrivy } from "@privy-io/react-auth";
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

function deriveCreatorFeeVaultPDA(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator_fees"), mint.toBuffer()],
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

function deriveProtocolConfigPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol_config")],
    PROGRAM_ID
  );
}

/**
 * useHumanofi — Master hook for all protocol interactions.
 *
 * No wallet prop needed — uses useHumanofiProgram() internally.
 *
 * Usage:
 *   const { createToken, buyTokens, sellTokens, claimCreatorFees, connected } = useHumanofi();
 */
export function useHumanofi() {
  const { program, connection, publicKey, walletAddress, connected } = useHumanofiProgram();
  const { getAccessToken } = usePrivy();

  // ─── CREATE TOKEN ───
  const createToken = useCallback(
    async (params: {
      name: string;
      symbol: string;
      uri: string; // metadata JSON URL (contains image, etc.)
      initialLiquidity: number; // in lamports
      treasury: PublicKey;
      preInstructions?: import("@solana/web3.js").TransactionInstruction[];
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
      const [creatorFeeVault] = deriveCreatorFeeVaultPDA(mint.publicKey);
      const [protocolVault] = deriveProtocolVaultPDA(mint.publicKey);
      const [protocolConfig] = deriveProtocolConfigPDA();

      // v3.6: creatorTokenAccount + treasury needed for Founder Buy
      const creatorTokenAccount = getAssociatedTokenAddressSync(
        mint.publicKey,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      let builder = program.methods
        .createToken(
          params.name,
          params.symbol,
          params.uri,
          new BN(params.initialLiquidity)
        )
        .accountsStrict({
          creator: publicKey,
          mint: mint.publicKey,
          config: protocolConfig,
          bondingCurve,
          creatorVault,
          creatorFeeVault,
          protocolVault,
          creatorTokenAccount,
          treasury: params.treasury,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        });

      // Add pre-instructions (e.g., Humanofi creation fee transfer)
      if (params.preInstructions && params.preInstructions.length > 0) {
        builder = builder.preInstructions(params.preInstructions);
      }

      // Build transaction manually to avoid double-send with Phantom/Privy
      const tx = await builder.transaction();

      const conn = program.provider.connection;
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // The mint keypair must sign first (it's a new account being created)
      tx.partialSign(mint);

      // Then the wallet signs via Privy adapter (does NOT auto-send)
      const signedTx = await (program.provider as AnchorProvider).wallet.signTransaction(tx);

      // Send raw — we control the send, no double
      const txPromise = conn.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      }).then(async (sig) => {
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        return sig;
      });

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
      treasury: PublicKey;
      minTokensOut?: number; // slippage protection (0 = no check)
    }) => {
      if (!program || !publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      const lamports = Math.floor(params.solAmount * LAMPORTS_PER_SOL);
      const [bondingCurve] = deriveBondingCurvePDA(params.mint);
      const [creatorFeeVault] = deriveCreatorFeeVaultPDA(params.mint);
      const [purchaseLimiter] = derivePurchaseLimiterPDA(publicKey, params.mint);
      const [protocolConfig] = deriveProtocolConfigPDA();

      const buyerTokenAccount = getAssociatedTokenAddressSync(
        params.mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // Build transaction manually to avoid double-send with Phantom/Privy
      const tx = await program.methods
        .buy(
          new BN(lamports),
          new BN(params.minTokensOut || 0)
        )
        .accountsStrict({
          buyer: publicKey,
          mint: params.mint,
          config: protocolConfig,
          bondingCurve,
          creatorFeeVault,
          purchaseLimiter,
          buyerTokenAccount,
          treasury: params.treasury,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      // Set recent blockhash and fee payer
      const conn = program.provider.connection;
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Sign via Privy wallet adapter (does NOT auto-send)
      const signedTx = await (program.provider as AnchorProvider).wallet.signTransaction(tx);

      // Send raw — we control the send, no double
      const txPromise = conn.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      }).then(async (sig) => {
        // Wait for confirmation
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        return sig;
      });

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

      // ── DEBUG: Log wallet info ──
      console.log("[Humanofi] SELL DEBUG — wallet:", publicKey.toBase58());
      console.log("[Humanofi] SELL DEBUG — mint:", params.mint.toBase58());
      console.log("[Humanofi] SELL DEBUG — tokenAmount:", params.tokenAmount);
      console.log("[Humanofi] SELL DEBUG — creatorWallet:", params.creatorWallet.toBase58());

      const [bondingCurve] = deriveBondingCurvePDA(params.mint);
      const [creatorFeeVault] = deriveCreatorFeeVaultPDA(params.mint);
      const [protocolConfig] = deriveProtocolConfigPDA();

      const sellerTokenAccount = getAssociatedTokenAddressSync(
        params.mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // ── DEBUG: Check token balance before selling ──
      try {
        const tokenBalance = await program.provider.connection.getTokenAccountBalance(sellerTokenAccount);
        console.log("[Humanofi] SELL DEBUG — Token balance:", tokenBalance.value.uiAmountString, "raw:", tokenBalance.value.amount);
        console.log("[Humanofi] SELL DEBUG — Trying to sell:", params.tokenAmount, "tokens (raw)");
        if (Number(tokenBalance.value.amount) < params.tokenAmount) {
          console.error("[Humanofi] SELL DEBUG — ⚠️ INSUFFICIENT TOKENS! Has:", tokenBalance.value.amount, "Wants:", params.tokenAmount);
          toast.error(`Insufficient tokens. You have ${tokenBalance.value.uiAmountString} tokens.`);
          return null;
        }
      } catch (balErr) {
        console.error("[Humanofi] SELL DEBUG — Failed to check token balance (ATA may not exist):", balErr);
        toast.error("No token account found — you may not hold this token.");
        return null;
      }

      // Check if seller is creator → include creator_vault
      const isCreator = publicKey.equals(params.creatorWallet);
      const [creatorVaultPda] = deriveCreatorVaultPDA(params.mint);

      console.log("[Humanofi] SELL DEBUG — isCreator:", isCreator);
      console.log("[Humanofi] SELL DEBUG — PDAs:", {
        bondingCurve: bondingCurve.toBase58(),
        creatorFeeVault: creatorFeeVault.toBase58(),
        sellerTokenAccount: sellerTokenAccount.toBase58(),
        protocolConfig: protocolConfig.toBase58(),
      });

      // Build transaction manually to avoid double-send with Phantom/Privy
      const tx = await program.methods
        .sell(
          new BN(params.tokenAmount),
          new BN(params.minSolOut || 0)
        )
        .accountsStrict({
          seller: publicKey,
          mint: params.mint,
          config: protocolConfig,
          bondingCurve,
          creatorFeeVault,
          creatorVault: isCreator ? creatorVaultPda : (null as unknown as PublicKey),
          sellerTokenAccount,
          creatorWallet: params.creatorWallet,
          treasury: params.treasury,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      // Set recent blockhash and fee payer
      const conn = program.provider.connection;
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      console.log("[Humanofi] SELL DEBUG — blockhash:", blockhash);

      // Sign via Privy wallet adapter (does NOT auto-send)
      console.log("[Humanofi] SELL DEBUG — requesting wallet signature...");
      const signedTx = await (program.provider as AnchorProvider).wallet.signTransaction(tx);
      console.log("[Humanofi] SELL DEBUG — tx signed, sending raw...");

      // Send raw — we control the send, no double
      const txPromise = conn.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      }).then(async (sig) => {
        console.log("[Humanofi] SELL DEBUG — tx sent, sig:", sig);
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        console.log("[Humanofi] SELL DEBUG — tx confirmed!");
        return sig;
      }).catch((sendErr) => {
        // Extract detailed logs from SendTransactionError
        console.error("[Humanofi] SELL DEBUG — sendRawTransaction FAILED:");
        console.error("[Humanofi] SELL DEBUG — Error:", sendErr);
        if (sendErr && typeof sendErr === "object" && "logs" in sendErr) {
          console.error("[Humanofi] SELL DEBUG — Transaction logs:", (sendErr as { logs: string[] }).logs);
        }
        if (sendErr && typeof sendErr === "object" && "getLogs" in sendErr && typeof (sendErr as { getLogs: () => Promise<string[]> }).getLogs === "function") {
          (sendErr as { getLogs: () => Promise<string[]> }).getLogs().then((logs: string[]) => {
            console.error("[Humanofi] SELL DEBUG — Full logs:", logs);
          }).catch(() => {});
        }
        throw sendErr;
      });

      toast.promise(txPromise, {
        loading: "Selling tokens...",
        success: (sig) => `Sold! Tx: ${sig.slice(0, 8)}...`,
        error: (err) => `Sell failed: ${parseAnchorError(err)}`,
      });

      return txPromise;
    },
    [program, publicKey]
  );

  // ─── CLAIM CREATOR FEES ───
  const claimCreatorFees = useCallback(
    async (mint: PublicKey) => {
      if (!program || !publicKey) {
        toast.error("Connect your wallet first.");
        return null;
      }

      const [creatorFeeVault] = deriveCreatorFeeVaultPDA(mint);
      const [protocolConfig] = deriveProtocolConfigPDA();
      const [bondingCurve] = deriveBondingCurvePDA(mint);

      // Build transaction manually to avoid double-send with Phantom/Privy
      const tx = await program.methods
        .claimCreatorFees()
        .accountsStrict({
          creator: publicKey,
          mint,
          config: protocolConfig,
          bondingCurve,
          creatorFeeVault,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const conn = program.provider.connection;
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signedTx = await (program.provider as AnchorProvider).wallet.signTransaction(tx);

      const txPromise = conn.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      }).then(async (sig) => {
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        return sig;
      });

      toast.promise(txPromise, {
        loading: "Claiming accumulated fees...",
        success: (sig) => `Fees claimed! Tx: ${sig.slice(0, 8)}...`,
        error: (err) => `Claim failed: ${parseAnchorError(err)}`,
      });

      return txPromise;
    },
    [program, publicKey]
  );

  // ─── FETCH CREATOR FEE VAULT STATE ───
  const fetchCreatorFeeVault = useCallback(
    async (mint: PublicKey) => {
      if (!program) return null;
      const [pda] = deriveCreatorFeeVaultPDA(mint);
      try {
        const account = await (program.account as Record<string, { fetch: (addr: PublicKey) => Promise<unknown> }>)
          .creatorFeeVault.fetch(pda);
        return account;
      } catch (err) {
        console.error("[Humanofi] fetchCreatorFeeVault FAILED for", mint.toBase58(), err);
        return null;
      }
    },
    [program]
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

  // ─── CHECK-IN (engagement for inner circle — no on-chain component) ───
  const checkIn = useCallback(
    async (mint: string) => {
      if (!walletAddress) {
        toast.error("Connect your wallet first.");
        return null;
      }

      try {
        const headers: Record<string, string> = {};
        try {
          const token = await getAccessToken();
          if (token) headers["Authorization"] = `Bearer ${token}`;
        } catch { /* Privy not available */ }
        if (walletAddress) headers["x-wallet-address"] = walletAddress;

        const res = await fetch(`/api/inner-circle/${mint}/checkin`, {
          method: "POST",
          headers,
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

  return {
    createToken,
    buyTokens,
    sellTokens,
    claimCreatorFees,
    fetchCreatorFeeVault,
    checkIn,
    fetchBondingCurve,
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
    if (msg.includes("already been processed"))
      return "Transaction already confirmed — your wallet may show the result. Refresh if needed.";
    // Check simulation errors AFTER "already processed" (message can contain both)
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
  if (msg.includes("CreatorClaimCooldown"))
    return "Claim cooldown — wait 15 days between fee claims.";
  if (msg.includes("NoFeesToClaim"))
    return "No fees available to claim.";
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
  6016: "No fees available to claim.",
  6017: "Claim cooldown — wait 15 days between fee claims.",
  6018: "Fee calculation error.",
  6019: "Transfer blocked — Trade via Humanofi only.",
  6020: "Bots not allowed — only direct wallet transactions.",
  6021: "Invalid mint.",
  6022: "Token amount must be greater than zero.",
  6023: "Initial liquidity below minimum.",
  6024: "Initial liquidity above maximum.",
  6025: "Invalid treasury wallet.",
  6026: "Slippage exceeded — received less than minimum.",
  6027: "Protocol is frozen — all operations suspended.",
  6028: "Creator is suspended — sell and claim operations blocked.",
  6029: "Unauthorized — only the protocol authority can perform this action.",
};

// Map Anchor error names for "Error Code: XXX" format
const NAMED_ERROR_MAP: Record<string, string> = {
  InsufficientSolAmount: "Insufficient SOL for this purchase.",
  InsufficientTokenBalance: "Not enough tokens to sell.",
  InsufficientReserve: "Insufficient reserve in bonding curve.",
  CurveNotActive: "This token is no longer active.",
  MathOverflow: "Math overflow error.",
  InvalidTreasury: "Invalid treasury.",
  ExcessiveInitialLiquidity: "Initial liquidity too high.",
  InsufficientInitialLiquidity: "Initial liquidity below minimum.",
  SlippageExceeded: "Price moved — try again with higher slippage tolerance.",
  CreatorVestingLocked: "Your tokens are locked for Year 1.",
  SellImpactExceeded: "Sell would impact price > 5% — reduce amount.",
  CreatorSellCooldown: "Cooldown active — wait 30 days between sells.",
  CreatorClaimCooldown: "Claim cooldown — wait 15 days between fee claims.",
  NoFeesToClaim: "No fees available to claim.",
  PoolDepleted: "Pool depleted — no more tokens available.",
  UnauthorizedCreator: "Only the creator can perform this action.",
  CpiGuard: "Transaction blocked — bots not allowed.",
  ZeroAmount: "Amount must be greater than zero.",
  ZeroPurchaseAmount: "Purchase amount must be greater than zero.",
  PriceCalculationZero: "Amount too small — price would be zero.",
  FeeOverflow: "Fee calculation error.",
  ProtocolFrozen: "Protocol is frozen — all operations suspended.",
  CreatorSuspended: "Creator is suspended — sell and claim blocked.",
  UnauthorizedAdmin: "Unauthorized — only admin can do this.",
};
