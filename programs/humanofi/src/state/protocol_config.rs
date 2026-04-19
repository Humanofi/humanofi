// ========================================
// Humanofi — Protocol Config (v3.8)
// ========================================
//
// Global singleton PDA storing admin authority & emergency freeze state.
// Seeds: ["protocol_config"]
//
// This account is checked by EVERY instruction (buy, sell, create, claim).
// If is_frozen = true, ALL operations are blocked until the authority
// calls toggle_freeze(false).

use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    /// The wallet authorized to freeze/unfreeze and suspend/unsuspend creators.
    /// In production, this should be a Squads multisig PDA.
    pub authority: Pubkey,

    /// Global emergency kill switch.
    /// When true, ALL instructions (buy, sell, create, claim) are blocked.
    pub is_frozen: bool,

    /// Unix timestamp of the last freeze event (0 if never frozen).
    pub frozen_at: i64,

    /// Reason for freeze (stored on-chain for transparency).
    /// Max 128 bytes.
    #[max_len(128)]
    pub freeze_reason: String,

    /// PDA bump seed.
    pub bump: u8,
}
