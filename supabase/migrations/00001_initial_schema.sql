-- ========================================
-- Humanofi — Initial Database Schema
-- Migration: 00001_initial_schema
-- ========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ========================================
-- 1. VERIFIED IDENTITIES
-- ========================================
-- Stores only HIUID hashes — NO personal data.
-- Stripe Identity handles PII storage.

CREATE TABLE verified_identities (
    hiuid           TEXT PRIMARY KEY,
    wallet_address  TEXT UNIQUE NOT NULL,
    has_token       BOOLEAN DEFAULT false,
    verified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    country_code    TEXT NOT NULL  -- ISO 3166-1 alpha-2, for aggregate stats only
);

-- RLS: Nobody can read this table from the client
ALTER TABLE verified_identities ENABLE ROW LEVEL SECURITY;

-- Only service role can access (used by API routes)
CREATE POLICY "service_role_only" ON verified_identities
    USING (false);

-- ========================================
-- 2. CREATOR TOKENS
-- ========================================
-- Public profiles of token creators.

CREATE TABLE creator_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mint_address    TEXT UNIQUE NOT NULL,
    wallet_address  TEXT UNIQUE NOT NULL,
    hiuid           TEXT NOT NULL REFERENCES verified_identities(hiuid),
    display_name    TEXT NOT NULL,
    category        TEXT NOT NULL CHECK (category IN (
        'trader', 'entrepreneur', 'investor', 'artist',
        'researcher', 'creator', 'thinker', 'other'
    )),
    bio             TEXT DEFAULT '',
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    token_lock_until TIMESTAMPTZ NOT NULL,
    
    -- Activity Score v2
    activity_score      INTEGER NOT NULL DEFAULT 0 CHECK (activity_score >= 0 AND activity_score <= 100),
    regularity_score    INTEGER NOT NULL DEFAULT 0 CHECK (regularity_score >= 0 AND regularity_score <= 30),
    engagement_score    INTEGER NOT NULL DEFAULT 0 CHECK (engagement_score >= 0 AND engagement_score <= 40),
    retention_score     INTEGER NOT NULL DEFAULT 0 CHECK (retention_score >= 0 AND retention_score <= 30),
    activity_status     TEXT NOT NULL DEFAULT 'active' CHECK (activity_status IN (
        'active', 'low_activity', 'inactive', 'dormant'
    )),
    last_active_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    dormant_since       TIMESTAMPTZ,
    withdrawal_available BOOLEAN DEFAULT false
);

-- RLS: Public read access, write restricted
ALTER TABLE creator_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_creators" ON creator_tokens
    FOR SELECT USING (true);

CREATE POLICY "creator_update_own" ON creator_tokens
    FOR UPDATE USING (wallet_address = auth.uid()::text);

-- Indexes for common queries
CREATE INDEX idx_creator_tokens_wallet ON creator_tokens(wallet_address);
CREATE INDEX idx_creator_tokens_category ON creator_tokens(category);
CREATE INDEX idx_creator_tokens_activity ON creator_tokens(activity_score DESC);
CREATE INDEX idx_creator_tokens_created ON creator_tokens(created_at DESC);

-- ========================================
-- 3. TOKEN HOLDERS
-- ========================================
-- Synced from on-chain via Helius webhooks.

CREATE TABLE token_holders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address  TEXT NOT NULL,
    mint_address    TEXT NOT NULL REFERENCES creator_tokens(mint_address),
    balance         BIGINT NOT NULL DEFAULT 0,
    first_bought_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(wallet_address, mint_address)
);

-- RLS: Public read (on-chain data)
ALTER TABLE token_holders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_holders" ON token_holders
    FOR SELECT USING (true);

-- Indexes
CREATE INDEX idx_holders_wallet ON token_holders(wallet_address);
CREATE INDEX idx_holders_mint ON token_holders(mint_address);
CREATE INDEX idx_holders_balance ON token_holders(mint_address, balance DESC);

-- ========================================
-- 4. INNER CIRCLE POSTS
-- ========================================
-- Private posts from creators, visible only to token holders.

CREATE TABLE inner_circle_posts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_mint    TEXT NOT NULL REFERENCES creator_tokens(mint_address),
    content         TEXT NOT NULL,
    image_urls      TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: Only holders with balance > 0 can read
ALTER TABLE inner_circle_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inner_circle_access" ON inner_circle_posts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM token_holders
            WHERE token_holders.wallet_address = auth.uid()::text
            AND token_holders.mint_address = inner_circle_posts.creator_mint
            AND token_holders.balance > 0
        )
        OR
        -- Creator can always see their own posts
        EXISTS (
            SELECT 1 FROM creator_tokens
            WHERE creator_tokens.mint_address = inner_circle_posts.creator_mint
            AND creator_tokens.wallet_address = auth.uid()::text
        )
    );

CREATE POLICY "creator_insert_posts" ON inner_circle_posts
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM creator_tokens
            WHERE creator_tokens.mint_address = inner_circle_posts.creator_mint
            AND creator_tokens.wallet_address = auth.uid()::text
        )
    );

-- Index for feed queries
CREATE INDEX idx_posts_creator ON inner_circle_posts(creator_mint, created_at DESC);

-- ========================================
-- 5. INNER CIRCLE REACTIONS
-- ========================================
-- Holder reactions to inner circle posts (used for engagement scoring).

CREATE TABLE inner_circle_reactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id         UUID NOT NULL REFERENCES inner_circle_posts(id) ON DELETE CASCADE,
    wallet_address  TEXT NOT NULL,
    reaction_type   TEXT NOT NULL CHECK (reaction_type IN ('like', 'fire', 'insight', 'support')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(post_id, wallet_address)  -- One reaction per holder per post
);

ALTER TABLE inner_circle_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holders_can_react" ON inner_circle_reactions
    FOR INSERT WITH CHECK (
        wallet_address = auth.uid()::text
        AND EXISTS (
            SELECT 1 FROM inner_circle_posts p
            JOIN token_holders h ON h.mint_address = p.creator_mint
            WHERE p.id = inner_circle_reactions.post_id
            AND h.wallet_address = auth.uid()::text
            AND h.balance > 0
        )
    );

CREATE POLICY "public_read_reactions" ON inner_circle_reactions
    FOR SELECT USING (true);

-- ========================================
-- 6. INNER CIRCLE REPLIES
-- ========================================
-- Holder replies to posts (used for engagement scoring).

CREATE TABLE inner_circle_replies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id         UUID NOT NULL REFERENCES inner_circle_posts(id) ON DELETE CASCADE,
    wallet_address  TEXT NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inner_circle_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holders_can_reply" ON inner_circle_replies
    FOR INSERT WITH CHECK (
        wallet_address = auth.uid()::text
        AND EXISTS (
            SELECT 1 FROM inner_circle_posts p
            JOIN token_holders h ON h.mint_address = p.creator_mint
            WHERE p.id = inner_circle_replies.post_id
            AND h.wallet_address = auth.uid()::text
            AND h.balance > 0
        )
    );

CREATE POLICY "inner_circle_read_replies" ON inner_circle_replies
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM inner_circle_posts p
            JOIN token_holders h ON h.mint_address = p.creator_mint
            WHERE p.id = inner_circle_replies.post_id
            AND h.wallet_address = auth.uid()::text
            AND h.balance > 0
        )
    );

-- ========================================
-- 7. CREATOR ACTIVITY LOG
-- ========================================
-- Tracks all creator actions for Activity Score calculation.

CREATE TABLE creator_activity (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_mint    TEXT NOT NULL REFERENCES creator_tokens(mint_address),
    action_type     TEXT NOT NULL CHECK (action_type IN ('post', 'login', 'reply')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_creator ON creator_activity(creator_mint, created_at DESC);

ALTER TABLE creator_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_activity" ON creator_activity
    FOR SELECT USING (true);

-- ========================================
-- 8. ACTIVITY SCORE v2 — CRON FUNCTION
-- ========================================
-- Multi-dimensional scoring: regularity + engagement + retention

CREATE OR REPLACE FUNCTION update_all_activity_scores()
RETURNS void AS $$
DECLARE
    creator RECORD;
    v_regularity INTEGER;
    v_engagement INTEGER;
    v_retention INTEGER;
    v_total INTEGER;
    v_status TEXT;
    v_posts_count INTEGER;
    v_engagement_rate NUMERIC;
    v_retention_rate NUMERIC;
    v_total_holders INTEGER;
    v_new_holders INTEGER;
    v_lost_holders INTEGER;
    v_reactions_replies INTEGER;
BEGIN
    FOR creator IN SELECT mint_address FROM creator_tokens LOOP
    
        -- 1. RÉGULARITÉ (30 pts max)
        SELECT COUNT(*) INTO v_posts_count
        FROM creator_activity
        WHERE creator_mint = creator.mint_address
        AND action_type = 'post'
        AND created_at >= now() - INTERVAL '30 days';

        v_regularity := CASE
            WHEN v_posts_count >= 8 THEN 30
            WHEN v_posts_count >= 4 THEN 20
            WHEN v_posts_count >= 2 THEN 10
            WHEN v_posts_count >= 1 THEN 5
            ELSE 0
        END;

        -- 2. ENGAGEMENT HOLDERS (40 pts max)
        SELECT COUNT(*) INTO v_total_holders
        FROM token_holders
        WHERE mint_address = creator.mint_address AND balance > 0;

        SELECT COUNT(DISTINCT r.wallet_address) + COUNT(DISTINCT rp.wallet_address)
        INTO v_reactions_replies
        FROM inner_circle_posts p
        LEFT JOIN inner_circle_reactions r ON r.post_id = p.id 
            AND r.created_at >= now() - INTERVAL '30 days'
        LEFT JOIN inner_circle_replies rp ON rp.post_id = p.id 
            AND rp.created_at >= now() - INTERVAL '30 days'
        WHERE p.creator_mint = creator.mint_address
        AND p.created_at >= now() - INTERVAL '30 days';

        IF v_total_holders > 0 THEN
            v_engagement_rate := (v_reactions_replies::NUMERIC / v_total_holders::NUMERIC) * 100;
        ELSE
            v_engagement_rate := 0;
        END IF;

        v_engagement := CASE
            WHEN v_engagement_rate > 20 THEN 40
            WHEN v_engagement_rate > 10 THEN 30
            WHEN v_engagement_rate > 5  THEN 20
            WHEN v_engagement_rate > 1  THEN 10
            ELSE 0
        END;

        -- 3. RÉTENTION NETTE (30 pts max)
        SELECT COUNT(*) INTO v_new_holders
        FROM token_holders
        WHERE mint_address = creator.mint_address
        AND first_bought_at >= now() - INTERVAL '30 days'
        AND balance > 0;

        SELECT COUNT(*) INTO v_lost_holders
        FROM token_holders
        WHERE mint_address = creator.mint_address
        AND updated_at >= now() - INTERVAL '30 days'
        AND balance = 0;

        IF v_total_holders > 0 THEN
            v_retention_rate := ((v_new_holders - v_lost_holders)::NUMERIC / v_total_holders::NUMERIC) * 100;
        ELSE
            v_retention_rate := 0;
        END IF;

        v_retention := CASE
            WHEN v_retention_rate > 10  THEN 30
            WHEN v_retention_rate > 1   THEN 20
            WHEN v_retention_rate > -1  THEN 15
            WHEN v_retention_rate > -10 THEN 5
            ELSE 0
        END;

        -- Calculate total
        v_total := LEAST(v_regularity + v_engagement + v_retention, 100);

        -- Determine status
        v_status := CASE
            WHEN v_total >= 70 THEN 'active'
            WHEN v_total >= 40 THEN 'low_activity'
            WHEN v_total >= 1  THEN 'inactive'
            ELSE 'dormant'
        END;

        -- Update creator
        UPDATE creator_tokens SET
            regularity_score = v_regularity,
            engagement_score = v_engagement,
            retention_score = v_retention,
            activity_score = v_total,
            activity_status = v_status,
            dormant_since = CASE
                WHEN v_status = 'dormant' AND dormant_since IS NULL THEN now()
                WHEN v_status != 'dormant' THEN NULL
                ELSE dormant_since
            END,
            withdrawal_available = CASE
                WHEN v_status = 'dormant' AND dormant_since IS NOT NULL 
                    AND dormant_since <= now() - INTERVAL '90 days' THEN true
                ELSE false
            END
        WHERE mint_address = creator.mint_address;

    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Schedule cron job: every day at 3 AM UTC
SELECT cron.schedule(
    'update_activity_scores',
    '0 3 * * *',
    $$ SELECT update_all_activity_scores(); $$
);

-- ========================================
-- 9. HELPER VIEWS
-- ========================================

-- Leaderboard view
CREATE VIEW leaderboard AS
SELECT 
    ct.mint_address,
    ct.display_name,
    ct.category,
    ct.avatar_url,
    ct.activity_score,
    ct.activity_status,
    ct.created_at,
    COUNT(DISTINCT th.wallet_address) FILTER (WHERE th.balance > 0) AS holders_count,
    COALESCE(SUM(th.balance) FILTER (WHERE th.balance > 0), 0) AS total_supply_held
FROM creator_tokens ct
LEFT JOIN token_holders th ON th.mint_address = ct.mint_address
GROUP BY ct.id
ORDER BY holders_count DESC, ct.activity_score DESC;
