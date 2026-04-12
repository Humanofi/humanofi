// ========================================
// Humanofi — Creator Vault PDA
// ========================================
//
// Simplified vesting + Smart Sell Limiter tracker:
//
//   Year 1      : 0% sellable. Full lock, no exceptions.
//   Year 2+     : Creator can sell via bonding curve, BUT:
//                 → Max 5% price impact per sell (Smart Sell Limiter)
//                 → 30-day cooldown between sells
//
// The creator's tokens arrive progressively via the Merit Reward
// mechanism (10% Merit Reward on each buy). Protocol gets 4%.
//
// Seeds: ["vault", mint_pubkey]

use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::HumanofiError;

#[account]
#[derive(InitSpace)]
pub struct CreatorVault {
    /// The Token-2022 mint
    pub mint: Pubkey,

    /// The creator's wallet address
    pub creator: Pubkey,

    /// Unix timestamp when the vault was created (start of vesting)
    pub created_at: i64,

    /// Unix timestamp of the creator's last sell (for cooldown enforcement)
    pub last_sell_at: i64,

    /// Total tokens the creator has sold lifetime
    pub total_sold: u64,

    /// PDA bump seed
    pub bump: u8,
}

impl CreatorVault {
    /// Check if the creator can sell right now.
    ///
    /// Rules:
    ///   1. Year 1: 0% – hard lock, no exceptions
    ///   2. Year 2+: allowed, but must respect 30-day cooldown
    pub fn can_sell(&self, now: i64) -> Result<()> {
        let elapsed = now.saturating_sub(self.created_at);

        // Year 1: hard lock
        require!(
            elapsed >= CREATOR_LOCK_DURATION,
            HumanofiError::CreatorVestingLocked
        );

        // 30-day cooldown between sells
        if self.last_sell_at > 0 {
            let since_last = now.saturating_sub(self.last_sell_at);
            require!(
                since_last >= CREATOR_SELL_COOLDOWN,
                HumanofiError::CreatorSellCooldown
            );
        }

        Ok(())
    }

    /// Record a creator sell and update the cooldown timestamp
    pub fn record_sell(&mut self, amount: u64, now: i64) -> Result<()> {
        self.last_sell_at = now;
        self.total_sold = self.total_sold
            .checked_add(amount)
            .ok_or(HumanofiError::MathOverflow)?;
        Ok(())
    }

    /// Calculate years elapsed since creation
    pub fn years_elapsed(&self, now: i64) -> u64 {
        let elapsed = now.saturating_sub(self.created_at);
        (elapsed / (365 * 24 * 60 * 60)) as u64
    }
}
