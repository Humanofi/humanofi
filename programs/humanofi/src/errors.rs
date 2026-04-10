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

    #[msg("Base price must be greater than zero")]
    InvalidBasePrice,

    #[msg("Curve factor must be greater than zero")]
    InvalidCurveFactor,

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

    // ---- Purchase Limits (6020-6029) ----
    #[msg("Purchase exceeds daily limit for this period")]
    DailyLimitExceeded,

    #[msg("Purchase amount must be greater than zero")]
    ZeroPurchaseAmount,

    // ---- Creator Vault (6030-6039) ----
    #[msg("Creator tokens are still locked")]
    TokensStillLocked,

    #[msg("Creator tokens have already been unlocked")]
    TokensAlreadyUnlocked,

    #[msg("Only the creator can unlock their tokens")]
    UnauthorizedUnlock,

    // ---- Rewards (6040-6049) ----
    #[msg("No rewards available to claim")]
    NoRewardsToClaim,

    #[msg("Holder must have a positive token balance to claim rewards")]
    ZeroHolderBalance,

    // ---- Fees (6050-6059) ----
    #[msg("Fee calculation overflow")]
    FeeOverflow,

    // ---- Security (6060-6069) ----
    #[msg("Unauthorized: transfer blocked — tokens can only be traded via Humanofi")]
    UnauthorizedTransfer,

    #[msg("Invalid mint for this operation")]
    InvalidMint,

    #[msg("Token amount must be greater than zero")]
    ZeroAmount,

    // ---- Engagement (6070-6079) ----
    #[msg("Engagement record expired — must be from current epoch")]
    EngagementExpired,

    #[msg("Insufficient engagement — minimum actions required this month")]
    InsufficientEngagement,

    #[msg("Unauthorized: only protocol authority can record engagement")]
    UnauthorizedOracle,
}
