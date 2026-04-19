// ========================================
// Humanofi — Admin Recovery API
// ========================================
// POST /api/admin/recovery — Emergency authority transfer
// Only callable by wallet with role='recovery'

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, isRecovery, adminSupabase, logAction } from "../middleware";

export async function POST(req: NextRequest) {
  const session = await verifyAdmin(req);
  if (!session || !isRecovery(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { action } = await req.json();

    if (action === "revoke_authority") {
      // 1. Deactivate all current authority wallets
      const { data: authorities } = await adminSupabase
        .from("admin_wallets")
        .select("wallet_address")
        .eq("role", "authority")
        .eq("is_active", true);

      if (authorities && authorities.length > 0) {
        for (const auth of authorities) {
          await adminSupabase
            .from("admin_wallets")
            .update({ is_active: false })
            .eq("wallet_address", auth.wallet_address);

          await logAction(
            session.wallet,
            "revoke_authority",
            "wallet",
            auth.wallet_address,
            "Emergency: authority revoked by recovery wallet",
            { revokedWallet: auth.wallet_address },
            req
          );
        }
      }

      // 2. Promote recovery wallet to authority
      await adminSupabase
        .from("admin_wallets")
        .update({ role: "authority" })
        .eq("wallet_address", session.wallet);

      await logAction(
        session.wallet,
        "revoke_authority",
        "wallet",
        session.wallet,
        "Recovery wallet promoted to authority",
        { promotedWallet: session.wallet },
        req
      );

      // 3. Emergency freeze the platform
      await adminSupabase
        .from("platform_settings")
        .update({ value: "true" })
        .eq("key", "emergency_freeze");

      await adminSupabase
        .from("platform_settings")
        .update({ value: "Emergency: authority compromised, platform frozen by recovery wallet" })
        .eq("key", "freeze_reason");

      return NextResponse.json({
        ok: true,
        message: "Authority revoked. Recovery wallet promoted. Platform frozen.",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Recovery failed" }, { status: 500 });
  }
}
