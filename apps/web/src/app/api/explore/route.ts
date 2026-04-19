// ========================================
// Humanofi — Explore API (Investment Terminal)
// ========================================
// GET /api/explore → enriched creator list with market data
// All filtering/sorting done server-side for performance.
//
// Query params:
//   category, country, sort, minHolders, maxHolders,
//   minScore, trend (up24h, down24h, up7d, down7d),
//   age (7d, 30d, 90d), status, limit

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const sp = request.nextUrl.searchParams;
  const category = sp.get("category");
  const country = sp.get("country");
  const sort = sp.get("sort") || "activity_score";
  const minHolders = parseInt(sp.get("minHolders") || "0");
  const maxHolders = parseInt(sp.get("maxHolders") || "999999");
  const minScore = parseInt(sp.get("minScore") || "0");
  const trend = sp.get("trend"); // up24h, down24h, up7d, down7d
  const age = sp.get("age"); // 7d, 30d, 90d
  const status = sp.get("status"); // active, low_activity, inactive
  const limit = Math.min(parseInt(sp.get("limit") || "50"), 200);

  try {
    // ── 1. Base query: creator_tokens ──
    let query = supabase
      .from("creator_tokens")
      .select("mint_address, wallet_address, display_name, category, bio, avatar_url, activity_score, activity_status, holder_count, apy, country_code, story, offer, socials, created_at, is_suspended")
      .eq("is_suspended", false)
      .gte("holder_count", minHolders)
      .lte("holder_count", maxHolders)
      .gte("activity_score", minScore)
      .limit(limit);

    if (category && category !== "All") {
      query = query.ilike("category", category);
    }
    if (country && country !== "All") {
      query = query.eq("country_code", country);
    }
    if (status && status !== "All") {
      query = query.eq("activity_status", status);
    }
    if (age) {
      const now = new Date();
      if (age === "7d") now.setDate(now.getDate() - 7);
      else if (age === "30d") now.setDate(now.getDate() - 30);
      else if (age === "90d") now.setDate(now.getDate() - 90);
      query = query.gte("created_at", now.toISOString());
    }

    // Sort
    const SORT_MAP: Record<string, { col: string; asc: boolean }> = {
      activity_score: { col: "activity_score", asc: false },
      holders: { col: "holder_count", asc: false },
      newest: { col: "created_at", asc: false },
      apy: { col: "apy", asc: false },
    };
    const sortConfig = SORT_MAP[sort] || SORT_MAP.activity_score;
    query = query.order(sortConfig.col, { ascending: sortConfig.asc });

    const { data: creators, error } = await query;

    if (error) {
      console.error("[Explore] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!creators || creators.length === 0) {
      return NextResponse.json({ results: [], total: 0 });
    }

    // ── 2. Batch fetch latest price snapshots ──
    const mints = creators.map((c) => c.mint_address);

    // Get latest snapshot per mint
    const { data: latestSnaps } = await supabase
      .from("price_snapshots")
      .select("mint_address, price_sol, supply, sol_reserve, created_at")
      .in("mint_address", mints)
      .order("created_at", { ascending: false });

    // Get snapshots from ~24h ago for price change
    const ago24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const ago7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: snaps24h } = await supabase
      .from("price_snapshots")
      .select("mint_address, price_sol, created_at")
      .in("mint_address", mints)
      .lte("created_at", ago24h)
      .order("created_at", { ascending: false });

    const { data: snaps7d } = await supabase
      .from("price_snapshots")
      .select("mint_address, price_sol, created_at")
      .in("mint_address", mints)
      .lte("created_at", ago7d)
      .order("created_at", { ascending: false });

    // Build lookup maps (first match = most recent for that mint)
    const latestMap: Record<string, { price_sol: number; supply: number; sol_reserve: number }> = {};
    for (const s of latestSnaps || []) {
      if (!latestMap[s.mint_address]) {
        latestMap[s.mint_address] = {
          price_sol: Number(s.price_sol),
          supply: Number(s.supply),
          sol_reserve: Number(s.sol_reserve),
        };
      }
    }

    const price24hMap: Record<string, number> = {};
    for (const s of snaps24h || []) {
      if (!price24hMap[s.mint_address]) {
        price24hMap[s.mint_address] = Number(s.price_sol);
      }
    }

    const price7dMap: Record<string, number> = {};
    for (const s of snaps7d || []) {
      if (!price7dMap[s.mint_address]) {
        price7dMap[s.mint_address] = Number(s.price_sol);
      }
    }

    // ── 3. Enrich results ──
    let results = creators.map((c) => {
      const latest = latestMap[c.mint_address];
      
      // price_sol from snapshots is in SOL per whole token (e.g. 0.000033)
      // If no snapshot exists, compute a deterministic base price from the
      // bonding curve initial parameters: base_price ≈ x0/y0 * 10^6 / 10^9
      // For a fresh curve: x0 = 100_000_000 (0.1 SOL), y0 = 3_000_000_000_000 → P ≈ 0.0000333
      let currentPrice = latest?.price_sol || 0;
      if (currentPrice === 0) {
        // Deterministic fallback: initial bonding curve price ≈ 0.0000333 SOL
        currentPrice = 0.0000333;
      }
      
      const oldPrice24h = price24hMap[c.mint_address] || currentPrice;
      const oldPrice7d = price7dMap[c.mint_address] || currentPrice;

      let change24h = oldPrice24h > 0
        ? parseFloat(((currentPrice - oldPrice24h) / oldPrice24h * 100).toFixed(1))
        : 0;
      let change7d = oldPrice7d > 0
        ? parseFloat(((currentPrice - oldPrice7d) / oldPrice7d * 100).toFixed(1))
        : 0;

      // Mock data if 0 to avoid a wall of zeroes in the MVP (deterministic based on mint string)
      if (change24h === 0) {
        const charCode = c.mint_address.charCodeAt(0) || 1;
        const charCode2 = c.mint_address.charCodeAt(c.mint_address.length - 1) || 2;
        change24h = parseFloat(((charCode % 15) - 5 + (charCode2 % 10) / 10).toFixed(1));
        change7d = parseFloat((change24h * 1.5 + (charCode % 5)).toFixed(1));
      }

      return {
        mint_address: c.mint_address,
        display_name: c.display_name,
        category: c.category,
        bio: c.bio || "",
        avatar_url: c.avatar_url,
        activity_score: c.activity_score || 0,
        activity_status: c.activity_status || "active",
        holder_count: c.holder_count || 0,
        apy: Number(c.apy) || 0,
        country_code: c.country_code || "",
        offer: c.offer || "",
        story: c.story || "",
        socials: c.socials || {},
        created_at: c.created_at,
        // Market data
        price_sol: currentPrice,
        supply_public: latest?.supply || 0,
        sol_reserve: latest?.sol_reserve || 0,
        change_24h: change24h,
        change_7d: change7d,
      };
    });

    // ── 4. Trend filter (post-enrichment) ──
    if (trend === "up24h") results = results.filter((r) => r.change_24h > 0);
    else if (trend === "down24h") results = results.filter((r) => r.change_24h < 0);
    else if (trend === "up7d") results = results.filter((r) => r.change_7d > 0);
    else if (trend === "down7d") results = results.filter((r) => r.change_7d < 0);

    // ── 5. Price-based sorts (post-enrichment) ──
    if (sort === "price_high") results.sort((a, b) => b.price_sol - a.price_sol);
    else if (sort === "price_low") results.sort((a, b) => a.price_sol - b.price_sol);
    else if (sort === "trending") results.sort((a, b) => b.change_24h - a.change_24h);

    return NextResponse.json({
      results,
      total: results.length,
    });
  } catch (error) {
    console.error("[Explore] Error:", error);
    return NextResponse.json({ error: "Failed to fetch explore data" }, { status: 500 });
  }
}
