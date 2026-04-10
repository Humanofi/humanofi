-- ========================================================
-- Migration: Add Rich Posts Support
-- ========================================================

-- Extend inner_circle_posts to support events, announcements, polls

-- Add post_type enum if we were restricting it, but TEXT is safer for future evolution.
-- We will use application-level validation for 'text', 'event', 'announcement', 'poll'.

ALTER TABLE inner_circle_posts
ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'text',
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Index on post_type for quick filtering (e.g., getting all upcoming events)
CREATE INDEX IF NOT EXISTS idx_inner_circle_posts_type ON inner_circle_posts(post_type);

-- If we want to safely migrate existing data
UPDATE inner_circle_posts SET post_type = 'text' WHERE post_type IS NULL;
