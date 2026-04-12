// ========================================
// Humanofi — Creator Fee Vault PDA
// ========================================
//
// Accumulates the creator's share of trading fees (2% of 5% total).
// SOL fees are sent here during buy/sell and the creator
// can claim them every 15 days.
//
// Seeds: ["creator_fees", mint_pubkey]

use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::HumanofiError;

#[account]
#[derive(InitSpace)]
pub struct CreatorFeeVault {
    /// The Token-2022 mint this vault belongs to
    pub mint: Pubkey,

    /// The creator's wallet address (only they can claim)
    pub creator: Pubkey,

    /// Total SOL accumulated in the vault (lamports)
    pub total_accumulated: u64,

    /// Total SOL claimed by the creator (lamports)
    pub total_claimed: u64,

    /// Timestamp of the last successful claim
    pub last_claim_at: i64,

    /// Timestamp when this vault was created
    pub created_at: i64,

    /// PDA bump seed
    pub bump: u8,
}

impl CreatorFeeVault {
    /// Check if the creator can claim right now (15-day cooldown)
    pub fn can_claim(&self, now: i64) -> Result<()> {
        if self.last_claim_at > 0 {
            let since_last = now.saturating_sub(self.last_claim_at);
            require!(
                since_last >= CREATOR_FEE_CLAIM_COOLDOWN,
                HumanofiError::CreatorClaimCooldown
            );
        }
        Ok(())
    }

    /// Record a fee deposit (called during buy/sell)
    pub fn record_deposit(&mut self, amount: u64) -> Result<()> {
        self.total_accumulated = self.total_accumulated
            .checked_add(amount)
            .ok_or(HumanofiError::MathOverflow)?;
        Ok(())
    }

    /// Record a claim and return the claimable amount
    pub fn record_claim(&mut self, now: i64) -> Result<u64> {
        let claimable = self.total_accumulated
            .checked_sub(self.total_claimed)
            .ok_or(HumanofiError::MathOverflow)?;

        self.total_claimed = self.total_accumulated;
        self.last_claim_at = now;

        Ok(claimable)
    }

    /// Get the current unclaimed balance
    pub fn unclaimed(&self) -> u64 {
        self.total_accumulated.saturating_sub(self.total_claimed)
    }
}
