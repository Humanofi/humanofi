-- ========================================================
-- HUMANOFI — Migration 003: Engagement Tracking
-- ========================================================
-- Run AFTER 002_beta_adjustments.sql
-- Date: 2026-04-10
--
-- Implements the "Conditional Engagement Rewards" system.
-- Holders must be active in the Inner Circle to claim
-- their share of the 30% reward pool.
--
-- Changes:
--   1. Create holder_engagement table
--   2. Create engagement tracking function
--   3. RLS policies for service access
-- ========================================================


-- ════════════════════════════════════════════════════════
-- 1. HOLDER ENGAGEMENT TABLE
-- ════════════════════════════════════════════════════════
-- Tracks engagement actions per holder per token per epoch.
-- The API increments counters when holders react/reply/vote.
-- The oracle sync API reads this to write on-chain records.

CREATE TABLE IF NOT EXISTS holder_engagement (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address  TEXT NOT NULL,
    mint_address    TEXT NOT NULL,
    epoch           BIGINT NOT NULL,              -- month epoch (unix_ts / 2_592_000)
    reactions_count INT DEFAULT 0 NOT NULL,       -- emoji reactions on posts
    replies_count   INT DEFAULT 0 NOT NULL,       -- replies on posts
    votes_count     INT DEFAULT 0 NOT NULL,       -- poll votes (V2)
    total_actions   INT DEFAULT 0 NOT NULL,       -- sum of all above
    synced_onchain  BOOLEAN DEFAULT FALSE,        -- has been written to Solana?
    synced_at       TIMESTAMPTZ,                  -- when it was synced
    created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- One row per wallet per token per epoch
    UNIQUE(wallet_address, mint_address, epoch)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_engagement_wallet_mint
    ON holder_engagement(wallet_address, mint_address);
CREATE INDEX IF NOT EXISTS idx_engagement_epoch
    ON holder_engagement(epoch, synced_onchain);
CREATE INDEX IF NOT EXISTS idx_engagement_mint_epoch
    ON holder_engagement(mint_address, epoch);

-- RLS
ALTER TABLE holder_engagement ENABLE ROW LEVEL SECURITY;

-- Public read (holders can see their own engagement)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'holder_engagement' AND policyname = 'public_read_engagement'
  ) THEN
    CREATE POLICY "public_read_engagement" ON holder_engagement
      FOR SELECT USING (true);
    RAISE NOTICE 'Added SELECT policy on holder_engagement';
  END IF;
END $$;

-- Service can manage (API writes engagement records)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'holder_engagement' AND policyname = 'service_manage_engagement'
  ) THEN
    CREATE POLICY "service_manage_engagement" ON holder_engagement
      FOR ALL USING (true);
    RAISE NOTICE 'Added ALL policy on holder_engagement';
  END IF;
END $$;

-- Updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_holder_engagement ON holder_engagement;
CREATE TRIGGER set_updated_at_holder_engagement
  BEFORE UPDATE ON holder_engagement
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ════════════════════════════════════════════════════════
-- 2. HELPER: Increment engagement function
-- ════════════════════════════════════════════════════════
-- Called by the API after each reaction/reply/vote to
-- atomically increment the correct counter.

CREATE OR REPLACE FUNCTION increment_engagement(
    p_wallet_address TEXT,
    p_mint_address TEXT,
    p_epoch BIGINT,
    p_action_type TEXT  -- 'reaction', 'reply', or 'vote'
) RETURNS void AS $$
BEGIN
    INSERT INTO holder_engagement (wallet_address, mint_address, epoch)
    VALUES (p_wallet_address, p_mint_address, p_epoch)
    ON CONFLICT (wallet_address, mint_address, epoch) DO NOTHING;

    IF p_action_type = 'reaction' THEN
        UPDATE holder_engagement
        SET reactions_count = reactions_count + 1,
            total_actions = total_actions + 1,
            synced_onchain = FALSE
        WHERE wallet_address = p_wallet_address
          AND mint_address = p_mint_address
          AND epoch = p_epoch;
    ELSIF p_action_type = 'reply' THEN
        UPDATE holder_engagement
        SET replies_count = replies_count + 1,
            total_actions = total_actions + 1,
            synced_onchain = FALSE
        WHERE wallet_address = p_wallet_address
          AND mint_address = p_mint_address
          AND epoch = p_epoch;
    ELSIF p_action_type = 'vote' THEN
        UPDATE holder_engagement
        SET votes_count = votes_count + 1,
            total_actions = total_actions + 1,
            synced_onchain = FALSE
        WHERE wallet_address = p_wallet_address
          AND mint_address = p_mint_address
          AND epoch = p_epoch;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════════════
-- DONE — Migration 003: Engagement Tracking
-- ════════════════════════════════════════════════════════
-- New table: holder_engagement
-- New function: increment_engagement()
-- All statements are idempotent (safe to re-run)
