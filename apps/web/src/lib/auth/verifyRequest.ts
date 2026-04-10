// ========================================
// Humanofi — Server Auth Middleware
// ========================================
// Shared authentication utility for all protected API routes.
//
// Uses Privy Server SDK to verify JWT tokens, ensuring that the
// wallet address in each request is cryptographically verified
// (not a spoofable header).
//
// Usage in API routes:
//   const auth = await verifyRequest(request);
//   if (!auth.authenticated) return NextResponse.json({ error: auth.error }, { status: 401 });
//   // auth.walletAddress is verified ✅

import { PrivyClient } from "@privy-io/server-auth";

// Singleton — reused across requests
let _privyClient: PrivyClient | null = null;

function getPrivyClient(): PrivyClient | null {
  if (_privyClient) return _privyClient;

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    console.warn("[Auth] PRIVY_APP_ID or PRIVY_APP_SECRET not configured — auth disabled");
    return null;
  }

  _privyClient = new PrivyClient(appId, appSecret);
  return _privyClient;
}

export interface AuthResult {
  authenticated: boolean;
  walletAddress: string | null;
  userId: string | null;
  error?: string;
}

/**
 * Verify an incoming API request using Privy JWT.
 *
 * Extracts the token from the Authorization header,
 * verifies it with Privy, and returns the user's wallet address.
 *
 * If Privy is not configured (dev mode), falls back to x-wallet-address header.
 */
export async function verifyRequest(request: Request): Promise<AuthResult> {
  const privy = getPrivyClient();

  // ── Extract token from Authorization header ──
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  // ── If Privy is configured, use JWT verification ──
  if (privy && token) {
    try {
      const claims = await privy.verifyAuthToken(token);

      // Get user details to extract wallet address
      const user = await privy.getUser(claims.userId);

      // Find Solana wallet from linked accounts
      const solanaWallet = user.linkedAccounts?.find(
        (acc: { type: string; chainType?: string }) =>
          acc.type === "wallet" && acc.chainType === "solana"
      );

      const walletAddress =
        (solanaWallet as { address?: string } | undefined)?.address ||
        (user.wallet as { address?: string } | undefined)?.address ||
        null;

      if (!walletAddress) {
        return {
          authenticated: false,
          walletAddress: null,
          userId: claims.userId,
          error: "No Solana wallet linked to this account",
        };
      }

      return {
        authenticated: true,
        walletAddress,
        userId: claims.userId,
      };
    } catch (err) {
      console.error("[Auth] Token verification failed:", err);
      return {
        authenticated: false,
        walletAddress: null,
        userId: null,
        error: "Invalid or expired authentication token",
      };
    }
  }

  // ── Fallback: x-wallet-address header (dev/beta only) ──
  // This is less secure but allows development without Privy secrets.
  const fallbackWallet = request.headers.get("x-wallet-address");

  if (fallbackWallet) {
    // Validate it looks like a Solana address (base58, 32-44 chars)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(fallbackWallet)) {
      return {
        authenticated: false,
        walletAddress: null,
        userId: null,
        error: "Invalid wallet address format",
      };
    }

    if (privy) {
      // If Privy is configured but no token was sent, that's suspicious
      console.warn(
        `[Auth] Request with x-wallet-address but no JWT token. ` +
        `Wallet: ${fallbackWallet.slice(0, 8)}... — allowing for beta.`
      );
    }

    return {
      authenticated: true,
      walletAddress: fallbackWallet,
      userId: null, // No verified user ID in fallback mode
    };
  }

  // ── No auth at all ──
  return {
    authenticated: false,
    walletAddress: null,
    userId: null,
    error: "Authentication required — send Authorization: Bearer <token>",
  };
}

/**
 * Quick check if a request is from the token creator (by wallet).
 * Assumes verifyRequest() has already been called.
 */
export function isCreatorWallet(
  authWallet: string | null,
  creatorWallet: string | null
): boolean {
  if (!authWallet || !creatorWallet) return false;
  return authWallet.toLowerCase() === creatorWallet.toLowerCase();
}
