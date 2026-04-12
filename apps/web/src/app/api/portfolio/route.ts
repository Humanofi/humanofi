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
    // ── 1. Fetch holdings with creator metadata ──
    // Balance comes from token_holders (Helius webhook = source of truth)
    let holdingsQuery = supabase
      .from("token_holders")
      .select(`
        wallet_address,
        mint_address,
        balance,
        first_bought_at,
        updated_at,
        creator_tokens!inner (
          display_name,
          avatar_url,
          category,
          token_color,
          activity_score,
          activity_status
        )
      `)
      .eq("wallet_address", wallet)
      .gt("balance", 0)
      .order("balance", { ascending: false });

    if (mint) {
      holdingsQuery = holdingsQuery.eq("mint_address", mint);
    }

    // ── 2. Fetch trade aggregates ──
    // P&L data: how much SOL invested, recovered, tokens bought
    let tradesQuery = supabase
      .from("trades")
      .select("mint_address, trade_type, sol_amount, token_amount, created_at")
      .eq("wallet_address", wallet);

    if (mint) {
      tradesQuery = tradesQuery.eq("mint_address", mint);
    }

    // Run both in parallel — fast
    const [holdingsResult, tradesResult] = await Promise.all([
      holdingsQuery,
      tradesQuery,
    ]);

    if (holdingsResult.error) {
      console.error("[Portfolio] Holdings error:", holdingsResult.error);
      return NextResponse.json({ error: "Failed to fetch holdings" }, { status: 500 });
    }

    // ── 3. Aggregate trades by mint (server-side merge) ──
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
          sol_invested: 0,
          sol_recovered: 0,
          tokens_bought: 0,
          tokens_sold: 0,
          buy_count: 0,
          sell_count: 0,
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

      // Track most recent trade
      if (!agg.last_trade_at || trade.created_at > agg.last_trade_at) {
        agg.last_trade_at = trade.created_at;
      }
    }

    // ── 4. Merge holdings + trade aggregates ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positions = (holdingsResult.data || []).map((h: any) => {
      const trades = tradesByMint[h.mint_address] || {
        sol_invested: 0,
        sol_recovered: 0,
        tokens_bought: 0,
        tokens_sold: 0,
        buy_count: 0,
        sell_count: 0,
        last_trade_at: null,
      };

      // Creator metadata (from JOIN)
      const creator = Array.isArray(h.creator_tokens) ? h.creator_tokens[0] : h.creator_tokens;

      // Average entry price: SOL per token (lamports/base unit)
      const avg_entry_price = trades.tokens_bought > 0
        ? trades.sol_invested / trades.tokens_bought
        : 0;

      return {
        mint_address: h.mint_address,
        // Balance (Helius webhook — source of truth)
        balance: h.balance,          // base units (6 decimals)
        first_bought_at: h.first_bought_at,
        // Trade history
        sol_invested: trades.sol_invested,     // lamports
        sol_recovered: trades.sol_recovered,   // lamports
        tokens_bought: trades.tokens_bought,   // base units
        tokens_sold: trades.tokens_sold,       // base units
        buy_count: trades.buy_count,
        sell_count: trades.sell_count,
        avg_entry_price,                       // lamports per base unit
        last_trade_at: trades.last_trade_at || h.first_bought_at,
        // Creator metadata
        display_name: creator?.display_name || "Unknown",
        avatar_url: creator?.avatar_url || null,
        category: creator?.category || "other",
        token_color: creator?.token_color || "blue",
        activity_score: creator?.activity_score || 0,
        activity_status: creator?.activity_status || "moderate",
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
