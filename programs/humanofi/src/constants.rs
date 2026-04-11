// ========================================
// Humanofi — Protocol Constants
// ========================================
//
// The Human Curve™ — All protocol parameters in one place.
// Every value here maps directly to the mathematical spec
// in docs/humanofi-mathematiques.md

use anchor_lang::prelude::*;

// ---- Token ----

/// Token decimals (standard SPL Token-2022)
pub const TOKEN_DECIMALS: u8 = 6;

/// One full token in base units (10^6)
pub const ONE_TOKEN: u64 = 1_000_000;

// ---- Human Curve™ ----

/// Depth multiplier: x₀ = (1 + DEPTH_RATIO) × V = 21 × V
/// D = DEPTH_RATIO × V is a mathematical parameter (not real SOL)
/// It gives the curve depth from day 1 — like Curve's A parameter.
pub const DEPTH_TOTAL_MULTIPLIER: u64 = 21;

/// Depth ratio: D = 20 × V (the depth parameter, never withdrawable)
pub const DEPTH_RATIO: u64 = 20;

/// Initial token reserve: y₀ = 1,000,000 tokens (in base units with 6 decimals)
/// All tokens in Humanofi start with this same reserve.
/// x₀ = DEPTH_TOTAL_MULTIPLIER × V
/// k₀ = x₀ × y₀
pub const INITIAL_Y: u128 = 1_000_000 * 1_000_000; // 1M × 10^6 = 10^12

// ---- Fees (6% total) ----

/// Total fee in basis points (6%)
pub const TOTAL_FEE_BPS: u64 = 600;

/// Creator's share of fees: 2% of transaction volume → SOL, immediate
pub const FEE_CREATOR_BPS: u64 = 200;

/// Holders' share of fees: 2% of transaction volume → reward pool
pub const FEE_HOLDERS_BPS: u64 = 200;

/// Protocol treasury share: 1% of transaction volume
pub const FEE_PROTOCOL_BPS: u64 = 100;

/// k-Deepening share: 1% of transaction volume → stays in x (state update only)
pub const FEE_DEPTH_BPS: u64 = 100;

/// Precision for basis points calculations
pub const BPS_DENOMINATOR: u64 = 10_000;

// ---- Merit Reward (α = 14% total: 12.6% creator + 1.4% protocol) ----

/// Creator portion of Merit Reward: 12.6% of tokens produced
pub const ALPHA_CREATOR_BPS: u64 = 1_260;

/// Protocol portion of Merit Reward: 1.4% of tokens produced (→ ProtocolVault)
pub const ALPHA_PROTOCOL_BPS: u64 = 140;

/// Buyer token share: 100% - α = 86%
pub const BUYER_SHARE_BPS: u64 = 8_600;

// ---- Smart Sell Limiter ----

/// Maximum price impact per creator sell: 5%
/// T_max = y × (1/√(1 - I) - 1) ≈ y × 0.02598
pub const SELL_IMPACT_BPS: u64 = 500; // 5%

/// Cooldown between creator sells: 30 days (in seconds)
pub const CREATOR_SELL_COOLDOWN: i64 = 30 * 24 * 60 * 60; // 2_592_000

/// Creator lock period: Year 1 = 0% vendable (in seconds)
pub const CREATOR_LOCK_DURATION: i64 = 365 * 24 * 60 * 60; // 31_536_000

// ---- Price Stabilizer ----

/// Trigger threshold: Stabilizer activates if price deviates > ρ from TWAP
pub const STABILIZER_THRESHOLD_BPS: u64 = 200; // 2%

/// Max fraction of protocol tokens sellable per stabilization: 50%
pub const STABILIZER_MAX_SELL_PCT: u64 = 50; // 50%

/// Max price impact the Stabilizer can cause: 1%
pub const STABILIZER_MAX_IMPACT_BPS: u64 = 100; // 1%

/// EMA smoothing factor numerator (α_ema = 20%)
/// P_ref = (EMA_ALPHA_NUM × P_spot + (EMA_ALPHA_DEN - EMA_ALPHA_NUM) × P_ref_old) / EMA_ALPHA_DEN
pub const EMA_ALPHA_NUM: u128 = 20;
pub const EMA_ALPHA_DEN: u128 = 100;

/// Precision for TWAP/price calculations (10^18)
pub const PRICE_PRECISION: u128 = 1_000_000_000_000_000_000;

// ---- Initial Liquidity ----

/// Minimum SOL a creator must inject at creation.
/// $5 ≈ 0.03 SOL @ $170/SOL
pub const MIN_INITIAL_LIQUIDITY: u64 = 30_000_000; // 0.03 SOL = 30M lamports

/// Maximum initial liquidity to prevent price manipulation (10 SOL)
pub const MAX_INITIAL_LIQUIDITY: u64 = 10_000_000_000; // 10 SOL

// ---- Seeds ----

pub const SEED_CURVE: &[u8] = b"curve";
pub const SEED_VAULT: &[u8] = b"vault";
pub const SEED_REWARDS: &[u8] = b"rewards";
pub const SEED_REWARD_STATE: &[u8] = b"reward_state";
pub const SEED_ENGAGEMENT: &[u8] = b"engagement";
pub const SEED_PROTOCOL_VAULT: &[u8] = b"protocol_vault";

// ---- Treasury ----

/// Protocol treasury wallet (receives 1% of fees).
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
