import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

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

  const { postId, optionIndex } = await request.json();
  if (postId === undefined || optionIndex === undefined)
    return NextResponse.json({ error: "postId and optionIndex required" }, { status: 400 });

  try {
    // Check if already voted
    const { data: existing } = await supabase
      .from("poll_votes")
      .select("id")
      .eq("post_id", postId)
      .eq("wallet_address", auth.walletAddress)
      .single();

    if (existing) return NextResponse.json({ error: "Already voted" }, { status: 409 });

    // Validate optionIndex is within bounds
    const { data: post } = await supabase
      .from("inner_circle_posts")
      .select("metadata")
      .eq("id", postId)
      .eq("creator_mint", mint)
      .single();

    if (!post?.metadata?.options || optionIndex < 0 || optionIndex >= (post.metadata.options as string[]).length) {
      return NextResponse.json({ error: "Invalid option index" }, { status: 400 });
    }

    // Insert vote
    await supabase.from("poll_votes").insert({
      post_id: postId,
      wallet_address: auth.walletAddress,
      option_index: optionIndex,
    });

    // Update vote count in post metadata (reuse `post` from validation above)
    if (post?.metadata?.votes) {
      const votes = [...(post.metadata.votes as number[])];
      votes[optionIndex] = (votes[optionIndex] || 0) + 1;
      await supabase
        .from("inner_circle_posts")
        .update({ metadata: { ...post.metadata, votes } })
        .eq("id", postId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Poll vote error:", error);
    return NextResponse.json({ error: "Failed to vote" }, { status: 500 });
  }
}
