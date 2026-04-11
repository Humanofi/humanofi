import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

/**
 * GET /api/inner-circle/[mint]/stats24h
 * 
 * Returns aggregated stats for the last 24 hours:
 *   - reactions: inner circle + public post reactions
 *   - posts: inner circle + public posts  
 *   - views: sum of view_count on posts created by this creator (last 24h visitors)
 * 
 * Strategy for reactions: since reaction tables don't have creator_mint,
 * we first get the creator's post IDs, then count reactions on those posts.
 * This is 2 small queries instead of a broken JOIN.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ reactions: 0, posts: 0, views: 0 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ── 1. Inner Circle posts (last 24h + all post IDs for reactions) ──
  const { data: icPosts } = await supabase
    .from("inner_circle_posts")
    .select("id, created_at, view_count")
    .eq("creator_mint", mint);

  const icPostIds = (icPosts || []).map(p => p.id);
  const icPostsLast24h = (icPosts || []).filter(p => p.created_at >= since).length;
  
  // Sum all view_count for this creator's posts
  const totalViews = (icPosts || []).reduce((sum, p) => sum + (p.view_count || 0), 0);

  // ── 2. Public posts (last 24h + all post IDs for reactions) ──
  const { data: pubPosts } = await supabase
    .from("public_posts")
    .select("id, created_at")
    .eq("creator_mint", mint);

  const pubPostIds = (pubPosts || []).map(p => p.id);
  const pubPostsLast24h = (pubPosts || []).filter(p => p.created_at >= since).length;

  // ── 3. IC reactions on this creator's posts (last 24h) ──
  let icReactionCount = 0;
  if (icPostIds.length > 0) {
    const { count } = await supabase
      .from("inner_circle_reactions")
      .select("*", { count: "exact", head: true })
      .in("post_id", icPostIds)
      .gte("created_at", since);
    icReactionCount = count || 0;
  }

  // ── 4. Public reactions on this creator's posts (last 24h) ──
  let pubReactionCount = 0;
  if (pubPostIds.length > 0) {
    const { count } = await supabase
      .from("public_post_reactions")
      .select("*", { count: "exact", head: true })
      .in("post_id", pubPostIds)
      .gte("created_at", since);
    pubReactionCount = count || 0;
  }

  return NextResponse.json({
    reactions: icReactionCount + pubReactionCount,
    posts: icPostsLast24h + pubPostsLast24h,
    views: totalViews,
  });
}
