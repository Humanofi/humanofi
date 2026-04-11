-- ========================================
-- Humanofi — Price History Snapshots
-- ========================================
-- Stores periodic price snapshots for each token.
-- Fed by: Helius webhook on buy/sell + hourly cron backup.
-- Used by: BondingCurveChart, PersonCard sparkline, leaderboard.

CREATE TABLE IF NOT EXISTS price_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mint_address    TEXT NOT NULL REFERENCES creator_tokens(mint_address),
    price_sol       NUMERIC NOT NULL,       -- token price in SOL at snapshot time
    supply          BIGINT NOT NULL DEFAULT 0,  -- supply_sold at snapshot time
    sol_reserve     BIGINT NOT NULL DEFAULT 0,  -- SOL reserve at snapshot time
    holder_count    INTEGER NOT NULL DEFAULT 0, -- holder count at snapshot time
    source          TEXT NOT NULL DEFAULT 'trade' CHECK (source IN ('trade', 'cron', 'manual')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient chart queries
CREATE INDEX IF NOT EXISTS idx_price_snapshots_mint_time 
    ON price_snapshots(mint_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_time 
    ON price_snapshots(created_at DESC);

-- RLS: Public read
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'price_snapshots' AND policyname = 'public_read_snapshots'
  ) THEN
    CREATE POLICY "public_read_snapshots" ON price_snapshots FOR SELECT USING (true);
  END IF;
END $$;

-- Service role can insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'price_snapshots' AND policyname = 'service_insert_snapshots'
  ) THEN
    CREATE POLICY "service_insert_snapshots" ON price_snapshots FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Enable realtime for live chart updates
ALTER PUBLICATION supabase_realtime ADD TABLE price_snapshots;

-- ── Seed initial snapshot for all existing creators ──
INSERT INTO price_snapshots (mint_address, price_sol, supply, sol_reserve, holder_count, source)
SELECT 
    ct.mint_address,
    0.0001,  -- default base price
    0,
    0,
    COALESCE(h.cnt, 0),
    'manual'
FROM creator_tokens ct
LEFT JOIN (
    SELECT mint_address, COUNT(*) AS cnt 
    FROM token_holders 
    WHERE balance > 0 
    GROUP BY mint_address
) h ON h.mint_address = ct.mint_address
ON CONFLICT DO NOTHING;
