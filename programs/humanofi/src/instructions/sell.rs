// ========================================
// Humanofi — Sell Tokens (Human Curve™) — v3.8
// ========================================
//
// Sell flow v3.7 (dual fee structure):
//   1. CPI Guard: reject bot/program calls
//   2. If seller = creator: verify vesting + Smart Sell Limiter + cooldown
//   3. Calculate sell via Human Curve (dual fee structure)
//   4. Thaw seller's ATA → Burn tokens
//   5. Distribute fees from bonding curve PDA
//   6. Transfer net SOL to seller
//   7. Re-freeze ATA if balance remains
//   8. Update curve state (x, y, k, supply)
//
// v3.7 Dual Fee Structure:
//   Holder sell: 5% (1% creator vault + 3% protocol + 1% depth)
//   Creator sell: 6% (5% protocol + 1% depth, no self-fee)
//
// Creator-specific rules:
//   - Year 1: 0% sellable (hard lock)
//   - Year 2+: max 5% price impact per sell (Smart Sell Limiter)
//   - 30-day cooldown between creator sells

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    burn, freeze_account, thaw_account, Burn, FreezeAccount, Mint, ThawAccount, TokenAccount,
    TokenInterface,
};

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

pub fn handler(ctx: Context<Sell>, token_amount: u64, min_sol_out: u64) -> Result<()> {
    require!(token_amount > 0, HumanofiError::ZeroAmount);

    // ── EMERGENCY FREEZE CHECK ──
    require!(!ctx.accounts.config.is_frozen, HumanofiError::ProtocolFrozen);

    // ── ANTI-BOT: Block CPI (program-to-program) calls ──
    #[cfg(not(feature = "cpi"))]
    {
        let stack_height = anchor_lang::solana_program::instruction::get_stack_height();
        require!(stack_height <= 1, HumanofiError::CpiGuard);
    }

    let curve = &ctx.accounts.bonding_curve;
    require!(curve.is_active, HumanofiError::CurveNotActive);
    let creator_is_suspended = curve.is_suspended;

    let seller_balance = ctx.accounts.seller_token_account.amount;
    require!(
        seller_balance >= token_amount,
        HumanofiError::InsufficientTokenBalance
    );

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // ── Detect if seller is the creator ──
    let is_creator = ctx.accounts.seller.key() == curve.creator;

    // ── CREATOR-SPECIFIC: Vesting + Smart Sell Limiter + Cooldown ──
    if is_creator {
        // v3.8: Creator sell is BLOCKED when suspended
        require!(!creator_is_suspended, HumanofiError::CreatorSuspended);

        let vault = ctx.accounts.creator_vault.as_ref()
            .ok_or(HumanofiError::UnauthorizedCreator)?;
        vault.can_sell(now)?;
        let max_sell = curve.get_max_sell_amount()?;
        require!(
            token_amount <= max_sell,
            HumanofiError::SellImpactExceeded
        );
    }

    // ── Calculate sell via Human Curve™ (dual fee structure) ──
    let result = curve.calculate_sell(token_amount, is_creator)?;
    require!(result.sol_net > 0, HumanofiError::PriceCalculationZero);

    // ── Slippage protection ──
    if min_sol_out > 0 {
        require!(
            result.sol_net >= min_sol_out,
            HumanofiError::SlippageExceeded
        );
    }

    // ── Thaw seller's token account ──
    let mint_key = ctx.accounts.mint.key();
    let curve_bump = ctx.accounts.bonding_curve.bump;
    let seeds = &[SEED_CURVE, mint_key.as_ref(), &[curve_bump]];
    let signer_seeds = &[&seeds[..]];

    thaw_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        ThawAccount {
            account: ctx.accounts.seller_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.bonding_curve.to_account_info(),
        },
        signer_seeds,
    ))?;

    // ── Burn tokens ──
    burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.seller_token_account.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        token_amount,
    )?;

    // ── Re-freeze if seller still has tokens ──
    let remaining_balance = seller_balance
        .checked_sub(token_amount)
        .ok_or(HumanofiError::MathOverflow)?;

    if remaining_balance > 0 {
        freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.seller_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.bonding_curve.to_account_info(),
            },
            signer_seeds,
        ))?;
    }

    // ── Distribute from bonding curve PDA ──
    let curve_info = ctx.accounts.bonding_curve.to_account_info();

    // SOL → seller (net)
    **curve_info.try_borrow_mut_lamports()? -= result.sol_net;
    **ctx.accounts.seller.to_account_info().try_borrow_mut_lamports()? += result.sol_net;

    // Creator fee vault (1% for holder sell, 0% for creator sell)
    // v3.8: If suspended, creator fees go to treasury instead
    if result.fee_creator > 0 {
        if creator_is_suspended {
            // SUSPENDED: Redirect creator fee → treasury
            **curve_info.try_borrow_mut_lamports()? -= result.fee_creator;
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += result.fee_creator;
        } else {
            // NORMAL: Creator fee → vault
            **curve_info.try_borrow_mut_lamports()? -= result.fee_creator;
            **ctx.accounts.creator_fee_vault.to_account_info().try_borrow_mut_lamports()? += result.fee_creator;
            ctx.accounts.creator_fee_vault.record_deposit(result.fee_creator)?;
        }
    }

    // Protocol treasury (3% for holder sell, 5% for creator sell)
    if result.fee_protocol > 0 {
        **curve_info.try_borrow_mut_lamports()? -= result.fee_protocol;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += result.fee_protocol;
    }

    // 1% depth stays in vault (already in x via calculate_sell)

    // ── Update bonding curve state ──
    let curve = &mut ctx.accounts.bonding_curve;
    curve.apply_sell(&result)?;
    curve.deduct_supply(token_amount, is_creator)?;

    // ── Update EMA TWAP ──
    curve.update_twap()?;

    // ── Update creator vault if creator sold ──
    if is_creator {
        if let Some(vault) = ctx.accounts.creator_vault.as_mut() {
            vault.record_sell(token_amount, now)?;
        }
    }

    msg!(
        "✅ Sell | seller={} | tokens={} | sol_net={} | is_creator={} | fee={}",
        ctx.accounts.seller.key(),
        token_amount,
        result.sol_net,
        is_creator,
        result.fee_creator + result.fee_protocol + result.fee_depth
    );

    Ok(())
}

#[derive(Accounts)]
pub struct Sell<'info> {
    /// The seller
    #[account(mut)]
    pub seller: Signer<'info>,

    /// The Token-2022 Mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// ProtocolConfig PDA — checked for emergency freeze
    #[account(
        seeds = [SEED_CONFIG],
        bump = config.bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// Bonding Curve PDA (holds SOL reserve)
    #[account(
        mut,
        seeds = [SEED_CURVE, mint.key().as_ref()],
        bump = bonding_curve.bump,
        has_one = mint,
    )]
    pub bonding_curve: Account<'info, BondingCurve>,

    /// Creator Fee Vault PDA — receives 1% of holder sell fees (0% on creator sell)
    #[account(
        mut,
        seeds = [SEED_CREATOR_FEES, mint.key().as_ref()],
        bump = creator_fee_vault.bump,
        has_one = mint,
    )]
    pub creator_fee_vault: Account<'info, CreatorFeeVault>,

    /// Creator Vault PDA — OPTIONAL. Only needed when seller = creator.
    #[account(
        mut,
        seeds = [SEED_VAULT, mint.key().as_ref()],
        bump,
        has_one = mint,
    )]
    pub creator_vault: Option<Account<'info, CreatorVault>>,

    /// Seller's token account (will be thawed, burned, re-frozen)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Creator's wallet (for validation only — fees go to vault)
    /// CHECK: validated via bonding_curve.creator
    #[account(
        mut,
        constraint = creator_wallet.key() == bonding_curve.creator @ HumanofiError::InvalidMint
    )]
    pub creator_wallet: UncheckedAccount<'info>,

    /// Protocol treasury
    /// CHECK: Validated against hardcoded TREASURY_WALLET constant
    #[account(
        mut,
        constraint = treasury.key() == TREASURY_WALLET @ HumanofiError::InvalidTreasury
    )]
    pub treasury: UncheckedAccount<'info>,

    /// Token-2022 Program
    pub token_program: Interface<'info, TokenInterface>,

    /// System Program
    pub system_program: Program<'info, System>,
}
