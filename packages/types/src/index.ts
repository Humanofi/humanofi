// ========================================
// Humanofi — Shared Types (v3.6 — Human Curve™)
// ========================================
// All TypeScript types shared across the monorepo.

import { PublicKey } from "@solana/web3.js";

// ---- Protocol Constants ----

export const PROTOCOL_CONSTANTS = {
  // ---- Holder Trade Fees (5% total) ----
  /** Total transaction fee in basis points (5%) */
  TOTAL_FEE_BPS: 500,
  /** Creator's fee share: 2% of total tx */
  FEE_CREATOR_BPS: 200,
  /** Protocol treasury: 2% of total tx */
  FEE_PROTOCOL_BPS: 200,
  /** k-deepening (stays in curve): 1% of total tx */
  FEE_DEPTH_BPS: 100,

  // ---- Creator Sell Fees (6% total, no self-fee) ----
  /** Creator sell total fee: 6% */
  CREATOR_SELL_FEE_BPS: 600,
  /** Creator sell protocol share: 5% */
  CREATOR_SELL_PROTOCOL_BPS: 500,
  /** Creator sell depth share: 1% */
  CREATOR_SELL_DEPTH_BPS: 100,

  // ---- Founder Buy Fees (3% total) ----
  /** Founder Buy total fee: 3% */
  FOUNDER_BUY_FEE_BPS: 300,
  /** Founder Buy protocol fee: 2% */
  FOUNDER_BUY_PROTOCOL_BPS: 200,
  /** Founder Buy depth fee: 1% */
  FOUNDER_BUY_DEPTH_BPS: 100,

  // ---- Curve Parameters ----
  /** Depth ratio: D = 20 × V (mathematical parameter, not real SOL) */
  DEPTH_RATIO: 20,
  /** Initial y₀ = 1,000,000 tokens (in whole tokens) */
  INITIAL_Y_TOKENS: 1_000_000,

  // ---- Creator Sell Limiter ----
  /** Creator token lock duration: Year 1 = 0% sellable */
  CREATOR_LOCK_DURATION: 365 * 24 * 60 * 60,
  /** Creator sell cooldown (30 days between sells) */
  CREATOR_SELL_COOLDOWN: 30 * 24 * 60 * 60,
  /** Smart Sell Limiter: max 5% price impact per sell (500 BPS) */
  SELL_IMPACT_BPS: 500,

  // ---- Price Stabilizer (DORMANT in v3.6) ----
  /** Price Stabilizer threshold: 2% deviation from TWAP */
  STABILIZER_THRESHOLD_BPS: 200,
  /** Price Stabilizer max sell: 50% of protocol tokens */
  STABILIZER_MAX_SELL_PCT: 50,

  // ---- Token ----
  /** Token decimals */
  TOKEN_DECIMALS: 6,
  /** Minimum initial liquidity (0.03 SOL) */
  MIN_INITIAL_LIQUIDITY: 30_000_000,
  /** Maximum initial liquidity (10 SOL) */
  MAX_INITIAL_LIQUIDITY: 10_000_000_000,
} as const;

// ---- Identity (HIUID) ----

export interface HIUIDInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO format: YYYY-MM-DD
  countryCode: string; // ISO 3166-1 alpha-2
  documentNumber: string;
}

export interface VerifiedIdentity {
  hiuid: string;
  walletAddress: string;
  hasToken: boolean;
  verifiedAt: Date;
  countryCode: string;
}

// ---- Creator / Token ----

export type CreatorCategory =
  | "trader"
  | "entrepreneur"
  | "investor"
  | "artist"
  | "researcher"
  | "creator"
  | "thinker"
  | "other";

export interface CreatorToken {
  mintAddress: string;
  walletAddress: string;
  hiuid: string;
  displayName: string;
  category: CreatorCategory;
  bio: string;
  avatarUrl: string | null;
  createdAt: Date;
  tokenLockUntil: Date;
  activityScore: number;
  lastActiveAt: Date;
}

export interface CreatorProfile extends CreatorToken {
  holdersCount: number;
  marketCap: number;
  currentPrice: number;
  supplyPublic: number;
  supplyCreator: number;
  solReserve: number;
  activityStatus: ActivityStatus;
}

// ---- Activity Score ----

export type ActivityStatus = "active" | "low_activity" | "inactive" | "dormant";

export interface ActivityScore {
  /** Regularity score (0-30) */
  regularity: number;
  /** Holder engagement score (0-40) */
  engagement: number;
  /** Net retention score (0-30) */
  retention: number;
  /** Total score (0-100) */
  total: number;
  /** Derived status */
  status: ActivityStatus;
}

export function getActivityStatus(score: number): ActivityStatus {
  if (score >= 70) return "active";
  if (score >= 40) return "low_activity";
  if (score >= 1) return "inactive";
  return "dormant";
}

// ---- Token Holders ----

export interface TokenHolder {
  walletAddress: string;
  mintAddress: string;
  balance: number;
  firstBoughtAt: Date;
  updatedAt: Date;
}

// ---- Inner Circle ----

export interface InnerCirclePost {
  id: string;
  creatorMint: string;
  content: string;
  imageUrls: string[];
  createdAt: Date;
}

export interface InnerCircleReaction {
  id: string;
  postId: string;
  walletAddress: string;
  type: "like" | "fire" | "insight" | "support";
  createdAt: Date;
}

// ---- Bonding Curve (Human Curve™) ----

export interface BondingCurveState {
  mint: string;
  creator: string;
  /** Total curve reserve x (lamports) = sol_reserve + depth_parameter */
  x: bigint;
  /** Token reserve counter y (base units) */
  y: bigint;
  /** Invariant k = x · y (evolves via k-deepening) */
  k: bigint;
  /** Public tokens in circulation (holders) */
  supplyPublic: number;
  /** Creator tokens from Founder Buy (locked via CreatorVault) */
  supplyCreator: number;
  /** Protocol token balance (always 0 in v3.6 — Merit removed) */
  supplyProtocol: number;
  /** Real SOL in vault (lamports). INVARIANT: sol_reserve = x − depth_parameter */
  solReserve: number;
  /** Depth Parameter D = 20 × V (mathematical, not real SOL, never withdrawable) */
  depthParameter: number;
  /** EMA TWAP price (scaled) */
  twapPrice: bigint;
  /** Number of trades processed */
  tradeCount: number;
  createdAt: Date;
  isActive: boolean;
}

export interface PriceInfo {
  currentPrice: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
}

// ---- Reward Pool (LEGACY — removed in v3) ----
// Kept for backward compatibility with existing API responses.

export interface RewardPoolState {
  mint: string;
  totalAccumulated: number;
  totalDistributed: number;
  rewardPerTokenStored: bigint;
  lastUpdatedAt: Date;
}

export interface ClaimableRewards {
  mintAddress: string;
  pendingAmount: number;
  lastClaimedAt: Date | null;
}

// ---- Leaderboard ----

export interface LeaderboardEntry {
  rank: number;
  creator: CreatorProfile;
  holdersCount: number;
  marketCap: number;
  activityStatus: ActivityStatus;
}

// ---- Webhooks (Helius) ----

export type HeliusEventType = "transfer" | "mint" | "burn";

export interface HeliusWebhookPayload {
  type: HeliusEventType;
  signature: string;
  slot: number;
  timestamp: number;
  tokenMint: string;
  from?: string;
  to?: string;
  amount?: number;
}

// ---- API Responses ----

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}
