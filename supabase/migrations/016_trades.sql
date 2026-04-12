-- ========================================
-- Humanofi — Trades History (On-Chain Proof)
-- ========================================
-- Stores every buy/sell with cryptographic proof (tx_signature + slot).
-- Used by: BondingCurveChart (OHLCV), trade history feed, analytics.
-- Each trade is verified on-chain before insertion.

CREATE TABLE IF NOT EXISTS trades (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mint_address    TEXT NOT NULL REFERENCES creator_tokens(mint_address),
    trade_type      TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
    wallet_address  TEXT NOT NULL,
    sol_amount      BIGINT NOT NULL,        -- lamports
    token_amount    BIGINT NOT NULL,        -- base units (6 decimals)
    price_sol       NUMERIC NOT NULL,       -- spot price in SOL after trade
    -- On-chain proof (immutable, verifiable on Solana Explorer)
    tx_signature    TEXT NOT NULL UNIQUE,    -- Solana transaction signature
    slot            BIGINT NOT NULL DEFAULT 0, -- Solana slot number
    -- Curve state snapshot after trade
    x_after         NUMERIC NOT NULL DEFAULT 0,
    y_after         NUMERIC NOT NULL DEFAULT 0,
    k_after         NUMERIC NOT NULL DEFAULT 0,
    sol_reserve     BIGINT NOT NULL DEFAULT 0,
    supply_public   BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient chart queries
CREATE INDEX IF NOT EXISTS idx_trades_mint_time
    ON trades(mint_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trades_mint_type
    ON trades(mint_address, trade_type);

CREATE INDEX IF NOT EXISTS idx_trades_tx_sig
    ON trades(tx_signature);

-- RLS: Public read, service insert
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trades' AND policyname = 'public_read_trades'
  ) THEN
    CREATE POLICY "public_read_trades" ON trades FOR SELECT USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trades' AND policyname = 'service_insert_trades'
  ) THEN
    CREATE POLICY "service_insert_trades" ON trades FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Enable realtime for live chart updates
ALTER PUBLICATION supabase_realtime ADD TABLE trades;
