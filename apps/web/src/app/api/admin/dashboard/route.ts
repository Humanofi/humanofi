// ========================================
// Humanofi — Admin Dashboard API (v3 — ISO Programme On-Chain)
// ========================================
// GET /api/admin/dashboard — Platform metrics (moderator+)
//
// Fee structure v3.7 (asymmetric, from constants.rs):
//
//   HOLDER BUY (5% total):
//     3% → Creator Fee Vault PDA (claimable every 15 days)
//     1% → Protocol Treasury (TREASURY_WALLET)
//     1% → k-Deepening (stays in bonding curve, non-extractible)
//
//   HOLDER SELL (5% total):
//     1% → Creator Fee Vault PDA
//     3% → Protocol Treasury
//     1% → k-Deepening
//
//   CREATOR SELL (6% total, no self-fee):
//     5% → Protocol Treasury
//     1% → k-Deepening
//
//   FOUNDER BUY (3% total, at token creation):
//     2% → Protocol Treasury
//     1% → k-Deepening
//
//   DROPS (15% protocol):
//     85% → Creator wallet
//     15% → Protocol Treasury
//
// k-Deepening is NOT revenue — it's a mathematical parameter
// trapped in the bonding curve forever.

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, isModeratorOrAbove, adminSupabase } from "../middleware";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const TREASURY = process.env.NEXT_PUBLIC_TREASURY_WALLET || "";
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

export async function GET(req: NextRequest) {
  const session = await verifyAdmin(req);
  if (!session || !isModeratorOrAbove(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    treasuryBalanceResult,
    creatorsResult,
    holdersResult,
    postsResult,
    tradesResult,
    warningsResult,
    recentActionsResult,
    platformResult,
    dropPurchasesResult,
    dropsResult,
  ] = await Promise.allSettled([
    // 1. Treasury SOL balance (on-chain)
    (async () => {
      if (!TREASURY) return 0;
      const conn = new Connection(RPC, "confirmed");
      const balance = await conn.getBalance(new PublicKey(TREASURY));
      return balance / LAMPORTS_PER_SOL;
    })(),

    // 2. Creators
    adminSupabase.from("creator_tokens").select("id, is_suspended", { count: "exact" }),

    // 3. Holders
    adminSupabase.from("token_holders").select("id", { count: "exact" }).gt("balance", 0),

    // 4. Posts
    adminSupabase.from("inner_circle_posts").select("id, is_hidden", { count: "exact" }),

    // 5. Trades (need trade_type + sol_amount to calculate asymmetric fees)
    adminSupabase.from("trades").select("sol_amount, trade_type"),

    // 6. Warnings
    adminSupabase.from("creator_warnings").select("id", { count: "exact" }).eq("acknowledged", false),

    // 7. Audit log
    adminSupabase
      .from("moderation_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),

    // 8. Platform settings
    adminSupabase.from("platform_settings").select("*"),

    // 9. Drop purchases
    adminSupabase.from("drop_purchases").select("amount_paid, protocol_fee, creator_revenue, verified"),

    // 10. Drops
    adminSupabase.from("exclusive_drops").select("id, title, total_revenue, buyer_count, price_lamports, is_active", { count: "exact" }),
  ]);

  // ── Parse results ──

  const treasuryBalance = treasuryBalanceResult.status === "fulfilled" ? treasuryBalanceResult.value : 0;

  // Creators
  const creators = creatorsResult.status === "fulfilled" ? creatorsResult.value : { data: [], count: 0 };
  const totalCreators = creators.count || 0;
  const suspendedCreators = creators.data?.filter((c: { is_suspended: boolean }) => c.is_suspended).length || 0;

  // Holders
  const totalHolders = holdersResult.status === "fulfilled" ? (holdersResult.value.count || 0) : 0;

  // Posts
  const posts = postsResult.status === "fulfilled" ? postsResult.value : { data: [], count: 0 };
  const totalPosts = posts.count || 0;
  const hiddenPosts = posts.data?.filter((p: { is_hidden: boolean }) => p.is_hidden).length || 0;

  // ── TRADE FEE CALCULATION (asymmetric, matching on-chain constants.rs) ──
  //
  // On-chain fee constants:
  //   BUY:  TOTAL=500bps, CREATOR=300bps, PROTOCOL=100bps, DEPTH=100bps
  //   SELL: TOTAL=500bps, CREATOR=100bps, PROTOCOL=300bps, DEPTH=100bps
  //
  // What the Treasury wallet receives:
  //   - On BUY:  1% of sol_amount (buyer's input)
  //   - On SELL: 3% of sol_gross (sol released from curve before fees)
  //
  // NOTE: sol_amount in the trades table is the BRUT amount:
  //   - For BUY: sol_amount = what the buyer paid (brut, before fee deduction)
  //   - For SELL: sol_amount = what the seller received (net, after fees)
  //     But we stored sol_amount as the trade's SOL movement, so we approximate
  //     using sol_amount as the brut value for both.

  const trades = tradesResult.status === "fulfilled" ? tradesResult.value : { data: [] };
  const tradesList: { sol_amount: number; trade_type: string }[] = trades.data || [];

  let totalBuyVolumeLamports = 0;
  let totalSellVolumeLamports = 0;
  let totalBuys = 0;
  let totalSells = 0;

  for (const t of tradesList) {
    const amount = t.sol_amount || 0;
    if (t.trade_type === "buy") {
      totalBuyVolumeLamports += amount;
      totalBuys++;
    } else {
      totalSellVolumeLamports += amount;
      totalSells++;
    }
  }

  const totalVolumeLamports = totalBuyVolumeLamports + totalSellVolumeLamports;
  const totalVolumeSol = totalVolumeLamports / 1e9;
  const totalTrades = tradesList.length;

  // Treasury revenue from trades (on-chain verified):
  //   BUY → treasury receives 1% (100 BPS)
  //   SELL → treasury receives 3% (300 BPS)
  const treasuryFromBuysLamports = Math.floor(totalBuyVolumeLamports * 100 / 10_000);
  const treasuryFromSellsLamports = Math.floor(totalSellVolumeLamports * 300 / 10_000);
  const treasuryFromTradesLamports = treasuryFromBuysLamports + treasuryFromSellsLamports;

  // Creator fees from trades (goes to Creator Fee Vault PDA, NOT treasury):
  //   BUY → creator receives 3% (300 BPS)
  //   SELL → creator receives 1% (100 BPS)
  const creatorFromBuysLamports = Math.floor(totalBuyVolumeLamports * 300 / 10_000);
  const creatorFromSellsLamports = Math.floor(totalSellVolumeLamports * 100 / 10_000);
  const creatorFeesLamports = creatorFromBuysLamports + creatorFromSellsLamports;

  // k-Deepening (1% on every trade — NOT revenue, stays in bonding curve):
  const kDeepeningLamports = Math.floor(totalVolumeLamports * 100 / 10_000);

  // Total 5% fees deducted from trades:
  const totalFeesLamports = treasuryFromTradesLamports + creatorFeesLamports + kDeepeningLamports;

  // Founder Buy fees (2% protocol on each token creation)
  // We can estimate: totalCreators × average_initial_liquidity × 2%
  // But without storing initial_liquidity in DB, we note it's not tracked yet
  const founderBuyFeesNote = "Not tracked in DB — 2% of initial_liquidity at creation goes to Treasury";

  // Warnings
  const activeWarnings = warningsResult.status === "fulfilled" ? (warningsResult.value.count || 0) : 0;

  // Audit log
  const recentActions = recentActionsResult.status === "fulfilled" ? (recentActionsResult.value.data || []) : [];

  // Platform settings
  const settings: Record<string, string> = {};
  if (platformResult.status === "fulfilled" && platformResult.value.data) {
    for (const s of platformResult.value.data) {
      settings[s.key] = s.value;
    }
  }

  // ── DROP REVENUE ──
  const dropPurchases = dropPurchasesResult.status === "fulfilled" ? dropPurchasesResult.value : { data: [] };
  const purchasesList: { amount_paid: number; protocol_fee: number; creator_revenue: number; verified: boolean }[] = dropPurchases.data || [];

  const verifiedPurchases = purchasesList.filter(p => p.verified);
  const dropTotalPaidLamports = verifiedPurchases.reduce((sum, p) => sum + (p.amount_paid || 0), 0);
  const dropProtocolFeeLamports = verifiedPurchases.reduce((sum, p) => sum + (p.protocol_fee || 0), 0);
  const dropCreatorRevenueLamports = verifiedPurchases.reduce((sum, p) => sum + (p.creator_revenue || 0), 0);
  const totalDropPurchases = verifiedPurchases.length;

  // Drops overview
  const drops = dropsResult.status === "fulfilled" ? dropsResult.value : { data: [], count: 0 };
  const totalDrops = drops.count || 0;
  const activeDrops = (drops.data || []).filter((d: { is_active: boolean }) => d.is_active).length;

  // ── TOTAL PLATFORM REVENUE (Treasury wallet) ──
  // = Trade treasury fees (1% buy + 3% sell) + Drop protocol fees (15%)
  // + Founder Buy fees (2% — not tracked)
  const totalPlatformRevenueLamports = treasuryFromTradesLamports + dropProtocolFeeLamports;

  return NextResponse.json({
    role: session.role,

    treasury: {
      balance: Number(treasuryBalance.toFixed(6)),
      wallet: TREASURY,
    },

    finance: {
      // Total verifiable platform revenue
      totalRevenueSol: Number((totalPlatformRevenueLamports / 1e9).toFixed(6)),

      // ── TRADE FEES (asymmetric, v3.7) ──
      trades: {
        totalVolumeSol: Number(totalVolumeSol.toFixed(6)),
        buyVolumeSol: Number((totalBuyVolumeLamports / 1e9).toFixed(6)),
        sellVolumeSol: Number((totalSellVolumeLamports / 1e9).toFixed(6)),
        totalTrades,
        totalBuys,
        totalSells,

        // Treasury revenue from trades
        treasuryFromBuysSol: Number((treasuryFromBuysLamports / 1e9).toFixed(6)),   // 1% of buys
        treasuryFromSellsSol: Number((treasuryFromSellsLamports / 1e9).toFixed(6)), // 3% of sells
        treasuryTotalSol: Number((treasuryFromTradesLamports / 1e9).toFixed(6)),

        // Creator fees (NOT treasury — for info only)
        creatorFeesSol: Number((creatorFeesLamports / 1e9).toFixed(6)),  // 3% buy + 1% sell

        // k-Deepening (NOT extractable — for info only)
        kDeepeningSol: Number((kDeepeningLamports / 1e9).toFixed(6)),    // 1% all trades

        // Total fees deducted
        totalFeesSol: Number((totalFeesLamports / 1e9).toFixed(6)),

        // Founder Buy (not tracked in DB)
        founderBuyFeesNote,
      },

      // ── DROP FEES (15% protocol) ──
      drops: {
        totalDrops,
        activeDrops,
        totalPurchases: totalDropPurchases,
        totalPaidSol: Number((dropTotalPaidLamports / 1e9).toFixed(6)),
        protocolFeeSol: Number((dropProtocolFeeLamports / 1e9).toFixed(6)),       // 15%
        creatorRevenueSol: Number((dropCreatorRevenueLamports / 1e9).toFixed(6)),  // 85%
      },
    },

    metrics: {
      totalCreators,
      suspendedCreators,
      totalHolders,
      totalPosts,
      hiddenPosts,
      totalVolumeSol: Number(totalVolumeSol.toFixed(3)),
      activeWarnings,
    },

    platform: {
      emergencyFreeze: settings.emergency_freeze === "true",
      freezeReason: settings.freeze_reason || "",
    },

    recentActions,
  });
}
