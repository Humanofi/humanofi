// ========================================
// Humanofi — Claim Rewards
// ========================================
//
// Allows holders to claim their accumulated rewards
// from the reward pool (30% of all trading fees).
//
// Uses the reward-per-token pattern:
// pending = balance * (global_rpt - personal_rpt) / PRECISION + owed

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

pub fn handler(ctx: Context<ClaimRewards>) -> Result<()> {
    let holder_balance = ctx.accounts.holder_token_account.amount;
    require!(holder_balance > 0, HumanofiError::ZeroHolderBalance);

    // ---- Calculate pending rewards ----
    let pending = ctx.accounts.reward_pool.calculate_pending_rewards(
        &ctx.accounts.holder_reward_state,
        holder_balance,
    )?;

    require!(pending > 0, HumanofiError::NoRewardsToClaim);

    // ---- Transfer SOL from reward pool PDA to holder ----
    let pool_info = ctx.accounts.reward_pool.to_account_info();
    **pool_info.try_borrow_mut_lamports()? -= pending;
    **ctx
        .accounts
        .holder
        .to_account_info()
        .try_borrow_mut_lamports()? += pending;

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
        .checked_add(pending)
        .ok_or(HumanofiError::MathOverflow)?;

    msg!(
        "✅ Claim | holder={} | rewards={} lamports | mint={}",
        ctx.accounts.holder.key(),
        pending,
        ctx.accounts.mint.key()
    );

    Ok(())
}

#[derive(Accounts)]
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
