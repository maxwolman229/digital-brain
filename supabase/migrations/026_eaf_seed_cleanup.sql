-- =============================================================================
-- 026_eaf_seed_cleanup.sql
-- Cleans up weak EAF seed data and adds stronger steel-specific content.
-- Target plant: bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb (MD1 EAF Plant)
--
-- Deletions (6 items):
--   - R-EAF-024: Literal "Test Rule" with empty scope/rationale
--   - R-EAF-025/026/027: Weak captured-via-interview rules in "general operations"
--   - A-EAF-012/013: Weak captured assertions in "general operations"
--
-- Additions (6 rules + 3 assertions):
--   - Fills Rolling Mill and Quality Lab coverage with specific thresholds
--
-- Applied via REST API on 2026-04-13. This file is the audit trail.
-- =============================================================================

-- ── 1. Delete weak items ────────────────────────────────────────────────────

DELETE FROM rules WHERE id IN ('R-EAF-024', 'R-EAF-025', 'R-EAF-026', 'R-EAF-027');
DELETE FROM assertions WHERE id IN ('A-EAF-012', 'A-EAF-013');

-- Also purge any links, comments, verifications, embeddings on those items
-- (CASCADE doesn't apply because links.target_id is text)
DELETE FROM links       WHERE (source_type='rule'      AND source_id IN ('R-EAF-024','R-EAF-025','R-EAF-026','R-EAF-027'))
                           OR (target_type='rule'      AND target_id IN ('R-EAF-024','R-EAF-025','R-EAF-026','R-EAF-027'))
                           OR (source_type='assertion' AND source_id IN ('A-EAF-012','A-EAF-013'))
                           OR (target_type='assertion' AND target_id IN ('A-EAF-012','A-EAF-013'));
DELETE FROM comments    WHERE (target_type='rule'      AND target_id IN ('R-EAF-024','R-EAF-025','R-EAF-026','R-EAF-027'))
                           OR (target_type='assertion' AND target_id IN ('A-EAF-012','A-EAF-013'));
DELETE FROM verifications WHERE (target_type='rule'    AND target_id IN ('R-EAF-024','R-EAF-025','R-EAF-026','R-EAF-027'))
                           OR (target_type='assertion' AND target_id IN ('A-EAF-012','A-EAF-013'));
DELETE FROM embeddings  WHERE (target_type='rule'      AND target_id IN ('R-EAF-024','R-EAF-025','R-EAF-026','R-EAF-027'))
                           OR (target_type='assertion' AND target_id IN ('A-EAF-012','A-EAF-013'));

-- ── 2. Insert new rules ─────────────────────────────────────────────────────

INSERT INTO rules (id, plant_id, display_id, title, category, process_area, scope, rationale, status, confidence, created_by, created_at, updated_at) VALUES

-- ── Rolling Mill ──────────────────────────────────────────────────────────────

('R-EAF-028', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'R-EAF-028',
 'Reheat slabs to 1230-1260°C before entry to roughing stand',
 'Process', 'Rolling',
 'Structural and commercial grades; tolerance ±15°C across slab',
 'Below 1230°C the slab is too stiff, causing mill motor overload and edge cracks. Above 1260°C scale formation and grain growth degrade surface quality.',
 'Established', 'High', 'MD1 Team', now(), now()),

('R-EAF-029', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'R-EAF-029',
 'Hold F1 finishing mill entry temperature at 1050-1080°C',
 'Process', 'Rolling',
 'Hot strip mill; all coil grades; measured via pyrometer at stand entry',
 'F1 entry temperature controls final microstructure. Outside this band, yield strength variation exceeds 25 MPa across the coil length — automatic rejection on structural orders.',
 'Established', 'High', 'MD1 Team', now(), now()),

('R-EAF-030', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'R-EAF-030',
 'Keep work roll differential cooling within 5°C across the barrel',
 'Equipment', 'Rolling',
 'All finishing stands; measured by thermal imaging pyrometer arrays',
 'Uneven roll cooling causes thermal crown variation and strip wedge. 5°C differential produces noticeable off-centre thickness that fails flatness inspection.',
 'Active', 'High', 'MD1 Team', now(), now()),

('R-EAF-031', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'R-EAF-031',
 'Set coiler tension at 15% of strip yield strength for gauges below 3 mm',
 'Process', 'Rolling',
 'Hot strip mill; thin gauge coiling on downcoilers 1 and 2',
 'Below 15% causes telescoping. Above 20% yields coil flatness defects and edge waves. 15% is the stable setpoint for thin gauge.',
 'Active', 'Medium', 'MD1 Team', now(), now()),

-- ── Quality Lab ───────────────────────────────────────────────────────────────

('R-EAF-032', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'R-EAF-032',
 'Target inclusion cleanliness Ki below 2.5 for structural grades',
 'Measurement', 'Quality Lab',
 'S355, A572, and all Ca-treated structural grades; SEM inclusion scan',
 'Ki above 2.5 correlates with surface defects in downstream rolling and cold-forming failures at the customer. 2.5 is the agreed internal spec on structurals.',
 'Established', 'High', 'MD1 Team', now(), now()),

('R-EAF-033', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'R-EAF-033',
 'Dry pin samples 10 minutes at 105°C before spectrometer analysis',
 'Measurement', 'Quality Lab',
 'All chemistry samples; applies before OES analysis',
 'Residual moisture on the sample surface causes erroneous low readings for C and S by up to 15%. 10 min at 105°C fully drives off moisture without oxidizing the surface.',
 'Active', 'High', 'MD1 Team', now(), now())

ON CONFLICT (id) DO NOTHING;

-- ── 3. Insert new assertions ────────────────────────────────────────────────

INSERT INTO assertions (id, plant_id, display_id, title, category, process_area, scope, status, confidence, created_by, created_at, updated_at) VALUES

('A-EAF-014', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'A-EAF-014',
 'Slab corner cracks are 3× more common when reheat furnace discharge temperature exceeds 1265°C',
 'Process', 'Rolling',
 'Observed in QA reject data over the past 18 months; holds across structural grades',
 'Active', 'High', 'MD1 Team', now(), now()),

('A-EAF-015', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'A-EAF-015',
 'Finishing mill motor torque spikes 8-12% on grades with residual copper above 0.3%',
 'Process', 'Rolling',
 'Reproducible across multiple campaigns; copper hardens the austenite at rolling temperatures',
 'Active', 'Medium', 'MD1 Team', now(), now()),

('A-EAF-016', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'A-EAF-016',
 'Coil flatness degrades rapidly when descaler header pressure drops below 180 bar',
 'Equipment', 'Rolling',
 'Incomplete descaling leaves scale pockets that roll into surface defects and wedge',
 'Established', 'High', 'MD1 Team', now(), now())

ON CONFLICT (id) DO NOTHING;
