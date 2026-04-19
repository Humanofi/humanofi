// ========================================
// Humanofi — Drops API
// ========================================
// GET  /api/drops/[mint]           → List drops for a creator
// POST /api/drops/[mint]           → Create a drop (creator only)
//
// Drops v3.6:
//   - Paid exclusive content sold in SOL
//   - 15% protocol fee, 85% to creator
//   - Unlocked after token reaches 100 unique holders
//   - Content encrypted on Supabase Storage

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import crypto from "crypto";

const DROPS_PROTOCOL_FEE_BPS = 1500; // 15%
const BPS_DENOMINATOR = 10000;
const MIN_DROP_PRICE_LAMPORTS = 1_000_000;     // ~$0.0002 — prevents spam
const MAX_DROP_PRICE_LAMPORTS = 100_000_000_000; // 100 SOL

// ─── GET: List drops for a creator ───
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    // Check if drops are unlocked for this creator
    const { data: creator } = await supabase
      .from("creator_tokens")
      .select("drops_unlocked, holder_count, wallet_address")
      .eq("mint_address", mint)
      .single();

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    // Get drops (exclude sensitive fields: content_path, encrypt_key)
    const { data: drops, error } = await supabase
      .from("exclusive_drops")
      .select(`
        id, title, description, content_type, preview_url,
        price_lamports, max_buyers, buyer_count, tier, tier_min_tokens,
        total_revenue, is_active, created_at
      `)
      .eq("creator_mint", mint)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Optionally check if the authenticated user has purchased each drop
    const auth = await verifyRequest(request);
    let purchasedDropIds: string[] = [];
    if (auth.authenticated && auth.walletAddress) {
      const { data: purchases } = await supabase
        .from("drop_purchases")
        .select("drop_id")
        .eq("buyer_wallet", auth.walletAddress)
        .eq("creator_mint", mint)
        .eq("verified", true);

      purchasedDropIds = (purchases || []).map((p: { drop_id: string }) => p.drop_id);
    }

    // Enrich drops with purchase status
    const enrichedDrops = (drops || []).map((drop: Record<string, unknown>) => ({
      ...drop,
      purchased: purchasedDropIds.includes(drop.id as string),
    }));

    // Count real holders from token_holders table (live, not cached)
    const { count: liveHolderCount } = await supabase
      .from("token_holders")
      .select("*", { count: "exact", head: true })
      .eq("mint_address", mint)
      .gt("balance", 0);

    // Fallback: count distinct buyers from trades table if token_holders is empty
    let realHolderCount = liveHolderCount ?? 0;
    if (realHolderCount === 0) {
      const { data: buyers } = await supabase
        .from("trades")
        .select("wallet_address")
        .eq("mint_address", mint)
        .eq("trade_type", "buy");
      if (buyers) {
        const uniqueBuyers = new Set(buyers.map((b: { wallet_address: string }) => b.wallet_address));
        realHolderCount = uniqueBuyers.size;
      }
    }
    // Also always at least use the cached value as a floor
    realHolderCount = Math.max(realHolderCount, creator.holder_count ?? 0);

    return NextResponse.json({
      drops: enrichedDrops,
      drops_unlocked: creator.drops_unlocked || realHolderCount >= 100,
      holder_count: realHolderCount,
      holders_needed: Math.max(0, 100 - realHolderCount),
    });
  } catch (error) {
    console.error("[Drops] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch drops" }, { status: 500 });
  }
}

// ─── POST: Create a drop (creator only) ───
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Auth required
  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress) {
    return NextResponse.json(
      { error: auth.error || "Authentication required" },
      { status: 401 }
    );
  }

  try {
    // Verify caller is the creator of this token
    const { data: creator } = await supabase
      .from("creator_tokens")
      .select("wallet_address, drops_unlocked, holder_count")
      .eq("mint_address", mint)
      .single();

    if (!creator) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    if (creator.wallet_address !== auth.walletAddress) {
      return NextResponse.json(
        { error: "Only the token creator can create drops" },
        { status: 403 }
      );
    }

    // Check drops are unlocked (100 holders)
    if (!creator.drops_unlocked) {
      return NextResponse.json(
        {
          error: "Drops are locked — your token needs 100 unique holders to unlock drops",
          holder_count: creator.holder_count,
          holders_needed: Math.max(0, 100 - (creator.holder_count || 0)),
        },
        { status: 403 }
      );
    }

    // Parse body
    const body = await request.json();
    const {
      title,
      description,
      content_type,
      preview_url,
      content_path,     // Path in Supabase Storage (already uploaded)
      price_lamports,
      max_buyers,
      tier,
      tier_min_tokens,
    } = body;

    // Validate required fields
    if (!title?.trim() || !content_path?.trim()) {
      return NextResponse.json(
        { error: "title and content_path are required" },
        { status: 400 }
      );
    }

    if (!price_lamports || price_lamports < MIN_DROP_PRICE_LAMPORTS) {
      return NextResponse.json(
        { error: `Minimum price is ${MIN_DROP_PRICE_LAMPORTS} lamports` },
        { status: 400 }
      );
    }

    if (price_lamports > MAX_DROP_PRICE_LAMPORTS) {
      return NextResponse.json(
        { error: `Maximum price is ${MAX_DROP_PRICE_LAMPORTS} lamports` },
        { status: 400 }
      );
    }

    // Generate encryption key for this drop
    const encryptKey = crypto.randomBytes(32).toString("hex");

    // Insert drop
    const { data: drop, error } = await supabase
      .from("exclusive_drops")
      .insert({
        creator_mint: mint,
        creator_wallet: auth.walletAddress,
        title: title.trim().slice(0, 120),
        description: (description || "").trim().slice(0, 2000),
        content_type: content_type || "document",
        preview_url: preview_url || null,
        content_path,
        encrypt_key: encryptKey,
        price_lamports,
        max_buyers: max_buyers || null,
        tier: tier || "all_holders",
        tier_min_tokens: tier_min_tokens || 0,
      })
      .select("id, title, price_lamports, created_at")
      .single();

    if (error) {
      console.error("[Drops] Insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log creator activity
    await supabase.from("creator_activity").insert({
      creator_mint: mint,
      action_type: "drop",
    });

    console.log(`[Drops] ✅ Created drop "${title}" for ${mint.slice(0, 8)}... | ${price_lamports} lamports`);

    return NextResponse.json({
      success: true,
      drop,
      protocol_fee_bps: DROPS_PROTOCOL_FEE_BPS,
    });
  } catch (error) {
    console.error("[Drops] POST error:", error);
    return NextResponse.json({ error: "Failed to create drop" }, { status: 500 });
  }
}
