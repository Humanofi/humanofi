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
    // Fetch mints the user holds via cached token_holders (with balance)
    const { data: holdings } = await supabase
      .from("token_holders")
      .select("mint_address, balance")
      .eq("wallet_address", walletAddress)
      .gt("balance", 0);

    const heldMints = new Set(
      (holdings || []).map((h: { mint_address: string }) => h.mint_address)
    );

    // Build balance map (in whole tokens, not micro-units)
    const balanceByMint: Record<string, number> = {};
    (holdings || []).forEach((h: { mint_address: string; balance: number }) => {
      balanceByMint[h.mint_address] = h.balance / 1e6;
    });

    // Fallback: also check trades table for mints user has bought
    // This ensures feed works even if Helius webhook hasn't synced token_holders yet
    const { data: boughtMints } = await supabase
      .from("trades")
      .select("mint_address")
      .eq("wallet_address", walletAddress)
      .eq("trade_type", "buy");

    if (boughtMints) {
      boughtMints.forEach((t: { mint_address: string }) => heldMints.add(t.mint_address));
    }

    // Also include the user's own token if they are a creator
    const { data: creator } = await supabase
      .from("creator_tokens")
      .select("mint_address")
      .eq("wallet_address", walletAddress)
      .single();

    const isCreator = !!creator;

    if (creator?.mint_address) {
      heldMints.add(creator.mint_address);
      balanceByMint[creator.mint_address] = Infinity; // Creator always has access
    }

    const mintList = Array.from(heldMints);

    if (mintList.length === 0) {
      return NextResponse.json({ posts: [], userVotes: {}, userRsvps: {} });
    }

    console.log("[Feed] mintList:", mintList);

    // Fetch latest posts (same query as inner-circle — NO join)
    const { data: posts, error: postsError } = await supabase
      .from("inner_circle_posts")
      .select(`
        *,
        inner_circle_replies(count)
      `)
      .in("creator_mint", mintList)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(100);

    console.log("[Feed] postsError:", postsError);
    console.log("[Feed] posts count:", posts?.length, "types:", posts?.map(p => p.post_type));

    if (postsError) {
      return NextResponse.json({ error: "Failed to fetch feed", detail: postsError.message }, { status: 500 });
    }

    // Fetch creator info separately (avoids JOIN issues)
    const uniqueMints = [...new Set((posts || []).map(p => p.creator_mint))];
    let creatorMap: Record<string, { display_name: string; avatar_url: string | null }> = {};
    if (uniqueMints.length > 0) {
      const { data: creators } = await supabase
        .from("creator_tokens")
        .select("mint_address, display_name, avatar_url")
        .in("mint_address", uniqueMints);
      if (creators) {
        creators.forEach(c => { creatorMap[c.mint_address] = { display_name: c.display_name, avatar_url: c.avatar_url }; });
      }
    }

    // Attach creator_tokens info to each post
    const enrichedPosts = (posts || []).map(p => ({
      ...p,
      creator_tokens: creatorMap[p.creator_mint] || { display_name: "Unknown", avatar_url: null },
    }));

    // Fetch user's poll votes and event RSVPs for these posts
    const postIds = (posts || []).map((p) => p.id);
    let userVotes: Record<string, number> = {};
    let userRsvps: Record<string, string> = {};

    if (postIds.length > 0) {
      const [{ data: votes }, { data: rsvps }, { data: allReactions }] = await Promise.all([
        supabase.from("poll_votes").select("post_id, option_index").in("post_id", postIds).eq("wallet_address", walletAddress),
        supabase.from("event_rsvps").select("post_id, status").in("post_id", postIds).eq("wallet_address", walletAddress),
        supabase.from("inner_circle_reactions").select("post_id, emoji, wallet_address").in("post_id", postIds),
      ]);
      if (votes) votes.forEach((v) => (userVotes[v.post_id] = v.option_index));
      if (rsvps) rsvps.forEach((r) => (userRsvps[r.post_id] = r.status));

      // Aggregate reactions per post + identify current user's reactions
      const reactionsMap: Record<string, Record<string, number>> = {};
      const userReactionsMap: Record<string, string[]> = {};
      (allReactions || []).forEach((r: { post_id: string; emoji: string; wallet_address: string }) => {
        if (!reactionsMap[r.post_id]) reactionsMap[r.post_id] = {};
        reactionsMap[r.post_id][r.emoji] = (reactionsMap[r.post_id][r.emoji] || 0) + 1;
        if (r.wallet_address === walletAddress) {
          if (!userReactionsMap[r.post_id]) userReactionsMap[r.post_id] = [];
          userReactionsMap[r.post_id].push(r.emoji);
        }
      });

      // Inject reactions into enriched posts
      enrichedPosts.forEach((p: Record<string, unknown>) => {
        p.reactions = reactionsMap[p.id as string] || {};
        p.userReactions = userReactionsMap[p.id as string] || [];
      });
    }

    return NextResponse.json({ posts: enrichedPosts, userVotes, userRsvps, balanceByMint, isCreator });
  } catch (error) {
    console.error("Feed error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
