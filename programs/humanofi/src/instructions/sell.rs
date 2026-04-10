// ========================================
// Humanofi — Sell Tokens
// ========================================
//
// Sells tokens back to the bonding curve:
// 1. Thaw seller's account (frozen for security)
// 2. Burn tokens from seller
// 3. Calculate SOL return via bonding curve
// 4. Apply exit tax if < 90 days since first purchase
// 5. Split fees (50/30/20)
// 6. Transfer SOL to seller
// 7. Re-freeze account if balance remains

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    burn, freeze_account, thaw_account, Burn, FreezeAccount, Mint, ThawAccount, TokenAccount,
    TokenInterface,
};

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

pub fn handler(ctx: Context<Sell>, token_amount: u64) -> Result<()> {
    require!(token_amount > 0, HumanofiError::ZeroAmount);

    let curve = &ctx.accounts.bonding_curve;
    require!(curve.is_active, HumanofiError::CurveNotActive);

    let seller_balance = ctx.accounts.seller_token_account.amount;
    require!(
        seller_balance >= token_amount,
        HumanofiError::InsufficientTokenBalance
    );

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // ---- Calculate SOL return from bonding curve ----
    let gross_return = ctx.accounts.bonding_curve.calculate_sell_return(token_amount)?;
    require!(gross_return > 0, HumanofiError::PriceCalculationZero);

    // ---- Calculate fees ----
    let total_fee = gross_return
        .checked_mul(TOTAL_FEE_BPS)
        .ok_or(HumanofiError::FeeOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(HumanofiError::FeeOverflow)?;

    // ---- Calculate exit tax (if applicable) ----
    let exit_tax = if ctx.accounts.purchase_limiter.is_exit_tax_eligible(now) {
        gross_return
            .checked_mul(EXIT_TAX_BPS)
            .ok_or(HumanofiError::FeeOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(HumanofiError::FeeOverflow)?
    } else {
        0
    };

    let creator_fee = total_fee
        .checked_mul(CREATOR_FEE_SHARE_BPS)
        .ok_or(HumanofiError::FeeOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(HumanofiError::FeeOverflow)?;

    let holder_fee = total_fee
        .checked_mul(HOLDER_FEE_SHARE_BPS)
        .ok_or(HumanofiError::FeeOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(HumanofiError::FeeOverflow)?
        // Exit tax goes to holders too
        .checked_add(exit_tax)
        .ok_or(HumanofiError::FeeOverflow)?;

    let treasury_fee = total_fee
        .checked_sub(creator_fee)
        .ok_or(HumanofiError::FeeOverflow)?
        .checked_sub(
            holder_fee
                .checked_sub(exit_tax)
                .ok_or(HumanofiError::FeeOverflow)?,
        )
        .ok_or(HumanofiError::FeeOverflow)?;

    let net_return = gross_return
        .checked_sub(total_fee)
        .ok_or(HumanofiError::FeeOverflow)?
        .checked_sub(exit_tax)
        .ok_or(HumanofiError::FeeOverflow)?;

    // Verify curve has enough SOL
    require!(
        ctx.accounts.bonding_curve.sol_reserve >= gross_return,
        HumanofiError::InsufficientReserve
    );

    // ---- Thaw seller's token account ----
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

    // ---- Burn tokens ----
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

    // ---- Re-freeze if seller still has tokens ----
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

    // ---- Transfer SOL from bonding curve PDA to seller ----
    let curve_info = ctx.accounts.bonding_curve.to_account_info();
    **curve_info.try_borrow_mut_lamports()? -= net_return;
    **ctx
        .accounts
        .seller
        .to_account_info()
        .try_borrow_mut_lamports()? += net_return;

    // ---- Transfer creator fee ----
    if creator_fee > 0 {
        **curve_info.try_borrow_mut_lamports()? -= creator_fee;
        **ctx
            .accounts
            .creator_wallet
            .to_account_info()
            .try_borrow_mut_lamports()? += creator_fee;
    }

    // ---- Transfer holder fee to reward pool ----
    if holder_fee > 0 {
        **curve_info.try_borrow_mut_lamports()? -= holder_fee;
        **ctx
            .accounts
            .reward_pool
            .to_account_info()
            .try_borrow_mut_lamports()? += holder_fee;
    }

    // ---- Transfer treasury fee ----
    if treasury_fee > 0 {
        **curve_info.try_borrow_mut_lamports()? -= treasury_fee;
        **ctx
            .accounts
            .treasury
            .to_account_info()
            .try_borrow_mut_lamports()? += treasury_fee;
    }

    // ---- Update bonding curve state ----
    let curve = &mut ctx.accounts.bonding_curve;
    curve.supply_sold = curve
        .supply_sold
        .checked_sub(token_amount)
        .ok_or(HumanofiError::MathOverflow)?;
    curve.sol_reserve = curve
        .sol_reserve
        .checked_sub(gross_return)
        .ok_or(HumanofiError::MathOverflow)?;

    // ---- Update reward pool ----
    if holder_fee > 0 && curve.supply_sold > 0 {
        ctx.accounts
            .reward_pool
            .update_reward_per_token(holder_fee, curve.supply_sold)?;
    }

    msg!(
        "✅ Sell | seller={} | tokens={} | sol_return={} | exit_tax={} | fee={}",
        ctx.accounts.seller.key(),
        token_amount,
        net_return,
        exit_tax,
        total_fee
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

    /// Bonding Curve PDA (holds SOL reserve)
    #[account(
        mut,
        seeds = [SEED_CURVE, mint.key().as_ref()],
        bump = bonding_curve.bump,
        has_one = mint,
    )]
    pub bonding_curve: Account<'info, BondingCurve>,

    /// Reward Pool PDA
    #[account(
        mut,
        seeds = [SEED_REWARDS, mint.key().as_ref()],
        bump = reward_pool.bump,
    )]
    pub reward_pool: Account<'info, RewardPool>,

    /// Purchase Limiter PDA (for exit tax check)
    #[account(
        seeds = [SEED_LIMITER, seller.key().as_ref(), mint.key().as_ref()],
        bump = purchase_limiter.bump,
    )]
    pub purchase_limiter: Account<'info, PurchaseLimiter>,

    /// Seller's token account (will be thawed, burned, re-frozen)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Creator's wallet (receives 50% of fees)
    /// CHECK: validated via bonding_curve.creator
    #[account(
        mut,
        constraint = creator_wallet.key() == bonding_curve.creator @ HumanofiError::InvalidMint
    )]
    pub creator_wallet: UncheckedAccount<'info>,

    /// Protocol treasury
    /// CHECK: Known multisig address
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    /// Token-2022 Program
    pub token_program: Interface<'info, TokenInterface>,

    /// System Program
    pub system_program: Program<'info, System>,
}
