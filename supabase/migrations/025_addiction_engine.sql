-- ========================================
-- Humanofi — Addiction Engine Foundation
-- ========================================
-- New tables & columns for the 3 engagement layers:
--   1. feed_events     → live market signal feed
--   2. token_holders   → holder_rank + is_early_believer
--   3. profiles        → bio + total_trades

-- ═══════════════════════════════════
-- 1. FEED EVENTS — Market signal stream
-- ═══════════════════════════════════
-- Unified event feed: trades, milestones, whale alerts, etc.
-- Powers the Live Trade Ticker + hybrid feed.

CREATE TABLE IF NOT EXISTS feed_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      TEXT NOT NULL CHECK (event_type IN (
        'trade', 'new_holder', 'milestone', 'whale_alert', 'price_move', 'new_creator'
    )),
    mint_address    TEXT NOT NULL REFERENCES creator_tokens(mint_address),
    wallet_address  TEXT,
    data            JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_events_time ON feed_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_events_mint ON feed_events(mint_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_events_type ON feed_events(event_type, created_at DESC);

ALTER TABLE feed_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feed_events' AND policyname = 'public_read_feed_events'
  ) THEN
    CREATE POLICY "public_read_feed_events" ON feed_events FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feed_events' AND policyname = 'service_insert_feed_events'
  ) THEN
    CREATE POLICY "service_insert_feed_events" ON feed_events FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Enable realtime for live ticker
ALTER PUBLICATION supabase_realtime ADD TABLE feed_events;


-- ═══════════════════════════════════
-- 2. EXTEND token_holders
-- ═══════════════════════════════════
-- holder_rank: numeric rank (1 = biggest holder)
-- is_early_believer: permanent badge for first 10 buyers

ALTER TABLE token_holders ADD COLUMN IF NOT EXISTS holder_rank INT;
ALTER TABLE token_holders ADD COLUMN IF NOT EXISTS is_early_believer BOOLEAN DEFAULT false;


-- ═══════════════════════════════════
-- 3. EXTEND profiles
-- ═══════════════════════════════════
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_trades INT DEFAULT 0;


-- ═══════════════════════════════════
-- 4. Function: Recalculate holder ranks for a mint
-- ═══════════════════════════════════
CREATE OR REPLACE FUNCTION recalc_holder_ranks(p_mint TEXT)
RETURNS VOID AS $$
BEGIN
    WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY balance DESC) AS rk
        FROM token_holders
        WHERE mint_address = p_mint AND balance > 0
    )
    UPDATE token_holders th
    SET holder_rank = ranked.rk
    FROM ranked
    WHERE th.id = ranked.id;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════
-- DONE
-- ═══════════════════════════════════
-- New table: feed_events (6 event types, realtime enabled)
-- Extended: token_holders (+holder_rank, +is_early_believer)
-- Extended: profiles (+bio, +total_trades)
-- Function: recalc_holder_ranks(mint) for rank updates
