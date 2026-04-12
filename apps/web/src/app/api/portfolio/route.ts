// ========================================
// Humanofi — Portfolio API
// ========================================
// GET /api/portfolio?wallet=...          → all positions for a wallet
// GET /api/portfolio?wallet=...&mint=... → single position for a specific token
//
// Returns holder positions enriched with:
//  - Balance (from token_holders, synced via Helius webhook)
//  - P&L data (from trades aggregation)
//  - Creator metadata (from creator_tokens)
//
// Zero on-chain calls. Price enrichment done client-side.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");
  const mint = searchParams.get("mint"); // Optional: filter to a single token

  if (!wallet) {
    return NextResponse.json({ error: "wallet param required" }, { status: 400 });
  }

  try {
    // ── Separate parallel queries (no fragile JOINs) ──
    // 1. Holdings (balance from Helius webhook)
    let holdingsQ = supabase
      .from("token_holders")
      .select("wallet_address, mint_address, balance, first_bought_at, updated_at")
      .eq("wallet_address", wallet)
      .gt("balance", 0)
      .order("balance", { ascending: false });
    if (mint) holdingsQ = holdingsQ.eq("mint_address", mint);

    // 2. Trades (for P&L calculation)
    let tradesQ = supabase
      .from("trades")
      .select("mint_address, trade_type, sol_amount, token_amount, created_at")
      .eq("wallet_address", wallet);
    if (mint) tradesQ = tradesQ.eq("mint_address", mint);

    // Run both in parallel
    const [holdingsResult, tradesResult] = await Promise.all([holdingsQ, tradesQ]);

    if (holdingsResult.error) {
      console.error("[Portfolio] Holdings error:", holdingsResult.error);
      return NextResponse.json({ error: "Failed to fetch holdings" }, { status: 500 });
    }

    const holdings = holdingsResult.data || [];
    if (holdings.length === 0) {
      return NextResponse.json({ wallet, positions: [], total_positions: 0 });
    }

    // 3. Creator metadata (separate query by mints we hold)
    const heldMints = holdings.map((h: { mint_address: string }) => h.mint_address);
    const { data: creators } = await supabase
      .from("creator_tokens")
      .select("mint_address, display_name, avatar_url, category, token_color, activity_score, activity_status")
      .in("mint_address", heldMints);

    // Index creators by mint for O(1) lookup
    const creatorMap: Record<string, Record<string, unknown>> = {};
    for (const c of (creators || [])) {
      creatorMap[c.mint_address] = c;
    }

    // ── Aggregate trades by mint ──
    interface TradeAgg {
      sol_invested: number;
      sol_recovered: number;
      tokens_bought: number;
      tokens_sold: number;
      buy_count: number;
      sell_count: number;
      last_trade_at: string | null;
    }

    const tradesByMint: Record<string, TradeAgg> = {};
    for (const trade of (tradesResult.data || [])) {
      const key = trade.mint_address;
      if (!tradesByMint[key]) {
        tradesByMint[key] = {
          sol_invested: 0, sol_recovered: 0,
          tokens_bought: 0, tokens_sold: 0,
          buy_count: 0, sell_count: 0,
          last_trade_at: null,
        };
      }
      const agg = tradesByMint[key];
      if (trade.trade_type === "buy") {
        agg.sol_invested += trade.sol_amount;
        agg.tokens_bought += trade.token_amount;
        agg.buy_count++;
      } else {
        agg.sol_recovered += trade.sol_amount;
        agg.tokens_sold += trade.token_amount;
        agg.sell_count++;
      }
      if (!agg.last_trade_at || trade.created_at > agg.last_trade_at) {
        agg.last_trade_at = trade.created_at;
      }
    }

    // ── Merge: holdings + trades + creators ──
    const positions = holdings.map((h: { mint_address: string; balance: number; first_bought_at: string }) => {
      const trades = tradesByMint[h.mint_address] || {
        sol_invested: 0, sol_recovered: 0,
        tokens_bought: 0, tokens_sold: 0,
        buy_count: 0, sell_count: 0,
        last_trade_at: null,
      };
      const creator = creatorMap[h.mint_address] || {};

      const avg_entry_price = trades.tokens_bought > 0
        ? trades.sol_invested / trades.tokens_bought
        : 0;

      return {
        mint_address: h.mint_address,
        balance: h.balance,
        first_bought_at: h.first_bought_at,
        sol_invested: trades.sol_invested,
        sol_recovered: trades.sol_recovered,
        tokens_bought: trades.tokens_bought,
        tokens_sold: trades.tokens_sold,
        buy_count: trades.buy_count,
        sell_count: trades.sell_count,
        avg_entry_price,
        last_trade_at: trades.last_trade_at || h.first_bought_at,
        display_name: (creator.display_name as string) || "Unknown",
        avatar_url: (creator.avatar_url as string) || null,
        category: (creator.category as string) || "other",
        token_color: (creator.token_color as string) || "blue",
        activity_score: (creator.activity_score as number) || 0,
        activity_status: (creator.activity_status as string) || "moderate",
      };
    });

    return NextResponse.json({
      wallet,
      positions,
      total_positions: positions.length,
    });
  } catch (error) {
    console.error("[Portfolio] Error:", error);
    return NextResponse.json({ error: "Failed to fetch portfolio" }, { status: 500 });
  }
}
