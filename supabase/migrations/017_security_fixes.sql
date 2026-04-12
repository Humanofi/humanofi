-- ========================================
-- Humanofi — Migration 017: Security & Schema Fixes
-- ========================================
-- Fixes from the global audit:
--   1. RLS trades: block INSERT via anon key
--   2. Add holder_count column to creator_tokens
--   3. Add didit_session_id column to verified_identities
--   4. Atomic balance update function for webhooks
--   5. RLS price_snapshots: block INSERT via anon key

-- ── 1. Fix RLS on trades: only service_role can insert ──
DROP POLICY IF EXISTS "service_insert_trades" ON trades;
CREATE POLICY "service_insert_trades" ON trades
  FOR INSERT
  WITH CHECK (false);
-- Note: service_role key bypasses RLS, so API routes still work.
-- This blocks direct inserts via the public anon key.

-- ── 2. Add holder_count to creator_tokens ──
ALTER TABLE creator_tokens
  ADD COLUMN IF NOT EXISTS holder_count INTEGER NOT NULL DEFAULT 0;

-- ── 3. Add didit_session_id to verified_identities ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'verified_identities') THEN
    ALTER TABLE verified_identities
      ADD COLUMN IF NOT EXISTS didit_session_id TEXT;
  END IF;
END $$;

-- ── 4. Atomic balance update function (prevents race conditions) ──
CREATE OR REPLACE FUNCTION update_holder_balance(
  p_wallet TEXT,
  p_mint TEXT,
  p_delta BIGINT
) RETURNS void AS $$
BEGIN
  INSERT INTO token_holders (wallet_address, mint_address, balance, first_bought_at, updated_at)
  VALUES (p_wallet, p_mint, GREATEST(0, p_delta), now(), now())
  ON CONFLICT (wallet_address, mint_address)
  DO UPDATE SET
    balance = GREATEST(0, token_holders.balance + p_delta),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only service_role can call this function
REVOKE ALL ON FUNCTION update_holder_balance(TEXT, TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_holder_balance(TEXT, TEXT, BIGINT) TO service_role;

-- ── 5. Fix RLS on price_snapshots: only service_role can insert ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'price_snapshots' AND policyname = 'service_insert_snapshots'
  ) THEN
    DROP POLICY "service_insert_snapshots" ON price_snapshots;
  END IF;
END $$;

-- Check if there's any permissive INSERT policy
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'price_snapshots' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON price_snapshots', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "service_only_insert_snapshots" ON price_snapshots
  FOR INSERT
  WITH CHECK (false);
