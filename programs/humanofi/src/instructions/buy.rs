// ========================================
// Humanofi — Buy Tokens
// ========================================
//
// Buys tokens from the bonding curve:
// 1. Calculate tokens from SOL via bonding curve integral
// 2. Enforce purchase limits (progressive daily caps)
// 3. Transfer SOL from buyer to curve reserve
// 4. Split fees (50% creator / 30% reward pool / 20% treasury)
// 5. Mint tokens to buyer's ATA
// 6. Freeze buyer's ATA (ensures tokens stay in Humanofi)

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        freeze_account, mint_to, thaw_account, FreezeAccount, Mint, MintTo, ThawAccount,
        TokenAccount, TokenInterface,
    },
};

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

pub fn handler(ctx: Context<Buy>, sol_amount: u64) -> Result<()> {
    require!(sol_amount > 0, HumanofiError::ZeroPurchaseAmount);

    let curve = &ctx.accounts.bonding_curve;
    require!(curve.is_active, HumanofiError::CurveNotActive);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // ---- Calculate fees ----
    let total_fee = sol_amount
        .checked_mul(TOTAL_FEE_BPS)
        .ok_or(HumanofiError::FeeOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(HumanofiError::FeeOverflow)?;

    let net_sol = sol_amount
        .checked_sub(total_fee)
        .ok_or(HumanofiError::FeeOverflow)?;

    let creator_fee = total_fee
        .checked_mul(CREATOR_FEE_SHARE_BPS)
        .ok_or(HumanofiError::FeeOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(HumanofiError::FeeOverflow)?;

    let holder_fee = total_fee
        .checked_mul(HOLDER_FEE_SHARE_BPS)
        .ok_or(HumanofiError::FeeOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(HumanofiError::FeeOverflow)?;

    let treasury_fee = total_fee
        .checked_sub(creator_fee)
        .ok_or(HumanofiError::FeeOverflow)?
        .checked_sub(holder_fee)
        .ok_or(HumanofiError::FeeOverflow)?;

    // ---- Calculate tokens to mint from net SOL ----
    // We need to reverse the cost function: given SOL, how many tokens?
    // For a linear curve: cost = base * amount + slope * (2*s*a + a²) / (2*PRECISION)
    // For simplicity, we approximate by dividing net SOL by current price
    // This is accurate for small purchases relative to supply
    let current_price = ctx.accounts.bonding_curve.get_current_price()?;
    require!(current_price > 0, HumanofiError::PriceCalculationZero);

    let token_amount = (net_sol as u128)
        .checked_mul(1_000_000) // Convert to base units (6 decimals)
        .ok_or(HumanofiError::MathOverflow)?
        .checked_div(current_price as u128)
        .ok_or(HumanofiError::MathOverflow)? as u64;

    require!(token_amount > 0, HumanofiError::PriceCalculationZero);

    // ---- Check purchase limits ----
    let limiter = &mut ctx.accounts.purchase_limiter;
    if limiter.first_purchase_at == 0 {
        // First purchase — initialize
        limiter.wallet = ctx.accounts.buyer.key();
        limiter.mint = ctx.accounts.mint.key();
        limiter.first_purchase_at = now;
        limiter.curve_created_at = ctx.accounts.bonding_curve.created_at;
        limiter.day_window_start = now;
        limiter.spent_today_lamports = 0;
        limiter.bump = ctx.bumps.purchase_limiter;
    }
    limiter.check_and_update(sol_amount, now)?;

    // ---- Transfer SOL: buyer → bonding curve reserve ----
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.bonding_curve.to_account_info(),
            },
        ),
        net_sol,
    )?;

    // ---- Transfer SOL: buyer → creator (fee) ----
    if creator_fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.creator_wallet.to_account_info(),
                },
            ),
            creator_fee,
        )?;
    }

    // ---- Transfer SOL: buyer → reward pool PDA (holder fee) ----
    if holder_fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.reward_pool.to_account_info(),
                },
            ),
            holder_fee,
        )?;
    }

    // ---- Transfer SOL: buyer → treasury (protocol fee) ----
    if treasury_fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            treasury_fee,
        )?;
    }

    // ---- Mint tokens to buyer ----
    let mint_key = ctx.accounts.mint.key();
    let curve_bump = ctx.accounts.bonding_curve.bump;
    let seeds = &[SEED_CURVE, mint_key.as_ref(), &[curve_bump]];
    let signer_seeds = &[&seeds[..]];

    // If buyer's account is frozen (returning buyer), thaw first
    if ctx.accounts.buyer_token_account.is_frozen() {
        thaw_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            ThawAccount {
                account: ctx.accounts.buyer_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.bonding_curve.to_account_info(),
            },
            signer_seeds,
        ))?;
    }

    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.bonding_curve.to_account_info(),
            },
            signer_seeds,
        ),
        token_amount,
    )?;

    // ---- Freeze buyer's ATA (lock tokens in Humanofi) ----
    freeze_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        FreezeAccount {
            account: ctx.accounts.buyer_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.bonding_curve.to_account_info(),
        },
        signer_seeds,
    ))?;

    // ---- Update bonding curve state ----
    let curve = &mut ctx.accounts.bonding_curve;
    curve.supply_sold = curve
        .supply_sold
        .checked_add(token_amount)
        .ok_or(HumanofiError::MathOverflow)?;
    curve.sol_reserve = curve
        .sol_reserve
        .checked_add(net_sol)
        .ok_or(HumanofiError::MathOverflow)?;

    // ---- Update reward pool ----
    if holder_fee > 0 {
        ctx.accounts
            .reward_pool
            .update_reward_per_token(holder_fee, curve.supply_sold)?;
    }

    msg!(
        "✅ Buy | buyer={} | sol={} | tokens={} | price={} | fee={}",
        ctx.accounts.buyer.key(),
        sol_amount,
        token_amount,
        current_price,
        total_fee
    );

    Ok(())
}

#[derive(Accounts)]
pub struct Buy<'info> {
    /// The buyer
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// The Token-2022 Mint
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// Bonding Curve PDA (holds SOL reserve + is mint/freeze authority)
    #[account(
        mut,
        seeds = [SEED_CURVE, mint.key().as_ref()],
        bump = bonding_curve.bump,
        has_one = mint,
    )]
    pub bonding_curve: Box<Account<'info, BondingCurve>>,

    /// Reward Pool PDA
    #[account(
        mut,
        seeds = [SEED_REWARDS, mint.key().as_ref()],
        bump = reward_pool.bump,
    )]
    pub reward_pool: Box<Account<'info, RewardPool>>,

    /// Purchase Limiter PDA (init_if_needed for first-time buyers)
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + PurchaseLimiter::INIT_SPACE,
        seeds = [SEED_LIMITER, buyer.key().as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub purchase_limiter: Box<Account<'info, PurchaseLimiter>>,

    /// Buyer's Associated Token Account (init_if_needed for first buy)
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Creator's wallet (receives 50% of fees)
    /// CHECK: validated via bonding_curve.creator
    #[account(
        mut,
        constraint = creator_wallet.key() == bonding_curve.creator @ HumanofiError::InvalidMint
    )]
    pub creator_wallet: UncheckedAccount<'info>,

    /// Protocol treasury wallet (receives 20% of fees)
    /// CHECK: Validated against hardcoded TREASURY_WALLET constant
    #[account(
        mut,
        constraint = treasury.key() == TREASURY_WALLET @ HumanofiError::InvalidTreasury
    )]
    pub treasury: UncheckedAccount<'info>,

    /// Token-2022 Program
    pub token_program: Interface<'info, TokenInterface>,

    /// Associated Token Program
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// System Program
    pub system_program: Program<'info, System>,
}
