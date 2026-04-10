// ========================================
// Humanofi — Didit Identity: Create Session
// ========================================
// POST /api/identity/create-session
//
// Creates a Didit verification session.
// The frontend redirects the user to Didit for KYC.
// Docs: https://docs.didit.me/getting-started/quick-start

import { NextRequest, NextResponse } from "next/server";

const DIDIT_API_KEY = process.env.DIDIT_API_KEY;
const DIDIT_WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID;
const DIDIT_API_URL = "https://verification.didit.me/v3/session/";

export async function POST(request: NextRequest) {
  if (!DIDIT_API_KEY || !DIDIT_WORKFLOW_ID) {
    return NextResponse.json(
      { error: "Didit is not configured. Set DIDIT_API_KEY and DIDIT_WORKFLOW_ID." },
      { status: 503 }
    );
  }

  try {
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 }
      );
    }

    // Create a Didit verification session
    const response = await fetch(DIDIT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": DIDIT_API_KEY,
      },
      body: JSON.stringify({
        workflow_id: DIDIT_WORKFLOW_ID,
        vendor_data: walletAddress, // Our internal reference — the wallet address
        callback: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/identity/didit-webhook`,
        metadata: {
          purpose: "humanofi_token_creation",
          wallet_address: walletAddress,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Didit] Session creation failed:", errorText);
      return NextResponse.json(
        { error: "Failed to create verification session" },
        { status: 500 }
      );
    }

    const session = await response.json();

    // Didit returns: { session_id, url, ... }
    return NextResponse.json({
      sessionId: session.session_id,
      url: session.url, // Redirect URL for the user
    });
  } catch (error) {
    console.error("[Didit] Session creation error:", error);
    return NextResponse.json(
      { error: "Failed to create verification session" },
      { status: 500 }
    );
  }
}
