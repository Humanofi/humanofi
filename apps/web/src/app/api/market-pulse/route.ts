// ========================================
// Humanofi — Market Pulse API
// ========================================
// GET /api/market-pulse → aggregated 24h market stats
// Replaces the client-side hacking in MarketPulse.tsx
// Returns: trades count, SOL volume, active tokens, top creator

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

export async function GET() {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Aggregate trade stats (server-side — no limit issue)
    const { data: trades } = await supabase
      .from("feed_events")
      .select("mint_address, data, created_at")
      .eq("event_type", "trade")
      .gte("created_at", twentyFourHoursAgo);

    const tradeList = trades || [];
    let totalVolume = 0;
    const creatorMap: Record<string, { count: number; mint: string }> = {};

    tradeList.forEach((t) => {
      const d = (t.data || {}) as Record<string, unknown>;
      totalVolume += Number(d.sol_amount || 0) / 1e9;

      if (!creatorMap[t.mint_address]) {
        creatorMap[t.mint_address] = { count: 0, mint: t.mint_address };
      }
      creatorMap[t.mint_address].count++;
    });

    // 2. Find top creator by trade count
    const sorted = Object.values(creatorMap).sort((a, b) => b.count - a.count);
    const topMint = sorted[0]?.mint || null;

    let topCreator: {
      mint_address: string;
      display_name: string;
      avatar_url: string | null;
      tradeCount: number;
    } | null = null;

    if (topMint) {
      const { data: creator } = await supabase
        .from("creator_tokens")
        .select("mint_address, display_name, avatar_url")
        .eq("mint_address", topMint)
        .single();

      if (creator) {
        topCreator = {
          mint_address: creator.mint_address,
          display_name: creator.display_name,
          avatar_url: creator.avatar_url,
          tradeCount: sorted[0].count,
        };
      }
    }

    return NextResponse.json({
      totalTrades24h: tradeList.length,
      totalVolume24h: totalVolume,
      activeCreators: Object.keys(creatorMap).length,
      topCreator,
    });
  } catch (error) {
    console.error("[MarketPulse API] Error:", error);
    return NextResponse.json({ error: "Failed to fetch market pulse" }, { status: 500 });
  }
}
