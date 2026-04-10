import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

// GET & POST: Streak management
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

  const { data: streak } = await supabase
    .from("holder_streaks")
    .select("*")
    .eq("wallet_address", auth.walletAddress)
    .eq("mint_address", mint)
    .single();

  if (!streak) {
    return NextResponse.json({
      current_streak: 0,
      longest_streak: 0,
      badge: "none",
      last_active_date: null,
    });
  }

  return NextResponse.json(streak);
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

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  try {
    // Get existing streak
    const { data: existing } = await supabase
      .from("holder_streaks")
      .select("*")
      .eq("wallet_address", auth.walletAddress)
      .eq("mint_address", mint)
      .single();

    if (!existing) {
      // Create new streak
      await supabase.from("holder_streaks").insert({
        wallet_address: auth.walletAddress,
        mint_address: mint,
        current_streak: 1,
        longest_streak: 1,
        last_active_date: today,
        badge: "none",
      });
      return NextResponse.json({ current_streak: 1, badge: "none" });
    }

    // Already active today
    if (existing.last_active_date === today) {
      return NextResponse.json(existing);
    }

    // Calculate new streak
    let newStreak: number;
    if (existing.last_active_date === yesterday) {
      newStreak = existing.current_streak + 1;
    } else {
      newStreak = 1; // streak broken
    }

    const newLongest = Math.max(existing.longest_streak, newStreak);

    // Calculate badge
    let badge = "none";
    if (newStreak >= 365) badge = "legendary";
    else if (newStreak >= 100) badge = "og";
    else if (newStreak >= 30) badge = "loyalist";
    else if (newStreak >= 7) badge = "engaged";
    else if (newStreak >= 3) badge = "curious";

    await supabase
      .from("holder_streaks")
      .update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_active_date: today,
        badge,
      })
      .eq("wallet_address", auth.walletAddress)
      .eq("mint_address", mint);

    return NextResponse.json({
      current_streak: newStreak,
      longest_streak: newLongest,
      badge,
      last_active_date: today,
    });
  } catch (error) {
    console.error("Streak error:", error);
    return NextResponse.json({ error: "Failed to update streak" }, { status: 500 });
  }
}
