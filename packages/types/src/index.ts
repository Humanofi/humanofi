// ========================================
// Humanofi — Shared Types
// ========================================
// All TypeScript types shared across the monorepo.

import { PublicKey } from "@solana/web3.js";

// ---- Protocol Constants ----

export const PROTOCOL_CONSTANTS = {
  /** Total transaction fee in basis points (2%) */
  TOTAL_FEE_BPS: 200,
  /** Creator's share of fees (50%) */
  CREATOR_FEE_SHARE_BPS: 5000,
  /** Holders' reward pool share (30%) */
  HOLDER_FEE_SHARE_BPS: 3000,
  /** Protocol treasury share (20%) */
  TREASURY_FEE_SHARE_BPS: 2000,
  /** Exit tax rate in basis points (10%) */
  EXIT_TAX_BPS: 1000,
  /** Exit tax window in seconds (90 days) */
  EXIT_TAX_WINDOW: 90 * 24 * 60 * 60,
  /** Creator token lock duration (12 months) */
  CREATOR_LOCK_DURATION: 365 * 24 * 60 * 60,
  /** Token decimals */
  TOKEN_DECIMALS: 6,
  /** Total initial supply */
  CREATOR_TOKEN_SUPPLY: 1_000_000_000,
  /** Token creation cost in USD */
  CREATION_COST_USD: 10,
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
  supplySold: number;
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

// ---- Bonding Curve ----

export interface BondingCurveState {
  mint: string;
  creator: string;
  basePrice: number;
  curveFactor: number;
  supplySold: number;
  solReserve: number;
  createdAt: Date;
  isActive: boolean;
}

export interface PriceInfo {
  currentPrice: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
}

// ---- Reward Pool ----

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

// ---- Purchase Limits ----

export interface PurchaseLimit {
  period: string;
  maxUsdPerDay: number;
  spentTodayUsd: number;
  remainingUsd: number;
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

export type HeliusEventType = "transfer" | "mint" | "burn" | "unlock";

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
