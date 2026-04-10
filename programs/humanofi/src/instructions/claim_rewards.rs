// ========================================
// Humanofi — Claim Rewards
// ========================================
//
// Allows holders to claim their accumulated rewards
// from the reward pool (30% of all trading fees).
//
// ENGAGEMENT GATING:
// Holders must have been active in the Inner Circle
// this month (minimum MIN_ENGAGEMENT_ACTIONS interactions)
// to qualify for claiming. This ensures rewards are
// "usage incentives" not "passive dividends" (securities).
//
// Uses the reward-per-token pattern:
// pending = balance * (global_rpt - personal_rpt) / PRECISION + owed

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

pub fn handler(ctx: Context<ClaimRewards>, epoch: u64) -> Result<()> {
    let holder_balance = ctx.accounts.holder_token_account.amount;
    require!(holder_balance > 0, HumanofiError::ZeroHolderBalance);

    // ---- Verify engagement (CONDITIONAL REWARDS) ----
    let clock = Clock::get()?;
    let current = current_epoch_from_timestamp(clock.unix_timestamp);
    let engagement = &ctx.accounts.engagement_record;

    require!(
        engagement.epoch == current,
        HumanofiError::EngagementExpired
    );
    require!(
        engagement.actions_count >= MIN_ENGAGEMENT_ACTIONS,
        HumanofiError::InsufficientEngagement
    );

    // ---- Calculate pending rewards ----
    let pending = ctx.accounts.reward_pool.calculate_pending_rewards(
        &ctx.accounts.holder_reward_state,
        holder_balance,
    )?;

    require!(pending > 0, HumanofiError::NoRewardsToClaim);

    // ---- Transfer SOL from reward pool PDA to holder ----
    // Ensure we never drain the PDA below rent-exemption
    let pool_info = ctx.accounts.reward_pool.to_account_info();
    let rent = Rent::get()?.minimum_balance(pool_info.data_len());
    let available = pool_info.lamports().saturating_sub(rent);
    let actual_payout = std::cmp::min(pending, available);
    require!(actual_payout > 0, HumanofiError::NoRewardsToClaim);

    **pool_info.try_borrow_mut_lamports()? -= actual_payout;
    **ctx
        .accounts
        .holder
        .to_account_info()
        .try_borrow_mut_lamports()? += actual_payout;

    // ---- Update holder's reward state ----
    let state = &mut ctx.accounts.holder_reward_state;
    state.reward_per_token_paid = ctx.accounts.reward_pool.reward_per_token_stored;
    state.rewards_owed = 0;
    state.mint = ctx.accounts.mint.key();
    state.holder = ctx.accounts.holder.key();
    state.bump = ctx.bumps.holder_reward_state;

    // ---- Update pool stats ----
    let pool = &mut ctx.accounts.reward_pool;
    pool.total_distributed = pool
        .total_distributed
        .checked_add(actual_payout)
        .ok_or(HumanofiError::MathOverflow)?;

    msg!(
        "✅ Claim | holder={} | rewards={} lamports | mint={} | engagement={}",
        ctx.accounts.holder.key(),
        actual_payout,
        ctx.accounts.mint.key(),
        engagement.actions_count
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(epoch: u64)]
pub struct ClaimRewards<'info> {
    /// The holder claiming rewards
    #[account(mut)]
    pub holder: Signer<'info>,

    /// The Token-2022 Mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Reward Pool PDA (SOL is stored as lamports here)
    #[account(
        mut,
        seeds = [SEED_REWARDS, mint.key().as_ref()],
        bump = reward_pool.bump,
        has_one = mint,
    )]
    pub reward_pool: Account<'info, RewardPool>,

    /// Holder's reward state (init_if_needed for first claim)
    #[account(
        init_if_needed,
        payer = holder,
        space = 8 + HolderRewardState::INIT_SPACE,
        seeds = [SEED_REWARD_STATE, mint.key().as_ref(), holder.key().as_ref()],
        bump,
    )]
    pub holder_reward_state: Account<'info, HolderRewardState>,

    /// Engagement record for current epoch (proves holder was active)
    #[account(
        seeds = [
            SEED_ENGAGEMENT,
            mint.key().as_ref(),
            holder.key().as_ref(),
            &epoch.to_le_bytes(),
        ],
        bump = engagement_record.bump,
        constraint = engagement_record.holder == holder.key() @ HumanofiError::InvalidMint,
        constraint = engagement_record.mint == mint.key() @ HumanofiError::InvalidMint,
    )]
    pub engagement_record: Account<'info, EngagementRecord>,

    /// Holder's token account (to verify balance)
    #[account(
        associated_token::mint = mint,
        associated_token::authority = holder,
        associated_token::token_program = token_program,
    )]
    pub holder_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Token-2022 Program
    pub token_program: Interface<'info, TokenInterface>,

    /// System Program
    pub system_program: Program<'info, System>,
}

