import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

/**
 * GET /api/inner-circle/[mint]/stats24h
 * Returns aggregated stats for the last 24 hours:
 *   - views: count of post views (from post_views table)
 *   - reactions: count of reactions
 *   - posts: count of new posts
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ views: 0, reactions: 0, posts: 0 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Count posts in last 24h
  const { count: postCount } = await supabase
    .from("inner_circle_posts")
    .select("*", { count: "exact", head: true })
    .eq("creator_mint", mint)
    .gte("created_at", since);

  // Count reactions in last 24h
  const { count: reactionCount } = await supabase
    .from("inner_circle_reactions")
    .select("*", { count: "exact", head: true })
    .eq("creator_mint", mint)
    .gte("created_at", since);

  // Count views in last 24h (if table exists)
  let viewCount = 0;
  try {
    const { count } = await supabase
      .from("post_views")
      .select("*", { count: "exact", head: true })
      .eq("creator_mint", mint)
      .gte("viewed_at", since);
    viewCount = count || 0;
  } catch {
    // post_views table may not exist yet
  }

  return NextResponse.json({
    views: viewCount,
    reactions: reactionCount || 0,
    posts: postCount || 0,
  });
}
