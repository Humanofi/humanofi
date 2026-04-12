-- ========================================
-- Humanofi — Migration 015: Align Category Constraint with Frontend
-- ========================================
-- The create form has 23 categories but the DB CHECK only allows 13.
-- This migration drops and replaces the constraint to match.

ALTER TABLE creator_tokens DROP CONSTRAINT IF EXISTS creator_tokens_category_check;

ALTER TABLE creator_tokens ADD CONSTRAINT creator_tokens_category_check
  CHECK (category IN (
    'trader', 'entrepreneur', 'investor', 'artist',
    'researcher', 'creator', 'thinker', 'other',
    'founder', 'dev', 'developer', 'musician', 'designer', 'activist',
    'athlete', 'influencer', 'writer', 'filmmaker', 'photographer',
    'educator', 'chef', 'streamer', 'engineer', 'scientist', 'journalist'
  ));
