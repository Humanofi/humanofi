-- ========================================
-- Humanofi — Activity Score v3 (Algorithmic)
-- ========================================
-- Replaces the crude CASE/WHEN step function with a continuous,
-- mathematically smooth scoring algorithm.
--
-- Score = Regularity (25) + Engagement (30) + Growth (20) + Quality (25)
--
-- Each dimension uses continuous functions (log, sqrt, min/max)
-- instead of step functions, so creators see their score
-- change with every action.

-- ── 1. Expand action_type to cover all trackable actions ──
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
    'question_reply'  -- answered holder question
  ));

-- ── 2. New Activity Score Function (v3) ──
CREATE OR REPLACE FUNCTION update_all_activity_scores()
RETURNS void AS $$
DECLARE
    creator RECORD;
    
    -- Regularity vars
    v_ic_posts_30d        INTEGER;
    v_pub_posts_30d       INTEGER;
    v_replies_30d         INTEGER;
    v_events_30d          INTEGER;
    v_active_days_30d     INTEGER;
    v_regularity          NUMERIC;
    
    -- Engagement vars  
    v_total_holders       INTEGER;
    v_reacting_holders    INTEGER;
    v_replying_holders    INTEGER;
    v_ic_reaction_count   INTEGER;
    v_pub_reaction_count  INTEGER;
    v_engagement          NUMERIC;
    
    -- Growth vars
    v_holders_30d_ago     INTEGER;
    v_new_holders_30d     INTEGER;
    v_lost_holders_30d    INTEGER;
    v_net_growth_rate     NUMERIC;
    v_growth              NUMERIC;
    
    -- Quality vars
    v_avg_reactions_per_post NUMERIC;
    v_reply_rate          NUMERIC;
    v_holder_questions    INTEGER;
    v_answered_questions  INTEGER;
    v_quality             NUMERIC;
    
    -- Final
    v_total               INTEGER;
    v_status              TEXT;
BEGIN
    FOR creator IN SELECT mint_address, wallet_address FROM creator_tokens LOOP

        -- ══════════════════════════════════════
        -- DIMENSION 1: REGULARITY (25 pts max)
        -- How consistently does the creator post?
        -- Uses log curve: posts have diminishing returns
        -- ══════════════════════════════════════
        
        -- Inner circle posts in last 30 days
        SELECT COUNT(*) INTO v_ic_posts_30d
        FROM inner_circle_posts
        WHERE creator_mint = creator.mint_address
        AND created_at >= now() - INTERVAL '30 days';
        
        -- Public posts in last 30 days
        SELECT COUNT(*) INTO v_pub_posts_30d
        FROM public_posts
        WHERE creator_mint = creator.mint_address
        AND created_at >= now() - INTERVAL '30 days';
        
        -- Creator replies to holders in last 30 days
        SELECT COUNT(*) INTO v_replies_30d
        FROM creator_activity
        WHERE creator_mint = creator.mint_address
        AND action_type IN ('reply', 'question_reply')
        AND created_at >= now() - INTERVAL '30 days';
        
        -- Events/polls in last 30 days
        SELECT COUNT(*) INTO v_events_30d
        FROM creator_activity
        WHERE creator_mint = creator.mint_address
        AND action_type IN ('event', 'poll')
        AND created_at >= now() - INTERVAL '30 days';
        
        -- Distinct active days (any activity) in last 30 days
        SELECT COUNT(DISTINCT DATE(created_at)) INTO v_active_days_30d
        FROM creator_activity
        WHERE creator_mint = creator.mint_address
        AND created_at >= now() - INTERVAL '30 days';
        
        -- Also count post days (inner circle posts aren't in creator_activity)
        v_active_days_30d := v_active_days_30d + COALESCE((
            SELECT COUNT(DISTINCT DATE(created_at))
            FROM inner_circle_posts
            WHERE creator_mint = creator.mint_address
            AND created_at >= now() - INTERVAL '30 days'
            AND DATE(created_at) NOT IN (
                SELECT DISTINCT DATE(created_at)
                FROM creator_activity
                WHERE creator_mint = creator.mint_address
                AND created_at >= now() - INTERVAL '30 days'
            )
        ), 0);
        
        -- Score: log curve for posts + linear for consistency
        -- ln(1 + total_posts) * 4 → caps around 12 pts for 20+ posts
        -- (active_days / 30) * 13 → perfect consistency = 13 pts
        v_regularity := LEAST(25,
            LN(1 + v_ic_posts_30d + v_pub_posts_30d + v_events_30d) * 4
            + (LEAST(v_active_days_30d, 30)::NUMERIC / 30.0) * 13
        );

        -- ══════════════════════════════════════
        -- DIMENSION 2: ENGAGEMENT (30 pts max)
        -- Are holders actively interacting?
        -- ══════════════════════════════════════
        
        -- Total holders with balance > 0
        SELECT COUNT(*) INTO v_total_holders
        FROM token_holders
        WHERE mint_address = creator.mint_address AND balance > 0;
        
        -- Unique holders who reacted to inner circle posts (last 30d)
        SELECT COUNT(DISTINCT r.wallet_address) INTO v_reacting_holders
        FROM inner_circle_reactions r
        JOIN inner_circle_posts p ON p.id = r.post_id
        WHERE p.creator_mint = creator.mint_address
        AND r.created_at >= now() - INTERVAL '30 days';
        
        -- Unique holders who replied (last 30d)
        SELECT COUNT(DISTINCT rp.wallet_address) INTO v_replying_holders
        FROM inner_circle_replies rp
        JOIN inner_circle_posts p ON p.id = rp.post_id
        WHERE p.creator_mint = creator.mint_address
        AND rp.created_at >= now() - INTERVAL '30 days';
        
        -- Total reactions on inner circle posts (last 30d)
        SELECT COUNT(*) INTO v_ic_reaction_count
        FROM inner_circle_reactions r
        JOIN inner_circle_posts p ON p.id = r.post_id
        WHERE p.creator_mint = creator.mint_address
        AND r.created_at >= now() - INTERVAL '30 days';
        
        -- Total reactions on public posts (last 30d)
        SELECT COUNT(*) INTO v_pub_reaction_count
        FROM public_post_reactions pr
        JOIN public_posts pp ON pp.id = pr.post_id
        WHERE pp.creator_mint = creator.mint_address
        AND pr.created_at >= now() - INTERVAL '30 days';
        
        IF v_total_holders > 0 THEN
            -- Engagement rate = unique engaged holders / total holders
            -- sqrt curve: rewards first engagements more than later ones
            -- Capped at 100%
            v_engagement := LEAST(30,
                -- Holder participation rate (20 pts max)
                SQRT(LEAST(
                    (v_reacting_holders + v_replying_holders)::NUMERIC / v_total_holders::NUMERIC,
                    1.0
                )) * 20
                -- Reaction volume bonus (10 pts max)
                + LEAST(10,
                    LN(1 + v_ic_reaction_count + v_pub_reaction_count) * 2.5
                )
            );
        ELSE
            -- No holders yet: give partial credit for public engagement
            v_engagement := LEAST(10,
                LN(1 + v_pub_reaction_count) * 3
            );
        END IF;

        -- ══════════════════════════════════════
        -- DIMENSION 3: GROWTH (20 pts max)
        -- Is the holder base growing or shrinking?
        -- ══════════════════════════════════════
        
        -- New holders in last 30 days
        SELECT COUNT(*) INTO v_new_holders_30d
        FROM token_holders
        WHERE mint_address = creator.mint_address
        AND first_bought_at >= now() - INTERVAL '30 days'
        AND balance > 0;
        
        -- Lost holders (sold everything) in last 30 days
        SELECT COUNT(*) INTO v_lost_holders_30d
        FROM token_holders
        WHERE mint_address = creator.mint_address
        AND updated_at >= now() - INTERVAL '30 days'
        AND balance = 0;
        
        -- Holders 30 days ago (approximation)
        v_holders_30d_ago := GREATEST(1, v_total_holders - v_new_holders_30d + v_lost_holders_30d);
        
        -- Net growth rate as percentage
        v_net_growth_rate := ((v_total_holders - v_holders_30d_ago)::NUMERIC / v_holders_30d_ago::NUMERIC) * 100;
        
        -- Score: sigmoid-like mapping
        -- +20% growth → 20 pts, 0% → 10 pts, -20% → 0 pts
        v_growth := LEAST(20, GREATEST(0,
            10 + v_net_growth_rate * 0.5
        ));

        -- ══════════════════════════════════════
        -- DIMENSION 4: QUALITY (25 pts max)
        -- How good is the content? (proxy: reactions per post)
        -- Does the creator respond to community?
        -- ══════════════════════════════════════
        
        -- Average reactions per post (last 30 days)
        IF (v_ic_posts_30d + v_pub_posts_30d) > 0 THEN
            v_avg_reactions_per_post := (v_ic_reaction_count + v_pub_reaction_count)::NUMERIC 
                / (v_ic_posts_30d + v_pub_posts_30d)::NUMERIC;
        ELSE
            v_avg_reactions_per_post := 0;
        END IF;
        
        -- Creator reply rate (does the creator reply to their posts' comments?)
        SELECT COUNT(*) INTO v_holder_questions
        FROM inner_circle_replies rp
        JOIN inner_circle_posts p ON p.id = rp.post_id
        WHERE p.creator_mint = creator.mint_address
        AND rp.wallet_address != creator.wallet_address
        AND rp.created_at >= now() - INTERVAL '30 days';
        
        SELECT COUNT(*) INTO v_answered_questions
        FROM inner_circle_replies rp
        JOIN inner_circle_posts p ON p.id = rp.post_id
        WHERE p.creator_mint = creator.mint_address
        AND rp.wallet_address = creator.wallet_address
        AND rp.created_at >= now() - INTERVAL '30 days';
        
        IF v_holder_questions > 0 THEN
            v_reply_rate := LEAST(1.0, v_answered_questions::NUMERIC / v_holder_questions::NUMERIC);
        ELSE
            v_reply_rate := 0;
        END IF;
        
        -- Score: quality of content + responsiveness
        v_quality := LEAST(25,
            -- Content quality: avg reactions per post (15 pts max)
            LEAST(15, LN(1 + v_avg_reactions_per_post) * 6)
            -- Responsiveness: creator reply rate (10 pts max)
            + v_reply_rate * 10
        );

        -- ══════════════════════════════════════
        -- FINAL SCORE
        -- ══════════════════════════════════════
        v_total := LEAST(100, GREATEST(0, 
            ROUND(v_regularity + v_engagement + v_growth + v_quality)
        ))::INTEGER;

        -- Status thresholds
        v_status := CASE
            WHEN v_total >= 70 THEN 'active'
            WHEN v_total >= 40 THEN 'low_activity'
            WHEN v_total >= 1  THEN 'inactive'
            ELSE 'dormant'
        END;

        -- Update last_active_at
        UPDATE creator_tokens SET
            regularity_score = ROUND(v_regularity)::INTEGER,
            engagement_score = ROUND(v_engagement)::INTEGER,
            retention_score  = ROUND(v_growth + v_quality)::INTEGER,
            activity_score   = v_total,
            activity_status  = v_status,
            last_active_at   = CASE 
                WHEN v_active_days_30d > 0 THEN now()
                ELSE last_active_at
            END,
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

-- ── 3. Run more frequently: every hour instead of once/day ──
SELECT cron.unschedule('update_activity_scores');

SELECT cron.schedule(
    'update_activity_scores',
    '0 * * * *',
    $$ SELECT update_all_activity_scores(); $$
);

-- ── 4. Run it NOW to fix the 0 scores ──
SELECT update_all_activity_scores();
