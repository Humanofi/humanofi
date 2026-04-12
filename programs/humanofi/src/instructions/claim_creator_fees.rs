// ========================================
// Humanofi — Claim Creator Fees
// ========================================
//
// Allows the creator to claim their accumulated trading fees
// (3% of all buy/sell volume) from the CreatorFeeVault PDA.
//
// Rules:
//   - Only the creator can claim (enforced via constraint)
//   - 15-day cooldown between claims
//   - All unclaimed fees are transferred at once
//   - SOL goes from the CreatorFeeVault PDA to the creator's wallet

use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

pub fn handler(ctx: Context<ClaimCreatorFees>) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // ── Verify cooldown (15 days between claims) ──
    ctx.accounts.creator_fee_vault.can_claim(now)?;

    // ── Calculate claimable amount ──
    let vault_info = ctx.accounts.creator_fee_vault.to_account_info();
    let rent = Rent::get()?.minimum_balance(vault_info.data_len());
    let vault_lamports = vault_info.lamports();
    let available = vault_lamports.saturating_sub(rent);

    let unclaimed = ctx.accounts.creator_fee_vault.unclaimed();
    let actual_payout = std::cmp::min(unclaimed, available);

    require!(actual_payout > 0, HumanofiError::NoFeesToClaim);

    // ── Transfer SOL: vault PDA → creator wallet ──
    **vault_info.try_borrow_mut_lamports()? -= actual_payout;
    **ctx.accounts.creator.to_account_info().try_borrow_mut_lamports()? += actual_payout;

    // ── Update vault state ──
    let vault = &mut ctx.accounts.creator_fee_vault;
    vault.total_claimed = vault.total_claimed
        .checked_add(actual_payout)
        .ok_or(HumanofiError::MathOverflow)?;
    vault.last_claim_at = now;

    msg!(
        "✅ Creator Fee Claim | creator={} | amount={} lamports | mint={} | next_claim_after={}",
        ctx.accounts.creator.key(),
        actual_payout,
        ctx.accounts.mint.key(),
        now + CREATOR_FEE_CLAIM_COOLDOWN,
    );

    Ok(())
}

#[derive(Accounts)]
pub struct ClaimCreatorFees<'info> {
    /// The creator claiming fees
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The Token-2022 Mint
    pub mint: InterfaceAccount<'info, Mint>,

    /// Creator Fee Vault PDA (SOL stored as lamports)
    #[account(
        mut,
        seeds = [SEED_CREATOR_FEES, mint.key().as_ref()],
        bump = creator_fee_vault.bump,
        has_one = mint,
        constraint = creator_fee_vault.creator == creator.key() @ HumanofiError::UnauthorizedCreator,
    )]
    pub creator_fee_vault: Account<'info, CreatorFeeVault>,

    /// System Program
    pub system_program: Program<'info, System>,
}
