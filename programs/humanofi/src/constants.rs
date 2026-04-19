// ========================================
// Humanofi — Protocol Constants (v3.7)
// ========================================
//
// The Human Curve™ — All protocol parameters in one place.
// Every value here maps directly to the mathematical spec.
//
// v3.7 changes:
//   - Asymmetric fee split: belief vs doubt philosophy
//   - Buy: 3% creator + 1% protocol + 1% depth = 5%
//   - Sell: 1% creator + 3% protocol + 1% depth = 5%
//   - Creator sell: unchanged 6% (5% protocol + 1% depth)
//   - Founder Buy: unchanged 3% (2% protocol + 1% depth)

use anchor_lang::prelude::*;

// ---- Token ----

/// Token decimals (standard SPL Token-2022)
pub const TOKEN_DECIMALS: u8 = 6;

/// One full token in base units (10^6)
pub const ONE_TOKEN: u64 = 1_000_000;

// ---- Human Curve™ ----

/// Depth ratio: D = 20 × V (the depth parameter, never withdrawable).
/// D is a mathematical parameter that gives the curve depth from day 1
/// — like Curve Finance's amplification factor A.
/// Nobody can ever withdraw D. It only exists in the x · y = k formula.
/// ⚠️ IMMUTABLE AFTER CREATION — modifying D breaks solvency invariant
pub const DEPTH_RATIO: u64 = 18;

/// Initial token reserve: y₀ = 1,000,000 tokens (in base units with 6 decimals)
/// All tokens in Humanofi start with this same reserve.
/// At creation: x₀ = D = DEPTH_RATIO × V, k₀ = x₀ × y₀
/// After Founder Buy: x = D + sol_to_curve + depth_fee ≈ 18.98V
/// Creator receives ~5.1% of supply (~51,000 tokens)
pub const INITIAL_Y: u128 = 1_000_000 * 1_000_000; // 1M × 10^6 = 10^12

// ---- Holder BUY Fees (5% total) ----
//
// v3.7: Asymmetric split — BUY rewards the creator (belief).
//
// 3% → Creator Fee Vault (PDA, claimable every 15 days)
// 1% → Protocol Treasury (immediate)
// 1% → k-Deepening (stays in x, state update only)

/// Total fee in basis points (5%) — same for buy and sell
pub const TOTAL_FEE_BPS: u64 = 500;

/// BUY: Creator's share: 3% → Creator Fee Vault PDA
pub const BUY_FEE_CREATOR_BPS: u64 = 300;

/// BUY: Protocol share: 1% → Protocol Treasury
pub const BUY_FEE_PROTOCOL_BPS: u64 = 100;

/// k-Deepening share: 1% → stays in x (state update only)
pub const FEE_DEPTH_BPS: u64 = 100;

// ---- Holder SELL Fees (5% total) ----
//
// v3.7: Asymmetric split — SELL feeds the protocol treasury (doubt).
//
// 1% → Creator Fee Vault (PDA, claimable every 15 days)
// 3% → Protocol Treasury (immediate)
// 1% → k-Deepening (stays in x, state update only)

/// SELL: Creator's share: 1% → Creator Fee Vault PDA
pub const SELL_FEE_CREATOR_BPS: u64 = 100;

/// SELL: Protocol share: 3% → Protocol Treasury
pub const SELL_FEE_PROTOCOL_BPS: u64 = 300;

/// Precision for basis points calculations
pub const BPS_DENOMINATOR: u64 = 10_000;

// ---- Creator Sell Fees (6% total, no self-fee) ----
//
// When the creator sells their own tokens, they don't earn creator fees
// on their own transactions. The protocol takes a higher cut instead.
//
// 5% → Protocol Treasury (immediate)
// 1% → k-Deepening (stays in x, state update only)

/// Total fee for creator sells (6%)
pub const CREATOR_SELL_FEE_BPS: u64 = 600;

/// Protocol share on creator sell: 5% → Protocol Treasury
pub const CREATOR_SELL_PROTOCOL_BPS: u64 = 500;

/// k-Deepening share on creator sell: 1% → stays in x
pub const CREATOR_SELL_DEPTH_BPS: u64 = 100;

// ---- Founder Buy ----
//
// At token creation, the creator buys tokens at P₀ using their initial
// liquidity deposit V. This gives them skin-in-the-game at the lowest price.
//
// Fee structure: 3% total (2% protocol + 1% depth). No creator self-fee.

/// Founder Buy total fee (3%)
pub const FOUNDER_BUY_FEE_BPS: u64 = 300;

/// Founder Buy protocol fee (2%) → Protocol Treasury
pub const FOUNDER_BUY_PROTOCOL_BPS: u64 = 200;

/// Founder Buy depth fee (1%) → k-deepening
pub const FOUNDER_BUY_DEPTH_BPS: u64 = 100;

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
//
// v3.6: The Stabilizer is DORMANT because Merit Reward is removed.
// Protocol never accumulates tokens → protocol_balance = 0 always.
// These constants are kept for future bidirectional market maker activation.

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
pub const SEED_CONFIG: &[u8] = b"protocol_config";

// ---- Treasury ----

/// Protocol treasury wallet (receives fees from trades + Founder Buy).
/// Pubkey: 6Jiop19yLzazX6vig4i4jKMRXRjFJumTWBZNgU2cAodM
pub const TREASURY_WALLET: Pubkey = Pubkey::new_from_array([
    78, 212, 148, 109, 151, 133, 91, 234, 175, 199, 198, 69, 217, 119, 90, 107,
    114, 0, 59, 119, 164, 109, 203, 109, 23, 150, 2, 88, 102, 171, 22, 44,
]);
