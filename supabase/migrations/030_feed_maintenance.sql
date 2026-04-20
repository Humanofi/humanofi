-- ========================================
-- Humanofi — Feed Events Maintenance
-- ========================================
-- 1. TTL cleanup for old feed_events (keep 30 days, preserve milestones/new_creator)
-- 2. Replace dead 'price_move' with useful 'holder_exit' event type
-- 3. Add index for TTL cleanup performance

-- ═══════════════════════════════════
-- 1. TTL CLEANUP FUNCTION
-- ═══════════════════════════════════
-- Purges feed_events older than 30 days, except historical milestones and new_creator events
-- Schedule via pg_cron: SELECT cron.schedule('feed-cleanup', '0 3 * * *', 'SELECT cleanup_old_feed_events()');

CREATE OR REPLACE FUNCTION cleanup_old_feed_events()
RETURNS void AS $$
BEGIN
    DELETE FROM feed_events
    WHERE created_at < now() - interval '30 days'
      AND event_type NOT IN ('milestone', 'new_creator');
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════
-- 2. UPDATE CHECK CONSTRAINT
-- ═══════════════════════════════════
-- Remove dead 'price_move' (never emitted), add 'holder_exit' (90%+ sold = exit signal)

-- Drop the old constraint
ALTER TABLE feed_events DROP CONSTRAINT IF EXISTS feed_events_event_type_check;

-- Add updated constraint with holder_exit
ALTER TABLE feed_events ADD CONSTRAINT feed_events_event_type_check
    CHECK (event_type IN (
        'trade', 'new_holder', 'milestone', 'whale_alert', 'new_creator', 'holder_exit'
    ));


-- ═══════════════════════════════════
-- DONE
-- ═══════════════════════════════════
-- - cleanup_old_feed_events() function ready for pg_cron
-- - 'price_move' removed, 'holder_exit' added to allowed event types
