-- =============================================================================
-- 017_bevcan_rules_reseed.sql
-- Re-seeds BevCan 1.0 plant and rules using BC-001...BC-020 IDs.
-- Safe to run on any DB state:
--   - If plant/rules already exist: ON CONFLICT DO NOTHING skips them.
--   - If migration 013 rolled back (PK conflict): inserts everything fresh.
--   - Cleans up any old R-NNN rules accidentally associated with the BevCan plant.
-- =============================================================================

-- ── Ensure org exists ─────────────────────────────────────────────────────────
INSERT INTO organisations (id, name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MD1 Public')
ON CONFLICT (id) DO NOTHING;

-- ── Ensure BevCan plant exists ────────────────────────────────────────────────
INSERT INTO plants (id, org_id, name, process_areas, industry, invite_code)
VALUES (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'BevCan 1.0 — Public Knowledge Bank',
  ARRAY['Cupping','Body Maker','Washer','Coater/Oven','Printer/Decorator','Necker/Flanger','Palletizer','Quality Lab'],
  'Beverage Can Manufacturing',
  'BEVCAN10'
)
ON CONFLICT (id) DO NOTHING;

-- ── Remove any old R-NNN rules for the BevCan plant (from a partial failed run) ─
DELETE FROM rules
WHERE plant_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  AND id ~ '^R-\d+$';

-- ── Seed the 20 reference rules ───────────────────────────────────────────────
INSERT INTO rules (id, plant_id, title, category, process_area, scope, rationale, status, confidence, created_by, created_at, updated_at)
VALUES

('BC-001', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Hold blank diameter tolerance within ±0.002 inch',
 'Material', 'Cupping',
 'All blank sizes; applies at blanking press exit',
 'Oversized blanks cause draw wrinkling; undersized blanks increase ear height and can weight.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-002', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Ensure even lubricant coverage across the full blank face',
 'Material', 'Cupping',
 'All alloy tempers; especially critical in high-speed operations above 300 spm',
 'Dry spots cause galling on the draw punch and shorten tooling life significantly.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-003', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Check redraw punch alignment every 4 hours during production',
 'Equipment', 'Body Maker',
 'All body maker lines; mandatory after any tooling intervention',
 'Misalignment causes eccentric ears and chime splits that propagate into necker rejects.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-004', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Verify dome depth after every tooling change',
 'Measurement', 'Body Maker',
 'Applies to all carbonated beverage cans; critical for pressurised filling',
 'Shallow domes reverse under internal carbonation pressure, causing catastrophic can failure at the filler.',
 'Reference', 'Very High', 'MD1 Team', now(), now()),

('BC-005', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Measure ironing ring clearance at the start of every shift',
 'Equipment', 'Body Maker',
 'Applies to all ring sets; accelerates in hot, high-speed conditions',
 'Ring wear causes thick walls and short cans — subtle drift that accumulates undetected until batch rejection.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-006', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Investigate knockout load spikes immediately — do not run to next shift',
 'Process', 'Body Maker',
 'Applies whenever KO load exceeds ±15% of baseline',
 'Spikes indicate ironing ring or punch galling in progress. Running on causes catastrophic tooling seizure.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-007', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Reject cans with trim height variation above ±0.015 inch',
 'Measurement', 'Body Maker',
 'Checked at trim die exit; applies to all can heights',
 'Excessive variation leads to necker flange rejects downstream and seamer mis-feed at the filler.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-008', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Hold final rinse water pH between 5.8 and 6.2',
 'Measurement', 'Washer',
 'Final rinse stage only; target 6.0; check with calibrated probe every 2 hours',
 'Alkaline rinse (pH above 6.5) causes blistering under inside spray; acid rinse etches the surface and reduces adhesion.',
 'Reference', 'Very High', 'MD1 Team', now(), now()),

('BC-009', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Do not allow can surface temperature to exceed 65°C at washer exit',
 'Measurement', 'Washer',
 'Measured with contact thermometer or IR gun at conveyor exit; worst case in summer',
 'Hot cans absorb inside spray unevenly — heavy in pools, thin at the top — leading to ERV failures.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-010', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Treat ERV above 20 mA as a pack-hold trigger — not a warning',
 'Measurement', 'Coater/Oven',
 'Applies to all food-contact cans; measured per NACE TM0186; target ≤5 mA',
 'Values above 20 mA indicate bare metal exposure. Cans with this ERV level are a corrosion and product contamination risk.',
 'Reference', 'Very High', 'MD1 Team', now(), now()),

('BC-011', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Calibrate oven temperature profiles monthly, not only on failure',
 'Equipment', 'Coater/Oven',
 'Applies to all zone thermocouples; mandatory before seasonal temperature swings',
 'Thermocouple drift causes systematic under-cure. Inside spray may test fine at the oven but fail ERV within 48 hours of cure.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-012', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Verify inside spray weight before oven entry — not after',
 'Process', 'Coater/Oven',
 'Weight verification window is at spray applicator exit; use wet weight sampling',
 'Post-oven adjustments require a full cure cycle reset. Detecting off-weight early saves a full oven queue of cans.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-013', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Set blanket-to-plate pressure to ink minimum for each colour station',
 'Equipment', 'Printer/Decorator',
 'Applies at decorator set-up and after any plate change; confirmed with densitometer',
 'Over-impression causes dot gain and colour shift that cannot be corrected at varnish. Customer colour approval is voided.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-014', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Inspect first 50 cans after a web break for registration accuracy',
 'Process', 'Printer/Decorator',
 'Applies after any unplanned line stop that resets the registration servo',
 'Post-restart cans can carry mis-registration that is invisible at line speed but visible on shelf.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-015', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Sort by wall thickness when diagnosing intermittent necking wrinkles',
 'Process', 'Necker/Flanger',
 'Applies when wrinkle rate is below 1% and no tooling fault is found',
 'Necking wrinkles appear first on the lightest-wall cans. Intermittent incidents are often a body-maker wall distribution problem, not a necker problem.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-016', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Hold flange width within ±0.005 inch of nominal',
 'Measurement', 'Necker/Flanger',
 'Measured at flanger exit with go/no-go gauge; sample 20 per hour',
 'Narrow flanges cause seam leakers at the filler seamer. Wide flanges cause cover overhang. Both are customer-visible defects.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-017', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Apply minimal lubrication to neck dies — excess migrates downstream',
 'Process', 'Necker/Flanger',
 'Applies to all die configurations; especially critical on high-speed servo neckers',
 'Excess lubricant on the neck transfers into the seaming chuck area and contaminates sealing compound, causing seam leakers.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-018', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Measure dome reversal pressure on-line at least once per shift',
 'Measurement', 'Quality Lab',
 'Lab sample alone is insufficient — line variation can exceed lab sample interval',
 'Lab samples represent a snapshot. Line pressurisation anomalies in a single body-maker station are invisible in pooled lab data.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-019', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Investigate both enamel cure and inside spray viscosity when tear-offs appear',
 'Process', 'Quality Lab',
 'Applies whenever tear-off rate exceeds 0.5% in any inspection window',
 'Tear-offs have two independent root causes — insufficient cure and excessive spray viscosity — that present identically. Fixing one without checking the other leads to recurrence.',
 'Reference', 'High', 'MD1 Team', now(), now()),

('BC-020', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
 'Attribute clustered ERV failures to spray atomisation before blaming enamel quality',
 'Process', 'Quality Lab',
 'Applies when multiple consecutive cans fail ERV with no spray weight deviation',
 'A single atomisation fault produces a cluster of high-ERV cans with normal spray weight. Raw enamel quality problems typically manifest as a gradual drift, not a sudden cluster.',
 'Reference', 'High', 'MD1 Team', now(), now())

ON CONFLICT (id) DO NOTHING;

-- ── Ensure mw@korfsteel.com has admin membership ──────────────────────────────
INSERT INTO plant_memberships (user_id, plant_id, role)
SELECT u.id, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin'
FROM auth.users u
WHERE u.email = 'mw@korfsteel.com'
ON CONFLICT (user_id, plant_id) DO NOTHING;
