// ========================================
// Humanofi — Inner Circle Check-in API
// ========================================
// POST /api/inner-circle/[mint]/checkin
//
// Allows holders to "check in" once per week to prove
// they're active, even if the creator hasn't posted.
// This prevents holders from being penalized for
// creator inactivity.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

const CHECKIN_COOLDOWN_HOURS = 24; // Min 24h between check-ins

/**
 * POST /api/inner-circle/[mint]/checkin
 * Record a check-in for engagement rewards.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress) {
    return NextResponse.json({ error: auth.error || "Authentication required" }, { status: 401 });
  }
  const walletAddress = auth.walletAddress;

  // Verify user is a holder (not just anyone)
  const { data: creator } = await supabase
    .from("creator_tokens")
    .select("wallet_address")
    .eq("mint_address", mint)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  const isCreator = creator.wallet_address === walletAddress;

  if (!isCreator) {
    const { data: holding } = await supabase
      .from("token_holders")
      .select("balance")
      .eq("wallet_address", walletAddress)
      .eq("mint_address", mint)
      .gt("balance", 0)
      .single();

    if (!holding) {
      return NextResponse.json(
        { error: "You must hold tokens to check in" },
        { status: 403 }
      );
    }
  }

  try {
    // Check cooldown — max 1 check-in per 24h per mint
    const { data: lastCheckin } = await supabase
      .from("holder_checkins")
      .select("created_at")
      .eq("wallet_address", walletAddress)
      .eq("mint_address", mint)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (lastCheckin) {
      const lastTime = new Date(lastCheckin.created_at).getTime();
      const cooldownMs = CHECKIN_COOLDOWN_HOURS * 60 * 60 * 1000;
      if (Date.now() - lastTime < cooldownMs) {
        const nextAvailable = new Date(lastTime + cooldownMs);
        return NextResponse.json(
          {
            error: "Check-in cooldown active",
            nextAvailable: nextAvailable.toISOString(),
          },
          { status: 429 }
        );
      }
    }

    // Record check-in
    const { error } = await supabase.from("holder_checkins").insert({
      wallet_address: walletAddress,
      mint_address: mint,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Track engagement
    const epoch = Math.floor(Date.now() / 1000 / 2_592_000);
    await supabase.rpc("increment_engagement", {
      p_wallet_address: walletAddress,
      p_mint_address: mint,
      p_epoch: epoch,
      p_action_type: "checkin",
    });

    return NextResponse.json({ success: true, action: "checked_in" });
  } catch (error) {
    console.error("Check-in error:", error);
    return NextResponse.json({ error: "Failed to check in" }, { status: 500 });
  }
}
