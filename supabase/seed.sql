-- ============================================================
-- MD1 Knowledge Bank — Demo Seed Data
-- Run as service role (bypasses RLS automatically)
-- ============================================================

BEGIN;

-- ── 1. Organisation + Plant ────────────────────────────────────────────────────

INSERT INTO organisations (id, name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MD1 Steel')
ON CONFLICT (id) DO NOTHING;

INSERT INTO plants (id, org_id, name, process_areas)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'MD1 EAF Plant',
  ARRAY['EAF','Ladle Furnace','Casting','Rolling','Scrap Yard','Quality Lab']
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Rules (22) ─────────────────────────────────────────────────────────────

INSERT INTO rules (id, plant_id, title, category, process_area, scope, rationale, status, confidence, tags, created_by, created_at, updated_at)
VALUES
  ('R-001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Dilute Sims shredded scrap with prime scrap or DRI',
   'Material','EAF',
   'Supplier = Sims Metal Management; Process = EAF',
   'Improves liquid steel quality and reduces downstream risk',
   'Proposed','Medium',
   ARRAY['scrap','sims','eaf','dilution'],
   'Max Wolman','2025-02-10T09:00:00Z','2025-02-10T09:00:00Z'),

  ('R-002','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Plan longer EAF heats for undiluted Sims scrap',
   'Process','EAF',
   'EAF heats dominated by Sims shredded scrap',
   'Additional refining time required to reach acceptable quality',
   'Proposed','Medium',
   ARRAY['scrap','sims','eaf','heat-time'],
   'Max Wolman','2025-02-10T09:15:00Z','2025-02-10T09:15:00Z'),

  ('R-003','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Reduce casting speed 15% when Sims scrap exceeds 50% of charge',
   'Process','Casting',
   'Casting following heats with undiluted shredded scrap',
   'Slower casting reduces cracking risk under marginal conditions',
   'Verified','High',
   ARRAY['casting','speed','defects','cracking'],
   'Max Wolman','2025-02-10T09:30:00Z','2025-02-12T08:00:00Z'),

  ('R-004','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Monitor slag foaming when using high-residual scrap',
   'Process','EAF',
   'EAF heats with high Cu/Sn residual scrap',
   'High residuals affect slag behavior and energy efficiency',
   'Active','High',
   ARRAY['slag','residuals','eaf','foaming'],
   'J. Martinez','2025-01-15T14:00:00Z','2025-01-15T14:00:00Z'),

  ('R-005','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Extend EAF refining by 5-8 min when copper exceeds 0.20%',
   'Equipment','Casting',
   'Continuous casting of peritectic and HSLA grades',
   'Oscillation tuning reduces surface crack formation',
   'Established','High',
   ARRAY['casting','mold','oscillation','cracks'],
   'L. Chen','2024-12-20T10:00:00Z','2024-12-20T10:00:00Z'),

  ('R-006','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Verify ladle refractory life before high-alloy heats',
   'Equipment','Ladle Furnace',
   'Ladle Furnace processing for high-alloy grades',
   'Worn refractories increase steel contamination risk',
   'Active','Medium',
   ARRAY['ladle','refractory','alloy','contamination'],
   'D. Okonkwo','2025-02-01T08:30:00Z','2025-02-01T08:30:00Z'),

  ('R-007','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Confirm chemistry before tapping — never tap on estimated values',
   'Measurement','EAF',
   'All EAF heats, especially HSLA and alloy grades',
   'Tapping on estimated chemistry has led to multiple off-spec heats requiring ladle correction',
   'Active','Verified',
   ARRAY['chemistry','spectrometer','tapping','quality'],
   'R. Patel','2024-11-30T10:00:00Z','2024-11-30T10:00:00Z'),

  ('R-008','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Inspect scrap for moisture and sealed containers before charging',
   'Material','Scrap Yard',
   'All incoming scrap, especially during wet weather or after outdoor storage',
   'Moisture in scrap causes steam explosions in the EAF — safety critical',
   'Active','Verified',
   ARRAY['scrap','safety','moisture','charging','explosion'],
   'HSE Team','2024-06-01T00:00:00Z','2024-06-01T00:00:00Z'),

  ('R-009','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Target 3–5 minutes for ladle arc heating between wire feeds',
   'Process','Ladle Furnace',
   'Ladle Furnace refining for all grades',
   'Ensures thermal homogeneity before alloy additions — prevents cold spots and alloy segregation',
   'Active','High',
   ARRAY['ladle','arc','wire-feed','alloy','temperature'],
   'J. Martinez','2025-01-20T11:00:00Z','2025-01-20T11:00:00Z'),

  ('R-010','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Roll HSLA billets within 4 hours of casting',
   'Process','Rolling',
   'HSLA grades cast from EAF route',
   'Delayed rolling allows hydrogen-induced cracking in sensitive grades',
   'Active','High',
   ARRAY['rolling','hsla','timing','hydrogen','cracking'],
   'L. Chen','2025-01-28T09:00:00Z','2025-01-28T09:00:00Z'),

  ('R-011','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Increase tundish preheat time by 15 min after lining change',
   'Equipment','Casting',
   'First sequence after tundish reline',
   'New linings absorb more heat — insufficient preheat causes temperature drop in first heat',
   'Proposed','Medium',
   ARRAY['tundish','preheat','lining','temperature','casting'],
   'A. Kowalski','2025-02-05T13:00:00Z','2025-02-05T13:00:00Z'),

  ('R-012','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Cap EAF power at 85% during final refining with high-Cu scrap',
   'Process','EAF',
   'EAF heats with Cu content > 0.25%',
   'Full power in final refining with high Cu causes excessive electrode consumption and unstable arc',
   'Proposed','Low',
   ARRAY['eaf','power','copper','electrode','refining'],
   'S. Volkov','2025-02-14T16:00:00Z','2025-02-14T16:00:00Z'),

  ('R-013','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Use argon stirring instead of nitrogen for low-N grades',
   'Process','Ladle Furnace',
   'Grades with N specification < 80ppm',
   'Nitrogen stirring adds 15-25ppm N pickup — pushes low-N grades out of spec',
   'Active','Verified',
   ARRAY['argon','nitrogen','stirring','ladle','chemistry'],
   'J. Martinez','2024-09-15T10:00:00Z','2024-09-15T10:00:00Z'),

  ('R-014','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Delay rolling start if billet surface temp below 1050°C',
   'Process','Rolling',
   'All grades entering the rolling mill',
   'Rolling below 1050°C increases roll force and risk of surface tearing',
   'Verified','High',
   ARRAY['rolling','temperature','surface','tearing'],
   'M. Novak','2024-08-01T07:00:00Z','2024-08-01T07:00:00Z'),

  ('R-015','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Recalibrate spectrometer after every 50 samples or shift change',
   'Measurement','Quality Lab',
   'All spectrometer analysis',
   'Drift accumulates after ~50 samples causing systematic bias in chemistry results',
   'Established','Very High',
   ARRAY['spectrometer','calibration','quality','chemistry','drift'],
   'R. Patel','2024-07-15T12:00:00Z','2024-07-15T12:00:00Z'),

  ('R-016','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Do not exceed 8 heats per tundish sequence on peritectic grades',
   'Equipment','Casting',
   'Continuous casting of peritectic steel grades (0.09–0.17% C)',
   'Tundish wear after 8 heats compromises flow control and nozzle alignment on sensitive grades',
   'Established','High',
   ARRAY['tundish','peritectic','sequence','nozzle','casting'],
   'A. Kowalski','2025-01-10T14:00:00Z','2025-01-10T14:00:00Z'),

  ('R-017','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Pre-heat alloy additions to 200°C minimum before wire feeding',
   'Material','Ladle Furnace',
   'Ladle Furnace alloy additions in winter months',
   'Cold alloy wire causes localized freezing at injection point — suspected link to inclusion clusters',
   'Proposed','Low',
   ARRAY['alloy','wire-feed','temperature','inclusions','ladle'],
   'J. Martinez','2025-02-18T11:00:00Z','2025-02-18T11:00:00Z'),

  ('R-018','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Log all scrap deliveries with supplier certificate within 2 hours of receipt',
   'Measurement','Scrap Yard',
   'All incoming scrap deliveries',
   'Traceability requirement — links charge composition to downstream quality issues',
   'Verified','High',
   ARRAY['scrap','traceability','logging','supplier','certificate'],
   'R. Patel','2024-04-01T08:00:00Z','2024-04-01T08:00:00Z'),

  ('R-019','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Notify shift supervisor before switching scrap supplier mid-campaign',
   'People','EAF',
   'Multi-heat campaigns with consistent grade targets',
   'Supplier switch changes residual profile — may require process adjustments that only supervisor can authorize',
   'Active','Medium',
   ARRAY['scrap','supplier','supervisor','communication','campaign'],
   'D. Okonkwo','2025-02-13T09:00:00Z','2025-02-13T09:00:00Z'),

  ('R-020','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Run SEN alignment check before every new tundish sequence',
   'Equipment','Casting',
   'Submerged entry nozzle (SEN) setup at sequence start',
   'Misaligned SEN causes asymmetric flow in mold leading to shell thinning and breakouts',
   'Proposed','Medium',
   ARRAY['sen','nozzle','alignment','breakout','casting','tundish'],
   'A. Kowalski','2025-02-20T10:00:00Z','2025-02-20T10:00:00Z'),

  ('R-021','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Increase casting speed to standard rate once mold level stabilises',
   'Process','Casting',
   'All grades after mold level stabilisation',
   'Throughput recovery — slower speeds reduce daily tonnage',
   'Active','Medium',
   ARRAY['casting','speed','throughput','mold'],
   'Production Manager','2025-01-05T08:00:00Z','2025-01-05T08:00:00Z'),

  ('R-022','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Use nitrogen stirring gas when argon supply is low',
   'Process','Ladle Furnace',
   'Ladle furnace stirring during argon shortages',
   'Maintain production continuity when argon unavailable',
   'Active','Low',
   ARRAY['nitrogen','argon','stirring','ladle','gas'],
   'T. Williams','2025-02-01T16:00:00Z','2025-02-01T16:00:00Z')

ON CONFLICT (id) DO NOTHING;

-- ── 3. Assertions (10) ────────────────────────────────────────────────────────

INSERT INTO assertions (id, plant_id, title, category, process_area, scope, status, confidence, tags, created_by, created_at, updated_at)
VALUES
  ('A-001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Lower quality shredded scrap requires longer EAF heat times',
   'Process / Material','EAF',
   'EAF heats with Sims scrap',
   'Proposed','Medium',
   ARRAY['scrap','sims','eaf','heat-time'],
   'Max Wolman','2025-02-10T09:00:00Z','2025-02-10T09:00:00Z'),

  ('A-002','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Insufficient dilution increases cracking and casting defect risk',
   'Material / Process','Casting',
   'Casting following heats dominated by Sims shredded scrap',
   'Proposed','High',
   ARRAY['dilution','cracking','casting','defect'],
   'Max Wolman','2025-02-10T09:10:00Z','2025-02-10T09:10:00Z'),

  ('A-003','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Slower casting speeds reduce defect risk under marginal conditions',
   'Process','Casting',
   'Casting under marginal chemistry or cleanliness conditions',
   'Proposed','High',
   ARRAY['casting','speed','defect','quality'],
   'Max Wolman','2025-02-10T09:20:00Z','2025-02-10T09:20:00Z'),

  ('A-004','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'High copper content (>0.25%) destabilizes EAF slag and increases electrode wear',
   'Material','EAF',
   'EAF heats with Cu-rich scrap sources',
   'Proposed','Medium',
   ARRAY['copper','slag','electrode','eaf'],
   'S. Volkov','2025-02-14T16:30:00Z','2025-02-14T16:30:00Z'),

  ('A-005','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Spectrometer drift after 50 samples introduces systematic chemistry bias',
   'Measurement','Quality Lab',
   'All spectrometer readings in Quality Lab',
   'Proposed','Very High',
   ARRAY['spectrometer','calibration','chemistry','drift'],
   'R. Patel','2024-07-15T12:30:00Z','2024-07-15T12:30:00Z'),

  ('A-006','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Ladle thermal homogeneity requires 3–5 min arc time between alloy additions',
   'Process','Ladle Furnace',
   'Ladle furnace refining',
   'Proposed','High',
   ARRAY['ladle','arc','alloy','temperature','homogeneity'],
   'J. Martinez','2025-01-20T11:30:00Z','2025-01-20T11:30:00Z'),

  ('A-007','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Moisture in scrap is the primary cause of EAF charging explosions',
   'Material','Scrap Yard',
   'All scrap charged to EAF',
   'Proposed','Very High',
   ARRAY['moisture','scrap','safety','explosion','eaf'],
   'HSE Team','2024-06-01T00:00:00Z','2024-06-01T00:00:00Z'),

  ('A-008','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'HSLA billets develop hydrogen cracks if held more than 4 hours before rolling',
   'Process','Rolling',
   'HSLA grades between casting and rolling',
   'Proposed','High',
   ARRAY['hsla','hydrogen','cracking','rolling','timing'],
   'L. Chen','2025-01-28T09:30:00Z','2025-01-28T09:30:00Z'),

  ('A-009','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Tundish wear accelerates after 8 heats compromising flow control on sensitive grades',
   'Equipment','Casting',
   'Tundish condition during multi-heat sequences',
   'Proposed','High',
   ARRAY['tundish','wear','nozzle','casting','peritectic'],
   'A. Kowalski','2025-01-10T14:30:00Z','2025-01-10T14:30:00Z'),

  ('A-010','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Nitrogen stirring adds 15-25ppm N pickup per ladle treatment',
   'Process','Ladle Furnace',
   'Ladle furnace stirring gas selection',
   'Proposed','Very High',
   ARRAY['nitrogen','stirring','ladle','chemistry','pickup'],
   'J. Martinez','2024-09-15T10:30:00Z','2024-09-15T10:30:00Z')

ON CONFLICT (id) DO NOTHING;

-- ── 4. Events (8) ─────────────────────────────────────────────────────────────

INSERT INTO events (id, plant_id, title, date, process_area, outcome, impact, status, root_cause, description, resolution, reported_by, tags, created_at)
VALUES
  ('E-001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Surface cracking on HSLA billet — Heat #4782',
   '2025-02-08T06:30:00Z','Casting','Negative','Significant','Closed',
   '{"Material":["Sims shredded scrap — high tramp element content","No prime scrap dilution available"],"Process":["Standard casting speed not reduced for marginal chemistry","EAF heat time not extended"],"Equipment":["Mold oscillation set for standard grades, not adjusted for crack sensitivity"],"People":["Night shift crew unfamiliar with HSLA casting adjustments"],"Measurement":["Spectrometer reading delayed — chemistry confirmed late"],"Environment":["Cold ambient temperature — mold cooling rate higher than normal"]}',
   'Multiple transverse surface cracks detected on HSLA billet during quality inspection post-casting. Heat #4782 used 70% Sims shredded scrap with no prime dilution. Casting speed was standard.',
   'Billets downgraded. Implemented mandatory casting speed reduction when Sims scrap exceeds 50% without dilution.',
   'L. Chen',
   ARRAY['cracking','hsla','sims','casting','defect'],
   '2025-02-08T06:30:00Z'),

  ('E-002','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Excessive slag carry-over into ladle — Heat #4801',
   '2025-02-12T14:15:00Z','EAF','Negative','Moderate','Open',
   '{"Material":["High-residual mixed scrap — poor slag chemistry control"],"Process":["Slag foaming unstable during final refining","Tap procedure rushed due to schedule pressure"],"Equipment":["EAF slag door sensor intermittent — delayed detection"],"People":["Operator noted slag behavior but did not delay tap"],"Measurement":[],"Environment":[]}',
   'Significant slag carry-over observed during EAF tap into ladle. Ladle furnace treatment extended by 12 minutes. Heat used high-residual shredded scrap from mixed suppliers.',
   '',
   'J. Martinez',
   ARRAY['slag','carry-over','eaf','ladle','residuals'],
   '2025-02-12T14:15:00Z'),

  ('E-003','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Zero-defect HSLA campaign — Heats #4810–4818',
   '2025-02-11T08:00:00Z','Casting','Positive','Significant','Closed',
   '{"Material":["Prime scrap dilution maintained above 30% on all heats","Consistent scrap sourcing — avoided Sims shredded for this campaign"],"Process":["Casting speed reduced 15% per HSLA protocol","EAF heat times extended to ensure clean tap chemistry"],"Equipment":["Mold oscillation pre-set to crack-sensitive parameters before campaign start"],"People":["Day shift A-crew — experienced with HSLA grades, pre-shift briefing held"],"Measurement":["Spectrometer readings confirmed before every tap — no delayed chemistry"],"Environment":["Moderate ambient temperature — stable mold cooling conditions"]}',
   'Nine consecutive HSLA heats cast with zero surface defects. Crew applied reduced casting speed, adjusted mold oscillation for peritectic grades, and ensured all heats had minimum 30% prime scrap dilution. Chemistry confirmed within spec before every tap.',
   'Campaign documented as best-practice reference. Crew commended. Parameters logged for replication.',
   'L. Chen',
   ARRAY['hsla','zero-defect','casting','best-practice','campaign'],
   '2025-02-11T08:00:00Z'),

  ('E-004','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Off-spec nitrogen in low-N grade — Heat #4825',
   '2025-02-15T10:30:00Z','Ladle Furnace','Negative','Significant','Closed',
   '{"Material":[],"Process":["Nitrogen gas used for stirring instead of argon","No grade-specific stirring protocol on shift card"],"Equipment":["Argon/nitrogen selector valve not clearly labelled"],"People":["Relief operator — first time on ladle furnace station","No handover briefing on grade requirements"],"Measurement":["N content only checked at final sample — no intermediate check"],"Environment":[]}',
   'Final N content 95ppm against 80ppm max specification. Investigation found nitrogen stirring gas was used instead of argon during ladle treatment. Operator was unaware of grade-specific stirring requirements. Heat diverted to lower-spec order at reduced margin.',
   'Valve labelling updated. Grade-specific gas requirement added to shift production card. Mandatory N check after first wire feed for low-N grades.',
   'J. Martinez',
   ARRAY['nitrogen','off-spec','ladle','stirring','argon'],
   '2025-02-15T10:30:00Z'),

  ('E-005','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Tundish breakout on heat 9 of peritectic sequence — Heat #4833',
   '2025-02-17T03:45:00Z','Casting','Negative','Major','Closed',
   '{"Material":[],"Process":["9th heat on tundish — exceeded 8-heat limit for peritectic","No intermediate nozzle inspection between heats 7 and 8"],"Equipment":["SEN misalignment developed progressively through sequence","Nozzle bore enlarged beyond safe limit"],"People":["Night shift extended sequence under production pressure","Supervisor approved extension without checking nozzle condition"],"Measurement":["No real-time nozzle wear monitoring available"],"Environment":[]}',
   'Breakout occurred on 9th heat of tundish sequence casting 0.12%C peritectic grade. Post-incident inspection showed severe nozzle bore erosion and SEN misalignment. Sequence was pushed beyond recommended 8-heat limit due to production pressure. Strand shutdown for 6 hours.',
   'Hard limit of 8 heats per tundish for peritectic grades enforced in Level 2 system. SEN alignment check mandatory at heat 6. Supervisor sign-off required for any sequence extension beyond 7 heats.',
   'A. Kowalski',
   ARRAY['breakout','tundish','peritectic','nozzle','safety'],
   '2025-02-17T03:45:00Z'),

  ('E-006','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Hydrogen cracking in HSLA billets held overnight — Heats #4840–4842',
   '2025-02-19T07:00:00Z','Rolling','Negative','Significant','Closed',
   '{"Material":["HSLA grade susceptible to hydrogen embrittlement"],"Process":["Billets held 14 hours — well beyond 4-hour rolling window","No priority routing established for HSLA after casting"],"Equipment":["Rolling mill down for scheduled bearing replacement"],"People":["Evening shift did not flag HSLA billets as priority for morning rolling"],"Measurement":["No hydrogen testing performed before rolling attempt"],"Environment":["Cold overnight temperatures may have accelerated hydrogen diffusion to surface"]}',
   'Three HSLA billets cast on evening shift held in billet yard overnight (14 hours) due to rolling mill maintenance. Hairline cracks found during first rolling pass. All three billets scrapped. Estimated loss $45,000.',
   'HSLA billets now flagged as priority-roll in Level 2 system. If rolling mill unavailable within 4 hours, billets routed to slow-cooling pit to retard hydrogen migration.',
   'M. Novak',
   ARRAY['hydrogen','cracking','hsla','rolling','delay','scrap-loss'],
   '2025-02-19T07:00:00Z'),

  ('E-007','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Spectrometer miscalibration caused 4 heats tapped on wrong chemistry',
   '2025-02-21T11:00:00Z','Quality Lab','Negative','Major','Closed',
   '{"Material":[],"Process":["Recalibration overdue — should have been done at sample 50","No automated drift warning in spectrometer software"],"Equipment":["Spectrometer calibration standard showed wear — replacement overdue"],"People":["Lab technician on double shift — missed calibration schedule"],"Measurement":["Systematic bias not caught because individual readings looked plausible","No cross-check with backup instrument"],"Environment":[]}',
   'Spectrometer calibration drifted after 80+ samples without recalibration. Carbon readings were systematically 0.03% low. Four heats tapped believing chemistry was within spec — all required ladle correction adding 8–12 minutes each. One heat missed delivery window.',
   'Automated calibration reminder added to lab software at 45 samples. Backup spectrometer cross-check required every 20 samples. Calibration standard replacement schedule tightened.',
   'R. Patel',
   ARRAY['spectrometer','calibration','chemistry','quality','drift'],
   '2025-02-21T11:00:00Z'),

  ('E-008','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Successful first use of DRI blend to offset Sims scrap quality',
   '2025-02-22T09:00:00Z','EAF','Positive','Moderate','Closed',
   '{"Material":["DRI at 20% provided sufficient dilution for Sims scrap","Prime scrap from verified low-residual supplier"],"Process":["Standard EAF parameters — no special adjustments needed","Normal casting speed achieved"],"Equipment":[],"People":["Day shift B-crew briefed on trial parameters before start"],"Measurement":["Chemistry confirmed on first spectrometer sample — no correction needed"],"Environment":[]}',
   'Trial heat using 40% Sims shredded + 20% DRI + 40% prime scrap. EAF heat time reduced by 8 minutes compared to 60% Sims-only heats. Tap chemistry clean on first sample. Casting proceeded at normal speed with zero defects.',
   'DRI blend ratio documented as recommended practice when Sims scrap exceeds 40% of charge. Cost analysis pending to confirm economic viability vs pure prime dilution.',
   'Max Wolman',
   ARRAY['dri','sims','scrap','dilution','trial','success'],
   '2025-02-22T09:00:00Z')

ON CONFLICT (id) DO NOTHING;

-- ── 5. Questions (5) ──────────────────────────────────────────────────────────

INSERT INTO questions (id, plant_id, question, detail, process_area, status, asked_by, created_at)
VALUES
  ('Q-001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'What do we do if the spectrometer goes down mid-heat and we need a chemistry check before tapping?',
   'Had this happen on night shift last week. Ended up calling the quality lab and waiting 20 minutes. There must be a faster backup procedure but I couldn''t find one.',
   'EAF','open','D. Novak','2025-02-15T22:10:00Z'),

  ('Q-002','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Is there a maximum number of heats we can run on a tundish for peritectic grades specifically?',
   'SOPs say 10 heats max on a tundish generally, but I''ve heard from Marco that peritectic grades should be limited to 6-7 because of nozzle erosion. Nothing written down about this.',
   'Casting','open','K. Alvarez','2025-02-16T07:45:00Z'),

  ('Q-003','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'How should we adjust EAF power profile when running 100% DRI charges?',
   'We rarely run full DRI but it''s happening more often. The melting behavior is completely different from scrap — much more predictable but the power curve we use is optimized for mixed charges. Need guidance.',
   'EAF','answered','S. Petrov','2025-02-17T14:30:00Z'),

  ('Q-004','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'What''s the correct slag conditioner addition rate when we see foamy slag collapsing early in the refining phase?',
   'Happened twice this week. Slag foams nicely during meltdown but collapses about 10 minutes into refining. We''ve been adding more carbon but not sure of the right rate.',
   'EAF','open','T. Williams','2025-02-18T09:00:00Z'),

  ('Q-005','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Do we have any experience with the new Praxair oxygen lance tips? Anything to watch for?',
   'Maintenance installed new lance tips last turnaround. They look different from the old ones — smaller bore diameter. Nobody briefed the operators on whether we need to adjust oxygen flow rates.',
   'EAF','open','R. Fernandez','2025-02-19T11:20:00Z')

ON CONFLICT (id) DO NOTHING;

-- ── 6. Responses ──────────────────────────────────────────────────────────────

INSERT INTO responses (question_id, text, by, created_at)
VALUES
  ('Q-003',
   'Full DRI needs a flat power profile — no need for the bore-in phase you use with scrap. Start at 80% power and hold steady. The arc is more stable so you won''t get the electrode breakage risk. Budget 38-42 minutes for a full DRI heat vs 45-50 for mixed. Also watch your slag — DRI generates less slag naturally so you may need to add lime earlier than usual.',
   'M. Rossi',
   '2025-02-17T16:15:00Z');

-- ── 7. Evidence ───────────────────────────────────────────────────────────────

INSERT INTO evidence (parent_type, parent_id, type, text, date)
VALUES
  ('rule','R-001','human_note','Original operator observation','2025-02-10'),
  ('rule','R-002','human_note','Original operator observation','2025-02-10'),
  ('rule','R-003','human_note','Original operator observation','2025-02-10'),
  ('rule','R-003','event_corroboration','Corroborated by E-001 and E-003','2025-02-11'),
  ('rule','R-004','human_note','Metallurgist observation across 50+ heats','2025-01-15'),
  ('rule','R-005','human_note','Quality team review of defect data 2024 Q3-Q4','2024-12-20'),
  ('rule','R-006','human_note','Shift supervisor incident report','2025-02-01'),
  ('rule','R-007','human_note','Quality manager directive after Q4 2024 audit','2024-11-30'),
  ('rule','R-007','event_corroboration','Three incidents in Nov 2024 traced to estimated taps','2024-12-01'),
  ('rule','R-008','human_note','HSE mandatory procedure — updated annually','2024-06-01'),
  ('rule','R-009','human_note','Metallurgist process optimization study','2025-01-20'),
  ('rule','R-010','human_note','Quality engineer investigation after rolling defects in Jan 2025','2025-01-28'),
  ('rule','R-011','human_note','Casting foreman observation over 3 reline cycles','2025-02-05'),
  ('rule','R-012','human_note','Electrical engineer observation — needs more data','2025-02-14'),
  ('rule','R-013','human_note','Metallurgist — confirmed across 200+ heats in 2024','2024-09-15'),
  ('rule','R-014','human_note','Rolling mill supervisor — standard operating knowledge','2024-08-01'),
  ('rule','R-015','human_note','Lab manager calibration study','2024-07-15'),
  ('rule','R-016','human_note','Casting engineer — based on nozzle inspection data','2025-01-10'),
  ('rule','R-017','human_note','Metallurgist hypothesis — two incidents observed','2025-02-18'),
  ('rule','R-018','human_note','Quality system audit requirement','2024-04-01'),
  ('rule','R-019','human_note','Lessons learned from E-002','2025-02-13'),
  ('rule','R-020','human_note','Casting engineer recommendation after breakout analysis','2025-02-20'),
  ('rule','R-021','human_note','Production manager directive','2025-01-05'),
  ('rule','R-022','human_note','Shift supervisor workaround during supply disruption','2025-02-01'),
  ('assertion','A-001','human_note','Original operator note','2025-02-10'),
  ('assertion','A-002','human_note','Original operator note','2025-02-10'),
  ('assertion','A-002','event_corroboration','Confirmed by E-001 and E-003','2025-02-11'),
  ('assertion','A-003','human_note','Original operator note','2025-02-10'),
  ('assertion','A-003','event_corroboration','E-003 zero-defect campaign used reduced speed','2025-02-11'),
  ('assertion','A-004','human_note','Electrical engineer and metallurgist joint observation','2025-02-14'),
  ('assertion','A-005','human_note','Lab manager calibration study across 6 months','2024-07-15'),
  ('assertion','A-006','human_note','Metallurgist process study — temperature mapping','2025-01-20'),
  ('assertion','A-007','human_note','HSE incident database — 12 incidents over 5 years all traced to moisture','2024-06-01'),
  ('assertion','A-008','human_note','Quality investigation — Jan 2025 rolling defects','2025-01-28'),
  ('assertion','A-009','human_note','Casting engineer — nozzle bore measurement data','2025-01-10'),
  ('assertion','A-010','human_note','Metallurgist — statistical analysis of 200+ heats comparing Ar vs N2 stirring','2024-09-15');

-- ── 8. Versions ───────────────────────────────────────────────────────────────

INSERT INTO versions (target_type, target_id, version_num, date, author, change_note, snapshot_title)
VALUES
  ('rule','R-001',1,'2025-02-10T09:00:00Z','Max Wolman','Initial capture from operator note',
   'When charging shredded scrap from Sims Metal Management, dilute the charge with prime scrap or DRI when available.'),
  ('rule','R-002',1,'2025-02-10T09:15:00Z','Max Wolman','Initial capture',
   'If Sims shredded scrap is used without sufficient dilution, plan for longer EAF heat times.'),
  ('rule','R-003',1,'2025-02-10T09:30:00Z','Max Wolman','Initial capture',
   'If lower quality scrap cannot be diluted, anticipate higher casting defect risk and reduce casting speed.'),
  ('rule','R-003',2,'2025-02-12T08:00:00Z','L. Chen','Promoted to Active after E-001 and E-003 confirmed effectiveness',
   'Reduce casting speed when undiluted low-quality scrap is used.'),
  ('rule','R-004',1,'2025-01-15T14:00:00Z','J. Martinez','Initial capture from metallurgist review',
   'Monitor slag foaming behavior closely when using high-residual scrap charges.'),
  ('rule','R-005',1,'2024-12-20T10:00:00Z','L. Chen','Initial capture from quality review',
   'Adjust mold oscillation parameters when casting crack-sensitive grades.'),
  ('rule','R-006',1,'2025-02-01T08:30:00Z','D. Okonkwo','Initial capture',
   'Check ladle refractory campaign life before routing high-alloy heats.'),
  ('rule','R-007',1,'2024-11-30T10:00:00Z','R. Patel','Initial — mandatory rule from quality audit',
   'Always confirm spectrometer chemistry before EAF tap.'),
  ('rule','R-008',1,'2024-06-01T00:00:00Z','HSE Team','Annual review — no changes',
   'Inspect all scrap for moisture and sealed containers before EAF charging.'),
  ('rule','R-009',1,'2025-01-20T11:00:00Z','J. Martinez','Initial from process study',
   'Allow 3-5 minutes of arc heating between wire feed additions in the ladle furnace.'),
  ('rule','R-010',1,'2025-01-28T09:00:00Z','L. Chen','Initial — from rolling defect investigation',
   'HSLA billets should enter the rolling mill within 4 hours of casting.'),
  ('rule','R-011',1,'2025-02-05T13:00:00Z','A. Kowalski','Initial from casting floor observation',
   'Add 15 minutes to tundish preheat after a lining change.'),
  ('rule','R-012',1,'2025-02-14T16:00:00Z','S. Volkov','Initial — preliminary observation, needs validation',
   'Limit EAF power to 85% during final refining when Cu exceeds 0.25%.'),
  ('rule','R-013',1,'2024-09-15T10:00:00Z','J. Martinez','Initial — well established practice',
   'Always use argon for ladle stirring on low-nitrogen grade specifications.'),
  ('rule','R-014',1,'2024-08-01T07:00:00Z','M. Novak','Initial — established practice',
   'Do not start rolling if billet surface temperature is below 1050°C.'),
  ('rule','R-015',1,'2024-07-15T12:00:00Z','R. Patel','Initial from calibration study',
   'Recalibrate spectrometer every 50 samples or at shift change.'),
  ('rule','R-016',1,'2025-01-10T14:00:00Z','A. Kowalski','Initial from nozzle inspection analysis',
   'Limit tundish sequence to 8 heats for peritectic grades.'),
  ('rule','R-017',1,'2025-02-18T11:00:00Z','J. Martinez','Initial — hypothesis needs validation',
   'Pre-heat alloy wire to 200°C before feeding into ladle during cold months.'),
  ('rule','R-018',1,'2024-04-01T08:00:00Z','R. Patel','Initial — ISO compliance requirement',
   'Log all scrap deliveries with supplier cert within 2 hours.'),
  ('rule','R-019',1,'2025-02-13T09:00:00Z','D. Okonkwo','Initial — from lessons learned session',
   'Always notify shift supervisor before changing scrap supplier during a production campaign.'),
  ('rule','R-020',1,'2025-02-20T10:00:00Z','A. Kowalski','Initial from breakout root cause analysis',
   'Check SEN alignment before starting each new tundish sequence.'),
  ('rule','R-021',1,'2025-01-05T08:00:00Z','Production Manager','Initial',
   'Return to standard casting speed once mold is stable.'),
  ('rule','R-022',1,'2025-02-01T16:00:00Z','T. Williams','Initial — supply disruption workaround',
   'Use nitrogen stirring when argon is not available.'),
  ('assertion','A-001',1,'2025-02-10T09:00:00Z','Max Wolman','Initial',
   'Lower quality shredded scrap requires longer EAF heat times'),
  ('assertion','A-002',1,'2025-02-10T09:10:00Z','Max Wolman','Initial',
   'Insufficient dilution increases cracking and casting defect risk'),
  ('assertion','A-003',1,'2025-02-10T09:20:00Z','Max Wolman','Initial',
   'Slower casting speeds reduce defect risk under marginal conditions'),
  ('assertion','A-004',1,'2025-02-14T16:30:00Z','S. Volkov','Initial',
   'Cu > 0.25% causes slag instability and electrode overconsumption'),
  ('assertion','A-005',1,'2024-07-15T12:30:00Z','R. Patel','Initial from calibration study',
   'Spectrometer accuracy degrades measurably after ~50 samples'),
  ('assertion','A-006',1,'2025-01-20T11:30:00Z','J. Martinez','Initial from temperature mapping study',
   'Without 3-5 min reheat between additions, cold spots persist in the ladle'),
  ('assertion','A-007',1,'2024-06-01T00:00:00Z','HSE Team','Initial — safety critical',
   'All 12 EAF charging incidents in the past 5 years involved wet or sealed scrap'),
  ('assertion','A-008',1,'2025-01-28T09:30:00Z','L. Chen','Initial from defect investigation',
   'Hydrogen diffuses to billet surface within 4 hours creating crack nucleation sites'),
  ('assertion','A-009',1,'2025-01-10T14:30:00Z','A. Kowalski','Initial from nozzle inspection data',
   'Nozzle bore enlargement exceeds 15% after 8 heats — threshold for flow control issues'),
  ('assertion','A-010',1,'2024-09-15T10:30:00Z','J. Martinez','Initial from statistical analysis',
   'N2 stirring consistently adds 15-25ppm N — Ar stirring adds <3ppm');

-- ── 9. Comments ───────────────────────────────────────────────────────────────

INSERT INTO comments (target_type, target_id, text, by, created_at)
VALUES
  ('rule','R-001',
   'Confirmed this on night shift last week. Definitely need the extra time.',
   'L. Chen','2025-02-10T08:00:00Z'),
  ('rule','R-003',
   'Also applies when using Turkish shredded. Same copper issues.',
   'M. Rossi','2025-02-14T14:30:00Z'),
  ('event','E-001',
   'We saw similar cracking on Heat #4790 two weeks earlier but didn''t file it.',
   'J. Martinez','2025-02-09T10:00:00Z');

-- ── 10. Verifications ─────────────────────────────────────────────────────────

INSERT INTO verifications (target_type, target_id, verified_by, created_at)
VALUES
  ('rule','R-001','M. Rossi', '2025-02-11T10:00:00Z'),
  ('rule','R-001','K. Alvarez','2025-02-11T11:00:00Z'),
  ('rule','R-001','D. Novak', '2025-02-11T12:00:00Z'),
  ('rule','R-003','L. Chen',  '2025-02-13T09:00:00Z'),
  ('rule','R-003','T. Williams','2025-02-13T10:00:00Z'),
  ('rule','R-005','M. Rossi', '2025-01-02T09:00:00Z'),
  ('assertion','A-001','J. Martinez','2025-02-11T13:00:00Z'),
  ('assertion','A-001','S. Petrov',  '2025-02-11T14:00:00Z'),
  ('assertion','A-002','L. Chen',    '2025-02-11T15:00:00Z')
ON CONFLICT (target_type, target_id, verified_by) DO NOTHING;

-- ── 11. Links ─────────────────────────────────────────────────────────────────

INSERT INTO links (source_type, source_id, target_type, target_id, relationship_type, created_by)
VALUES
  -- Rule → Assertion (supports)
  ('rule','R-001','assertion','A-001','supports','Max Wolman'),
  ('rule','R-002','assertion','A-001','supports','Max Wolman'),
  ('rule','R-002','assertion','A-002','supports','Max Wolman'),
  ('rule','R-003','assertion','A-002','supports','Max Wolman'),
  ('rule','R-003','assertion','A-003','supports','Max Wolman'),
  ('rule','R-004','assertion','A-001','supports','J. Martinez'),
  ('rule','R-004','assertion','A-004','supports','J. Martinez'),
  ('rule','R-005','assertion','A-003','supports','L. Chen'),
  ('rule','R-006','assertion','A-002','supports','D. Okonkwo'),
  ('rule','R-006','assertion','A-006','supports','D. Okonkwo'),
  ('rule','R-007','assertion','A-005','supports','R. Patel'),
  ('rule','R-008','assertion','A-007','supports','HSE Team'),
  ('rule','R-009','assertion','A-006','supports','J. Martinez'),
  ('rule','R-010','assertion','A-003','supports','L. Chen'),
  ('rule','R-010','assertion','A-008','supports','L. Chen'),
  ('rule','R-011','assertion','A-009','supports','A. Kowalski'),
  ('rule','R-012','assertion','A-004','supports','S. Volkov'),
  ('rule','R-013','assertion','A-010','supports','J. Martinez'),
  ('rule','R-014','assertion','A-008','supports','M. Novak'),
  ('rule','R-015','assertion','A-005','supports','R. Patel'),
  ('rule','R-016','assertion','A-009','supports','A. Kowalski'),
  ('rule','R-017','assertion','A-006','supports','J. Martinez'),
  ('rule','R-018','assertion','A-007','supports','R. Patel'),
  ('rule','R-019','assertion','A-001','supports','D. Okonkwo'),
  ('rule','R-019','assertion','A-004','supports','D. Okonkwo'),
  ('rule','R-020','assertion','A-009','supports','A. Kowalski'),
  -- Contradicting rules (R-013 vs R-022 — argon vs nitrogen stirring)
  ('rule','R-013','rule','R-022','contradicts','J. Martinez'),
  -- Event → Rule links
  ('event','E-001','rule','R-003','caused_by','L. Chen'),
  ('event','E-001','rule','R-005','caused_by','L. Chen'),
  ('event','E-002','rule','R-004','caused_by','J. Martinez'),
  ('event','E-003','rule','R-003','mitigates','L. Chen'),
  ('event','E-003','rule','R-005','mitigates','L. Chen'),
  ('event','E-004','rule','R-013','caused_by','J. Martinez'),
  ('event','E-005','rule','R-016','caused_by','A. Kowalski'),
  ('event','E-005','rule','R-020','caused_by','A. Kowalski'),
  ('event','E-006','rule','R-010','caused_by','M. Novak'),
  ('event','E-006','rule','R-014','caused_by','M. Novak'),
  ('event','E-007','rule','R-007','caused_by','R. Patel'),
  ('event','E-007','rule','R-015','caused_by','R. Patel'),
  ('event','E-008','rule','R-001','supports','Max Wolman'),
  ('event','E-008','rule','R-002','supports','Max Wolman'),
  -- Event → Assertion links
  ('event','E-001','assertion','A-002','supports','L. Chen'),
  ('event','E-001','assertion','A-003','supports','L. Chen'),
  ('event','E-002','assertion','A-001','supports','J. Martinez'),
  ('event','E-003','assertion','A-003','supports','L. Chen'),
  ('event','E-004','assertion','A-010','supports','J. Martinez'),
  ('event','E-005','assertion','A-009','supports','A. Kowalski'),
  ('event','E-006','assertion','A-008','supports','M. Novak'),
  ('event','E-007','assertion','A-005','supports','R. Patel'),
  ('event','E-008','assertion','A-001','supports','Max Wolman'),
  ('event','E-008','assertion','A-002','supports','Max Wolman')
ON CONFLICT (source_type, source_id, target_type, target_id, relationship_type) DO NOTHING;

COMMIT;
