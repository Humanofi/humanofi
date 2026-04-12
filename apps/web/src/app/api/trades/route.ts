// ========================================
// Humanofi — Trades API (On-Chain Verified)
// ========================================
// POST: Record a trade with TX signature + auth verification
// GET:  Return trade history for chart (OHLCV-like data)
//
// Security:
//   1. Privy JWT or wallet header authentication
//   2. TX exists on-chain and did not fail
//   3. TX signer matches authenticated wallet
//   4. tx_signature is UNIQUE — no duplicates

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { Connection } from "@solana/web3.js";
import { verifyRequest } from "@/lib/auth/verifyRequest";

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

// ─── POST: Record a verified trade ───
export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // ── AUTHENTICATION ──
  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress) {
    return NextResponse.json(
      { error: auth.error || "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const {
      mintAddress,
      tradeType,      // 'buy' | 'sell'
      walletAddress,
      solAmount,       // lamports
      tokenAmount,     // base units
      priceSol,        // spot price after trade
      txSignature,     // Solana TX signature
      xAfter,
      yAfter,
      kAfter,
      solReserve,
      supplyPublic,
    } = body;

    // Validate required fields
    if (!mintAddress || !tradeType || !walletAddress || !txSignature || priceSol === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!["buy", "sell"].includes(tradeType)) {
      return NextResponse.json({ error: "tradeType must be 'buy' or 'sell'" }, { status: 400 });
    }

    // ── WALLET MATCH: Authenticated wallet must match trade wallet ──
    if (auth.walletAddress !== walletAddress) {
      console.warn(
        `[Trades] Wallet mismatch: auth=${auth.walletAddress?.slice(0, 8)} vs body=${walletAddress?.slice(0, 8)}`
      );
      return NextResponse.json(
        { error: "Wallet mismatch — you can only record your own trades" },
        { status: 403 }
      );
    }

    // ── VERIFY TX ON-CHAIN ──
    let slot = 0;
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      const tx = await connection.getTransaction(txSignature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        // TX not finalized yet — retry instead of silently accepting
        return NextResponse.json(
          { error: "Transaction not found on-chain yet — please retry in a few seconds" },
          { status: 202 }
        );
      }

      slot = tx.slot;

      // Verify the TX did not fail
      if (tx.meta?.err) {
        return NextResponse.json({ error: "Transaction failed on-chain" }, { status: 400 });
      }

      // ── VERIFY SIGNER: TX fee payer must match authenticated wallet ──
      const accountKeys = tx.transaction.message.getAccountKeys();
      const feePayer = accountKeys.get(0)?.toBase58();
      if (feePayer && feePayer !== walletAddress) {
        console.warn(
          `[Trades] Signer mismatch: tx_signer=${feePayer?.slice(0, 8)} vs wallet=${walletAddress?.slice(0, 8)}`
        );
        return NextResponse.json(
          { error: "Transaction signer does not match your wallet" },
          { status: 403 }
        );
      }
    } catch (err) {
      console.warn("[Trades] TX verification error:", err);
      // If RPC is down, reject rather than accept unverified trades
      return NextResponse.json(
        { error: "Could not verify transaction on-chain — please retry" },
        { status: 503 }
      );
    }

    // ── INSERT TRADE ──
    const { error: insertError } = await supabase
      .from("trades")
      .insert({
        mint_address: mintAddress,
        trade_type: tradeType,
        wallet_address: walletAddress,
        sol_amount: solAmount || 0,
        token_amount: tokenAmount || 0,
        price_sol: priceSol,
        tx_signature: txSignature,
        slot,
        x_after: xAfter || 0,
        y_after: yAfter || 0,
        k_after: kAfter || 0,
        sol_reserve: solReserve || 0,
        supply_public: supplyPublic || 0,
      });

    if (insertError) {
      // Duplicate tx_signature → trade already recorded
      if (insertError.code === "23505") {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      console.error("[Trades] Insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log(`[Trades] ✅ ${tradeType.toUpperCase()} recorded | ${txSignature.slice(0, 12)}... | ${priceSol} SOL`);
    return NextResponse.json({ ok: true, slot });

  } catch (error) {
    console.error("[Trades] Error:", error);
    return NextResponse.json({ error: "Failed to record trade" }, { status: 500 });
  }
}

// ─── GET: Trade history for chart ───
export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const mint = searchParams.get("mint");
  const limit = Math.min(parseInt(searchParams.get("limit") || "200"), 500);
  const after = searchParams.get("after"); // cursor-based pagination

  if (!mint) {
    return NextResponse.json({ error: "mint param required" }, { status: 400 });
  }

  try {
    let query = supabase
      .from("trades")
      .select("trade_type, price_sol, sol_amount, token_amount, tx_signature, slot, created_at")
      .eq("mint_address", mint)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (after) {
      query = query.gt("created_at", after);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ trades: data || [] });
  } catch (error) {
    console.error("[Trades] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 });
  }
}
