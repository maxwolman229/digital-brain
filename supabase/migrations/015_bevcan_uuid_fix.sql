-- =============================================================================
-- 015_bevcan_uuid_fix.sql
-- Migrates BevCan plant from cccccccc UUID to dddddddd UUID if old UUID exists.
-- Also ensures dddddddd plant exists for fresh installs where 013 was already
-- applied with the old UUID.
-- =============================================================================

-- ── Ensure org exists ─────────────────────────────────────────────────────────
INSERT INTO organisations (id, name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MD1 Public')
ON CONFLICT (id) DO NOTHING;

-- ── Ensure dddddddd plant exists ──────────────────────────────────────────────
-- If cccccccc exists, clone it. Otherwise create fresh.
INSERT INTO plants (id, org_id, name, process_areas, industry, invite_code)
SELECT
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  COALESCE(
    (SELECT org_id FROM plants WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  COALESCE(
    (SELECT name FROM plants WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    'BevCan 1.0 — Public Knowledge Bank'
  ),
  COALESCE(
    (SELECT process_areas FROM plants WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    ARRAY['Cupping','Body Maker','Washer','Coater/Oven','Printer/Decorator','Necker/Flanger','Palletizer','Quality Lab']
  ),
  COALESCE(
    (SELECT industry FROM plants WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    'Beverage Can Manufacturing'
  ),
  COALESCE(
    (SELECT invite_code FROM plants WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
    'BEVCAN10'
  )
ON CONFLICT (id) DO NOTHING;

-- ── Migrate all FK references from cccccccc → dddddddd ────────────────────────
UPDATE rules
SET plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
WHERE plant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

UPDATE assertions
SET plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
WHERE plant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

UPDATE events
SET plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
WHERE plant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

UPDATE questions
SET plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
WHERE plant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

UPDATE plant_memberships
SET plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
WHERE plant_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- ── Remove old cccccccc plant (all FKs migrated above) ────────────────────────
DELETE FROM plants WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- ── Ensure mw@korfsteel.com has admin membership to dddddddd ──────────────────
INSERT INTO plant_memberships (user_id, plant_id, role)
SELECT
  u.id,
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'admin'
FROM auth.users u
WHERE u.email = 'mw@korfsteel.com'
  AND EXISTS (SELECT 1 FROM plants WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd')
ON CONFLICT (user_id, plant_id) DO NOTHING;
