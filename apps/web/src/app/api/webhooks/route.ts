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

    // Update sender balance (decrease)
    if (fromUserAccount) {
      // First try to get current balance
      const { data: sender } = await supabase
        .from("token_holders")
        .select("balance")
        .eq("wallet_address", fromUserAccount)
        .eq("mint_address", mint)
        .single();

      const newBalance = Math.max(0, (sender?.balance || 0) - tokenAmount);

      await supabase
        .from("token_holders")
        .upsert(
          {
            wallet_address: fromUserAccount,
            mint_address: mint,
            balance: newBalance,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "wallet_address,mint_address" }
        );
    }

    // Update receiver balance (increase)
    if (toUserAccount) {
      const { data: receiver } = await supabase
        .from("token_holders")
        .select("balance")
        .eq("wallet_address", toUserAccount)
        .eq("mint_address", mint)
        .single();

      const newBalance = (receiver?.balance || 0) + tokenAmount;

      await supabase
        .from("token_holders")
        .upsert(
          {
            wallet_address: toUserAccount,
            mint_address: mint,
            balance: newBalance,
            first_bought_at: receiver ? undefined : new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "wallet_address,mint_address" }
        );
    }

    // ── Price Snapshot ──
    // Log a price snapshot for chart history after each trade.
    // We read the bonding curve state from accountData if available,
    // otherwise compute from holder count as a proxy.
    try {
      const { count: holderCount } = await supabase
        .from("token_holders")
        .select("*", { count: "exact", head: true })
        .eq("mint_address", mint)
        .gt("balance", 0);

      // Try to extract bonding curve data from account changes
      const accountData = event.accountData || [];
      let priceSol = 0;
      let supply = 0;
      let solReserve = 0;

      // Look for bonding curve PDA in account data
      for (const acc of accountData) {
        if (acc.tokenBalanceChanges) {
          for (const change of acc.tokenBalanceChanges) {
            if (change.mint === mint) {
              supply = Math.abs(change.rawTokenAmount?.tokenAmount || 0);
            }
          }
        }
        if (acc.nativeBalanceChange && Math.abs(acc.nativeBalanceChange) > 0) {
          solReserve = Math.abs(acc.nativeBalanceChange);
          // Estimate price from SOL exchanged / tokens exchanged
          if (supply > 0) {
            priceSol = solReserve / supply;
          }
        }
      }

      // If we couldn't extract price, use a simple supply-based estimate
      if (priceSol === 0 && holderCount) {
        // Base price + slope * approximate supply
        priceSol = 0.0001 + (holderCount * 0.00001);
      }

      if (priceSol > 0) {
        await supabase.from("price_snapshots").insert({
          mint_address: mint,
          price_sol: priceSol,
          supply,
          sol_reserve: solReserve,
          holder_count: holderCount || 0,
          source: "trade",
        });
      }
    } catch (snapshotErr) {
      console.warn("[Helius] Price snapshot failed:", snapshotErr);
      // Non-blocking — don't fail the webhook
    }
  }
}
