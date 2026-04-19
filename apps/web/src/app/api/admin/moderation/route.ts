// ========================================
// Humanofi — Moderation Actions API
// ========================================
// GET  /api/admin/moderation — List actions + content to moderate
// POST /api/admin/moderation — Execute moderation action

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, isModeratorOrAbove, isAuthority, adminSupabase, logAction } from "../middleware";

// GET — Fetch content for moderation + action history
export async function GET(req: NextRequest) {
  const session = await verifyAdmin(req);
  if (!session || !isModeratorOrAbove(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get("type") || "all";

  const results: Record<string, unknown> = {};

  if (type === "all" || type === "posts") {
    const { data } = await adminSupabase
      .from("inner_circle_posts")
      .select("id, creator_mint, content, image_urls, is_hidden, hidden_by, hidden_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    results.posts = data || [];
  }

  if (type === "all" || type === "creators") {
    const { data } = await adminSupabase
      .from("creator_tokens")
      .select("mint_address, display_name, category, wallet_address, is_suspended, suspension_reason, activity_score, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    results.creators = data || [];
  }

  if (type === "all" || type === "warnings") {
    const { data } = await adminSupabase
      .from("creator_warnings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    results.warnings = data || [];
  }

  if (type === "all" || type === "actions") {
    const { data } = await adminSupabase
      .from("moderation_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    results.actions = data || [];
  }

  return NextResponse.json(results);
}

// POST — Execute a moderation action
export async function POST(req: NextRequest) {
  const session = await verifyAdmin(req);
  if (!session || !isModeratorOrAbove(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { action, targetId, reason, metadata } = await req.json();
  if (!action || !reason) {
    return NextResponse.json({ error: "action and reason required" }, { status: 400 });
  }

  // ── Authority-only actions ──
  const authorityOnlyActions = ["suspend_token", "unsuspend_token", "emergency_freeze", "emergency_unfreeze"];
  if (authorityOnlyActions.includes(action) && !isAuthority(session)) {
    return NextResponse.json({ error: "Authority required" }, { status: 403 });
  }

  let targetType = "platform";

  switch (action) {
    case "hide_post": {
      targetType = "post";
      await adminSupabase
        .from("inner_circle_posts")
        .update({ is_hidden: true, hidden_by: session.wallet, hidden_reason: reason })
        .eq("id", targetId);
      break;
    }

    case "unhide_post": {
      targetType = "post";
      await adminSupabase
        .from("inner_circle_posts")
        .update({ is_hidden: false, hidden_by: null, hidden_reason: null })
        .eq("id", targetId);
      break;
    }

    case "warn_creator": {
      targetType = "creator";
      const warningType = metadata?.warningType || "other";
      const severity = metadata?.severity || "warning";
      await adminSupabase.from("creator_warnings").insert({
        creator_mint: targetId,
        warning_type: warningType,
        message: reason,
        severity,
        issued_by: session.wallet,
      });
      break;
    }

    case "suspend_token": {
      targetType = "token";
      await adminSupabase
        .from("creator_tokens")
        .update({ is_suspended: true, suspension_reason: reason })
        .eq("mint_address", targetId);
      break;
    }

    case "unsuspend_token": {
      targetType = "token";
      await adminSupabase
        .from("creator_tokens")
        .update({ is_suspended: false, suspension_reason: null })
        .eq("mint_address", targetId);
      break;
    }

    case "emergency_freeze": {
      targetType = "platform";
      await adminSupabase.from("platform_settings").update({ value: "true" }).eq("key", "emergency_freeze");
      await adminSupabase.from("platform_settings").update({ value: reason }).eq("key", "freeze_reason");
      break;
    }

    case "emergency_unfreeze": {
      targetType = "platform";
      await adminSupabase.from("platform_settings").update({ value: "false" }).eq("key", "emergency_freeze");
      await adminSupabase.from("platform_settings").update({ value: "" }).eq("key", "freeze_reason");
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await logAction(session.wallet, action, targetType, targetId, reason, metadata || {}, req);

  return NextResponse.json({ ok: true });
}
