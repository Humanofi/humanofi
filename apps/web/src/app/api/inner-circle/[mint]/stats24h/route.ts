import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

/**
 * GET /api/inner-circle/[mint]/stats24h
 * 
 * Returns aggregated stats for the last 24 hours:
 *   - reactions: inner circle + public post reactions
 *   - posts: inner circle + public posts
 *   - views: not tracked (would require a dedicated table + write-heavy system).
 *            We use total reaction count as a proxy for engagement.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ reactions: 0, posts: 0 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ── Inner Circle posts in last 24h ──
  const { count: icPostCount } = await supabase
    .from("inner_circle_posts")
    .select("*", { count: "exact", head: true })
    .eq("creator_mint", mint)
    .gte("created_at", since);

  // ── Public posts in last 24h ──
  const { count: pubPostCount } = await supabase
    .from("public_posts")
    .select("*", { count: "exact", head: true })
    .eq("creator_mint", mint)
    .gte("created_at", since);

  // ── Inner Circle reactions in last 24h ──
  // inner_circle_reactions doesn't have creator_mint, so we join via posts
  const { data: icReactionData } = await supabase
    .from("inner_circle_reactions")
    .select("id, post_id, inner_circle_posts!inner(creator_mint)")
    .gte("created_at", since);

  // Filter reactions belonging to this creator's posts
  let icReactionCount = 0;
  if (icReactionData) {
    icReactionCount = icReactionData.filter((r: any) => {
      const post = r.inner_circle_posts;
      return post && post.creator_mint === mint;
    }).length;
  }

  // ── Public post reactions in last 24h ──
  // public_post_reactions also doesn't have creator_mint, join via public_posts
  const { data: pubReactionData } = await supabase
    .from("public_post_reactions")
    .select("id, post_id, public_posts!inner(creator_mint)")
    .gte("created_at", since);

  let pubReactionCount = 0;
  if (pubReactionData) {
    pubReactionCount = pubReactionData.filter((r: any) => {
      const post = r.public_posts;
      return post && post.creator_mint === mint;
    }).length;
  }

  return NextResponse.json({
    reactions: icReactionCount + pubReactionCount,
    posts: (icPostCount || 0) + (pubPostCount || 0),
  });
}
