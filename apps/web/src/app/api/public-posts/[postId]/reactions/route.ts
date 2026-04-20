import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

const EMOJI_WEIGHTS: Record<string, number> = {
  "🔥": 1.0, "❤️": 1.2, "🚀": 1.5, "💡": 1.3, "🙏": 0.8, "👀": 0.5,
  "😅": 0.7, "😫": 0.6, "😱": 1.1, "🤌": 1.4,
};
const GRAVITY = 1.5;

function calculateHotScore(
  reactionsByEmoji: Record<string, number>,
  holderCount: number,
  createdAt: string
): number {
  let weighted = 0;
  for (const [emoji, count] of Object.entries(reactionsByEmoji)) {
    weighted += count * (EMOJI_WEIGHTS[emoji] || 1.0);
  }
  const holderBoost = Math.log2(1 + holderCount) * 0.5;
  const ageHours = Math.max(0.1, (Date.now() - new Date(createdAt).getTime()) / 3600000);
  return (weighted + holderBoost) / Math.pow(ageHours + 2, GRAVITY);
}

// POST: Toggle reaction + recalculate HotScore
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { emoji } = await request.json();
  const VALID_EMOJIS = ["🔥", "💡", "🙏", "🚀", "❤️", "👀", "😅", "😫", "😱", "🤌"];
  if (!emoji || !VALID_EMOJIS.includes(emoji))
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });

  try {
    // 1 reaction per wallet per post: check any existing reaction
    const { data: existing } = await supabase
      .from("public_post_reactions")
      .select("id, emoji")
      .eq("post_id", postId)
      .eq("wallet_address", auth.walletAddress)
      .single();

    let action: string;
    let previousEmoji: string | null = null;

    if (existing) {
      if (existing.emoji === emoji) {
        // Same emoji → remove
        const { error: delErr } = await supabase.from("public_post_reactions").delete().eq("id", existing.id);
        if (delErr) {
          console.error("Public reaction delete error:", delErr);
          return NextResponse.json({ error: "Failed to remove reaction" }, { status: 500 });
        }
        action = "removed";
      } else {
        // Different emoji → replace
        previousEmoji = existing.emoji;
        const { error: updErr } = await supabase.from("public_post_reactions").update({ emoji }).eq("id", existing.id);
        if (updErr) {
          console.error("Public reaction update error:", updErr);
          return NextResponse.json({ error: "Failed to update reaction" }, { status: 500 });
        }
        action = "replaced";
      }
    } else {
      // No reaction → add
      const { error: insErr } = await supabase.from("public_post_reactions").insert({
        post_id: postId,
        wallet_address: auth.walletAddress,
        emoji,
      });
      if (insErr) {
        console.error("Public reaction insert error:", insErr);
        return NextResponse.json({ error: "Failed to add reaction" }, { status: 500 });
      }
      action = "added";
    }

    // Recalculate HotScore
    const { data: post } = await supabase.from("public_posts").select("creator_mint, created_at").eq("id", postId).single();
    if (post) {
      const { data: reactions } = await supabase
        .from("public_post_reactions")
        .select("emoji")
        .eq("post_id", postId);

      const reactionsByEmoji: Record<string, number> = {};
      (reactions || []).forEach((r) => {
        reactionsByEmoji[r.emoji] = (reactionsByEmoji[r.emoji] || 0) + 1;
      });

      const { count: holderCount } = await supabase
        .from("token_holders")
        .select("*", { count: "exact", head: true })
        .eq("mint_address", post.creator_mint)
        .gt("balance", 0);

      const newScore = calculateHotScore(reactionsByEmoji, holderCount || 0, post.created_at);
      const totalReactions = Object.values(reactionsByEmoji).reduce((a, b) => a + b, 0);

      await supabase.from("public_posts")
        .update({ hot_score: newScore, reaction_count: totalReactions })
        .eq("id", postId);
    }

    return NextResponse.json({ action, emoji, ...(previousEmoji ? { previousEmoji } : {}) });
  } catch (error) {
    console.error("Public reaction error:", error);
    return NextResponse.json({ error: "Failed to react" }, { status: 500 });
  }
}
