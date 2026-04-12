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
//
// v2: Simplified fee structure for legal compliance.
//     Holder rewards REMOVED to avoid securities classification.
//
// 3% → Creator Fee Vault (PDA, claimable every 15 days)
// 2% → Protocol Treasury (immediate)
// 1% → k-Deepening (stays in x, state update only)

/// Total fee in basis points (6%)
pub const TOTAL_FEE_BPS: u64 = 600;

/// Creator's share of fees: 3% of transaction volume → Creator Fee Vault PDA
pub const FEE_CREATOR_BPS: u64 = 300;

/// Protocol treasury share: 2% of transaction volume → immediate
pub const FEE_PROTOCOL_BPS: u64 = 200;

/// k-Deepening share: 1% of transaction volume → stays in x (state update only)
pub const FEE_DEPTH_BPS: u64 = 100;

/// Precision for basis points calculations
pub const BPS_DENOMINATOR: u64 = 10_000;

// ---- Merit Reward (α = 14% total: 10% creator + 4% protocol) ----
//
// v2: Rebalanced to boost the Price Stabilizer.
//     Creator reduced from 12.6% → 10% (keeps skin-in-the-game)
//     Protocol increased from 1.4% → 4% (Stabilizer ~3× more powerful)

/// Creator portion of Merit Reward: 10% of tokens produced
pub const ALPHA_CREATOR_BPS: u64 = 1_000;

/// Protocol portion of Merit Reward: 4% of tokens produced (→ ProtocolVault)
pub const ALPHA_PROTOCOL_BPS: u64 = 400;

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

// ---- Creator Fee Claim ----

/// Cooldown between creator fee claims: 15 days (in seconds)
pub const CREATOR_FEE_CLAIM_COOLDOWN: i64 = 15 * 24 * 60 * 60; // 1_296_000

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
pub const SEED_CREATOR_FEES: &[u8] = b"creator_fees";
pub const SEED_PROTOCOL_VAULT: &[u8] = b"protocol_vault";

// ---- Treasury ----

/// Protocol treasury wallet (receives 2% of fees).
/// Pubkey: 6Jiop19yLzazX6vig4i4jKMRXRjFJumTWBZNgU2cAodM
pub const TREASURY_WALLET: Pubkey = Pubkey::new_from_array([
    78, 212, 148, 109, 151, 133, 91, 234, 175, 199, 198, 69, 217, 119, 90, 107,
    114, 0, 59, 119, 164, 109, 203, 109, 23, 150, 2, 88, 102, 171, 22, 44,
]);
