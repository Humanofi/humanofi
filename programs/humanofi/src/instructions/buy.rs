// ========================================
// Humanofi — Buy Tokens (Human Curve™)
// ========================================
//
// Buy flow (matches humanofi-mathematiques.md §5):
//   1. CPI Guard: reject bot/program calls
//   2. Calculate buy via Human Curve (fees + k-deepening + merit split)
//   3. Slippage protection
//   4. Transfer SOL: buyer → curve reserve (net)
//   5. Distribute fees: 2% creator, 2% holder pool, 1% protocol
//   6. Mint tokens_buyer → buyer ATA (thaw/mint/freeze)
//   7. Mint tokens_creator → creator ATA (12.6% Merit Reward, frozen)
//   8. Mint tokens_protocol → protocol ATA (1.4% Merit Fee, frozen)
//   9. Update reward pool (MasterChef pattern)
//  10. Update curve state (x, y, k, supplies)
//  11. Update EMA TWAP
//  12. Price Stabilizer: auto-sell protocol tokens if price spiked
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

    // ── Transfer fees: buyer → recipients (5% total exits vault) ──

    // 2% → Creator wallet (SOL, immediate)
    if result.fee_creator > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.creator_wallet.to_account_info(),
                },
            ),
            result.fee_creator,
        )?;
    }

    // 2% → Holder reward pool
    if result.fee_holders > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.reward_pool.to_account_info(),
                },
            ),
            result.fee_holders,
        )?;
    }

    // 1% → Protocol treasury
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

    // ── Mint creator's Merit Reward (12.6%) → creator ATA ──
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

    // ── Mint protocol's Merit Fee (1.4%) → protocol ATA ──
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

    // ── Update reward pool BEFORE supply change (MasterChef pattern) ──
    // On first buy: supply_public == 0, but after this buy the buyer will have tokens.
    // We use tokens_buyer as denominator so the first buyer gets their fair share
    // of the holders fee (otherwise those fees are locked forever — S-04 fix).
    {
        let curve = &ctx.accounts.bonding_curve;
        if result.fee_holders > 0 {
            let denominator = if curve.supply_public > 0 {
                curve.supply_public
            } else {
                // First buy: attribute fees to the incoming buyer's token count
                result.tokens_buyer
            };
            ctx.accounts
                .reward_pool
                .update_reward_per_token(result.fee_holders, denominator)?;
        }
    }

    // ── Update curve state ──
    let curve = &mut ctx.accounts.bonding_curve;
    curve.apply_buy(&result)?;
    curve.update_twap()?;

    // ── Price Stabilizer ──
    // Pre-compute stabilization BEFORE CPI to avoid borrow conflicts
    let protocol_balance = ctx.accounts.protocol_vault.token_balance;
    let stab_result = curve.calculate_stabilization(protocol_balance)?;

    if let Some(stab) = stab_result {
        // Apply state changes first (while we have &mut)
        let supply_public_for_rewards = curve.supply_public;
        curve.apply_stabilization(&stab)?;

        // Now drop the mut ref for CPI
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
            **ctx.accounts.creator_wallet.to_account_info().try_borrow_mut_lamports()? += stab.fee_creator;
        }
        if stab.fee_holders > 0 {
            **curve_info.try_borrow_mut_lamports()? -= stab.fee_holders;
            **ctx.accounts.reward_pool.to_account_info().try_borrow_mut_lamports()? += stab.fee_holders;

            if supply_public_for_rewards > 0 {
                ctx.accounts.reward_pool
                    .update_reward_per_token(stab.fee_holders, supply_public_for_rewards)?;
            }
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

        // Update TWAP after stabilization so EMA reflects the stabilized price (S-10 fix)
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
        result.fee_creator + result.fee_holders + result.fee_protocol + result.fee_depth
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
        has_one = mint,
    )]
    pub reward_pool: Box<Account<'info, RewardPool>>,

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

    /// Creator's wallet (receives 2% SOL fee + ATA authority for Merit tokens)
    /// CHECK: validated via bonding_curve.creator
    #[account(
        mut,
        constraint = creator_wallet.key() == bonding_curve.creator @ HumanofiError::InvalidMint
    )]
    pub creator_wallet: UncheckedAccount<'info>,

    /// Protocol treasury wallet (receives 1% of fees + Stabilizer revenue)
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
