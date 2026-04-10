// ========================================
// Humanofi — Purchase Limiter PDA
// ========================================
//
// Enforces progressive buy limits per wallet per token.
// Also tracks the first purchase timestamp for exit tax eligibility.
//
// Seeds: ["limiter", wallet_pubkey, mint_pubkey]

use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::HumanofiError;

#[account]
#[derive(InitSpace)]
pub struct PurchaseLimiter {
    /// The buyer's wallet
    pub wallet: Pubkey,

    /// The token mint
    pub mint: Pubkey,

    /// Amount spent today in lamports (rolling 24h window)
    pub spent_today_lamports: u64,

    /// Start of the current day window (unix timestamp)
    pub day_window_start: i64,

    /// Timestamp of the very first purchase (for exit tax)
    pub first_purchase_at: i64,

    /// Timestamp of the bonding curve creation (for period calculation)
    pub curve_created_at: i64,

    /// PDA bump seed
    pub bump: u8,
}

impl PurchaseLimiter {
    /// Get the maximum daily spend in lamports based on how long
    /// since the bonding curve was created.
    ///
    /// Week 1:   max $50/day  → ~0.33 SOL at $150
    /// Month 1:  max $200/day → ~1.33 SOL at $150
    /// After:    max $1000/day → ~6.67 SOL at $150
    ///
    /// Note: This uses a fixed SOL/USD approximation for now.
    /// TODO: Integrate Pyth oracle for live pricing.
    pub fn get_daily_limit_lamports(&self, now: i64) -> u64 {
        let age = now.saturating_sub(self.curve_created_at);

        // Convert USD limits to approximate lamports (assuming ~$150/SOL)
        let sol_per_usd: u64 = 6_666_667; // 1 SOL / 150 = 0.006667 SOL = 6_666_667 lamports

        if age < SECONDS_PER_WEEK {
            WEEK1_MAX_USD_PER_DAY * sol_per_usd
        } else if age < SECONDS_PER_MONTH {
            MONTH1_MAX_USD_PER_DAY * sol_per_usd
        } else {
            DEFAULT_MAX_USD_PER_DAY * sol_per_usd
        }
    }

    /// Check and update the daily spending limit.
    /// Returns Ok if the purchase is within limits.
    pub fn check_and_update(&mut self, sol_amount: u64, now: i64) -> Result<()> {
        // Reset window if 24 hours have passed
        if now.saturating_sub(self.day_window_start) >= SECONDS_PER_DAY {
            self.spent_today_lamports = 0;
            self.day_window_start = now;
        }

        let daily_limit = self.get_daily_limit_lamports(now);
        let new_total = self
            .spent_today_lamports
            .checked_add(sol_amount)
            .ok_or(HumanofiError::MathOverflow)?;

        require!(new_total <= daily_limit, HumanofiError::DailyLimitExceeded);

        self.spent_today_lamports = new_total;
        Ok(())
    }

    /// Check if a sell is subject to exit tax (sold within 90 days of first purchase).
    pub fn is_exit_tax_eligible(&self, now: i64) -> bool {
        now.saturating_sub(self.first_purchase_at) < EXIT_TAX_WINDOW
    }
}
