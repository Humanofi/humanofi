// ========================================
// Humanofi — Error Codes
// ========================================

use anchor_lang::prelude::*;

#[error_code]
pub enum HumanofiError {
    // ---- Token Creation (6000-6009) ----
    #[msg("Token name must be between 1 and 32 characters")]
    InvalidTokenName,

    #[msg("Token symbol must be between 1 and 10 characters")]
    InvalidTokenSymbol,

    // ---- Bonding Curve (6010-6019) ----
    #[msg("Bonding curve is not active")]
    CurveNotActive,

    #[msg("Insufficient SOL for this purchase")]
    InsufficientSolAmount,

    #[msg("Insufficient token balance to sell")]
    InsufficientTokenBalance,

    #[msg("Calculated price is zero — amount too small")]
    PriceCalculationZero,

    #[msg("Math overflow in bonding curve calculation")]
    MathOverflow,

    #[msg("Insufficient reserve in bonding curve")]
    InsufficientReserve,

    #[msg("Pool depleted — insufficient token reserve to complete trade")]
    PoolDepleted,

    // ---- Purchase (6020-6029) ----
    #[msg("Purchase amount must be greater than zero")]
    ZeroPurchaseAmount,

    // ---- Creator Vault / Smart Sell Limiter (6030-6039) ----
    #[msg("Creator tokens are still locked — Year 1 vesting (0% sellable)")]
    CreatorVestingLocked,

    #[msg("Sell exceeds max price impact (5% limit per transaction)")]
    SellImpactExceeded,

    #[msg("Creator must wait 30 days between sells")]
    CreatorSellCooldown,

    #[msg("Only the creator can perform this action")]
    UnauthorizedCreator,

    // ---- Rewards / Fees (6040-6049) ----
    #[msg("No rewards available to claim")]
    NoRewardsToClaim,

    #[msg("Holder must have a positive token balance to claim rewards")]
    ZeroHolderBalance,

    #[msg("No fees available to claim")]
    NoFeesToClaim,

    #[msg("Creator must wait 15 days between fee claims")]
    CreatorClaimCooldown,

    // ---- Fees (6050-6059) ----
    #[msg("Fee calculation overflow")]
    FeeOverflow,

    // ---- Security (6060-6069) ----
    #[msg("Unauthorized: transfer blocked — tokens can only be traded via Humanofi")]
    UnauthorizedTransfer,

    #[msg("CPI guard: only direct wallet transactions are allowed — no bots or programs")]
    CpiGuard,

    #[msg("Invalid mint for this operation")]
    InvalidMint,

    #[msg("Token amount must be greater than zero")]
    ZeroAmount,

    // ---- Initial Liquidity (6080-6089) ----
    #[msg("Initial liquidity below minimum — inject more SOL to give your token value")]
    InsufficientInitialLiquidity,

    #[msg("Initial liquidity exceeds maximum")]
    ExcessiveInitialLiquidity,

    // ---- Treasury (6090-6099) ----
    #[msg("Invalid treasury wallet — must match protocol treasury")]
    InvalidTreasury,

    // ---- Slippage Protection (6100-6109) ----
    #[msg("Slippage exceeded — received less than minimum specified")]
    SlippageExceeded,
}
