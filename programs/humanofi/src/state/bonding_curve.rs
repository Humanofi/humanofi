// ========================================
// Humanofi — Bonding Curve PDA
// ========================================
//
// Tracks the state of a token's bonding curve market.
// Also serves as the mint_authority and freeze_authority for the Token-2022 mint.
// SOL reserve is held as lamports in this PDA account.
//
// Seeds: ["curve", mint_pubkey]

use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::HumanofiError;

#[account]
#[derive(InitSpace)]
pub struct BondingCurve {
    /// The Token-2022 mint this curve manages
    pub mint: Pubkey,

    /// The creator who launched this token
    pub creator: Pubkey,

    /// Base price in lamports per token (at supply = 0)
    pub base_price: u64,

    /// Slope factor for the linear bonding curve
    /// Higher = steeper price increase
    pub slope: u64,

    /// Number of tokens currently in circulation (base units, 6 decimals)
    pub supply_sold: u64,

    /// Total SOL deposited in the curve (tracked separately from account lamports)
    pub sol_reserve: u64,

    /// Timestamp of token creation
    pub created_at: i64,

    /// Whether the curve is active (can be deactivated by governance)
    pub is_active: bool,

    /// PDA bump seed
    pub bump: u8,
}

impl BondingCurve {
    /// Calculate the current spot price at the current supply level.
    /// price(s) = base_price + slope * s / CURVE_PRECISION
    pub fn get_current_price(&self) -> Result<u64> {
        let slope_component = (self.slope as u128)
            .checked_mul(self.supply_sold as u128)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(CURVE_PRECISION)
            .ok_or(HumanofiError::MathOverflow)?;

        let price = (self.base_price as u128)
            .checked_add(slope_component)
            .ok_or(HumanofiError::MathOverflow)?;

        Ok(price as u64)
    }

    /// Calculate the SOL cost to buy `token_amount` tokens at current supply.
    ///
    /// Uses the integral of the linear price function:
    /// cost = base_price * amount + slope * (2 * supply * amount + amount²) / (2 * PRECISION)
    pub fn calculate_buy_cost(&self, token_amount: u64) -> Result<u64> {
        let s = self.supply_sold as u128;
        let a = token_amount as u128;
        let b = self.base_price as u128;
        let m = self.slope as u128;

        // base_cost = base_price * amount
        let base_cost = b.checked_mul(a).ok_or(HumanofiError::MathOverflow)?;

        // slope_cost = slope * (2 * supply * amount + amount^2) / (2 * PRECISION)
        let two_s_a = s
            .checked_mul(2)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_mul(a)
            .ok_or(HumanofiError::MathOverflow)?;
        let a_squared = a.checked_mul(a).ok_or(HumanofiError::MathOverflow)?;
        let numerator = two_s_a
            .checked_add(a_squared)
            .ok_or(HumanofiError::MathOverflow)?;
        let slope_cost = m
            .checked_mul(numerator)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(2 * CURVE_PRECISION)
            .ok_or(HumanofiError::MathOverflow)?;

        let total = base_cost
            .checked_add(slope_cost)
            .ok_or(HumanofiError::MathOverflow)?;

        Ok(total as u64)
    }

    /// Calculate the SOL returned when selling `token_amount` tokens.
    ///
    /// Uses the integral from (supply - amount) to supply:
    /// receive = base_price * amount + slope * (2 * supply * amount - amount²) / (2 * PRECISION)
    pub fn calculate_sell_return(&self, token_amount: u64) -> Result<u64> {
        require!(
            token_amount <= self.supply_sold,
            HumanofiError::InsufficientTokenBalance
        );

        let s = self.supply_sold as u128;
        let a = token_amount as u128;
        let b = self.base_price as u128;
        let m = self.slope as u128;

        // base_return = base_price * amount
        let base_return = b.checked_mul(a).ok_or(HumanofiError::MathOverflow)?;

        // slope_return = slope * (2 * supply * amount - amount^2) / (2 * PRECISION)
        let two_s_a = s
            .checked_mul(2)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_mul(a)
            .ok_or(HumanofiError::MathOverflow)?;
        let a_squared = a.checked_mul(a).ok_or(HumanofiError::MathOverflow)?;
        let numerator = two_s_a
            .checked_sub(a_squared)
            .ok_or(HumanofiError::MathOverflow)?;
        let slope_return = m
            .checked_mul(numerator)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(2 * CURVE_PRECISION)
            .ok_or(HumanofiError::MathOverflow)?;

        let total = base_return
            .checked_add(slope_return)
            .ok_or(HumanofiError::MathOverflow)?;

        // Never return more than the reserve
        let total = std::cmp::min(total as u64, self.sol_reserve);

        Ok(total)
    }

    /// Calculate the exact number of tokens buyable for a given SOL amount.
    ///
    /// Strategy: Quadratic formula + forward verification (Synthetix-audited pattern)
    ///
    /// 1. Solve the quadratic inverse of the cost integral analytically
    /// 2. Verify by computing the actual cost of the result via calculate_buy_cost()
    /// 3. Adjust downward if isqrt rounding caused an overshoot
    /// 4. Try +1 token to check if rounding was too conservative
    ///
    /// This guarantees: calculate_buy_cost(result) <= sol_amount
    ///                   calculate_buy_cost(result + 1) > sol_amount
    ///
    /// The buyer always gets the MAXIMUM tokens without exceeding budget.
    pub fn calculate_tokens_from_sol(&self, sol_amount: u64) -> Result<u64> {
        if sol_amount == 0 {
            return Ok(0);
        }

        let b = self.base_price as u128;
        let m = self.slope as u128;
        let cost = sol_amount as u128;

        // ── Special case: slope = 0 (flat price) ──
        if m == 0 {
            if b == 0 {
                return Err(HumanofiError::PriceCalculationZero.into());
            }
            let tokens = cost
                .checked_mul(1_000_000)
                .ok_or(HumanofiError::MathOverflow)?
                .checked_div(b)
                .ok_or(HumanofiError::MathOverflow)?;
            return Ok(tokens as u64);
        }

        // ── Quadratic formula ──
        // cost = base*a + slope*(2*s*a + a²) / (2*PREC)
        // Rearranged: (m/(2P))*a² + (b + m*s/P)*a - cost = 0
        // Multiply through by 2P: m*a² + (2P*b + 2*m*s)*a - 2P*cost = 0
        // a = (-B + sqrt(B² + 4AC)) / 2A
        //   where A = m, B = 2P*b + 2*m*s, C = 2P*cost

        let s = self.supply_sold as u128;
        let two_p = 2u128 * CURVE_PRECISION;

        let coeff_b = two_p
            .checked_mul(b)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_add(
                2u128
                    .checked_mul(m)
                    .ok_or(HumanofiError::MathOverflow)?
                    .checked_mul(s)
                    .ok_or(HumanofiError::MathOverflow)?,
            )
            .ok_or(HumanofiError::MathOverflow)?;

        let four_a_c = 4u128
            .checked_mul(m)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_mul(two_p)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_mul(cost)
            .ok_or(HumanofiError::MathOverflow)?;

        let discriminant = coeff_b
            .checked_mul(coeff_b)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_add(four_a_c)
            .ok_or(HumanofiError::MathOverflow)?;

        let sqrt_disc = crate::utils::isqrt_u128(discriminant);

        let numerator = sqrt_disc
            .checked_sub(coeff_b)
            .ok_or(HumanofiError::MathOverflow)?;

        let denominator = 2u128
            .checked_mul(m)
            .ok_or(HumanofiError::MathOverflow)?;

        let mut tokens = numerator
            .checked_div(denominator)
            .ok_or(HumanofiError::MathOverflow)? as u64;

        if tokens == 0 {
            // Quadratic rounded down to 0 — check if at least 1 token is affordable
            let cost_one = self.calculate_buy_cost_at_supply(1, self.supply_sold)?;
            if cost_one <= sol_amount {
                return Ok(1);
            }
            return Ok(0);
        }

        // ── Forward verification (the critical safety net) ──
        // Verify that the actual cost doesn't exceed the budget.
        // isqrt may round up, giving us 1 token too many.
        let actual_cost = self.calculate_buy_cost_at_supply(tokens, self.supply_sold)?;
        if actual_cost > sol_amount {
            // Rounding overshoot — reduce by 1
            tokens = tokens.saturating_sub(1);
        } else {
            // Check if we can squeeze one more token (isqrt rounded down)
            let cost_plus_one = self.calculate_buy_cost_at_supply(tokens + 1, self.supply_sold)?;
            if cost_plus_one <= sol_amount {
                tokens += 1;
            }
        }

        Ok(tokens)
    }

    /// Calculate the cost to buy `token_amount` tokens starting at a specific supply.
    /// Internal helper for forward verification during buy calculations.
    fn calculate_buy_cost_at_supply(&self, token_amount: u64, supply: u64) -> Result<u64> {
        let s = supply as u128;
        let a = token_amount as u128;
        let b = self.base_price as u128;
        let m = self.slope as u128;

        let base_cost = b.checked_mul(a).ok_or(HumanofiError::MathOverflow)?;

        let two_s_a = s
            .checked_mul(2)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_mul(a)
            .ok_or(HumanofiError::MathOverflow)?;
        let a_squared = a.checked_mul(a).ok_or(HumanofiError::MathOverflow)?;
        let numerator = two_s_a
            .checked_add(a_squared)
            .ok_or(HumanofiError::MathOverflow)?;
        let slope_cost = m
            .checked_mul(numerator)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(2 * CURVE_PRECISION)
            .ok_or(HumanofiError::MathOverflow)?;

        let total = base_cost
            .checked_add(slope_cost)
            .ok_or(HumanofiError::MathOverflow)?;

        Ok(total as u64)
    }
}

