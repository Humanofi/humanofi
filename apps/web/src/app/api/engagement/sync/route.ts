// ========================================
// Humanofi — Engagement Sync API (Oracle)
// ========================================
// POST /api/engagement/sync
//
// Reads engagement data from Supabase and writes it on-chain
// as an EngagementRecord PDA via the record_engagement instruction.
// This is called by the frontend before claim_rewards.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import idl from "@/idl/humanofi.json";

const PROGRAM_ID = new PublicKey(idl.address);
const ENGAGEMENT_EPOCH_DURATION = 2_592_000; // 30 days in seconds

/**
 * POST /api/engagement/sync
 * Body: { mint: string }
 *
 * Reads the holder's engagement from Supabase for the current epoch,
 * then writes it on-chain via the oracle (protocol authority keypair).
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Verify authenticated user
  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress) {
    return NextResponse.json({ error: auth.error || "Authentication required" }, { status: 401 });
  }
  const walletAddress = auth.walletAddress;

  try {
    const { mint } = await request.json();
    if (!mint) {
      return NextResponse.json({ error: "mint is required" }, { status: 400 });
    }

    // Calculate current epoch
    const epoch = Math.floor(Date.now() / 1000 / ENGAGEMENT_EPOCH_DURATION);

    // Get engagement data from Supabase
    const { data: engagement } = await supabase
      .from("holder_engagement")
      .select("total_actions, synced_onchain")
      .eq("wallet_address", walletAddress)
      .eq("mint_address", mint)
      .eq("epoch", epoch)
      .single();

    if (!engagement) {
      return NextResponse.json(
        { error: "No engagement found for this epoch", actions: 0, required: 4 },
        { status: 404 }
      );
    }

    if (engagement.total_actions < 4) {
      return NextResponse.json(
        {
          error: "Insufficient engagement",
          actions: engagement.total_actions,
          required: 4,
        },
        { status: 400 }
      );
    }

    // If already synced, return success
    if (engagement.synced_onchain) {
      return NextResponse.json({
        success: true,
        message: "Already synced on-chain",
        actions: engagement.total_actions,
      });
    }

    // Load oracle keypair from environment
    const oracleKeyStr = process.env.ORACLE_PRIVATE_KEY;
    if (!oracleKeyStr) {
      console.error("[Engagement Sync] ORACLE_PRIVATE_KEY not configured");
      return NextResponse.json(
        { error: "Oracle not configured" },
        { status: 503 }
      );
    }

    const oracleKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(oracleKeyStr))
    );

    // Build Anchor program
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const anchorWallet = {
      publicKey: oracleKeypair.publicKey,
      signTransaction: async <T,>(tx: T): Promise<T> => tx,
      signAllTransactions: async <T,>(tx: T): Promise<T> => tx,
    };
    const provider = new AnchorProvider(connection, anchorWallet as never, {
      commitment: "confirmed",
    });
    const program = new Program(idl as never, provider);

    // Derive PDA
    const mintPubkey = new PublicKey(mint);
    const holderPubkey = new PublicKey(walletAddress);
    const epochBytes = Buffer.alloc(8);
    epochBytes.writeBigUInt64LE(BigInt(epoch));

    const [engagementPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("engagement"),
        mintPubkey.toBuffer(),
        holderPubkey.toBuffer(),
        epochBytes,
      ],
      PROGRAM_ID
    );

    // Send record_engagement transaction
    const sig = await program.methods
      .recordEngagement(engagement.total_actions)
      .accountsStrict({
        authority: oracleKeypair.publicKey,
        holder: holderPubkey,
        mint: mintPubkey,
        engagementRecord: engagementPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracleKeypair])
      .rpc();

    // Mark as synced in Supabase
    await supabase
      .from("holder_engagement")
      .update({ synced_onchain: true, synced_at: new Date().toISOString() })
      .eq("wallet_address", walletAddress)
      .eq("mint_address", mint)
      .eq("epoch", epoch);

    return NextResponse.json({
      success: true,
      signature: sig,
      actions: engagement.total_actions,
      epoch,
    });
  } catch (error) {
    console.error("[Engagement Sync] Error:", error);
    return NextResponse.json(
      { error: "Failed to sync engagement on-chain" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/engagement/sync?wallet=...&mint=...
 * Returns the holder's engagement status for the current epoch.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");
  const mint = searchParams.get("mint");

  if (!wallet || !mint) {
    return NextResponse.json({ error: "wallet and mint required" }, { status: 400 });
  }

  const epoch = Math.floor(Date.now() / 1000 / ENGAGEMENT_EPOCH_DURATION);

  const { data } = await supabase
    .from("holder_engagement")
    .select("*")
    .eq("wallet_address", wallet)
    .eq("mint_address", mint)
    .eq("epoch", epoch)
    .single();

  return NextResponse.json({
    engagement: data || {
      reactions_count: 0,
      replies_count: 0,
      votes_count: 0,
      total_actions: 0,
      synced_onchain: false,
    },
    epoch,
    required: 4,
    qualified: (data?.total_actions || 0) >= 4,
  });
}
