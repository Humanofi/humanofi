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
}
