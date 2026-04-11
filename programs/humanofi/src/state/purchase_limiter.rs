// ========================================
// Humanofi — Purchase Tracker PDA
// ========================================
//
// Lightweight tracker for buyer activity.
// Tracks first purchase timestamp (for analytics/UI).
//
// The Human Curve™ model with 6% fees + k-evolution
// provides sufficient protection without daily limits.
//
// Seeds: ["limiter", wallet_pubkey, mint_pubkey]
// (Seed name kept as "limiter" for backward PDA compatibility)

use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct PurchaseLimiter {
    /// The buyer's wallet
    pub wallet: Pubkey,

    /// The token mint
    pub mint: Pubkey,

    /// Timestamp of the very first purchase
    pub first_purchase_at: i64,

    /// Total SOL spent lifetime on this token (lamports)
    pub total_spent_lamports: u64,

    /// Total number of purchases
    pub purchase_count: u32,

    /// PDA bump seed
    pub bump: u8,
}

impl PurchaseLimiter {
    /// Record a purchase
    pub fn record_purchase(&mut self, sol_amount: u64, now: i64) -> Result<()> {
        if self.first_purchase_at == 0 {
            self.first_purchase_at = now;
        }
        self.total_spent_lamports = self.total_spent_lamports
            .saturating_add(sol_amount);
        self.purchase_count = self.purchase_count
            .saturating_add(1);
        Ok(())
    }
}
