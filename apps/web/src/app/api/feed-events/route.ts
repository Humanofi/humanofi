// ========================================
// Humanofi — Feed Events API
// ========================================
// GET /api/feed-events → market signal stream
// Params: type, mint, limit, after (cursor)

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");       // optional: 'trade', 'whale_alert', etc.
  const mint = searchParams.get("mint");       // optional: filter by mint
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const after = searchParams.get("after");     // cursor-based pagination

  try {
    let query = supabase
      .from("feed_events")
      .select(`
        id, event_type, mint_address, wallet_address, data, created_at,
        creator_tokens!inner(display_name, avatar_url, category)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq("event_type", type);
    }
    if (mint) {
      query = query.eq("mint_address", mint);
    }
    if (after) {
      query = query.lt("created_at", after);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[FeedEvents] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      events: data || [],
      hasMore: (data || []).length === limit,
    });

    // Note: wallet display names are resolved client-side via identicon lib
    // to avoid expensive JOINs on every ticker refresh
  } catch (error) {
    console.error("[FeedEvents] Error:", error);
    return NextResponse.json({ error: "Failed to fetch feed events" }, { status: 500 });
  }
}
