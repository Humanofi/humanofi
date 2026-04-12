// ========================================
// Humanofi — Buy Tokens (Human Curve™)
// ========================================
//
// Buy flow v2 (simplified fees — no holder rewards):
//   1. CPI Guard: reject bot/program calls
//   2. Calculate buy via Human Curve (fees + k-deepening + merit split)
//   3. Slippage protection
//   4. Transfer SOL: buyer → curve reserve (net)
//   5. Distribute fees: 3% creator fee vault, 2% protocol, 1% depth (state)
//   6. Mint tokens_buyer → buyer ATA (thaw/mint/freeze)
//   7. Mint tokens_creator → creator ATA (10% Merit Reward, frozen)
//   8. Mint tokens_protocol → protocol ATA (4% Merit Fee, frozen)
//   9. Update curve state (x, y, k, supplies)
//  10. Update EMA TWAP
//  11. Price Stabilizer: auto-sell protocol tokens if price spiked
//
// The depth fee (1%) stays in the vault as a state update —
// no CPI transfer needed.

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        burn, freeze_account, mint_to, thaw_account,
        Burn, FreezeAccount, Mint, MintTo, ThawAccount,
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

    // ── Transfer fees: buyer → recipients (5% total exits to destinations) ──

    // 3% → Creator Fee Vault PDA (accumulated, claimable every 15 days)
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

    // ── Mint tokens ──
    let mint_key = ctx.accounts.mint.key();
    let curve_bump = ctx.accounts.bonding_curve.bump;
    let seeds = &[SEED_CURVE, mint_key.as_ref(), &[curve_bump]];
    let signer_seeds = &[&seeds[..]];

    // ── Mint buyer tokens → buyer ATA ──
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

    // ── Mint creator's Merit Reward (10%) → creator ATA ──
    if result.tokens_creator > 0 {
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

        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.creator_token_account.to_account_info(),
                    authority: ctx.accounts.bonding_curve.to_account_info(),
                },
                signer_seeds,
            ),
            result.tokens_creator,
        )?;

        freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.creator_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.bonding_curve.to_account_info(),
            },
            signer_seeds,
        ))?;
    }

    // ── Mint protocol's Merit Fee (4%) → protocol ATA ──
    if result.tokens_protocol > 0 {
        if ctx.accounts.protocol_token_account.is_frozen() {
            thaw_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                ThawAccount {
                    account: ctx.accounts.protocol_token_account.to_account_info(),
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
                    to: ctx.accounts.protocol_token_account.to_account_info(),
                    authority: ctx.accounts.bonding_curve.to_account_info(),
                },
                signer_seeds,
            ),
            result.tokens_protocol,
        )?;

        freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.protocol_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.bonding_curve.to_account_info(),
            },
            signer_seeds,
        ))?;

        // Update protocol vault balance
        let pv = &mut ctx.accounts.protocol_vault;
        pv.token_balance = pv.token_balance
            .checked_add(result.tokens_protocol)
            .ok_or(HumanofiError::MathOverflow)?;
        pv.total_accumulated = pv.total_accumulated
            .checked_add(result.tokens_protocol)
            .ok_or(HumanofiError::MathOverflow)?;
    }

    // ── Update curve state ──
    let curve = &mut ctx.accounts.bonding_curve;
    curve.apply_buy(&result)?;
    curve.update_twap()?;

    // ── Price Stabilizer ──
    let protocol_balance = ctx.accounts.protocol_vault.token_balance;
    let stab_result = curve.calculate_stabilization(protocol_balance)?;

    if let Some(stab) = stab_result {
        let curve = &mut ctx.accounts.bonding_curve;
        curve.apply_stabilization(&stab)?;

        let _ = curve;

        // Burn protocol tokens from the protocol ATA
        if ctx.accounts.protocol_token_account.is_frozen() {
            thaw_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                ThawAccount {
                    account: ctx.accounts.protocol_token_account.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    authority: ctx.accounts.bonding_curve.to_account_info(),
                },
                signer_seeds,
            ))?;
        }

        burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.protocol_token_account.to_account_info(),
                    authority: ctx.accounts.bonding_curve.to_account_info(),
                },
                signer_seeds,
            ),
            stab.tokens_to_sell,
        )?;

        freeze_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            FreezeAccount {
                account: ctx.accounts.protocol_token_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.bonding_curve.to_account_info(),
            },
            signer_seeds,
        ))?;

        // Distribute SOL fees from the stabilizer sell via lamport manipulation
        let curve_info = ctx.accounts.bonding_curve.to_account_info();
        if stab.fee_creator > 0 {
            **curve_info.try_borrow_mut_lamports()? -= stab.fee_creator;
            **ctx.accounts.creator_fee_vault.to_account_info().try_borrow_mut_lamports()? += stab.fee_creator;
            ctx.accounts.creator_fee_vault.record_deposit(stab.fee_creator)?;
        }
        if stab.fee_protocol > 0 {
            **curve_info.try_borrow_mut_lamports()? -= stab.fee_protocol;
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += stab.fee_protocol;
        }
        // sol_net → protocol treasury (Stabilizer revenue)
        if stab.sol_net > 0 {
            **curve_info.try_borrow_mut_lamports()? -= stab.sol_net;
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += stab.sol_net;
        }

        // Update protocol vault
        let pv = &mut ctx.accounts.protocol_vault;
        pv.token_balance = pv.token_balance
            .checked_sub(stab.tokens_to_sell)
            .ok_or(HumanofiError::MathOverflow)?;
        pv.total_stabilized = pv.total_stabilized
            .checked_add(stab.tokens_to_sell)
            .ok_or(HumanofiError::MathOverflow)?;
        pv.total_sol_earned = pv.total_sol_earned
            .checked_add(stab.sol_net)
            .ok_or(HumanofiError::MathOverflow)?;

        msg!(
            "🛡️ Stabilizer | sold={} tokens | sol_earned={}",
            stab.tokens_to_sell,
            stab.sol_net,
        );

        // Update TWAP after stabilization
        let curve = &mut ctx.accounts.bonding_curve;
        curve.update_twap()?;
    }

    msg!(
        "✅ Buy | buyer={} | sol={} | tokens_buyer={} | tokens_merit={} | tokens_protocol={} | fee={}",
        ctx.accounts.buyer.key(),
        sol_amount,
        result.tokens_buyer,
        result.tokens_creator,
        result.tokens_protocol,
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

    /// Creator Fee Vault PDA — accumulates 3% creator fees
    #[account(
        mut,
        seeds = [SEED_CREATOR_FEES, mint.key().as_ref()],
        bump = creator_fee_vault.bump,
        has_one = mint,
    )]
    pub creator_fee_vault: Box<Account<'info, CreatorFeeVault>>,

    /// Protocol Vault PDA — tracks protocol token balance
    #[account(
        mut,
        seeds = [SEED_PROTOCOL_VAULT, mint.key().as_ref()],
        bump = protocol_vault.bump,
        has_one = mint,
    )]
    pub protocol_vault: Box<Account<'info, ProtocolVault>>,

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

    /// Creator's token account for Merit Reward (init_if_needed)
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = creator_wallet,
        associated_token::token_program = token_program,
    )]
    pub creator_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Protocol's token account for Merit Fee (init_if_needed)
    /// Authority = bonding_curve PDA (so the program can burn for Stabilizer)
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = bonding_curve,
        associated_token::token_program = token_program,
    )]
    pub protocol_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Creator's wallet (ATA authority for Merit tokens)
    /// CHECK: validated via bonding_curve.creator
    #[account(
        mut,
        constraint = creator_wallet.key() == bonding_curve.creator @ HumanofiError::InvalidMint
    )]
    pub creator_wallet: UncheckedAccount<'info>,

    /// Protocol treasury wallet (receives 2% of fees + Stabilizer revenue)
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
