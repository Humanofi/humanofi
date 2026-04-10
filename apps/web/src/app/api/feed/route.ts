// ========================================
// Humanofi — Global Feed API (V2)
// ========================================
// GET /api/feed → aggregated timeline with full media, replies, votes

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress) {
    return NextResponse.json({ error: auth.error || "Authentication required" }, { status: 401 });
  }
  const walletAddress = auth.walletAddress;

  try {
    // Fetch all mints the user holds
    const { data: holdings, error: holdingError } = await supabase
      .from("token_holders")
      .select("mint_address")
      .eq("wallet_address", walletAddress)
      .gt("balance", 0);

    if (holdingError) {
      return NextResponse.json({ error: "Failed to fetch holdings" }, { status: 500 });
    }

    const heldMints = (holdings || []).map((h: { mint_address: string }) => h.mint_address);

    // Also include the user's own token if they are a creator
    const { data: creator } = await supabase
      .from("creator_tokens")
      .select("mint_address")
      .eq("wallet_address", walletAddress)
      .single();

    if (creator && creator.mint_address && !heldMints.includes(creator.mint_address)) {
      heldMints.push(creator.mint_address);
    }

    if (heldMints.length === 0) {
      return NextResponse.json({ posts: [], userVotes: {}, userRsvps: {} });
    }

    // Fetch latest posts with creator info, reply count
    const { data: posts, error: postsError } = await supabase
      .from("inner_circle_posts")
      .select(`
        *,
        creator_tokens!inner(display_name, avatar_url),
        inner_circle_replies(count)
      `)
      .in("creator_mint", heldMints)
      .order("created_at", { ascending: false })
      .limit(100);

    if (postsError) {
      return NextResponse.json({ error: "Failed to fetch feed" }, { status: 500 });
    }

    // Fetch user's poll votes and event RSVPs for these posts
    const postIds = (posts || []).map((p) => p.id);
    let userVotes: Record<string, number> = {};
    let userRsvps: Record<string, string> = {};

    if (postIds.length > 0) {
      const [{ data: votes }, { data: rsvps }] = await Promise.all([
        supabase.from("poll_votes").select("post_id, option_index").in("post_id", postIds).eq("wallet_address", walletAddress),
        supabase.from("event_rsvps").select("post_id, status").in("post_id", postIds).eq("wallet_address", walletAddress),
      ]);
      if (votes) votes.forEach((v) => (userVotes[v.post_id] = v.option_index));
      if (rsvps) rsvps.forEach((r) => (userRsvps[r.post_id] = r.status));
    }

    return NextResponse.json({ posts: posts || [], userVotes, userRsvps });
  } catch (error) {
    console.error("Feed error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
