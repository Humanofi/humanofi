// ========================================
// Humanofi — Admin Instructions (v3.8)
// ========================================
//
// 4 instructions for protocol governance:
//   1. init_config     — Initialize the ProtocolConfig PDA (one-time)
//   2. toggle_freeze   — Emergency freeze/unfreeze all operations
//   3. suspend_creator — Suspend a creator (redirect fees, block sell/claim)
//   4. unsuspend_creator — Lift creator suspension
//
// All admin instructions require:
//   - authority = signer matching ProtocolConfig.authority
//
// The authority should be a Squads multisig in production.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

// ════════════════════════════════════════
// 1. INIT CONFIG — One-time setup
// ════════════════════════════════════════

pub fn handler_init_config(ctx: Context<InitConfig>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.is_frozen = false;
    config.frozen_at = 0;
    config.freeze_reason = String::new();
    config.bump = ctx.bumps.config;

    msg!(
        "✅ ProtocolConfig initialized | authority={}",
        config.authority
    );

    Ok(())
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    /// The initial authority (will be the payer).
    /// In production, transfer to Squads multisig afterward.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The ProtocolConfig PDA — singleton, created once.
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [SEED_CONFIG],
        bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// System Program
    pub system_program: Program<'info, System>,
}

// ════════════════════════════════════════
// 2. TOGGLE FREEZE — Emergency kill switch
// ════════════════════════════════════════

pub fn handler_toggle_freeze(
    ctx: Context<ToggleFreeze>,
    freeze: bool,
    reason: String,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let clock = Clock::get()?;

    config.is_frozen = freeze;
    config.frozen_at = if freeze { clock.unix_timestamp } else { 0 };
    config.freeze_reason = if freeze {
        // Truncate to 128 chars max
        reason.chars().take(128).collect()
    } else {
        String::new()
    };

    msg!(
        "🚨 Protocol {} | authority={} | reason={}",
        if freeze { "FROZEN" } else { "UNFROZEN" },
        ctx.accounts.authority.key(),
        config.freeze_reason
    );

    Ok(())
}

#[derive(Accounts)]
pub struct ToggleFreeze<'info> {
    /// The protocol authority (must match config.authority)
    pub authority: Signer<'info>,

    /// The ProtocolConfig PDA
    #[account(
        mut,
        seeds = [SEED_CONFIG],
        bump = config.bump,
        constraint = config.authority == authority.key() @ HumanofiError::UnauthorizedAdmin,
    )]
    pub config: Account<'info, ProtocolConfig>,
}

// ════════════════════════════════════════
// 3. SUSPEND CREATOR
// ════════════════════════════════════════
//
// When a creator is suspended:
//   - Buy: still allowed, but with WARNING (frontend) and fees go to treasury
//   - Sell (holder): unchanged — holders can always exit
//   - Sell (creator): BLOCKED
//   - Claim fees: BLOCKED
//   - Creator fees: redirected → 100% protocol treasury

pub fn handler_suspend_creator(ctx: Context<SuspendCreator>) -> Result<()> {
    let curve = &mut ctx.accounts.bonding_curve;
    curve.is_suspended = true;

    msg!(
        "🔴 Creator SUSPENDED | mint={} | creator={} | authority={}",
        curve.mint,
        curve.creator,
        ctx.accounts.authority.key()
    );

    Ok(())
}

#[derive(Accounts)]
pub struct SuspendCreator<'info> {
    /// The protocol authority
    pub authority: Signer<'info>,

    /// The Token-2022 Mint (needed for PDA seed derivation)
    pub mint: InterfaceAccount<'info, Mint>,

    /// The ProtocolConfig PDA (validates authority)
    #[account(
        seeds = [SEED_CONFIG],
        bump = config.bump,
        constraint = config.authority == authority.key() @ HumanofiError::UnauthorizedAdmin,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The BondingCurve to suspend — validated via PDA seeds
    #[account(
        mut,
        seeds = [SEED_CURVE, mint.key().as_ref()],
        bump = bonding_curve.bump,
        has_one = mint,
    )]
    pub bonding_curve: Account<'info, BondingCurve>,
}

// ════════════════════════════════════════
// 4. UNSUSPEND CREATOR
// ════════════════════════════════════════

pub fn handler_unsuspend_creator(ctx: Context<UnsuspendCreator>) -> Result<()> {
    let curve = &mut ctx.accounts.bonding_curve;
    curve.is_suspended = false;

    msg!(
        "🟢 Creator UNSUSPENDED | mint={} | creator={} | authority={}",
        curve.mint,
        curve.creator,
        ctx.accounts.authority.key()
    );

    Ok(())
}

#[derive(Accounts)]
pub struct UnsuspendCreator<'info> {
    /// The protocol authority
    pub authority: Signer<'info>,

    /// The Token-2022 Mint (needed for PDA seed derivation)
    pub mint: InterfaceAccount<'info, Mint>,

    /// The ProtocolConfig PDA (validates authority)
    #[account(
        seeds = [SEED_CONFIG],
        bump = config.bump,
        constraint = config.authority == authority.key() @ HumanofiError::UnauthorizedAdmin,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// The BondingCurve to unsuspend — validated via PDA seeds
    #[account(
        mut,
        seeds = [SEED_CURVE, mint.key().as_ref()],
        bump = bonding_curve.bump,
        has_one = mint,
    )]
    pub bonding_curve: Account<'info, BondingCurve>,
}
