// ========================================
// Humanofi — Holder Ranks API (Batch)
// ========================================
// GET /api/holder-ranks?wallet=xxx
// Returns all holder ranks for a wallet in a single query.
// Eliminates the N+1 problem in FeedSidebar.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet param required" }, { status: 400 });
  }

  try {
    // Get all positions where user has balance > 0 with rank info
    const { data: holdings } = await supabase
      .from("token_holders")
      .select("mint_address, holder_rank, is_early_believer, balance")
      .eq("wallet_address", wallet)
      .gt("balance", 0)
      .order("balance", { ascending: false })
      .limit(10);

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({ ranks: [] });
    }

    // Get creator names for these mints
    const mints = holdings.map(h => h.mint_address);
    const { data: creators } = await supabase
      .from("creator_tokens")
      .select("mint_address, display_name, holder_count")
      .in("mint_address", mints);

    const creatorMap: Record<string, { name: string; total: number }> = {};
    (creators || []).forEach(c => {
      creatorMap[c.mint_address] = {
        name: c.display_name,
        total: c.holder_count || 0,
      };
    });

    const ranks = holdings.map(h => ({
      mint: h.mint_address,
      name: creatorMap[h.mint_address]?.name || "Unknown",
      rank: h.holder_rank || 0,
      total: creatorMap[h.mint_address]?.total || 0,
      is_early_believer: h.is_early_believer || false,
    })).filter(r => r.rank > 0); // Only include ranked positions

    return NextResponse.json({ ranks });
  } catch (error) {
    console.error("[HolderRanks] Error:", error);
    return NextResponse.json({ error: "Failed to fetch ranks" }, { status: 500 });
  }
}
