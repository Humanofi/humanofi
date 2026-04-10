// ========================================
// Humanofi — Creator Vault PDA
// ========================================
//
// Progressive vesting schedule for creator tokens:
//
// Year 1    : 0% sellable. Full lock, no exceptions.
// Year 2    : max 10% of original allocation sellable
// Year 3    : max 10% additional (20% cumulative max)
// Year 4+   : max 20% per year
//
// The creator can NEVER dump their entire position.
// Even after 5 years, they still hold a majority.
// Their long-term interest is structurally aligned with holders.
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

    /// Original amount allocated (never changes — used for % calculations)
    pub original_allocation: u64,

    /// Total amount already unlocked/sold over time
    pub total_unlocked: u64,

    /// Unix timestamp when the vault was created (start of vesting)
    pub created_at: i64,

    /// PDA bump seed
    pub bump: u8,
}

impl CreatorVault {
    /// Calculate the cumulative maximum tokens that can be unlocked
    /// at the current timestamp, based on the progressive vesting schedule.
    ///
    /// Year 1 : 0%
    /// Year 2 : 10%
    /// Year 3 : 20%
    /// Year 4 : 40%
    /// Year 5 : 60%
    /// Year 6 : 80%
    /// Year 7+: 100%
    pub fn get_cumulative_max_unlockable(&self, now: i64) -> Result<u64> {
        let elapsed = now.saturating_sub(self.created_at);

        // Year 1: nothing
        if elapsed < VESTING_CLIFF_DURATION {
            return Ok(0);
        }

        // How many full years have passed since creation
        let years_elapsed = (elapsed / SECONDS_PER_YEAR) as u64;

        // Calculate cumulative percentage in basis points
        let cumulative_bps = match years_elapsed {
            0 => 0,                                          // Year 1: 0%
            1 => VESTING_YEAR_2_3_MAX_BPS,                   // Year 2: 10%
            2 => VESTING_YEAR_2_3_MAX_BPS * 2,               // Year 3: 20%
            y => {
                // Year 2-3: 20% total, then 20% per additional year
                let base = VESTING_YEAR_2_3_MAX_BPS * 2;     // 20% for years 2-3
                let extra_years = y.saturating_sub(2);
                let extra = extra_years
                    .checked_mul(VESTING_YEAR_4_PLUS_MAX_BPS)
                    .ok_or(HumanofiError::MathOverflow)?;
                let total = base
                    .checked_add(extra)
                    .ok_or(HumanofiError::MathOverflow)?;
                // Cap at 100%
                std::cmp::min(total, BPS_DENOMINATOR)
            }
        };

        // Convert percentage to token amount
        let max_tokens = (self.original_allocation as u128)
            .checked_mul(cumulative_bps as u128)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR as u128)
            .ok_or(HumanofiError::MathOverflow)? as u64;

        Ok(max_tokens)
    }

    /// Calculate how many tokens the creator can unlock RIGHT NOW,
    /// taking into account what they've already unlocked.
    pub fn get_currently_unlockable(&self, now: i64) -> Result<u64> {
        let max = self.get_cumulative_max_unlockable(now)?;
        let available = max.saturating_sub(self.total_unlocked);
        Ok(available)
    }

    /// Get the current vesting status as a human-readable string.
    pub fn get_vesting_year(&self, now: i64) -> u64 {
        let elapsed = now.saturating_sub(self.created_at);
        ((elapsed / SECONDS_PER_YEAR) + 1) as u64
    }
}
