// ========================================
// Humanofi — Public Posts API
// ========================================
// GET  /api/public-posts → ranked public feed
// POST /api/public-posts → create public post (1/day limit)

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

// ── HotScore Algorithm ──
const EMOJI_WEIGHTS: Record<string, number> = {
  "🔥": 1.0,
  "❤️": 1.2,
  "🚀": 1.5,
  "💡": 1.3,
  "🙏": 0.8,
  "👀": 0.5,
  "😅": 0.7,
  "😫": 0.6,
  "😱": 1.1,
  "🤌": 1.4,
};
const GRAVITY = 1.5;

function calculateHotScore(
  reactionsByEmoji: Record<string, number>,
  holderCount: number,
  createdAt: string
): number {
  // Weighted reactions
  let weightedReactions = 0;
  for (const [emoji, count] of Object.entries(reactionsByEmoji)) {
    weightedReactions += count * (EMOJI_WEIGHTS[emoji] || 1.0);
  }

  // Holder boost: log2(1 + holders) * 0.5
  const holderBoost = Math.log2(1 + holderCount) * 0.5;

  // Age in hours
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageHours = Math.max(0.1, ageMs / (1000 * 60 * 60));

  // HotScore formula
  return (weightedReactions + holderBoost) / Math.pow(ageHours + 2, GRAVITY);
}

// ── GET: Ranked public feed ──
export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 50);
  const creatorMint = searchParams.get("creator"); // Optional: filter by creator
  const offset = (page - 1) * limit;

  // Get wallet for user reactions
  const walletAddress = request.headers.get("x-wallet-address") || null;

  try {
    let query = supabase
      .from("public_posts")
      .select(`*, creator_tokens!inner(display_name, avatar_url, category)`)
      .order("hot_score", { ascending: false })
      .range(offset, offset + limit - 1);

    if (creatorMint) {
      query = query.eq("creator_mint", creatorMint);
    }

    const { data: posts, error } = await query;
    if (error) return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });

    // Fetch reactions + holder counts in parallel
    const postIds = (posts || []).map((p) => p.id);
    const creatorMints = [...new Set((posts || []).map((p) => p.creator_mint))];
    let reactions: Record<string, Record<string, number>> = {};
    let userReactions: Record<string, string[]> = {};
    let holderCounts: Record<string, number> = {};

    if (postIds.length > 0) {
      const [{ data: allReactions }, { data: holders }] = await Promise.all([
        supabase.from("public_post_reactions").select("post_id, emoji, wallet_address").in("post_id", postIds),
        creatorMints.length > 0
          ? supabase.from("token_holders").select("mint_address").in("mint_address", creatorMints).gt("balance", 0)
          : Promise.resolve({ data: [] }),
      ]);

      (allReactions || []).forEach((r) => {
        if (!reactions[r.post_id]) reactions[r.post_id] = {};
        reactions[r.post_id][r.emoji] = (reactions[r.post_id][r.emoji] || 0) + 1;

        if (walletAddress && r.wallet_address === walletAddress) {
          if (!userReactions[r.post_id]) userReactions[r.post_id] = [];
          userReactions[r.post_id].push(r.emoji);
        }
      });

      (holders || []).forEach((h: { mint_address: string }) => {
        holderCounts[h.mint_address] = (holderCounts[h.mint_address] || 0) + 1;
      });
    }

    // Enrich posts
    const enriched = (posts || []).map((p) => ({
      ...p,
      reactions: reactions[p.id] || {},
      userReactions: userReactions[p.id] || [],
      holderCount: holderCounts[p.creator_mint] || 0,
    }));

    return NextResponse.json({ posts: enriched, page, hasMore: (posts || []).length === limit });
  } catch (error) {
    console.error("Public feed error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST: Create public post (1/day limit) ──
export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { content, mediaUrls } = await request.json();
  if (!content?.trim())
    return NextResponse.json({ error: "Content is required" }, { status: 400 });

  if (content.trim().length > 500)
    return NextResponse.json({ error: "Content must be 500 characters or less" }, { status: 400 });

  try {
    // 1. Verify user is a creator
    const { data: creator } = await supabase
      .from("creator_tokens")
      .select("mint_address")
      .eq("wallet_address", auth.walletAddress)
      .single();

    if (!creator) return NextResponse.json({ error: "Only creators can post publicly" }, { status: 403 });

    // 2. Check 1/day limit (sliding 24h window)
    const twentyFourHoursAgo = new Date(Date.now() - 86400000).toISOString();

    const { data: recentPosts } = await supabase
      .from("public_posts")
      .select("id, created_at")
      .eq("creator_mint", creator.mint_address)
      .gte("created_at", twentyFourHoursAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentPosts && recentPosts.length >= 1) {
      const lastPostedAt = new Date(recentPosts[0].created_at).getTime();
      const nextPostAt = new Date(lastPostedAt + 86400000).toISOString();
      return NextResponse.json({
        error: "You've already posted in the last 24 hours. Try again later!",
        nextPostAt,
      }, { status: 429 });
    }

    // 3. Get holder count for initial HotScore
    const { count: holderCount } = await supabase
      .from("token_holders")
      .select("*", { count: "exact", head: true })
      .eq("mint_address", creator.mint_address)
      .gt("balance", 0);

    // 4. Calculate initial HotScore
    const initialScore = calculateHotScore({}, holderCount || 0, new Date().toISOString());

    // 5. Insert
    const { data: newPost, error } = await supabase
      .from("public_posts")
      .insert({
        creator_mint: creator.mint_address,
        content: content.trim(),
        media_urls: mediaUrls || [],
        hot_score: initialScore,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: "Failed to create post" }, { status: 500 });

    // Log creator activity (for Activity Score)
    await supabase.from("creator_activity").insert({
      creator_mint: creator.mint_address,
      action_type: "public_post",
    });

    return NextResponse.json({ post: newPost }, { status: 201 });
  } catch (error) {
    console.error("Public post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
