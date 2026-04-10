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
  }
}
