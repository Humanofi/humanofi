// ========================================
// Humanofi — Unlock Creator Tokens (Progressive Vesting)
// ========================================
//
// Progressive unlock — NOT a cliff:
//
// Year 1  : 0% — full lock, zero liquidity
// Year 2  : 10% of original allocation unlockable
// Year 3  : 10% additional (20% cumulative)
// Year 4+ : 20% per year additional
// Year 7+ : 100% cumulative max
//
// The creator calls this instruction to unlock a specified
// amount within their current allowance. Unlocked tokens
// are thawed and can be sold via the bonding curve.
//
// The creator can NEVER liquidate their full position quickly.
// This is THE signal that makes Humanofi different from everything else.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    thaw_account, Mint, ThawAccount, TokenAccount, TokenInterface,
};

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

pub fn handler(ctx: Context<UnlockTokens>, amount_to_unlock: u64) -> Result<()> {
    require!(amount_to_unlock > 0, HumanofiError::ZeroAmount);

    let vault = &ctx.accounts.creator_vault;

    // ---- Verify creator ----
    require!(
        vault.creator == ctx.accounts.creator.key(),
        HumanofiError::UnauthorizedUnlock
    );

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // ---- Check vesting schedule ----
    let currently_unlockable = vault.get_currently_unlockable(now)?;
    require!(
        currently_unlockable > 0,
        HumanofiError::TokensStillLocked
    );
    require!(
        amount_to_unlock <= currently_unlockable,
        HumanofiError::TokensStillLocked
    );

    // ---- Thaw creator's token account (if frozen) ----
    let mint_key = ctx.accounts.mint.key();
    let curve_bump = ctx.accounts.bonding_curve.bump;
    let seeds = &[SEED_CURVE, mint_key.as_ref(), &[curve_bump]];
    let signer_seeds = &[&seeds[..]];

    if ctx.accounts.creator_token_account.is_frozen() {
        thaw_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccount {
                account: ctx.accounts.creator_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.bonding_curve.to_account_info(),
            },
            signer_seeds,
        ))?;
    }

    // Note: We DON'T re-freeze after unlock.
    // The creator can now sell unlocked tokens through the bonding curve.
    // They can't transfer them externally because the sell instruction
    // handles the thaw/burn/freeze cycle, and direct transfers
    // still fail because only frozen accounts exist for other holders.
    //
    // After unlock, if the creator wants to sell, they use the sell
    // instruction which will work on their thawed account.

    // ---- Update vault ----
    let vault = &mut ctx.accounts.creator_vault;
    vault.total_unlocked = vault
        .total_unlocked
        .checked_add(amount_to_unlock)
        .ok_or(HumanofiError::MathOverflow)?;

    let vesting_year = vault.get_vesting_year(now);
    let cumulative_max = vault.get_cumulative_max_unlockable(now)?;
    let remaining_lockable = cumulative_max.saturating_sub(vault.total_unlocked);

    msg!(
        "✅ Unlock | creator={} | amount={} | year={} | total_unlocked={}/{} | remaining_this_period={}",
        ctx.accounts.creator.key(),
        amount_to_unlock,
        vesting_year,
        vault.total_unlocked,
        vault.original_allocation,
        remaining_lockable
    );

    Ok(())
}

#[derive(Accounts)]
pub struct UnlockTokens<'info> {
    /// The creator unlocking their tokens
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The Token-2022 Mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Bonding Curve PDA (freeze authority)
    #[account(
        seeds = [SEED_CURVE, mint.key().as_ref()],
        bump = bonding_curve.bump,
        has_one = mint,
    )]
    pub bonding_curve: Account<'info, BondingCurve>,

    /// Creator Vault PDA (tracks vesting schedule)
    #[account(
        mut,
        seeds = [SEED_VAULT, mint.key().as_ref()],
        bump = creator_vault.bump,
        has_one = mint,
        has_one = creator,
    )]
    pub creator_vault: Account<'info, CreatorVault>,

    /// Creator's frozen token account
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program,
    )]
    pub creator_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Token-2022 Program
    pub token_program: Interface<'info, TokenInterface>,
}
