// ========================================
// Humanofi — Helius Webhook Handler
// ========================================
// POST /api/webhooks
//
// Receives enhanced transaction events from Helius
// and syncs token holder balances to Supabase.
//
// Helius Config:
//   Network: devnet
//   Webhook Type: enhanced
//   Transaction Type(s): TRANSFER (or Any)
//   Webhook URL: https://your-domain.com/api/webhooks
//   Authentication Header: Bearer <HELIUS_WEBHOOK_SECRET>
//   Account Addresses: <your Anchor program ID>

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

/**
 * Verify the Helius webhook auth header.
 * Helius sends the Authentication Header you configured
 * in the dashboard as a standard Authorization header.
 */
function verifyAuth(request: NextRequest): boolean {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[Helius] HELIUS_WEBHOOK_SECRET not set — skipping auth");
    return true; // Allow in dev
  }

  const authHeader = request.headers.get("authorization") || "";
  return authHeader === `Bearer ${secret}`;
}

/**
 * POST /api/webhooks
 *
 * Receives enhanced transaction events from Helius and syncs to Supabase.
 */
export async function POST(request: NextRequest) {
  try {
    // Verify auth header
    if (!verifyAuth(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const events = await request.json();
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const txList = Array.isArray(events) ? events : [events];

    for (const event of txList) {
      await processEvent(supabase, event);
    }

    return NextResponse.json({ success: true, processed: txList.length });
  } catch (error) {
    console.error("[Helius] Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Process a single Helius enhanced transaction event.
 *
 * Enhanced format docs: https://docs.helius.dev/webhooks-and-websockets/enhanced-webhooks
 *
 * Key fields:
 * - type: "TRANSFER", "SWAP", "NFT_SALE", etc.
 * - tokenTransfers[]: { mint, fromUserAccount, toUserAccount, tokenAmount }
 * - accountData[]: full account state changes
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processEvent(supabase: any, event: any) {
  const { type, tokenTransfers, signature } = event;

  console.log(`[Helius] Processing ${type} tx: ${signature}`);

  if (!tokenTransfers || tokenTransfers.length === 0) return;

  for (const transfer of tokenTransfers) {
    const { mint, fromUserAccount, toUserAccount, tokenAmount } = transfer;

    if (!mint) continue;

    // Update sender balance (decrease) — atomic operation
    if (fromUserAccount) {
      await supabase.rpc("update_holder_balance", {
        p_wallet: fromUserAccount,
        p_mint: mint,
        p_delta: -tokenAmount,
      });
    }

    // Update receiver balance (increase) — atomic operation
    if (toUserAccount) {
      await supabase.rpc("update_holder_balance", {
        p_wallet: toUserAccount,
        p_mint: mint,
        p_delta: tokenAmount,
      });
    }

    // ── Price Snapshot ──
    // Log a price snapshot for chart history after each trade.
    // Price snapshot: only record holder count from Helius webhook.
    // Accurate price snapshots are recorded by POST /api/price-snapshot
    // (called from the frontend after each trade with x/y from bonding curve).
    // The webhook doesn't have access to x/y, so any price calculation here
    // would be inaccurate (solReserve/supply ≠ x/y spot price).
    try {
      const { count: holderCount } = await supabase
        .from("token_holders")
        .select("*", { count: "exact", head: true })
        .eq("mint_address", mint)
        .gt("balance", 0);

      // Update holder count on creator_tokens for quick access
      if (holderCount !== null) {
        await supabase
          .from("creator_tokens")
          .update({ holder_count: holderCount })
          .eq("mint_address", mint);
      }
    } catch (snapshotErr) {
      console.warn("[Helius] Holder count update failed:", snapshotErr);
      // Non-blocking — don't fail the webhook
    }
  }
}
