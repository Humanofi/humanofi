-- ========================================
-- Humanofi — Activity Score v4 (Platform-Grade)
-- ========================================
--
-- 5 dimensions + penalties, continuous math, time decay, engagement depth.
-- Score starts at 50 (neutral), goes up/down based on real metrics.
--
-- Score = Baseline(50) + Regularity(+15) + Engagement(+20) + Momentum(+10/-10) + Quality(+15) - Penalties(-10)
--         = [0, 100]

-- ══════════════════════════════════════════
-- 1. EXPAND ACTION TYPES
-- ══════════════════════════════════════════

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

-- ══════════════════════════════════════════
-- 2. ADD STREAK TRACKING COLUMN
-- ══════════════════════════════════════════

ALTER TABLE creator_tokens 
  ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;

-- ══════════════════════════════════════════
-- 3. ACTIVITY SCORE v4 FUNCTION
-- ══════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_all_activity_scores()
RETURNS void AS $$
DECLARE
    creator RECORD;
    
    -- ── Regularity ──
    v_weighted_posts      NUMERIC;
    v_active_days         INTEGER;
    v_streak              INTEGER;
    v_events              INTEGER;
    v_regularity          NUMERIC;
    
    -- ── Engagement Depth ──
    v_total_holders       INTEGER;
    v_unique_engaged      INTEGER;
    v_weighted_engagement NUMERIC;
    v_total_interactions  INTEGER;
    v_this_week_eng       NUMERIC;
    v_prev_week_eng       NUMERIC;
    v_pub_reactions       INTEGER;
    v_engagement          NUMERIC;
    
    -- ── Momentum & Trust ──
    v_new_holders         INTEGER;
    v_lost_holders        INTEGER;
    v_holders_30d_ago     INTEGER;
    v_still_holding       INTEGER;
    v_avg_hold_days       NUMERIC;
    v_sell_pressure_7d    NUMERIC;
    v_total_reserve       NUMERIC;
    v_sold_7d             NUMERIC;
    v_momentum            NUMERIC;
    
    -- ── Quality & Retention ──
    v_weighted_rpp        NUMERIC;
    v_post_count          INTEGER;
    v_holder_comments     INTEGER;
    v_creator_replies     INTEGER;
    v_questions_asked     INTEGER;
    v_questions_answered  INTEGER;
    v_returning_engagers  INTEGER;
    v_quality             NUMERIC;
    
    -- ── Penalties ──
    v_days_since_post     INTEGER;
    v_reactions_21d       INTEGER;
    v_penalties           NUMERIC;
    
    -- ── Final ──
    v_total               INTEGER;
    v_status              TEXT;
    
    -- ── Temp for daily cap ──
    v_day_record          RECORD;
    v_daily_capped_posts  NUMERIC;
    
BEGIN
    FOR creator IN SELECT mint_address, wallet_address, current_streak FROM creator_tokens LOOP

        -- ══════════════════════════════════════
        -- DIMENSION 1: REGULARITY (+15 max)
        -- Posts with time decay, daily quota, streak
        -- ══════════════════════════════════════
        
        -- Weighted posts with daily cap of 2 and time decay
        -- We count EXISTING posts (not activity log) to prevent delete/repost gaming
        v_daily_capped_posts := 0;
        
        FOR v_day_record IN
            SELECT 
                DATE(created_at) AS post_date,
                LEAST(COUNT(*), 2) AS capped_count,  -- max 2 per day
                EXTRACT(EPOCH FROM (now() - DATE(created_at)::timestamp)) / 86400.0 AS age_days
            FROM (
                -- Inner circle posts (existing, not deleted)
                SELECT created_at FROM inner_circle_posts
                WHERE creator_mint = creator.mint_address
                AND created_at >= now() - INTERVAL '30 days'
                UNION ALL
                -- Public posts (existing, not deleted)
                SELECT created_at FROM public_posts
                WHERE creator_mint = creator.mint_address
                AND created_at >= now() - INTERVAL '30 days'
            ) all_posts
            GROUP BY DATE(created_at)
        LOOP
            -- Apply time decay: e^(-0.03 * age_days)
            v_daily_capped_posts := v_daily_capped_posts 
                + v_day_record.capped_count * EXP(-0.03 * v_day_record.age_days);
        END LOOP;
        
        v_weighted_posts := v_daily_capped_posts;
        
        -- Active days (distinct days with any activity)
        SELECT COUNT(DISTINCT activity_date) INTO v_active_days FROM (
            SELECT DATE(created_at) AS activity_date
            FROM inner_circle_posts
            WHERE creator_mint = creator.mint_address
            AND created_at >= now() - INTERVAL '30 days'
            UNION
            SELECT DATE(created_at)
            FROM public_posts
            WHERE creator_mint = creator.mint_address
            AND created_at >= now() - INTERVAL '30 days'
            UNION
            SELECT DATE(created_at)
            FROM creator_activity
            WHERE creator_mint = creator.mint_address
            AND created_at >= now() - INTERVAL '30 days'
        ) days;
        
        -- Calculate streak (consecutive days ending today or yesterday)
        v_streak := 0;
        DECLARE
            v_check_date DATE := CURRENT_DATE;
            v_has_activity BOOLEAN;
        BEGIN
            -- Allow checking from yesterday if no activity today yet
            SELECT EXISTS(
                SELECT 1 FROM (
                    SELECT DATE(created_at) AS d FROM inner_circle_posts WHERE creator_mint = creator.mint_address AND DATE(created_at) = CURRENT_DATE
                    UNION SELECT DATE(created_at) FROM public_posts WHERE creator_mint = creator.mint_address AND DATE(created_at) = CURRENT_DATE
                    UNION SELECT DATE(created_at) FROM creator_activity WHERE creator_mint = creator.mint_address AND DATE(created_at) = CURRENT_DATE
                ) t
            ) INTO v_has_activity;
            
            IF NOT v_has_activity THEN
                v_check_date := CURRENT_DATE - 1;
            END IF;
            
            LOOP
                SELECT EXISTS(
                    SELECT 1 FROM (
                        SELECT DATE(created_at) AS d FROM inner_circle_posts WHERE creator_mint = creator.mint_address AND DATE(created_at) = v_check_date
                        UNION SELECT DATE(created_at) FROM public_posts WHERE creator_mint = creator.mint_address AND DATE(created_at) = v_check_date
                        UNION SELECT DATE(created_at) FROM creator_activity WHERE creator_mint = creator.mint_address AND DATE(created_at) = v_check_date
                    ) t
                ) INTO v_has_activity;
                
                EXIT WHEN NOT v_has_activity;
                v_streak := v_streak + 1;
                v_check_date := v_check_date - 1;
                EXIT WHEN v_streak >= 30; -- safety cap
            END LOOP;
        END;
        
        -- Events/polls in last 30 days
        SELECT COUNT(*) INTO v_events
        FROM creator_activity
        WHERE creator_mint = creator.mint_address
        AND action_type IN ('event', 'poll')
        AND created_at >= now() - INTERVAL '30 days';
        
        -- Regularity score
        v_regularity := LEAST(15,
            LN(1 + v_weighted_posts) * 3.0
            + (LEAST(v_active_days, 30)::NUMERIC / 30.0) * 5
            + LEAST(4, SQRT(v_streak) * 1.5)
            + LEAST(3, v_events * 1.5)
        );

        -- ══════════════════════════════════════
        -- DIMENSION 2: ENGAGEMENT DEPTH (+20 max)
        -- Participation rate + depth weights + velocity
        -- ══════════════════════════════════════
        
        -- Total holders
        SELECT COUNT(*) INTO v_total_holders
        FROM token_holders
        WHERE mint_address = creator.mint_address AND balance > 0;
        
        -- Unique engaged holders (reacted OR replied to IC posts, 30d)
        SELECT COUNT(DISTINCT wallet) INTO v_unique_engaged FROM (
            SELECT r.wallet_address AS wallet
            FROM inner_circle_reactions r
            JOIN inner_circle_posts p ON p.id = r.post_id
            WHERE p.creator_mint = creator.mint_address
            AND r.created_at >= now() - INTERVAL '30 days'
            UNION
            SELECT rp.wallet_address
            FROM inner_circle_replies rp
            JOIN inner_circle_posts p ON p.id = rp.post_id
            WHERE p.creator_mint = creator.mint_address
            AND rp.wallet_address != creator.wallet_address
            AND rp.created_at >= now() - INTERVAL '30 days'
        ) engaged;
        
        -- Weighted engagement with depth weights + time decay
        -- Reaction=1, Reply=3, Question=4, Buy=5
        SELECT 
            COALESCE(SUM(weight * decay), 0),
            COALESCE(COUNT(*), 0)
        INTO v_weighted_engagement, v_total_interactions
        FROM (
            -- Reactions (weight 1.0)
            SELECT 
                1.0 AS weight,
                EXP(-0.03 * EXTRACT(EPOCH FROM (now() - r.created_at)) / 86400.0) AS decay
            FROM inner_circle_reactions r
            JOIN inner_circle_posts p ON p.id = r.post_id
            WHERE p.creator_mint = creator.mint_address
            AND r.created_at >= now() - INTERVAL '30 days'
            UNION ALL
            -- Replies (weight 3.0)
            SELECT 3.0, EXP(-0.03 * EXTRACT(EPOCH FROM (now() - rp.created_at)) / 86400.0)
            FROM inner_circle_replies rp
            JOIN inner_circle_posts p ON p.id = rp.post_id
            WHERE p.creator_mint = creator.mint_address
            AND rp.wallet_address != creator.wallet_address
            AND rp.created_at >= now() - INTERVAL '30 days'
            UNION ALL
            -- New buyers (weight 5.0)
            SELECT 5.0, EXP(-0.03 * EXTRACT(EPOCH FROM (now() - first_bought_at)) / 86400.0)
            FROM token_holders
            WHERE mint_address = creator.mint_address
            AND first_bought_at >= now() - INTERVAL '30 days'
            AND balance > 0
        ) weighted;
        
        -- Engagement velocity: this week vs last week
        SELECT COUNT(*) INTO v_this_week_eng
        FROM (
            SELECT r.id FROM inner_circle_reactions r
            JOIN inner_circle_posts p ON p.id = r.post_id
            WHERE p.creator_mint = creator.mint_address
            AND r.created_at >= now() - INTERVAL '7 days'
            UNION ALL
            SELECT rp.id FROM inner_circle_replies rp
            JOIN inner_circle_posts p ON p.id = rp.post_id
            WHERE p.creator_mint = creator.mint_address
            AND rp.created_at >= now() - INTERVAL '7 days'
        ) tw;
        
        SELECT COUNT(*) INTO v_prev_week_eng
        FROM (
            SELECT r.id FROM inner_circle_reactions r
            JOIN inner_circle_posts p ON p.id = r.post_id
            WHERE p.creator_mint = creator.mint_address
            AND r.created_at >= now() - INTERVAL '14 days'
            AND r.created_at < now() - INTERVAL '7 days'
            UNION ALL
            SELECT rp.id FROM inner_circle_replies rp
            JOIN inner_circle_posts p ON p.id = rp.post_id
            WHERE p.creator_mint = creator.mint_address
            AND rp.created_at >= now() - INTERVAL '14 days'
            AND rp.created_at < now() - INTERVAL '7 days'
        ) pw;
        
        -- Public reactions (for creators without holders)
        SELECT COUNT(*) INTO v_pub_reactions
        FROM public_post_reactions pr
        JOIN public_posts pp ON pp.id = pr.post_id
        WHERE pp.creator_mint = creator.mint_address
        AND pr.created_at >= now() - INTERVAL '30 days';
        
        IF v_total_holders > 0 THEN
            v_engagement := LEAST(20,
                -- Participation rate (10 pts)
                SQRT(LEAST(1.0, v_unique_engaged::NUMERIC / GREATEST(1, v_total_holders)::NUMERIC)) * 10
                -- Depth score (6 pts)
                + LEAST(6, LN(1 + v_weighted_engagement / GREATEST(1, v_total_interactions)) * 3)
                -- Velocity (4 pts, can be negative)
                + CASE 
                    WHEN v_prev_week_eng > 0 THEN
                        4 * TANH((v_this_week_eng::NUMERIC / v_prev_week_eng::NUMERIC) - 1.0)
                    WHEN v_this_week_eng > 0 THEN 2  -- new engagement from zero
                    ELSE 0
                END
            );
        ELSE
            v_engagement := LEAST(5, LN(1 + v_pub_reactions) * 2);
        END IF;

        -- ══════════════════════════════════════
        -- DIMENSION 3: MOMENTUM & TRUST (+10/-10)
        -- Net growth + retention + hold duration + sell pressure
        -- ══════════════════════════════════════
        
        -- New holders (30d)
        SELECT COUNT(*) INTO v_new_holders
        FROM token_holders
        WHERE mint_address = creator.mint_address
        AND first_bought_at >= now() - INTERVAL '30 days'
        AND balance > 0;
        
        -- Lost holders (30d)
        SELECT COUNT(*) INTO v_lost_holders
        FROM token_holders
        WHERE mint_address = creator.mint_address
        AND updated_at >= now() - INTERVAL '30 days'
        AND balance = 0;
        
        -- Holders 30d ago (approximation)
        v_holders_30d_ago := GREATEST(1, v_total_holders - v_new_holders + v_lost_holders);
        
        -- Retention: holders from 30d ago still holding
        SELECT COUNT(*) INTO v_still_holding
        FROM token_holders
        WHERE mint_address = creator.mint_address
        AND first_bought_at < now() - INTERVAL '30 days'
        AND balance > 0;
        
        -- Average hold duration (days)
        SELECT COALESCE(AVG(
            EXTRACT(EPOCH FROM (now() - first_bought_at)) / 86400.0
        ), 0) INTO v_avg_hold_days
        FROM token_holders
        WHERE mint_address = creator.mint_address
        AND balance > 0;
        
        -- Sell pressure (7d) — we approximate via lost holders
        -- In production, this would use on-chain sell volume
        v_sell_pressure_7d := 0;
        IF v_total_holders > 0 THEN
            SELECT COUNT(*) INTO v_sold_7d
            FROM token_holders
            WHERE mint_address = creator.mint_address
            AND updated_at >= now() - INTERVAL '7 days'
            AND balance = 0;
            v_sell_pressure_7d := v_sold_7d::NUMERIC / GREATEST(1, v_total_holders + v_sold_7d)::NUMERIC;
        END IF;
        
        -- Momentum score
        v_momentum := GREATEST(-10, LEAST(10,
            -- Net growth sigmoid (5 pts)
            5 * TANH(
                ((v_total_holders - v_holders_30d_ago)::NUMERIC / v_holders_30d_ago::NUMERIC) * 100 / 20
            )
            -- Retention rate (3 pts)
            + CASE 
                WHEN v_holders_30d_ago > 1 THEN
                    (v_still_holding::NUMERIC / v_holders_30d_ago::NUMERIC) * 3
                ELSE 0
            END
            -- Hold duration (2 pts)
            + LEAST(2, LN(1 + v_avg_hold_days / 7.0) * 1.0)
            -- Sell pressure penalty (-5 max)
            - CASE
                WHEN v_sell_pressure_7d > 0.30 THEN
                    LEAST(5, (v_sell_pressure_7d - 0.30) * 15)
                ELSE 0
            END
        ));

        -- ══════════════════════════════════════
        -- DIMENSION 4: QUALITY & RETENTION (+15 max)
        -- Reactions/post + response time + returning engagers
        -- ══════════════════════════════════════
        
        -- Post count (existing, 30d)
        SELECT COUNT(*) INTO v_post_count FROM (
            SELECT id FROM inner_circle_posts
            WHERE creator_mint = creator.mint_address
            AND created_at >= now() - INTERVAL '30 days'
            UNION ALL
            SELECT id FROM public_posts
            WHERE creator_mint = creator.mint_address
            AND created_at >= now() - INTERVAL '30 days'
        ) posts;
        
        -- Weighted reactions per post
        IF v_post_count > 0 THEN
            v_weighted_rpp := v_weighted_engagement / v_post_count;
        ELSE
            v_weighted_rpp := 0;
        END IF;
        
        -- Holder comments (non-creator replies, 30d)
        SELECT COUNT(*) INTO v_holder_comments
        FROM inner_circle_replies rp
        JOIN inner_circle_posts p ON p.id = rp.post_id
        WHERE p.creator_mint = creator.mint_address
        AND rp.wallet_address != creator.wallet_address
        AND rp.created_at >= now() - INTERVAL '30 days';
        
        -- Creator replies (30d)
        SELECT COUNT(*) INTO v_creator_replies
        FROM inner_circle_replies rp
        JOIN inner_circle_posts p ON p.id = rp.post_id
        WHERE p.creator_mint = creator.mint_address
        AND rp.wallet_address = creator.wallet_address
        AND rp.created_at >= now() - INTERVAL '30 days';
        
        -- Questions asked by holders (30d)
        SELECT COUNT(*) INTO v_questions_asked
        FROM inner_circle_questions q
        JOIN inner_circle_posts p ON p.id = q.post_id
        WHERE p.creator_mint = creator.mint_address
        AND q.created_at >= now() - INTERVAL '30 days';
        
        -- Questions answered by creator (30d)
        SELECT COUNT(*) INTO v_questions_answered
        FROM inner_circle_questions q
        JOIN inner_circle_posts p ON p.id = q.post_id
        WHERE p.creator_mint = creator.mint_address
        AND q.answered_at IS NOT NULL
        AND q.created_at >= now() - INTERVAL '30 days';
        
        -- Returning engagers: holders who reacted on >=2 distinct posts
        SELECT COUNT(*) INTO v_returning_engagers
        FROM (
            SELECT r.wallet_address, COUNT(DISTINCT r.post_id) AS post_count
            FROM inner_circle_reactions r
            JOIN inner_circle_posts p ON p.id = r.post_id
            WHERE p.creator_mint = creator.mint_address
            AND r.created_at >= now() - INTERVAL '30 days'
            GROUP BY r.wallet_address
            HAVING COUNT(DISTINCT r.post_id) >= 2
        ) returning;
        
        -- Quality score
        v_quality := LEAST(15,
            -- Content quality: weighted reactions per post (6 pts)
            LEAST(6, LN(1 + v_weighted_rpp) * 2.5)
            -- Responsiveness: reply ratio (4 pts)
            + CASE
                WHEN v_holder_comments > 0 THEN
                    LEAST(1.0, v_creator_replies::NUMERIC / v_holder_comments::NUMERIC) * 4
                ELSE 0
            END
            -- Q&A rate (2 pts)
            + CASE
                WHEN v_questions_asked > 0 THEN
                    LEAST(1.0, v_questions_answered::NUMERIC / v_questions_asked::NUMERIC) * 2
                ELSE 0
            END
            -- Returning engagement (3 pts)
            + CASE
                WHEN v_total_holders > 0 THEN
                    SQRT(LEAST(1.0, v_returning_engagers::NUMERIC / v_total_holders::NUMERIC)) * 3
                ELSE 0
            END
        );

        -- ══════════════════════════════════════
        -- DIMENSION 5: PENALTIES (-10 max)
        -- Inactivity + sell-off + ghost holders
        -- ══════════════════════════════════════
        
        -- Days since last post (IC or public)
        SELECT COALESCE(
            EXTRACT(EPOCH FROM (now() - MAX(created_at))) / 86400,
            999
        )::INTEGER INTO v_days_since_post
        FROM (
            SELECT created_at FROM inner_circle_posts WHERE creator_mint = creator.mint_address
            UNION ALL
            SELECT created_at FROM public_posts WHERE creator_mint = creator.mint_address
        ) all_posts;
        
        -- Reactions in last 21 days
        SELECT COUNT(*) INTO v_reactions_21d
        FROM inner_circle_reactions r
        JOIN inner_circle_posts p ON p.id = r.post_id
        WHERE p.creator_mint = creator.mint_address
        AND r.created_at >= now() - INTERVAL '21 days';
        
        v_penalties := LEAST(10,
            -- Inactivity penalty
            CASE
                WHEN v_days_since_post > 30 THEN 7
                WHEN v_days_since_post > 14 THEN 3
                ELSE 0
            END
            -- Sell-off penalty
            + CASE
                WHEN v_sell_pressure_7d > 0.40 THEN 5
                ELSE 0
            END
            -- Ghost holder penalty
            + CASE
                WHEN v_total_holders > 5 AND v_reactions_21d = 0 THEN 3
                ELSE 0
            END
        );

        -- ══════════════════════════════════════
        -- FINAL SCORE
        -- Baseline 50 + dimensions - penalties
        -- ══════════════════════════════════════
        
        v_total := LEAST(100, GREATEST(0,
            ROUND(50 + v_regularity + v_engagement + v_momentum + v_quality - v_penalties)
        ))::INTEGER;

        -- Status
        v_status := CASE
            WHEN v_total >= 85 THEN 'thriving'
            WHEN v_total >= 65 THEN 'active'
            WHEN v_total >= 45 THEN 'moderate'
            WHEN v_total >= 25 THEN 'low_activity'
            ELSE 'dormant'
        END;

        -- Update
        UPDATE creator_tokens SET
            regularity_score  = ROUND(v_regularity)::INTEGER,
            engagement_score  = ROUND(GREATEST(0, v_engagement))::INTEGER,
            retention_score   = ROUND(GREATEST(0, v_momentum + v_quality))::INTEGER,
            activity_score    = v_total,
            activity_status   = v_status,
            current_streak    = v_streak,
            last_active_at    = CASE 
                WHEN v_active_days > 0 THEN now()
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

-- ══════════════════════════════════════════
-- 4. UPDATE ACTIVITY_STATUS CONSTRAINT
-- ══════════════════════════════════════════

ALTER TABLE creator_tokens
  DROP CONSTRAINT IF EXISTS creator_tokens_activity_status_check;

ALTER TABLE creator_tokens
  ADD CONSTRAINT creator_tokens_activity_status_check
  CHECK (activity_status IN ('thriving', 'active', 'moderate', 'low_activity', 'inactive', 'dormant'));

-- ══════════════════════════════════════════
-- 5. SCHEDULE: every hour
-- ══════════════════════════════════════════

SELECT cron.unschedule('update_activity_scores');

SELECT cron.schedule(
    'update_activity_scores',
    '0 * * * *',
    $$ SELECT update_all_activity_scores(); $$
);

-- ══════════════════════════════════════════
-- 6. RUN NOW
-- ══════════════════════════════════════════

SELECT update_all_activity_scores();
