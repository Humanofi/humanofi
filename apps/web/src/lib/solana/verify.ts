// ========================================
// Humanofi — On-chain Verification (Server-side)
// ========================================
// Utility functions to verify on-chain state from API routes.
// This is the security backbone: ensures Supabase data
// always matches what's actually on the blockchain.

import { Connection, PublicKey } from "@solana/web3.js";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import idl from "@/idl/humanofi.json";

const PROGRAM_ID = new PublicKey(idl.address);

/**
 * Get a read-only Solana connection for server-side verification.
 * Uses the public RPC (no wallet needed for reads).
 */
export function getServerConnection(): Connection {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    "https://api.devnet.solana.com";
  return new Connection(rpcUrl, { commitment: "confirmed" });
}

/**
 * Get a read-only Anchor program (no wallet/signer needed).
 * Only used for reading account data.
 */
export function getReadOnlyProgram(connection: Connection) {
  // Minimal provider for read-only operations
  const provider = {
    connection,
    publicKey: PublicKey.default,
  };
  return new Program(idl as never, provider as unknown as AnchorProvider);
}

/**
 * Derive the BondingCurve PDA for a given mint.
 */
export function deriveBondingCurvePDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), mint.toBuffer()],
    PROGRAM_ID
  );
}

// ─── Verification Result Types ───

interface VerifyMintResult {
  valid: boolean;
  error?: string;
  creator?: string;
  mint?: string;
  bondingCurve?: string;
}

interface VerifyHolderResult {
  isHolder: boolean;
  balance: number;
  error?: string;
}

/**
 * Verify that a mint address is a valid Humanofi token
 * AND that the given wallet is its creator.
 *
 * Checks:
 * 1. The mint exists on-chain (Token-2022)
 * 2. The mint's authority is our bonding curve PDA
 * 3. The BondingCurve account data confirms the creator wallet
 *
 * @param mintAddress - The token mint address to verify
 * @param walletAddress - The wallet claiming to be the creator
 * @returns VerifyMintResult with valid=true if all checks pass
 */
export async function verifyHumanofiToken(
  mintAddress: string,
  walletAddress: string
): Promise<VerifyMintResult> {
  const connection = getServerConnection();

  let mintPubkey: PublicKey;
  try {
    mintPubkey = new PublicKey(mintAddress);
  } catch {
    return { valid: false, error: "Invalid mint address format" };
  }

  let walletPubkey: PublicKey;
  try {
    walletPubkey = new PublicKey(walletAddress);
  } catch {
    return { valid: false, error: "Invalid wallet address format" };
  }

  // ── STEP 1: Verify the mint exists on-chain (Token-2022) ──
  let mintInfo;
  try {
    mintInfo = await getMint(
      connection,
      mintPubkey,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
  } catch {
    return { valid: false, error: "Mint does not exist on-chain or is not a Token-2022 mint" };
  }

  // ── STEP 2: Verify the mint authority is our bonding curve PDA ──
  const [expectedBondingCurve] = deriveBondingCurvePDA(mintPubkey);

  if (!mintInfo.mintAuthority) {
    return { valid: false, error: "Mint has no authority (revoked)" };
  }

  if (!mintInfo.mintAuthority.equals(expectedBondingCurve)) {
    return {
      valid: false,
      error: "Mint authority is not the Humanofi bonding curve — this is not a Humanofi token",
    };
  }

  // ── STEP 3: Read the BondingCurve PDA and verify the creator ──
  const program = getReadOnlyProgram(connection);

  let bondingCurveData: { creator: PublicKey; mint: PublicKey };
  try {
    const account = await (
      program.account as Record<
        string,
        { fetch: (addr: PublicKey) => Promise<unknown> }
      >
    ).bondingCurve.fetch(expectedBondingCurve);
    bondingCurveData = account as { creator: PublicKey; mint: PublicKey };
  } catch {
    return { valid: false, error: "BondingCurve PDA not found — token may not be fully initialized" };
  }

  // Verify the creator field matches the claimed wallet
  if (!bondingCurveData.creator.equals(walletPubkey)) {
    return {
      valid: false,
      error: `Wallet ${walletAddress} is not the creator of this token. On-chain creator: ${bondingCurveData.creator.toBase58()}`,
    };
  }

  // Verify the mint field matches (extra safety)
  if (!bondingCurveData.mint.equals(mintPubkey)) {
    return { valid: false, error: "BondingCurve mint mismatch — data integrity error" };
  }

  return {
    valid: true,
    creator: walletAddress,
    mint: mintAddress,
    bondingCurve: expectedBondingCurve.toBase58(),
  };
}

/**
 * Verify if a wallet holds tokens of a given mint on-chain.
 * Used for Inner Circle gating.
 *
 * @param walletAddress - The holder's wallet
 * @param mintAddress - The token mint to check
 * @returns VerifyHolderResult with balance info
 */
export async function verifyTokenHolder(
  walletAddress: string,
  mintAddress: string
): Promise<VerifyHolderResult> {
  const connection = getServerConnection();

  let walletPubkey: PublicKey;
  let mintPubkey: PublicKey;

  try {
    walletPubkey = new PublicKey(walletAddress);
    mintPubkey = new PublicKey(mintAddress);
  } catch {
    return { isHolder: false, balance: 0, error: "Invalid address format" };
  }

  try {
    // Find all token accounts for this wallet + mint
    const accounts = await connection.getTokenAccountsByOwner(
      walletPubkey,
      { mint: mintPubkey, programId: TOKEN_2022_PROGRAM_ID }
    );

    if (accounts.value.length === 0) {
      return { isHolder: false, balance: 0 };
    }

    // Get balance from the first account (usually only one ATA)
    const tokenAccountPubkey = accounts.value[0].pubkey;
    const balanceResult = await connection.getTokenAccountBalance(tokenAccountPubkey);
    const balance = balanceResult.value.uiAmount || 0;

    return {
      isHolder: balance > 0,
      balance,
    };
  } catch (err) {
    console.error("[verifyTokenHolder] Error:", err);
    // Fallback: not a holder (fail-safe)
    return { isHolder: false, balance: 0, error: "RPC error — could not verify balance" };
  }
}
