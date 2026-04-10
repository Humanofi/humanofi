// ========================================
// Humanofi — Record Engagement (Oracle)
// ========================================
//
// Called by the protocol's oracle API to record a holder's
// engagement score on-chain. This creates/updates an
// EngagementRecord PDA that is verified during claim_rewards.
//
// Only the PROTOCOL_AUTHORITY can call this instruction.
// The oracle reads engagement data from Supabase and writes
// it on-chain before the holder can claim.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

pub fn handler(ctx: Context<RecordEngagement>, actions_count: u16) -> Result<()> {
    // Verify oracle authority
    require!(
        ctx.accounts.authority.key() == PROTOCOL_AUTHORITY,
        HumanofiError::UnauthorizedOracle
    );

    let clock = Clock::get()?;
    let epoch = current_epoch_from_timestamp(clock.unix_timestamp);

    let record = &mut ctx.accounts.engagement_record;
    record.mint = ctx.accounts.mint.key();
    record.holder = ctx.accounts.holder.key();
    record.epoch = epoch;
    record.actions_count = actions_count;
    record.last_recorded_at = clock.unix_timestamp;
    record.bump = ctx.bumps.engagement_record;

    msg!(
        "✅ Engagement | holder={} | mint={} | epoch={} | actions={}",
        ctx.accounts.holder.key(),
        ctx.accounts.mint.key(),
        epoch,
        actions_count
    );

    Ok(())
}

#[derive(Accounts)]
pub struct RecordEngagement<'info> {
    /// Protocol oracle authority (API signer)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The holder whose engagement is being recorded
    /// CHECK: Validated by seeds — this is the holder's wallet address
    pub holder: UncheckedAccount<'info>,

    /// The Token-2022 Mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Engagement record PDA (init_if_needed for first record)
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + EngagementRecord::INIT_SPACE,
        seeds = [
            SEED_ENGAGEMENT,
            mint.key().as_ref(),
            holder.key().as_ref(),
            &current_epoch_from_timestamp(Clock::get()?.unix_timestamp).to_le_bytes(),
        ],
        bump,
    )]
    pub engagement_record: Account<'info, EngagementRecord>,

    /// System Program
    pub system_program: Program<'info, System>,
}
