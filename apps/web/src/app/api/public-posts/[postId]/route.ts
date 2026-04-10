import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

// Helper: verify creator owns the post
async function getCreatorMint(supabase: NonNullable<ReturnType<typeof createServerClient>>, walletAddress: string) {
  const { data } = await supabase
    .from("creator_tokens")
    .select("mint_address")
    .eq("wallet_address", walletAddress)
    .single();
  return data?.mint_address || null;
}

// DELETE: Creator can delete their own public post
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const creatorMint = await getCreatorMint(supabase, auth.walletAddress);
    if (!creatorMint) return NextResponse.json({ error: "Not a creator" }, { status: 403 });

    const { error } = await supabase
      .from("public_posts")
      .delete()
      .eq("id", postId)
      .eq("creator_mint", creatorMint);

    if (error) return NextResponse.json({ error: "Failed to delete" }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete public post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH: Creator can edit content of their public post
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    const creatorMint = await getCreatorMint(supabase, auth.walletAddress);
    if (!creatorMint) return NextResponse.json({ error: "Not a creator" }, { status: 403 });

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.content === "string") {
      const trimmed = body.content.trim();
      if (!trimmed) return NextResponse.json({ error: "Content cannot be empty" }, { status: 400 });
      if (trimmed.length > 2000) return NextResponse.json({ error: "Content too long" }, { status: 400 });
      updates.content = trimmed;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    const { error } = await supabase
      .from("public_posts")
      .update(updates)
      .eq("id", postId)
      .eq("creator_mint", creatorMint);

    if (error) {
      console.error("Update public post error:", error);
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true, updates });
  } catch (error) {
    console.error("PATCH public post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
