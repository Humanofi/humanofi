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

  const { postId, status } = await request.json();
  const VALID_STATUSES = ["going", "interested", "declined"];
  if (!postId || !status || !VALID_STATUSES.includes(status))
    return NextResponse.json({ error: "postId and valid status required (going, interested, declined)" }, { status: 400 });

  try {
    // Upsert RSVP
    await supabase.from("event_rsvps").upsert(
      {
        post_id: postId,
        wallet_address: auth.walletAddress,
        status,
      },
      { onConflict: "post_id,wallet_address" }
    );

    // Update RSVP count in post metadata
    const { data: rsvps } = await supabase
      .from("event_rsvps")
      .select("id")
      .eq("post_id", postId)
      .eq("status", "going");

    const rsvpCount = rsvps?.length || 0;

    const { data: post } = await supabase
      .from("inner_circle_posts")
      .select("metadata")
      .eq("id", postId)
      .eq("creator_mint", mint)
      .single();

    if (post) {
      await supabase
        .from("inner_circle_posts")
        .update({ metadata: { ...post.metadata, rsvp_count: rsvpCount } })
        .eq("id", postId);
    }

    return NextResponse.json({ success: true, rsvpCount });
  } catch (error) {
    console.error("RSVP error:", error);
    return NextResponse.json({ error: "Failed to RSVP" }, { status: 500 });
  }
}
