import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

// GET: Fetch reactions for posts (bulk)
// POST: Toggle a reaction (add or remove)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { postId, emoji } = await request.json();
  const VALID_EMOJIS = ["🔥", "💡", "🙏", "🚀", "❤️", "👀", "😅", "😫", "😱", "🤌"];
  if (!postId || !emoji || !VALID_EMOJIS.includes(emoji))
    return NextResponse.json({ error: "postId and valid emoji required" }, { status: 400 });

  const walletAddress = auth.walletAddress;

  try {
    // Check if user already has ANY reaction on this post
    const { data: existing } = await supabase
      .from("inner_circle_reactions")
      .select("id, emoji")
      .eq("post_id", postId)
      .eq("wallet_address", walletAddress)
      .single();

    if (existing) {
      if (existing.emoji === emoji) {
        // Same emoji → toggle OFF (remove)
        const { error: delErr } = await supabase.from("inner_circle_reactions").delete().eq("id", existing.id);
        if (delErr) {
          console.error("IC reaction delete error:", delErr);
          return NextResponse.json({ error: "Failed to remove reaction" }, { status: 500 });
        }
        return NextResponse.json({ action: "removed", emoji });
      } else {
        // Different emoji → replace
        const { error: updErr } = await supabase.from("inner_circle_reactions")
          .update({ emoji })
          .eq("id", existing.id);
        if (updErr) {
          console.error("IC reaction update error:", updErr);
          return NextResponse.json({ error: "Failed to update reaction" }, { status: 500 });
        }
        return NextResponse.json({ action: "replaced", emoji, previousEmoji: existing.emoji });
      }
    } else {
      // No reaction yet → add
      const { error: insErr } = await supabase.from("inner_circle_reactions").insert({
        post_id: postId,
        wallet_address: walletAddress,
        emoji,
      });
      if (insErr) {
        console.error("IC reaction insert error:", insErr);
        return NextResponse.json({ error: "Failed to add reaction" }, { status: 500 });
      }
      return NextResponse.json({ action: "added", emoji });
    }
  } catch (error) {
    console.error("Reaction error:", error);
    return NextResponse.json({ error: "Failed to react" }, { status: 500 });
  }
}

// GET: Fetch aggregated reaction counts + user's own reactions for given posts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const postIds = searchParams.get("postIds")?.split(",").filter(Boolean) || [];

  if (postIds.length === 0)
    return NextResponse.json({ reactions: {}, userReactions: {} });

  try {
    // Fetch all reactions for these posts
    const { data: allReactions } = await supabase
      .from("inner_circle_reactions")
      .select("post_id, emoji, wallet_address")
      .in("post_id", postIds);

    // Aggregate: { postId: { emoji: count } }
    const reactions: Record<string, Record<string, number>> = {};
    // User's own: { postId: [emoji1, emoji2] }
    const userReactions: Record<string, string[]> = {};

    (allReactions || []).forEach((r) => {
      if (!reactions[r.post_id]) reactions[r.post_id] = {};
      reactions[r.post_id][r.emoji] = (reactions[r.post_id][r.emoji] || 0) + 1;

      if (r.wallet_address === auth.walletAddress) {
        if (!userReactions[r.post_id]) userReactions[r.post_id] = [];
        userReactions[r.post_id].push(r.emoji);
      }
    });

    return NextResponse.json({ reactions, userReactions });
  } catch (error) {
    console.error("Fetch reactions error:", error);
    return NextResponse.json({ error: "Failed to fetch reactions" }, { status: 500 });
  }
}
