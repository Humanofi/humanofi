// ========================================
// Humanofi — Engagement Sync API (DEPRECATED)
// ========================================
// 
// ⚠️ V2: The on-chain record_engagement instruction has been removed.
// Holder rewards no longer exist (legal compliance).
//
// This API now only returns engagement stats from Supabase (GET).
// The POST endpoint (which wrote on-chain) is disabled.
// Engagement tracking in Supabase remains active for activity scores
// and Inner Circle features, but is no longer tied to on-chain rewards.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

const ENGAGEMENT_EPOCH_DURATION = 2_592_000; // 30 days in seconds

/**
 * POST /api/engagement/sync — DISABLED
 * 
 * Previously synced engagement data on-chain for claim_rewards.
 * Now returns a 410 Gone since holder rewards have been removed in V2.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Engagement sync is no longer needed. Holder rewards have been removed in V2.",
      info: "Creators now earn 3% fees via CreatorFeeVault (claimable every 15 days).",
    },
    { status: 410 }
  );
}

/**
 * GET /api/engagement/sync?wallet=...&mint=...
 * Returns the holder's engagement status for the current epoch.
 * Still active for activity scores and UI display.
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
    },
    epoch,
  });
}
