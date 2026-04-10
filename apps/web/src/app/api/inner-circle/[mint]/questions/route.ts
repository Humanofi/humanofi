import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

// ========================================
// Inner Circle — Questions (AMA) API
// ========================================
// GET: Fetch questions for a post
//   - Creator sees ALL questions + answers
//   - Holders see ONLY their own questions + answers
// POST: Submit a question (holders) or answer one (creator)

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
  const postId = searchParams.get("postId");
  if (!postId) return NextResponse.json({ error: "postId required" }, { status: 400 });

  try {
    // Check if user is the creator
    const { data: creator } = await supabase
      .from("creator_tokens")
      .select("wallet_address")
      .eq("mint_address", mint)
      .single();

    const isCreator = creator?.wallet_address?.toLowerCase() === auth.walletAddress.toLowerCase();

    // Fetch questions — creator sees all, holder sees only their own
    let query = supabase
      .from("inner_circle_questions")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (!isCreator) {
      query = query.eq("wallet_address", auth.walletAddress);
    }

    const { data: questions, error } = await query;
    if (error) throw error;

    // Count total for creator
    let totalCount = 0;
    let answeredCount = 0;
    if (isCreator) {
      totalCount = (questions || []).length;
      answeredCount = (questions || []).filter((q) => q.answer !== null).length;
    }

    return NextResponse.json({
      questions: questions || [],
      isCreator,
      totalCount,
      answeredCount,
    });
  } catch (error) {
    console.error("Fetch questions error:", error);
    return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
  }
}

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

  const body = await request.json();
  const { action } = body;

  try {
    // Check if user is the creator
    const { data: creator } = await supabase
      .from("creator_tokens")
      .select("wallet_address")
      .eq("mint_address", mint)
      .single();

    const isCreator = creator?.wallet_address?.toLowerCase() === auth.walletAddress.toLowerCase();

    if (action === "ask") {
      // ── Holder submits a question ──
      const { postId, question } = body;
      if (!postId || !question?.trim())
        return NextResponse.json({ error: "postId and question required" }, { status: 400 });

      if (question.trim().length > 500)
        return NextResponse.json({ error: "Question too long (500 chars max)" }, { status: 400 });

      // Limit: max 3 questions per holder per AMA post
      const { count } = await supabase
        .from("inner_circle_questions")
        .select("*", { count: "exact", head: true })
        .eq("post_id", postId)
        .eq("wallet_address", auth.walletAddress);

      if ((count || 0) >= 3)
        return NextResponse.json({ error: "Max 3 questions per session" }, { status: 429 });

      const { data, error } = await supabase
        .from("inner_circle_questions")
        .insert({
          post_id: postId,
          wallet_address: auth.walletAddress,
          question: question.trim(),
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ question: data });
    }

    if (action === "answer") {
      // ── Creator answers a question ──
      if (!isCreator)
        return NextResponse.json({ error: "Only the creator can answer" }, { status: 403 });

      const { questionId, answer } = body;
      if (!questionId || !answer?.trim())
        return NextResponse.json({ error: "questionId and answer required" }, { status: 400 });

      const { data, error } = await supabase
        .from("inner_circle_questions")
        .update({ answer: answer.trim(), answered_at: new Date().toISOString() })
        .eq("id", questionId)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ question: data });
    }

    return NextResponse.json({ error: "Invalid action. Use 'ask' or 'answer'." }, { status: 400 });
  } catch (error) {
    console.error("Question error:", error);
    return NextResponse.json({ error: "Failed to process question" }, { status: 500 });
  }
}
