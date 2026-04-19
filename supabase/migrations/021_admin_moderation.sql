-- ========================================
-- Humanofi — Admin & Moderation System
-- Migration: 021_admin_moderation
-- ========================================
-- Creates the admin/moderation infrastructure:
--   1. admin_wallets (role-based access)
--   2. admin_nonces (anti-replay for auth)
--   3. moderation_actions (immutable audit trail)
--   4. creator_warnings (creator notifications)
--   5. platform_settings (emergency freeze, etc.)
--   6. Adds moderation columns to existing tables


-- ══════════════════════════════════════════
-- 1. ADMIN WALLETS
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_wallets (
  wallet_address  TEXT PRIMARY KEY,
  role            TEXT NOT NULL CHECK (role IN ('authority', 'moderator', 'recovery')),
  password_hash   TEXT NOT NULL,
  label           TEXT DEFAULT '',
  added_by        TEXT,
  is_active       BOOLEAN DEFAULT true,
  failed_attempts INTEGER DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  last_login_ip   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS: NOBODY can read this from the client. Service role only.
ALTER TABLE admin_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_wallets_deny_all" ON admin_wallets USING (false);


-- ══════════════════════════════════════════
-- 2. ADMIN NONCES (auth anti-replay)
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS admin_nonces (
  nonce           TEXT PRIMARY KEY,
  wallet_address  TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  used            BOOLEAN DEFAULT false
);

ALTER TABLE admin_nonces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_nonces_deny_all" ON admin_nonces USING (false);

-- Auto-cleanup nonces older than 5 minutes
CREATE OR REPLACE FUNCTION cleanup_expired_nonces()
RETURNS void AS $$
BEGIN
  DELETE FROM admin_nonces WHERE created_at < now() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ══════════════════════════════════════════
-- 3. MODERATION ACTIONS (immutable audit trail)
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS moderation_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_wallet TEXT NOT NULL,
  action_type     TEXT NOT NULL CHECK (action_type IN (
    'hide_post', 'unhide_post', 'hide_drop', 'unhide_drop',
    'warn_creator', 'suspend_token', 'unsuspend_token',
    'add_moderator', 'remove_moderator',
    'withdraw_fees', 'emergency_freeze', 'emergency_unfreeze',
    'revoke_authority', 'login', 'login_failed'
  )),
  target_type     TEXT CHECK (target_type IN ('creator', 'post', 'drop', 'token', 'platform', 'wallet')),
  target_id       TEXT,
  reason          TEXT DEFAULT '',
  metadata        JSONB DEFAULT '{}',
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS: deny client access, immutable (no UPDATE/DELETE policies)
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "moderation_actions_deny_all" ON moderation_actions USING (false);

CREATE INDEX IF NOT EXISTS idx_mod_actions_created ON moderation_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_actions_type ON moderation_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_mod_actions_moderator ON moderation_actions(moderator_wallet);


-- ══════════════════════════════════════════
-- 4. CREATOR WARNINGS
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS creator_warnings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_mint    TEXT NOT NULL,
  warning_type    TEXT NOT NULL CHECK (warning_type IN (
    'content_violation', 'spam', 'scam', 'manipulation', 'other'
  )),
  message         TEXT NOT NULL,
  severity        TEXT DEFAULT 'warning' CHECK (severity IN ('warning', 'strike', 'final_warning')),
  issued_by       TEXT NOT NULL,
  acknowledged    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE creator_warnings ENABLE ROW LEVEL SECURITY;

-- Creators can see their own warnings (by matching mint)
CREATE POLICY "creator_read_own_warnings" ON creator_warnings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM creator_tokens
      WHERE creator_tokens.mint_address = creator_warnings.creator_mint
      AND creator_tokens.wallet_address = auth.uid()::text
    )
  );

CREATE INDEX IF NOT EXISTS idx_warnings_mint ON creator_warnings(creator_mint);


-- ══════════════════════════════════════════
-- 5. PLATFORM SETTINGS
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
-- Public can read (for emergency freeze check)
CREATE POLICY "public_read_settings" ON platform_settings FOR SELECT USING (true);
-- No client writes
CREATE POLICY "settings_deny_write" ON platform_settings FOR INSERT WITH CHECK (false);
CREATE POLICY "settings_deny_update" ON platform_settings FOR UPDATE USING (false);

INSERT INTO platform_settings (key, value) VALUES ('emergency_freeze', 'false') ON CONFLICT DO NOTHING;
INSERT INTO platform_settings (key, value) VALUES ('freeze_reason', '') ON CONFLICT DO NOTHING;


-- ══════════════════════════════════════════
-- 6. MODERATION COLUMNS ON EXISTING TABLES
-- ══════════════════════════════════════════

-- Posts: can be hidden by moderators
ALTER TABLE inner_circle_posts ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
ALTER TABLE inner_circle_posts ADD COLUMN IF NOT EXISTS hidden_by TEXT;
ALTER TABLE inner_circle_posts ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

-- Creators: can be suspended by authority
ALTER TABLE creator_tokens ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
ALTER TABLE creator_tokens ADD COLUMN IF NOT EXISTS suspension_reason TEXT;


-- ══════════════════════════════════════════
-- NOTE: Insert admin wallets MANUALLY via SQL Editor
-- ══════════════════════════════════════════
-- DO NOT put passwords in migration files.
-- Use the following template in Supabase SQL Editor:
--
-- INSERT INTO admin_wallets (wallet_address, role, password_hash, label)
-- VALUES ('YOUR_WALLET_PUBKEY', 'authority', '$2a$12$YOUR_BCRYPT_HASH', 'Alexis');
--
-- Generate hash with: node -e "require('bcryptjs').hash('PASSWORD',12,(e,h)=>console.log(h))"
