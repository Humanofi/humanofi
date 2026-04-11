// ========================================
// Humanofi — Inner Circle Posts API
// ========================================
// GET  /api/inner-circle/[mint]/posts  → Get posts (if holder)
// POST /api/inner-circle/[mint]/posts  → Create post (if creator)

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

/**
 * GET /api/inner-circle/[mint]/posts
 * Returns inner circle posts for a given token mint.
 * Access is gated: user must hold tokens to read.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Verify auth (Privy JWT or fallback)
  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress) {
    return NextResponse.json(
      { error: auth.error || "Authentication required", locked: true },
      { status: 401 }
    );
  }
  const walletAddress = auth.walletAddress;

  // ── ACCESS CHECK: On-chain first, Supabase cache as fallback ──

  // 1. Check if user is the creator (fast DB check)
  const { data: creator } = await supabase
    .from("creator_tokens")
    .select("wallet_address")
    .eq("mint_address", mint)
    .eq("wallet_address", walletAddress)
    .single();

  const isCreator = !!creator;
  let holderBalance = isCreator ? Infinity : 0;

  if (!isCreator) {
    // 2. Verify token holdings ON-CHAIN (source of truth)
    let hasAccess = false;

    try {
      const { verifyTokenHolder } = await import("@/lib/solana/verify");
      const result = await verifyTokenHolder(walletAddress, mint);
      hasAccess = result.isHolder;
      holderBalance = result.balance;
    } catch (err) {
      console.warn("[InnerCircle] On-chain verification failed, falling back to cache:", err);
      // 3. Fallback to Supabase cache if RPC fails
      const { data: holding } = await supabase
        .from("token_holders")
        .select("balance")
        .eq("wallet_address", walletAddress)
        .eq("mint_address", mint)
        .gt("balance", 0)
        .single();
      hasAccess = !!holding;
      if (holding) holderBalance = holding.balance;
    }

    if (!hasAccess) {
      return NextResponse.json(
        {
          error: "You must hold tokens to access the Inner Circle",
          locked: true,
        },
        { status: 403 }
      );
    }
  }

  // Fetch posts
  const url = new URL(request.url);
  const includeArchived = url.searchParams.get("include_archived") === "true";

  let postsQuery = supabase
    .from("inner_circle_posts")
    .select(`
      *,
      inner_circle_reactions(count),
      inner_circle_replies(count)
    `)
    .eq("creator_mint", mint)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!includeArchived) {
    postsQuery = postsQuery.eq("is_archived", false);
  }

  const { data: posts, error } = await postsQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch the current user's votes and rsvps for these posts
  const postIds = posts?.map((p) => p.id) || [];
  let userVotes: Record<string, number> = {};
  let userRsvps: Record<string, string> = {};

  if (postIds.length > 0) {
    const [{ data: votes }, { data: rsvps }] = await Promise.all([
      supabase.from("poll_votes").select("post_id, option_index").in("post_id", postIds).eq("wallet_address", walletAddress),
      supabase.from("event_rsvps").select("post_id, status").in("post_id", postIds).eq("wallet_address", walletAddress)
    ]);

    if (votes) votes.forEach(v => userVotes[v.post_id] = v.option_index);
    if (rsvps) rsvps.forEach(r => userRsvps[r.post_id] = r.status);
  }

  return NextResponse.json({ posts: posts || [], isCreator, holderBalance, userVotes, userRsvps });
}

/**
 * POST /api/inner-circle/[mint]/posts
 * Create a new inner circle post (creator only).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress) {
    return NextResponse.json({ error: auth.error || "Authentication required" }, { status: 401 });
  }
  const walletAddress = auth.walletAddress;

  // Verify the user is the creator of this token
  const { data: creator } = await supabase
    .from("creator_tokens")
    .select("wallet_address")
    .eq("mint_address", mint)
    .eq("wallet_address", walletAddress)
    .single();

  if (!creator) {
    return NextResponse.json(
      { error: "Only the creator can post in this Inner Circle" },
      { status: 403 }
    );
  }

  try {
    const { content, imageUrls, mediaUrls, post_type, metadata } = await request.json();

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Post content is required" },
        { status: 400 }
      );
    }

    // Create the post
    const { data: post, error } = await supabase
      .from("inner_circle_posts")
      .insert({
        creator_mint: mint,
        content: content.trim(),
        image_urls: imageUrls || [],
        media_urls: mediaUrls || [],
        post_type: post_type || 'text',
        metadata: metadata || {}
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log creator activity (for Activity Score)
    const activityType = post_type === 'event' ? 'event' 
      : post_type === 'poll' ? 'poll' 
      : 'post';
    await supabase.from("creator_activity").insert({
      creator_mint: mint,
      action_type: activityType,
    });

    return NextResponse.json({ success: true, post });
  } catch (error) {
    console.error("Inner circle post error:", error);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}
