// ========================================
// Humanofi — Drop Purchase API
// ========================================
// POST /api/drops/[mint]/purchase
//
// Flow:
//   1. Buyer sends SOL to creator wallet (via frontend)
//   2. Buyer submits tx_signature here
//   3. API verifies tx on-chain (amount, recipient, not failed)
//   4. Records purchase in DB
//   5. Returns download token
//
// Security:
//   - TX must exist on-chain and not be failed
//   - TX signer must match authenticated wallet
//   - TX recipient must be the creator wallet
//   - No double purchases (unique constraint on drop_id + buyer_wallet)
//   - 15% protocol fee deducted

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import { Connection } from "@solana/web3.js";

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DROPS_PROTOCOL_FEE_BPS = 1500;
const BPS_DENOMINATOR = 10000;
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Auth required
  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress) {
    return NextResponse.json(
      { error: auth.error || "Authentication required" },
      { status: 401 }
    );
  }
  const buyerWallet = auth.walletAddress;

  try {
    const { drop_id, tx_signature } = await request.json();

    if (!drop_id || !tx_signature) {
      return NextResponse.json(
        { error: "drop_id and tx_signature are required" },
        { status: 400 }
      );
    }

    // ── 1. Fetch the drop ──
    const { data: drop } = await supabase
      .from("exclusive_drops")
      .select("*, creator_wallet")
      .eq("id", drop_id)
      .eq("creator_mint", mint)
      .eq("is_active", true)
      .single();

    if (!drop) {
      return NextResponse.json({ error: "Drop not found or inactive" }, { status: 404 });
    }

    // ── 2. Check supply limit ──
    if (drop.max_buyers && drop.buyer_count >= drop.max_buyers) {
      return NextResponse.json({ error: "Drop sold out" }, { status: 410 });
    }

    // ── 3. Check already purchased ──
    const { data: existing } = await supabase
      .from("drop_purchases")
      .select("id")
      .eq("drop_id", drop_id)
      .eq("buyer_wallet", buyerWallet)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "You already purchased this drop", already_purchased: true },
        { status: 409 }
      );
    }

    // ── 4. Check tier access ──
    if (drop.tier !== "public") {
      const { data: holding } = await supabase
        .from("token_holders")
        .select("balance")
        .eq("wallet_address", buyerWallet)
        .eq("mint_address", mint)
        .gt("balance", 0)
        .single();

      if (!holding) {
        return NextResponse.json(
          { error: "You must hold tokens to purchase this drop" },
          { status: 403 }
        );
      }

      if (drop.tier === "top_holders" && holding.balance < drop.tier_min_tokens) {
        return NextResponse.json(
          {
            error: `You need at least ${drop.tier_min_tokens / 1e6} tokens to purchase this drop`,
            required: drop.tier_min_tokens,
            current: holding.balance,
          },
          { status: 403 }
        );
      }
    }

    // ── 5. Verify TX on-chain ──
    const connection = new Connection(RPC_URL, "confirmed");
    let tx;
    try {
      tx = await connection.getTransaction(tx_signature, {
        maxSupportedTransactionVersion: 0,
      });
    } catch (err) {
      console.warn("[Drops] TX fetch error:", err);
      return NextResponse.json(
        { error: "Could not verify transaction — please retry" },
        { status: 503 }
      );
    }

    if (!tx) {
      return NextResponse.json(
        { error: "Transaction not found on-chain yet — please retry in a few seconds" },
        { status: 202 }
      );
    }

    if (tx.meta?.err) {
      return NextResponse.json({ error: "Transaction failed on-chain" }, { status: 400 });
    }

    // Verify signer matches buyer
    const accountKeys = tx.transaction.message.getAccountKeys();
    const feePayer = accountKeys.get(0)?.toBase58();
    if (feePayer !== buyerWallet) {
      return NextResponse.json(
        { error: "Transaction signer does not match your wallet" },
        { status: 403 }
      );
    }

    // Verify SOL transfer amount (check pre/post balances)
    // The creator wallet should have received at least price_lamports worth of SOL
    const creatorKeyIndex = Array.from(
      { length: accountKeys.length },
      (_, i) => accountKeys.get(i)?.toBase58()
    ).findIndex(k => k === drop.creator_wallet);

    if (creatorKeyIndex === -1) {
      return NextResponse.json(
        { error: "Creator wallet not found in transaction — wrong recipient?" },
        { status: 400 }
      );
    }

    const preBalance = tx.meta?.preBalances?.[creatorKeyIndex] || 0;
    const postBalance = tx.meta?.postBalances?.[creatorKeyIndex] || 0;
    const received = postBalance - preBalance;

    // Allow 1% tolerance for rounding
    const expectedCreatorAmount = Math.floor(drop.price_lamports * (BPS_DENOMINATOR - DROPS_PROTOCOL_FEE_BPS) / BPS_DENOMINATOR);
    if (received < expectedCreatorAmount * 0.99) {
      return NextResponse.json(
        {
          error: "Insufficient payment amount",
          expected: expectedCreatorAmount,
          received,
        },
        { status: 400 }
      );
    }

    // ── 6. Record purchase ──
    const protocolFee = Math.ceil(drop.price_lamports * DROPS_PROTOCOL_FEE_BPS / BPS_DENOMINATOR);
    const creatorRevenue = drop.price_lamports - protocolFee;

    const { error: insertError } = await supabase
      .from("drop_purchases")
      .insert({
        drop_id: drop_id,
        buyer_wallet: buyerWallet,
        creator_mint: mint,
        tx_signature,
        amount_paid: drop.price_lamports,
        protocol_fee: protocolFee,
        creator_revenue: creatorRevenue,
        verified: true,
      });

    if (insertError) {
      // Duplicate tx_signature → already recorded
      if (insertError.code === "23505") {
        return NextResponse.json({ success: true, already_recorded: true });
      }
      console.error("[Drops] Purchase insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Update drop stats
    await supabase.rpc("record_drop_purchase", {
      p_drop_id: drop_id,
      p_amount: drop.price_lamports,
      p_protocol_fee: protocolFee,
      p_creator_revenue: creatorRevenue,
    });

    console.log(`[Drops] ✅ Purchase | drop=${drop.title} | buyer=${buyerWallet.slice(0, 8)}... | ${drop.price_lamports} lamports`);

    return NextResponse.json({
      success: true,
      purchase: {
        drop_id,
        tx_signature,
        amount_paid: drop.price_lamports,
        protocol_fee: protocolFee,
        creator_revenue: creatorRevenue,
      },
    });
  } catch (error) {
    console.error("[Drops] Purchase error:", error);
    return NextResponse.json({ error: "Failed to process purchase" }, { status: 500 });
  }
}
