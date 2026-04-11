// ========================================
// Humanofi — Reward Pool PDA
// ========================================
//
// Accumulates the holders' share of trading fees (2% of 6% = ~33%).
// Uses the reward-per-token pattern for gas-efficient
// pro-rata distribution without iterating all holders.
//
// Seeds: ["rewards", mint_pubkey]

use anchor_lang::prelude::*;
use crate::errors::HumanofiError;

#[account]
#[derive(InitSpace)]
pub struct RewardPool {
    /// The Token-2022 mint this pool belongs to
    pub mint: Pubkey,

    /// Cumulative reward per token stored (scaled by 10^18)
    /// This increases every time fees are added to the pool
    pub reward_per_token_stored: u128,

    /// Total SOL accumulated in the pool (lamports)
    pub total_accumulated: u64,

    /// Total SOL distributed to holders (lamports)
    pub total_distributed: u64,

    /// Last time the pool was updated
    pub last_updated_at: i64,

    /// PDA bump seed
    pub bump: u8,
}

/// Per-holder state for tracking claimed rewards.
/// Seeds: ["reward_state", mint_pubkey, holder_pubkey]
#[account]
#[derive(InitSpace)]
pub struct HolderRewardState {
    /// The mint this state belongs to
    pub mint: Pubkey,

    /// The holder's wallet
    pub holder: Pubkey,

    /// The reward_per_token value at last claim
    pub reward_per_token_paid: u128,

    /// Unclaimed rewards (lamports)
    pub rewards_owed: u64,

    /// PDA bump seed
    pub bump: u8,
}

/// Precision for reward-per-token (10^18)
const REWARD_PRECISION: u128 = 1_000_000_000_000_000_000;

impl RewardPool {
    /// Update the reward_per_token when new fees are deposited.
    /// Must be called BEFORE any holder's balance changes.
    pub fn update_reward_per_token(
        &mut self,
        fee_amount: u64,
        total_circulating_supply: u64,
    ) -> Result<()> {
        if total_circulating_supply == 0 || fee_amount == 0 {
            return Ok(());
        }

        let reward_increase = (fee_amount as u128)
            .checked_mul(REWARD_PRECISION)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(total_circulating_supply as u128)
            .ok_or(HumanofiError::MathOverflow)?;

        self.reward_per_token_stored = self
            .reward_per_token_stored
            .checked_add(reward_increase)
            .ok_or(HumanofiError::MathOverflow)?;

        self.total_accumulated = self
            .total_accumulated
            .checked_add(fee_amount)
            .ok_or(HumanofiError::MathOverflow)?;

        let clock = Clock::get()?;
        self.last_updated_at = clock.unix_timestamp;

        Ok(())
    }

    /// Calculate unclaimed rewards for a holder.
    pub fn calculate_pending_rewards(
        &self,
        holder_state: &HolderRewardState,
        holder_balance: u64,
    ) -> Result<u64> {
        let reward_delta = self
            .reward_per_token_stored
            .checked_sub(holder_state.reward_per_token_paid)
            .ok_or(HumanofiError::MathOverflow)?;

        let pending = (holder_balance as u128)
            .checked_mul(reward_delta)
            .ok_or(HumanofiError::MathOverflow)?
            .checked_div(REWARD_PRECISION)
            .ok_or(HumanofiError::MathOverflow)?;

        let total = (pending as u64)
            .checked_add(holder_state.rewards_owed)
            .ok_or(HumanofiError::MathOverflow)?;

        Ok(total)
    }
}
