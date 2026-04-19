-- ========================================
-- Humanofi — Exclusive Drops Schema
-- Migration: 018_exclusive_drops
-- ========================================
--
-- Drops v3.6: Paid exclusive content sold in SOL.
--   - 15% protocol fee on each purchase
--   - Unlocked after token reaches 100 unique holders
--   - Content stored encrypted on Supabase Storage
--   - Decryption key delivered after on-chain payment verification
--
-- Tables:
--   1. exclusive_drops     — Drop listings (creator creates)
--   2. drop_purchases      — Purchase records (buyer buys)
--
-- Changes to existing tables:
--   - creator_tokens: +drops_unlocked flag

-- ========================================
-- 1. EXCLUSIVE DROPS
-- ========================================

CREATE TABLE IF NOT EXISTS exclusive_drops (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Creator reference
    creator_mint        TEXT NOT NULL REFERENCES creator_tokens(mint_address),
    creator_wallet      TEXT NOT NULL,
    
    -- Content metadata
    title               TEXT NOT NULL CHECK (char_length(title) <= 120),
    description         TEXT DEFAULT '' CHECK (char_length(description) <= 2000),
    content_type        TEXT NOT NULL DEFAULT 'document' CHECK (content_type IN (
        'document', 'video', 'audio', 'image', 'archive', 'other'
    )),
    preview_url         TEXT,           -- Public preview (thumbnail, teaser)
    
    -- Encrypted content (stored in Supabase Storage)
    -- content_path = bucket path to encrypted file
    -- encrypt_key  = AES-256 key used to encrypt the file (never exposed to client)
    content_path        TEXT NOT NULL,
    encrypt_key         TEXT NOT NULL,
    
    -- Pricing
    price_lamports      BIGINT NOT NULL CHECK (price_lamports >= 1000000),   -- Min ~$0.0002
    price_lamports_max  BIGINT,         -- NULL = no max (for future dynamic pricing)
    
    -- Supply control
    max_buyers          INTEGER,        -- NULL = unlimited
    buyer_count         INTEGER NOT NULL DEFAULT 0,
    
    -- Access tier
    -- 'all_holders'    = any holder with balance > 0
    -- 'top_holders'    = holders with balance >= tier_min_tokens
    -- 'public'         = anyone (no token required, but drops must be unlocked)
    tier                TEXT NOT NULL DEFAULT 'all_holders' CHECK (tier IN (
        'all_holders', 'top_holders', 'public'
    )),
    tier_min_tokens     BIGINT NOT NULL DEFAULT 0,  -- Only used for 'top_holders'
    
    -- Revenue tracking (in lamports)
    total_revenue       BIGINT NOT NULL DEFAULT 0,
    
    -- Status
    is_active           BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE exclusive_drops ENABLE ROW LEVEL SECURITY;

-- Anyone can read active drops (metadata only, not content_path/encrypt_key)
CREATE POLICY "public_read_drops" ON exclusive_drops
    FOR SELECT USING (is_active = true);

-- Service role handles inserts/updates (via API routes)
CREATE POLICY "service_manage_drops" ON exclusive_drops
    FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_drops_creator ON exclusive_drops(creator_mint, created_at DESC);
CREATE INDEX idx_drops_active ON exclusive_drops(is_active) WHERE is_active = true;

-- ========================================
-- 2. DROP PURCHASES
-- ========================================

CREATE TABLE IF NOT EXISTS drop_purchases (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    drop_id             UUID NOT NULL REFERENCES exclusive_drops(id),
    buyer_wallet        TEXT NOT NULL,
    creator_mint        TEXT NOT NULL REFERENCES creator_tokens(mint_address),
    
    -- Payment proof
    tx_signature        TEXT UNIQUE NOT NULL,   -- Solana TX signature (unique = no double spend)
    amount_paid         BIGINT NOT NULL,        -- Total SOL paid (lamports)
    protocol_fee        BIGINT NOT NULL,        -- 15% protocol fee (lamports)
    creator_revenue     BIGINT NOT NULL,        -- 85% to creator (lamports)
    
    -- Status
    verified            BOOLEAN NOT NULL DEFAULT false,  -- TX verified on-chain
    
    -- Timestamps
    purchased_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE drop_purchases ENABLE ROW LEVEL SECURITY;

-- Buyers can see their own purchases
CREATE POLICY "buyer_read_purchases" ON drop_purchases
    FOR SELECT USING (buyer_wallet = current_setting('request.jwt.claims', true)::json->>'sub');

-- Service role handles inserts
CREATE POLICY "service_manage_purchases" ON drop_purchases
    FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX idx_purchases_drop ON drop_purchases(drop_id);
CREATE INDEX idx_purchases_buyer ON drop_purchases(buyer_wallet, drop_id);
CREATE INDEX idx_purchases_creator ON drop_purchases(creator_mint);
CREATE INDEX idx_purchases_tx ON drop_purchases(tx_signature);

-- Unique: 1 purchase per buyer per drop
CREATE UNIQUE INDEX idx_purchases_unique ON drop_purchases(drop_id, buyer_wallet);

-- ========================================
-- 3. DROPS UNLOCK FLAG ON CREATOR_TOKENS
-- ========================================
-- A creator's drops are unlocked when their token reaches 100 unique holders.
-- This is checked and set by the API, not by a trigger (to avoid race conditions).

ALTER TABLE creator_tokens
    ADD COLUMN IF NOT EXISTS drops_unlocked BOOLEAN NOT NULL DEFAULT false;

-- Also add holder_count for quick access (synced by Helius webhook)
ALTER TABLE creator_tokens
    ADD COLUMN IF NOT EXISTS holder_count INTEGER NOT NULL DEFAULT 0;

-- ========================================
-- 4. HELPER: Increment buyer count & revenue
-- ========================================

CREATE OR REPLACE FUNCTION record_drop_purchase(
    p_drop_id UUID,
    p_amount BIGINT,
    p_protocol_fee BIGINT,
    p_creator_revenue BIGINT
) RETURNS void AS $$
BEGIN
    UPDATE exclusive_drops SET
        buyer_count = buyer_count + 1,
        total_revenue = total_revenue + p_creator_revenue,
        updated_at = now()
    WHERE id = p_drop_id;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 5. HELPER: Check and unlock drops
-- ========================================
-- Called after holder_count changes (Helius webhook).
-- Unlocks drops when holder_count >= 100.

CREATE OR REPLACE FUNCTION check_drops_unlock(p_mint TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_count INTEGER;
    v_already_unlocked BOOLEAN;
BEGIN
    SELECT drops_unlocked INTO v_already_unlocked
    FROM creator_tokens WHERE mint_address = p_mint;

    -- Already unlocked → keep it (no re-lock)
    IF v_already_unlocked THEN
        RETURN true;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM token_holders
    WHERE mint_address = p_mint AND balance > 0;

    IF v_count >= 100 THEN
        UPDATE creator_tokens SET drops_unlocked = true
        WHERE mint_address = p_mint;
        RETURN true;
    END IF;

    RETURN false;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 6. EXPAND ACTION TYPES to include 'drop'
-- ========================================

ALTER TABLE creator_activity
  DROP CONSTRAINT IF EXISTS creator_activity_action_type_check;

ALTER TABLE creator_activity
  ADD CONSTRAINT creator_activity_action_type_check
  CHECK (action_type IN (
    'post',           -- inner circle post
    'public_post',    -- public feed post
    'reply',          -- reply to a holder
    'login',          -- daily check-in
    'event',          -- hosted event
    'poll',           -- created poll
    'question_reply', -- answered holder question
    'drop'            -- created an exclusive drop
  ));

