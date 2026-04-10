// ========================================
// Humanofi — Protocol Constants
// ========================================

use anchor_lang::prelude::*;

// ---- Token ----

/// Token decimals (standard SPL)
pub const TOKEN_DECIMALS: u8 = 6;

/// Creator's share of initial supply (10%)
/// Minted directly into the locked CreatorVault
pub const CREATOR_SUPPLY_SHARE_BPS: u64 = 1000; // 10%

/// Initial supply minted to creator vault (100M with 6 decimals)
pub const CREATOR_INITIAL_SUPPLY: u64 = 100_000_000 * 1_000_000;

// ---- Fees ----

/// Total transaction fee in basis points (2%)
pub const TOTAL_FEE_BPS: u64 = 200;

/// Creator's share of collected fees (50%)
pub const CREATOR_FEE_SHARE_BPS: u64 = 5000;

/// Holders reward pool share of fees (30%)
pub const HOLDER_FEE_SHARE_BPS: u64 = 3000;

/// Protocol treasury share of fees (20%)
pub const TREASURY_FEE_SHARE_BPS: u64 = 2000;

/// Precision factor for basis points calculations
pub const BPS_DENOMINATOR: u64 = 10_000;

// ---- Exit Tax ----

/// Exit tax rate in basis points (10%)
pub const EXIT_TAX_BPS: u64 = 1000;

/// Exit tax window in seconds (90 days)
pub const EXIT_TAX_WINDOW: i64 = 90 * 24 * 60 * 60;

// ---- Creator Vesting Schedule ----

/// Year 1: 0% sellable — full lock, no exceptions
pub const VESTING_CLIFF_DURATION: i64 = 365 * 24 * 60 * 60;

/// Year 2-3: max 10% of total allocation per year
pub const VESTING_YEAR_2_3_MAX_BPS: u64 = 1000; // 10%

/// Year 4+: max 20% of total allocation per year
pub const VESTING_YEAR_4_PLUS_MAX_BPS: u64 = 2000; // 20%

/// Seconds in one year (for vesting period calculation)
pub const SECONDS_PER_YEAR: i64 = 365 * 24 * 60 * 60;

// ---- Purchase Limits (in lamports) ----

/// Maximum SOL per day — Week 1 (first 7 days): 1 SOL
pub const WEEK1_MAX_LAMPORTS_PER_DAY: u64 = 1_000_000_000;

/// Maximum SOL per day — Month 1 (days 8-30): 5 SOL
pub const MONTH1_MAX_LAMPORTS_PER_DAY: u64 = 5_000_000_000;

/// Maximum SOL per day — After month 1: 20 SOL
pub const DEFAULT_MAX_LAMPORTS_PER_DAY: u64 = 20_000_000_000;

/// Seconds in one day (for rolling window)
pub const SECONDS_PER_DAY: i64 = 86_400;

/// Seconds in one week
pub const SECONDS_PER_WEEK: i64 = 7 * SECONDS_PER_DAY;

/// Seconds in 30 days
pub const SECONDS_PER_MONTH: i64 = 30 * SECONDS_PER_DAY;

// ---- Bonding Curve ----

/// Precision for bonding curve math (10^12)
pub const CURVE_PRECISION: u128 = 1_000_000_000_000;

// ---- Seeds ----

pub const SEED_CURVE: &[u8] = b"curve";
pub const SEED_VAULT: &[u8] = b"vault";
pub const SEED_REWARDS: &[u8] = b"rewards";
pub const SEED_LIMITER: &[u8] = b"limiter";
pub const SEED_REWARD_STATE: &[u8] = b"reward_state";
pub const SEED_ENGAGEMENT: &[u8] = b"engagement";

// ---- Initial Liquidity ----

/// Minimum SOL a creator must inject into the bonding curve at creation.
/// 0.03 SOL — Gives the token a non-zero starting value.
pub const MIN_INITIAL_LIQUIDITY: u64 = 30_000_000; // 0.03 SOL = 30M lamports

/// Maximum initial liquidity to prevent price manipulation (10 SOL)
pub const MAX_INITIAL_LIQUIDITY: u64 = 10_000_000_000; // 10 SOL

// ---- Treasury ----

/// Protocol treasury wallet (receives 20% of fees).
/// Pubkey: 6Jiop19yLzazX6vig4i4jKMRXRjFJumTWBZNgU2cAodM
pub const TREASURY_WALLET: Pubkey = Pubkey::new_from_array([
    78, 212, 148, 109, 151, 133, 91, 234, 175, 199, 198, 69, 217, 119, 90, 107,
    114, 0, 59, 119, 164, 109, 203, 109, 23, 150, 2, 88, 102, 171, 22, 44,
]);

// ---- Engagement Rewards ----

/// Minimum actions per epoch to qualify for reward claims
pub const MIN_ENGAGEMENT_ACTIONS: u16 = 4;

/// Epoch duration in seconds (30 days)
pub const ENGAGEMENT_EPOCH_DURATION: i64 = 30 * 24 * 60 * 60; // 2_592_000

/// Protocol authority pubkey (oracle API signer)
/// Pubkey: HwjhotCERc13H1HVpmejq9mEjJAKUccutx9LzVLQshkH
pub const PROTOCOL_AUTHORITY: Pubkey = Pubkey::new_from_array([
    251, 192, 163, 189, 237, 131, 160, 77, 242, 237, 73, 235, 117, 30, 198, 23,
    111, 140, 246, 93, 102, 215, 206, 245, 18, 173, 24, 243, 242, 50, 247, 14,
]);
