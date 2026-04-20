-- ========================================
-- Migration 026: Add token_symbol to creator_tokens
-- ========================================
-- The token symbol (e.g. "LISAV") was never persisted in creator_tokens.
-- It was only saved on-chain in the SPL metadata but lost in the DB.
-- This migration adds the column with a UNIQUE constraint to prevent duplicates.

-- 1. Add column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'creator_tokens' AND column_name = 'token_symbol'
  ) THEN
    ALTER TABLE creator_tokens ADD COLUMN token_symbol TEXT;
    RAISE NOTICE 'Added column: creator_tokens.token_symbol';
  END IF;
END $$;

-- 2. Add unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_tokens_token_symbol_unique'
  ) THEN
    ALTER TABLE creator_tokens
      ADD CONSTRAINT creator_tokens_token_symbol_unique UNIQUE (token_symbol);
    RAISE NOTICE 'Added UNIQUE constraint on token_symbol';
  END IF;
END $$;
