// ========================================
// Humanofi — Buy Tokens (Human Curve™) — v3.6
// ========================================
//
// Buy flow v3.6 (simplified — no merit reward, no stabilizer):
//   1. CPI Guard: reject bot/program calls
//   2. Calculate buy via Human Curve (fees + k-deepening)
//   3. Slippage protection
//   4. Transfer SOL: buyer → curve reserve (net + depth)
//   5. Distribute fees: 2% creator fee vault, 2% protocol
//   6. Mint 100% tokens → buyer ATA (thaw/mint/freeze)
//   7. Update curve state (x, y, k, supply_public)
//   8. Update EMA TWAP
//
// The depth fee (1%) stays in the vault as a state update —
// no CPI transfer needed.
//
// v3.6 changes:
//   - Merit Reward REMOVED: 100% tokens go to buyer (was 86%)
//   - Creator/Protocol token accounts REMOVED from instruction
//   - Protocol Vault REMOVED from instruction
//   - Stabilizer REMOVED (dormant — no protocol tokens to sell)
//   - Fees: 5% total (was 6%)

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        freeze_account, mint_to, thaw_account,
        FreezeAccount, Mint, MintTo, ThawAccount,
        TokenAccount, TokenInterface,
    },
};

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

pub fn handler(ctx: Context<Buy>, sol_amount: u64, min_tokens_out: u64) -> Result<()> {
    require!(sol_amount > 0, HumanofiError::ZeroPurchaseAmount);

    // ── ANTI-BOT: Block CPI (program-to-program) calls ──
    #[cfg(not(feature = "cpi"))]
    {
        let stack_height = anchor_lang::solana_program::instruction::get_stack_height();
        require!(stack_height <= 1, HumanofiError::CpiGuard);
    }

    let curve = &ctx.accounts.bonding_curve;
    require!(curve.is_active, HumanofiError::CurveNotActive);

    // ── Calculate buy via Human Curve™ ──
    let result = curve.calculate_buy(sol_amount)?;

    require!(result.tokens_buyer > 0, HumanofiError::PriceCalculationZero);

    // ── Slippage protection ──
    if min_tokens_out > 0 {
        require!(
            result.tokens_buyer >= min_tokens_out,
            HumanofiError::SlippageExceeded
        );
    }

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    // ── Record purchase (analytics) ──
    let limiter = &mut ctx.accounts.purchase_limiter;
    if limiter.first_purchase_at == 0 {
        limiter.wallet = ctx.accounts.buyer.key();
        limiter.mint = ctx.accounts.mint.key();
        limiter.bump = ctx.bumps.purchase_limiter;
    }
    limiter.record_purchase(sol_amount, now)?;

    // ── Transfer SOL: buyer → bonding curve (net_sol + depth) ──
    let sol_to_vault = result.sol_to_curve
        .checked_add(result.fee_depth)
        .ok_or(HumanofiError::MathOverflow)?;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.bonding_curve.to_account_info(),
            },
        ),
        sol_to_vault,
    )?;

    // ── Transfer fees: buyer → recipients ──

    // 2% → Creator Fee Vault PDA (accumulated, claimable every 15 days)
    if result.fee_creator > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.creator_fee_vault.to_account_info(),
                },
            ),
            result.fee_creator,
        )?;
        // Update vault accounting
        ctx.accounts.creator_fee_vault.record_deposit(result.fee_creator)?;
    }

    // 2% → Protocol treasury
    if result.fee_protocol > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            result.fee_protocol,
        )?;
    }

    // ── Mint 100% tokens → buyer ATA ──
    let mint_key = ctx.accounts.mint.key();
    let curve_bump = ctx.accounts.bonding_curve.bump;
    let seeds = &[SEED_CURVE, mint_key.as_ref(), &[curve_bump]];
    let signer_seeds = &[&seeds[..]];

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
        result.tokens_buyer,
    )?;

    freeze_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        FreezeAccount {
            account: ctx.accounts.buyer_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.bonding_curve.to_account_info(),
        },
        signer_seeds,
    ))?;

    // ── Update curve state ──
    let curve = &mut ctx.accounts.bonding_curve;
    curve.apply_buy(&result)?;
    curve.update_twap()?;

    msg!(
        "✅ Buy | buyer={} | sol={} | tokens={} | fee={}",
        ctx.accounts.buyer.key(),
        sol_amount,
        result.tokens_buyer,
        result.fee_creator + result.fee_protocol + result.fee_depth
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

    /// Creator Fee Vault PDA — accumulates 2% creator fees
    #[account(
        mut,
        seeds = [SEED_CREATOR_FEES, mint.key().as_ref()],
        bump = creator_fee_vault.bump,
        has_one = mint,
    )]
    pub creator_fee_vault: Box<Account<'info, CreatorFeeVault>>,

    /// Purchase tracker PDA (init_if_needed for first-time buyers)
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + PurchaseLimiter::INIT_SPACE,
        seeds = [b"limiter", buyer.key().as_ref(), mint.key().as_ref()],
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

    /// Protocol treasury wallet (receives 2% of fees)
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
