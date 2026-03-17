-- =============================================================================
-- 011_plant_industry.sql
-- Add industry column to plants table.
-- =============================================================================

ALTER TABLE plants ADD COLUMN IF NOT EXISTS industry text;
