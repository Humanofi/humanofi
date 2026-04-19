// ========================================
// Humanofi — Search API
// ========================================
// GET /api/search?q=xxx → returns matching creator tokens
// Searches by display_name (ilike), category, mint_address

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Search by display_name (case-insensitive)
    const { data, error } = await supabase
      .from("creator_tokens")
      .select("mint_address, display_name, avatar_url, category, holder_count, activity_score")
      .or(`display_name.ilike.%${q}%,category.ilike.%${q}%,mint_address.ilike.%${q}%`)
      .order("activity_score", { ascending: false })
      .limit(8);

    if (error) {
      console.error("[Search] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ results: data || [] });
  } catch (error) {
    console.error("[Search] Error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
