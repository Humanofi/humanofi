// ========================================
// Humanofi — The Human Curve™ (Bonding Curve PDA)
// ========================================
//
// Implements the proprietary constant-product AMM: x · y = k(t)
//
// Innovations:
//   1. Merit Reward (α = 14%) — 12.6% creator + 1.4% protocol
//   2. k-Evolution — Curve depth grows with volume (1% of each tx)
//   3. Smart Sell Limiter — Creator capped at 5% price impact per sell
//   4. Price Stabilizer — Auto-sells protocol tokens to smooth price spikes
//
// x = sol_reserve + D (Depth Parameter). D = 20×V, mathematical depth, never withdrawable.
//
// All math uses u128 to prevent overflow.
// Token amounts are in base units (6 decimals = 10^6).
// SOL amounts are in lamports (9 decimals = 10^9).
//
// Seeds: ["curve", mint_pubkey]

use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::HumanofiError;

// ────────────────────────────────────────────────────────
// Result structs for buy/sell/stabilize calculations
// ────────────────────────────────────────────────────────

/// Result of a buy calculation — all amounts in lamports/base units
#[derive(Debug, Clone)]
pub struct BuyResult {
    /// SOL entering the curve (after fees)
    pub sol_to_curve: u64,
    /// Tokens produced by the curve (total)
    pub tokens_total: u64,
    /// Tokens going to the buyer (86%)
    pub tokens_buyer: u64,
    /// Tokens going to the creator (12.6% Merit Reward)
    pub tokens_creator: u64,
    /// Tokens going to the protocol vault (1.4% Merit Fee)
    pub tokens_protocol: u64,
    /// Fee breakdown
    pub fee_creator: u64,
    pub fee_holders: u64,
    pub fee_protocol: u64,
    pub fee_depth: u64,
    /// New curve state after buy
    pub new_x: u128,
    pub new_y: u128,
    pub new_k: u128,
}

/// Result of a sell calculation — all amounts in lamports/base units
#[derive(Debug, Clone)]
pub struct SellResult {
    /// Gross SOL from the curve before fees
    pub sol_gross: u64,
    /// Net SOL the seller receives (after 6% fees)
    pub sol_net: u64,
    /// Fee breakdown
    pub fee_creator: u64,
    pub fee_holders: u64,
    pub fee_protocol: u64,
    pub fee_depth: u64,
    /// New curve state after sell
    pub new_x: u128,
    pub new_y: u128,
    pub new_k: u128,
}

/// Result of a Price Stabilizer calculation
#[derive(Debug, Clone)]
pub struct StabilizerResult {
    /// Tokens the protocol burns to stabilize the price
    pub tokens_to_sell: u64,
    /// Gross SOL extracted from the curve
    pub sol_extracted: u64,
    /// SOL net after 6% fees
    pub sol_net: u64,
    /// Fee breakdown (standard 6% applies)
    pub fee_creator: u64,
    pub fee_holders: u64,
    pub fee_protocol: u64,
    pub fee_depth: u64,
    /// New curve state after stabilization
    pub new_x: u128,
    pub new_y: u128,
    pub new_k: u128,
}

// ────────────────────────────────────────────────────────
// BondingCurve Account
// ────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct BondingCurve {
    /// The Token-2022 mint this curve manages
    pub mint: Pubkey,

    /// The creator who launched this token
    pub creator: Pubkey,

    // ---- Human Curve™: x · y = k(t) ----

    /// Total curve reserve (lamports) = sol_reserve + depth_parameter
    /// x = vault_réel + D (D is a mathematical depth parameter, not real SOL)
    pub x: u128,

    /// Token reserve counter (decreases on buy, increases on sell)
    /// Starts at INITIAL_Y = 10^12 base units
    pub y: u128,

    /// The curve invariant — EVOLVES via k-deepening
    /// k(0) = x₀ · y₀, k(t+1) ≥ k(t) always
    pub k: u128,

    // ---- Supply tracking ----

    /// Tokens held by public holders (buyers)
    pub supply_public: u64,

    /// Tokens held by the creator (Merit Reward, locked)
    pub supply_creator: u64,

    /// Tokens held by protocol vault (Merit Fee, used by Stabilizer)
    pub supply_protocol: u64,

    // ---- SOL tracking ----

    /// Real SOL in the vault (lamports) — what the PDA actually holds
    /// INVARIANT: sol_reserve = x - depth_parameter at all times
    pub sol_reserve: u64,

    /// Depth Parameter D = DEPTH_RATIO × V (fixed at creation, never changes)
    /// This is NOT real SOL. It's a mathematical parameter that gives
    /// the curve depth from day 1, like Curve Finance's amplification factor A.
    /// Nobody can ever withdraw D. It only exists in the formula.
    /// ⚠️ IMMUTABLE AFTER CREATION — modifying D breaks solvency invariant
    pub depth_parameter: u64,

    // ---- Price Stabilizer (EMA TWAP) ----

    /// EMA of price (P × PRICE_PRECISION for precision)
    /// Updated after every buy/sell
    pub twap_price: u128,

    /// Number of trades processed (for initial seeding of TWAP)
    pub trade_count: u64,

    // ---- Metadata ----

    /// Unix timestamp of token creation
    pub created_at: i64,

    /// Whether the curve is active (can be deactivated by governance)
    pub is_active: bool,

    /// PDA bump seed
    pub bump: u8,
}

impl BondingCurve {
    // ────────────────────────────────────────
    // Price
    // ────────────────────────────────────────

    /// Spot price P = x / y (in lamports per base token unit)
    /// Returned as a scaled value: P × PRICE_PRECISION for precision
    pub fn get_spot_price(&self) -> Result<u128> {
        require!(self.y > 0, HumanofiError::PoolDepleted);
        let price = self.x
            .checked_mul(PRICE_PRECISION)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(self.y)
            .ok_or(HumanofiError::PoolDepleted)?;
        Ok(price)
    }

    /// Spot price as lamports per whole token (for display)
    /// P_display = x * ONE_TOKEN / y
    pub fn get_price_per_token(&self) -> Result<u64> {
        require!(self.y > 0, HumanofiError::PoolDepleted);
        let price = self.x
            .checked_mul(ONE_TOKEN as u128)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(self.y)
            .ok_or(HumanofiError::PoolDepleted)?;
        u64::try_from(price).map_err(|_| HumanofiError::MathOverflow.into())
    }

    // ────────────────────────────────────────
    // TWAP (EMA)
    // ────────────────────────────────────────

    /// Update the EMA TWAP after a trade.
    /// P_ref = α × P_spot + (1 − α) × P_ref_old
    /// where α = EMA_ALPHA_NUM / EMA_ALPHA_DEN = 20%
    pub fn update_twap(&mut self) -> Result<()> {
        let p_spot = self.get_spot_price()?;

        if self.trade_count == 0 {
            // First trade: seed TWAP with current price
            self.twap_price = p_spot;
        } else {
            // EMA: new = α·spot + (1-α)·old
            let weighted_spot = p_spot
                .checked_mul(EMA_ALPHA_NUM)
                .ok_or(HumanofiError::MathOverflow)?;
            let weighted_old = self.twap_price
                .checked_mul(EMA_ALPHA_DEN.checked_sub(EMA_ALPHA_NUM).ok_or(HumanofiError::MathOverflow)?)
                .ok_or(HumanofiError::MathOverflow)?;
            self.twap_price = weighted_spot
                .checked_add(weighted_old)
                .ok_or(HumanofiError::MathOverflow)?
                .checked_div(EMA_ALPHA_DEN)
                .ok_or(HumanofiError::MathOverflow)?;
        }

        self.trade_count = self.trade_count.saturating_add(1);
        Ok(())
    }

    // ────────────────────────────────────────
    // BUY Calculation
    // ────────────────────────────────────────

    /// Calculate the result of a buy for `sol_brut` lamports.
    ///
    /// Order of operations:
    ///   1. Calculate fees (6% total)
    ///   2. Apply k-deepening: x += depth, k = x * y
    ///   3. Remaining SOL enters the curve
    ///   4. Curve produces Δy_total tokens
    ///   5. Split: 86% buyer, 12.6% creator, 1.4% protocol
    pub fn calculate_buy(&self, sol_brut: u64) -> Result<BuyResult> {
        require!(sol_brut > 0, HumanofiError::ZeroPurchaseAmount);
        require!(self.y > 0, HumanofiError::PoolDepleted);

        // ── Step 1: Calculate fees (6%) ──
        let fee_total = crate::utils::ceil_div_u64(
            sol_brut.checked_mul(TOTAL_FEE_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        let fee_creator = crate::utils::ceil_div_u64(
            sol_brut.checked_mul(FEE_CREATOR_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        let fee_holders = crate::utils::ceil_div_u64(
            sol_brut.checked_mul(FEE_HOLDERS_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        let fee_depth = crate::utils::ceil_div_u64(
            sol_brut.checked_mul(FEE_DEPTH_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        // Protocol gets the remainder
        let fee_protocol = fee_total
            .saturating_sub(fee_creator)
            .saturating_sub(fee_holders)
            .saturating_sub(fee_depth);

        let sol_to_curve = sol_brut
            .checked_sub(fee_total)
            .ok_or(HumanofiError::FeeOverflow)?;

        // ── Step 2: k-deepening ──
        let x_after_depth = self.x
            .checked_add(fee_depth as u128)
            .ok_or(HumanofiError::MathOverflow)?;
        let k_after_depth = x_after_depth
            .checked_mul(self.y)
            .ok_or(HumanofiError::MathOverflow)?;

        // ── Step 3: SOL enters the curve ──
        let x_new = x_after_depth
            .checked_add(sol_to_curve as u128)
            .ok_or(HumanofiError::MathOverflow)?;

        // ── Step 4: Curve produces tokens ──
        let y_new = k_after_depth
            .checked_div(x_new)
            .ok_or(HumanofiError::PoolDepleted)?;

        let dy_total = self.y
            .checked_sub(y_new)
            .ok_or(HumanofiError::PoolDepleted)?;

        require!(dy_total > 0, HumanofiError::PriceCalculationZero);

        // ── Step 5: Merit Reward split (12.6% creator + 1.4% protocol) ──
        let dy_total_u64 = u64::try_from(dy_total)
            .map_err(|_| HumanofiError::MathOverflow)?;

        // tokens_creator = 12.6% of dy_total
        let tokens_creator = (dy_total as u128)
            .checked_mul(ALPHA_CREATOR_BPS as u128)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(HumanofiError::MathOverflow)?;
        let tokens_creator_u64 = u64::try_from(tokens_creator)
            .map_err(|_| HumanofiError::MathOverflow)?;

        // tokens_protocol = 1.4% of dy_total
        let tokens_protocol = (dy_total as u128)
            .checked_mul(ALPHA_PROTOCOL_BPS as u128)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(HumanofiError::MathOverflow)?;
        let tokens_protocol_u64 = u64::try_from(tokens_protocol)
            .map_err(|_| HumanofiError::MathOverflow)?;

        // tokens_buyer = remainder (avoids rounding errors)
        let tokens_buyer = dy_total_u64
            .checked_sub(tokens_creator_u64)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_sub(tokens_protocol_u64)
            .ok_or(HumanofiError::MathOverflow)?;

        Ok(BuyResult {
            sol_to_curve,
            tokens_total: dy_total_u64,
            tokens_buyer,
            tokens_creator: tokens_creator_u64,
            tokens_protocol: tokens_protocol_u64,
            fee_creator,
            fee_holders,
            fee_protocol,
            fee_depth,
            new_x: x_new,
            new_y: y_new,
            new_k: k_after_depth,
        })
    }

    /// Apply a buy result to the curve state
    pub fn apply_buy(&mut self, result: &BuyResult) -> Result<()> {
        self.x = result.new_x;
        self.y = result.new_y;
        self.k = result.new_k;

        self.supply_public = self.supply_public
            .checked_add(result.tokens_buyer)
            .ok_or(HumanofiError::MathOverflow)?;
        self.supply_creator = self.supply_creator
            .checked_add(result.tokens_creator)
            .ok_or(HumanofiError::MathOverflow)?;
        self.supply_protocol = self.supply_protocol
            .checked_add(result.tokens_protocol)
            .ok_or(HumanofiError::MathOverflow)?;

        self.sol_reserve = self.sol_reserve
            .checked_add(result.sol_to_curve)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_add(result.fee_depth)
            .ok_or(HumanofiError::MathOverflow)?;

        Ok(())
    }

    // ────────────────────────────────────────
    // SELL Calculation
    // ────────────────────────────────────────

    /// Calculate the result of selling `token_amount` base units.
    pub fn calculate_sell(&self, token_amount: u64) -> Result<SellResult> {
        require!(token_amount > 0, HumanofiError::ZeroAmount);
        require!(self.y > 0, HumanofiError::PoolDepleted);

        let t = token_amount as u128;

        // ── Step 1: Tokens return to y ──
        let y_new = self.y
            .checked_add(t)
            .ok_or(HumanofiError::MathOverflow)?;

        // ── Step 2: Calculate gross SOL ──
        let x_after = self.k
            .checked_div(y_new)
            .ok_or(HumanofiError::MathOverflow)?;

        let dx_brut = self.x
            .checked_sub(x_after)
            .ok_or(HumanofiError::InsufficientReserve)?;

        let sol_gross = u64::try_from(dx_brut)
            .map_err(|_| HumanofiError::MathOverflow)?;

        require!(sol_gross > 0, HumanofiError::PriceCalculationZero);

        // ── Step 3: Calculate fees (6%) ──
        let fee_total = crate::utils::ceil_div_u64(
            sol_gross.checked_mul(TOTAL_FEE_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        let fee_creator = crate::utils::ceil_div_u64(
            sol_gross.checked_mul(FEE_CREATOR_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        let fee_holders = crate::utils::ceil_div_u64(
            sol_gross.checked_mul(FEE_HOLDERS_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        let fee_depth = crate::utils::ceil_div_u64(
            sol_gross.checked_mul(FEE_DEPTH_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        let fee_protocol = fee_total
            .saturating_sub(fee_creator)
            .saturating_sub(fee_holders)
            .saturating_sub(fee_depth);

        let sol_net = sol_gross
            .checked_sub(fee_total)
            .ok_or(HumanofiError::FeeOverflow)?;

        // ── Step 4: k-deepening ──
        let x_final = self.x
            .checked_sub(dx_brut)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_add(fee_depth as u128)
            .ok_or(HumanofiError::MathOverflow)?;

        let k_new = x_final
            .checked_mul(y_new)
            .ok_or(HumanofiError::MathOverflow)?;

        // Verify the real vault has enough SOL
        let total_out = sol_net
            .checked_add(fee_creator)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_add(fee_holders)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_add(fee_protocol)
            .ok_or(HumanofiError::MathOverflow)?;

        require!(
            self.sol_reserve >= total_out,
            HumanofiError::InsufficientReserve
        );

        Ok(SellResult {
            sol_gross,
            sol_net,
            fee_creator,
            fee_holders,
            fee_protocol,
            fee_depth,
            new_x: x_final,
            new_y: y_new,
            new_k: k_new,
        })
    }

    /// Apply a sell result to the curve state.
    pub fn apply_sell(&mut self, result: &SellResult) -> Result<()> {
        self.x = result.new_x;
        self.y = result.new_y;
        self.k = result.new_k;

        let total_out = result.sol_net
            .checked_add(result.fee_creator)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_add(result.fee_holders)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_add(result.fee_protocol)
            .ok_or(HumanofiError::MathOverflow)?;

        self.sol_reserve = self.sol_reserve
            .checked_sub(total_out)
            .ok_or(HumanofiError::InsufficientReserve)?;

        Ok(())
    }

    /// Update supply after sell
    pub fn deduct_supply(&mut self, token_amount: u64, is_creator: bool) -> Result<()> {
        if is_creator {
            self.supply_creator = self.supply_creator
                .checked_sub(token_amount)
                .ok_or(HumanofiError::InsufficientTokenBalance)?;
        } else {
            self.supply_public = self.supply_public
                .checked_sub(token_amount)
                .ok_or(HumanofiError::InsufficientTokenBalance)?;
        }
        Ok(())
    }

    // ────────────────────────────────────────
    // Price Stabilizer
    // ────────────────────────────────────────

    /// Check if stabilization is needed and calculate the sell.
    ///
    /// The Stabilizer activates when P_spot deviates > ρ from the TWAP.
    /// It sells protocol tokens to push price back toward TWAP.
    ///
    /// Returns None if no stabilization needed or T_protocol = 0.
    pub fn calculate_stabilization(&self, protocol_balance: u64) -> Result<Option<StabilizerResult>> {
        // Skip if no protocol tokens or no TWAP history
        if protocol_balance == 0 || self.trade_count < 2 {
            return Ok(None);
        }

        let p_spot = self.get_spot_price()?;

        // Check if price deviated above TWAP by more than ρ
        // Condition: (P_spot - P_ref) / P_ref > ρ
        // Equivalent: P_spot * BPS > P_ref * (BPS + ρ)
        let threshold = self.twap_price
            .checked_mul((BPS_DENOMINATOR as u128).checked_add(STABILIZER_THRESHOLD_BPS as u128).ok_or(HumanofiError::MathOverflow)?)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(HumanofiError::MathOverflow)?;

        if p_spot <= threshold {
            return Ok(None); // Price within acceptable range
        }

        // Target price: P_target = P_ref × (1 + ρ/2) — halfway back
        let p_target = self.twap_price
            .checked_mul(
                (BPS_DENOMINATOR as u128)
                    .checked_add((STABILIZER_THRESHOLD_BPS / 2) as u128)
                    .ok_or(HumanofiError::MathOverflow)?
            )
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(HumanofiError::MathOverflow)?;

        // Calculate δ tokens to sell to reach P_target
        // P = x/y and k = x·y → x = k/y → P = k/y²
        // P_target = k / y_target² → y_target² = k / P_unscaled
        // where P_unscaled = P_target / PRICE_PRECISION
        //
        // To avoid overflow: y_target = √(k · PRICE_PRECISION / P_target)
        // But k · PRICE_PRECISION can overflow.
        //
        // Alternative: y_target = √(k) · √(PRICE_PRECISION) / √(P_target)
        // This is safe because each sqrt fits in u128.
        let sqrt_k = crate::utils::isqrt_u128(self.k);
        let sqrt_prec = crate::utils::isqrt_u128(PRICE_PRECISION); // = 10^9
        let sqrt_p_target = crate::utils::isqrt_u128(p_target);

        if sqrt_p_target == 0 {
            return Ok(None);
        }

        let y_target = sqrt_k
            .checked_mul(sqrt_prec)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(sqrt_p_target)
            .ok_or(HumanofiError::MathOverflow)?;

        if y_target <= self.y {
            return Ok(None); // Would need to buy, not sell
        }

        let mut delta = y_target
            .checked_sub(self.y)
            .ok_or(HumanofiError::MathOverflow)?;

        // Constraint 1: max 50% of protocol balance
        let max_from_balance = (protocol_balance as u128)
            .checked_mul(STABILIZER_MAX_SELL_PCT as u128)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(100)
            .ok_or(HumanofiError::MathOverflow)?;
        if delta > max_from_balance {
            delta = max_from_balance;
        }

        let delta_u64 = u64::try_from(delta)
            .map_err(|_| HumanofiError::MathOverflow)?;

        if delta_u64 == 0 {
            return Ok(None);
        }

        // Calculate the sell result for δ tokens
        // This is equivalent to a regular sell executed by the protocol
        let y_new = self.y
            .checked_add(delta)
            .ok_or(HumanofiError::MathOverflow)?;
        let x_after = self.k
            .checked_div(y_new)
            .ok_or(HumanofiError::MathOverflow)?;
        let dx_brut = self.x
            .checked_sub(x_after)
            .ok_or(HumanofiError::InsufficientReserve)?;

        let sol_extracted = u64::try_from(dx_brut)
            .map_err(|_| HumanofiError::MathOverflow)?;

        if sol_extracted == 0 {
            return Ok(None);
        }

        // Constraint 2: max 1% price impact from stabilizer
        // Check: dx_brut / x ≤ 1%
        let max_impact = self.x
            .checked_mul(STABILIZER_MAX_IMPACT_BPS as u128)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(HumanofiError::MathOverflow)?;
        if dx_brut > max_impact {
            return Ok(None); // Would exceed max impact, skip
        }

        // Standard 6% fees on the extracted SOL
        let fee_total = crate::utils::ceil_div_u64(
            sol_extracted.checked_mul(TOTAL_FEE_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        let fee_creator = crate::utils::ceil_div_u64(
            sol_extracted.checked_mul(FEE_CREATOR_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        let fee_holders = crate::utils::ceil_div_u64(
            sol_extracted.checked_mul(FEE_HOLDERS_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        let fee_depth = crate::utils::ceil_div_u64(
            sol_extracted.checked_mul(FEE_DEPTH_BPS).ok_or(HumanofiError::FeeOverflow)?,
            BPS_DENOMINATOR,
        );
        let fee_protocol = fee_total
            .saturating_sub(fee_creator)
            .saturating_sub(fee_holders)
            .saturating_sub(fee_depth);

        let sol_net = sol_extracted.saturating_sub(fee_total);

        // k-deepening on stabilizer sell too
        let x_final = self.x
            .checked_sub(dx_brut)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_add(fee_depth as u128)
            .ok_or(HumanofiError::MathOverflow)?;
        let k_new = x_final
            .checked_mul(y_new)
            .ok_or(HumanofiError::MathOverflow)?;

        // Constraint 3: P_stable >= P_ref
        let p_stable = x_final
            .checked_mul(PRICE_PRECISION)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(y_new)
            .ok_or(HumanofiError::PoolDepleted)?;
        if p_stable < self.twap_price {
            return Ok(None); // Would push below TWAP, abort
        }

        // Verify solvency
        let total_out = sol_net
            .checked_add(fee_creator).ok_or(HumanofiError::MathOverflow)?
            .checked_add(fee_holders).ok_or(HumanofiError::MathOverflow)?
            .checked_add(fee_protocol).ok_or(HumanofiError::MathOverflow)?;
        if self.sol_reserve < total_out {
            return Ok(None);
        }

        Ok(Some(StabilizerResult {
            tokens_to_sell: delta_u64,
            sol_extracted,
            sol_net,
            fee_creator,
            fee_holders,
            fee_protocol,
            fee_depth,
            new_x: x_final,
            new_y: y_new,
            new_k: k_new,
        }))
    }

    /// Apply stabilization result to the curve
    pub fn apply_stabilization(&mut self, result: &StabilizerResult) -> Result<()> {
        self.x = result.new_x;
        self.y = result.new_y;
        self.k = result.new_k;

        self.supply_protocol = self.supply_protocol
            .checked_sub(result.tokens_to_sell)
            .ok_or(HumanofiError::InsufficientTokenBalance)?;

        // SOL leaving the vault: sol_net + creator + holders + protocol fees
        // fee_depth stays in the vault
        let total_out = result.sol_net
            .checked_add(result.fee_creator).ok_or(HumanofiError::MathOverflow)?
            .checked_add(result.fee_holders).ok_or(HumanofiError::MathOverflow)?
            .checked_add(result.fee_protocol).ok_or(HumanofiError::MathOverflow)?;

        self.sol_reserve = self.sol_reserve
            .checked_sub(total_out)
            .ok_or(HumanofiError::InsufficientReserve)?;

        Ok(())
    }

    // ────────────────────────────────────────
    // Smart Sell Limiter
    // ────────────────────────────────────────

    /// Calculate the maximum tokens ANY seller can sell in one transaction.
    /// Universal Smart Sell Limiter: max 5% price impact per sell.
    pub fn get_max_sell_amount(&self) -> Result<u64> {
        crate::utils::smart_sell_max(self.y, SELL_IMPACT_BPS)
    }

    // ────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────

    /// Total supply in circulation
    pub fn total_supply(&self) -> u64 {
        self.supply_public
            .saturating_add(self.supply_creator)
            .saturating_add(self.supply_protocol)
    }

    /// Market cap in lamports: P × S_tot
    pub fn market_cap_lamports(&self) -> Result<u64> {
        if self.y == 0 { return Ok(0); }
        let mc = self.x
            .checked_mul(self.total_supply() as u128)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(self.y)
            .ok_or(HumanofiError::PoolDepleted)?;
        u64::try_from(mc).map_err(|_| HumanofiError::MathOverflow.into())
    }
}
