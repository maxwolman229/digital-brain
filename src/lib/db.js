import { supabase } from './supabase.js'
import { INITIAL_RULES, INITIAL_ASSERTIONS, INITIAL_EVENTS, INITIAL_QUESTIONS } from './data.js'
import { getPlantId, getDisplayName } from './userContext.js'

// Dynamic plant ID from authenticated user context.
// Falls back to env/seed UUID so development still works without auth.
const PLANT_ID = () => getPlantId() || import.meta.env.VITE_PLANT_ID || 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

// ─── Normalise snake_case Supabase rows → camelCase prototype shape ───────────

function normaliseRule(r, evidence = [], versions = [], linkedAssertions = []) {
  return {
    id: r.id,
    title: r.title,
    type: 'rule',
    status: r.status,
    confidence: r.confidence,
    category: r.category,
    processArea: r.process_area,
    scope: r.scope,
    rationale: r.rationale,
    tags: r.tags || [],
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    evidence: evidence
      .filter(e => e.parent_id === r.id)
      .map(e => ({ type: e.type, text: e.text, date: e.date })),
    versions: versions
      .filter(v => v.target_id === r.id)
      .sort((a, b) => a.version_num - b.version_num)
      .map(v => ({ version: v.version_num, date: v.date, author: v.author, change: v.change_note, snapshot: v.snapshot_title })),
    linkedAssertions,
  }
}

function normaliseAssertion(a, evidence = [], versions = [], linkedRules = []) {
  return {
    id: a.id,
    title: a.title,
    type: 'assertion',
    status: a.status,
    confidence: a.confidence,
    category: a.category,
    processArea: a.process_area,
    scope: a.scope,
    tags: a.tags || [],
    createdBy: a.created_by,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    evidence: evidence
      .filter(e => e.parent_id === a.id)
      .map(e => ({ type: e.type, text: e.text, date: e.date })),
    versions: versions
      .filter(v => v.target_id === a.id)
      .sort((a, b) => a.version_num - b.version_num)
      .map(v => ({ version: v.version_num, date: v.date, author: v.author, change: v.change_note, snapshot: v.snapshot_title })),
    linkedRules,
  }
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export async function fetchRules() {
  const [rulesRes, evidenceRes, versionsRes, linksRes] = await Promise.all([
    supabase.from('rules').select('*').eq('plant_id', PLANT_ID()).order('created_at', { ascending: false }),
    supabase.from('evidence').select('*').eq('parent_type', 'rule'),
    supabase.from('versions').select('*').eq('target_type', 'rule'),
    supabase.from('links').select('source_id, target_id').eq('source_type', 'rule').eq('target_type', 'assertion'),
  ])

  if (!rulesRes.data?.length) return INITIAL_RULES

  const linksBySource = {}
  linksRes.data?.forEach(l => {
    if (!linksBySource[l.source_id]) linksBySource[l.source_id] = []
    linksBySource[l.source_id].push(l.target_id)
  })

  return rulesRes.data.map(r =>
    normaliseRule(r, evidenceRes.data || [], versionsRes.data || [], linksBySource[r.id] || [])
  )
}

// ─── Assertions ───────────────────────────────────────────────────────────────

export async function fetchAssertions() {
  const [assertRes, evidenceRes, versionsRes, linksRes] = await Promise.all([
    supabase.from('assertions').select('*').eq('plant_id', PLANT_ID()).order('created_at', { ascending: false }),
    supabase.from('evidence').select('*').eq('parent_type', 'assertion'),
    supabase.from('versions').select('*').eq('target_type', 'assertion'),
    supabase.from('links').select('source_id, target_id').eq('source_type', 'rule').eq('target_type', 'assertion'),
  ])

  if (!assertRes.data?.length) return INITIAL_ASSERTIONS

  // Build reverse map: assertion_id → rule_ids
  const linkedRulesMap = {}
  linksRes.data?.forEach(l => {
    if (!linkedRulesMap[l.target_id]) linkedRulesMap[l.target_id] = []
    linkedRulesMap[l.target_id].push(l.source_id)
  })

  return assertRes.data.map(a =>
    normaliseAssertion(a, evidenceRes.data || [], versionsRes.data || [], linkedRulesMap[a.id] || [])
  )
}

// ─── Comments (keyed by target_id) ───────────────────────────────────────────

export async function fetchComments(targetType) {
  const { data } = await supabase
    .from('comments')
    .select('*')
    .eq('target_type', targetType)
    .order('created_at')

  if (!data?.length) {
    return SEED_COMMENTS[targetType] || {}
  }

  const map = {}
  data.forEach(c => {
    if (!map[c.target_id]) map[c.target_id] = []
    map[c.target_id].push({ by: c.by, text: c.text, date: c.created_at })
  })
  return map
}

// ─── Verifications (keyed by target_id, array of names) ──────────────────────

export async function fetchVerifications(targetType) {
  const { data } = await supabase
    .from('verifications')
    .select('*')
    .eq('target_type', targetType)

  if (!data?.length) {
    return SEED_VERIFICATIONS[targetType] || {}
  }

  const map = {}
  data.forEach(v => {
    if (!map[v.target_id]) map[v.target_id] = []
    map[v.target_id].push(v.verified_by)
  })
  return map
}

// ─── Events ───────────────────────────────────────────────────────────────────

function normaliseEvent(e) {
  return {
    id: e.id,
    title: e.title,
    type: 'event',
    outcome: e.outcome,
    impact: e.impact,
    status: e.status,
    processArea: e.process_area,
    date: e.date,
    description: e.description,
    ishikawa: e.root_cause || {},
    resolution: e.resolution,
    linkedRules: [],
    linkedAssertions: [],
    generatedRules: [],
    generatedAssertions: [],
    reportedBy: e.reported_by,
    taggedPeople: e.tagged_people || [],
    tags: e.tags || [],
    createdAt: e.created_at,
  }
}

export async function fetchEvents() {
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('plant_id', PLANT_ID())
    .order('date', { ascending: false })

  if (!data?.length) return INITIAL_EVENTS
  return data.map(normaliseEvent)
}

export async function addEvent(ev) {
  const id = await nextId('events', 'E')
  const { data, error } = await supabase
    .from('events')
    .insert({
      id,
      plant_id: PLANT_ID(),
      title: ev.title,
      outcome: ev.outcome,
      impact: ev.impact,
      status: ev.status || 'Open',
      process_area: ev.processArea,
      date: ev.date,
      description: ev.description,
      root_cause: ev.ishikawa || {},
      resolution: ev.resolution,
      reported_by: ev.reportedBy,
      tagged_people: ev.taggedPeople || [],
      tags: ev.tags || [],
    })
    .select()
    .single()

  if (error) {
    console.error('[addEvent] insert failed:', error.message)
    return null
  }
  return normaliseEvent(data)
}

// ─── Seed maps (shared fallback for per-item and bulk fetches) ────────────────

const SEED_COMMENTS = {
  rule: {
    'R-001': [{ by: 'L. Chen', text: 'Confirmed this on night shift last week. Definitely need the extra time.', date: '2025-02-10T08:00:00Z' }],
    'R-003': [{ by: 'M. Rossi', text: 'Also applies when using Turkish shredded. Same copper issues.', date: '2025-02-14T14:30:00Z' }],
  },
  event: {
    'E-001': [{ by: 'J. Martinez', text: "We saw similar cracking on Heat #4790 two weeks earlier but didn't file it.", date: '2025-02-09T10:00:00Z' }],
  },
}

const SEED_VERIFICATIONS = {
  rule: {
    'R-001': ['M. Rossi', 'K. Alvarez', 'D. Novak'],
    'R-003': ['L. Chen', 'T. Williams'],
    'R-005': ['M. Rossi'],
  },
  assertion: {
    'A-001': ['J. Martinez', 'S. Petrov'],
    'A-002': ['L. Chen'],
  },
}

// ─── Per-item fetch — used by Comments / Verifications components ─────────────

export async function fetchItemComments(targetType, targetId) {
  const { data } = await supabase
    .from('comments')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at')

  if (data?.length) {
    return data.map(c => ({ by: c.by, text: c.text, date: c.created_at }))
  }
  return SEED_COMMENTS[targetType]?.[targetId] || []
}

export async function fetchItemVerifications(targetType, targetId) {
  const { data } = await supabase
    .from('verifications')
    .select('verified_by')
    .eq('target_type', targetType)
    .eq('target_id', targetId)

  if (data?.length) {
    return data.map(v => v.verified_by)
  }
  return SEED_VERIFICATIONS[targetType]?.[targetId] || []
}

// ─── Persist a new comment to Supabase ───────────────────────────────────────

export async function addComment(targetType, targetId, text, by) {
  const { data, error } = await supabase
    .from('comments')
    .insert({ target_type: targetType, target_id: targetId, text, by })
    .select()
    .single()

  if (error) {
    console.error('[addComment] insert failed:', error.message)
    return null
  }
  return { by: data.by, text: data.text, date: data.created_at }
}

// ─── Persist a verification ───────────────────────────────────────────────────

export async function addVerification(targetType, targetId, verifiedBy) {
  const { error } = await supabase
    .from('verifications')
    .upsert({ target_type: targetType, target_id: targetId, verified_by: verifiedBy })
  if (error) {
    console.error('[addVerification] upsert failed:', error.message, { targetType, targetId })
  }
}

// ─── Questions ────────────────────────────────────────────────────────────────

function normaliseQuestion(q) {
  return {
    id: q.id,
    question: q.question,
    detail: q.detail,
    processArea: q.process_area,
    askedBy: q.asked_by,
    askedAt: q.created_at,
    status: q.status,
    responses: [],
    generatedRules: [],
    generatedAssertions: [],
    taggedPeople: q.tagged_people || [],
  }
}

export async function fetchQuestions() {
  const { data } = await supabase
    .from('questions')
    .select('*')
    .eq('plant_id', PLANT_ID())
    .order('created_at', { ascending: false })

  if (!data?.length) return INITIAL_QUESTIONS
  return data.map(normaliseQuestion)
}

export async function addQuestion(q) {
  const id = await nextId('questions', 'Q')
  const { data, error } = await supabase
    .from('questions')
    .insert({
      id,
      plant_id: PLANT_ID(),
      question: q.question,
      detail: q.detail || '',
      process_area: q.processArea || '',
      asked_by: q.askedBy,
      status: 'open',
      tagged_people: q.taggedPeople || [],
    })
    .select()
    .single()

  if (error) {
    console.error('[addQuestion] insert failed:', error.message)
    return null
  }
  return normaliseQuestion(data)
}

export async function updateQuestionStatus(questionId, status) {
  const { error } = await supabase
    .from('questions')
    .update({ status })
    .eq('id', questionId)
  if (error) console.error('[updateQuestionStatus] failed:', error.message)
}

export async function saveResponse(questionId, text, by, parentId) {
  const { data, error } = await supabase
    .from('responses')
    .insert({ question_id: questionId, text, by, parent_id: parentId || null })
    .select()
    .single()
  if (error) {
    console.error('[saveResponse] insert failed:', error.message)
    return null
  }
  return { id: data.id, by: data.by, text: data.text, date: data.created_at, replyTo: data.parent_id }
}

export async function fetchResponses(questionId) {
  const { data } = await supabase
    .from('responses')
    .select('*')
    .eq('question_id', questionId)
    .order('created_at')
  return (data || []).map(r => ({ id: r.id, by: r.by, text: r.text, date: r.created_at, replyTo: r.parent_id }))
}

// ─── Links ────────────────────────────────────────────────────────────────────

// Returns all links involving this item (bidirectional), with resolved titles.
export async function fetchLinks(itemType, itemId) {
  const { data, error } = await supabase
    .from('links')
    .select('*')
    .or(`and(source_type.eq.${itemType},source_id.eq.${itemId}),and(target_type.eq.${itemType},target_id.eq.${itemId})`)

  if (error || !data?.length) return []

  // Collect all rule/assertion IDs we need titles for
  const ruleIds = new Set()
  const assertionIds = new Set()
  data.forEach(l => {
    const isSource = l.source_type === itemType && l.source_id === itemId
    const linkedType = isSource ? l.target_type : l.source_type
    const linkedId   = isSource ? l.target_id   : l.source_id
    if (linkedType === 'rule')      ruleIds.add(linkedId)
    if (linkedType === 'assertion') assertionIds.add(linkedId)
  })

  const [rulesRes, assertRes] = await Promise.all([
    ruleIds.size      ? supabase.from('rules').select('id, title, process_area').in('id', [...ruleIds])      : { data: [] },
    assertionIds.size ? supabase.from('assertions').select('id, title, process_area').in('id', [...assertionIds]) : { data: [] },
  ])

  const titleMap = {}
  ;(rulesRes.data || []).forEach(r => { titleMap[r.id] = { title: r.title, processArea: r.process_area } })
  ;(assertRes.data || []).forEach(a => { titleMap[a.id] = { title: a.title, processArea: a.process_area } })

  return data.map(l => {
    const isSource  = l.source_type === itemType && l.source_id === itemId
    const linkedType = isSource ? l.target_type : l.source_type
    const linkedId   = isSource ? l.target_id   : l.source_id
    const meta = titleMap[linkedId] || {}
    return {
      id:             l.id,
      relType:        l.relationship_type,
      comment:        l.comment || '',
      direction:      isSource ? 'outgoing' : 'incoming',
      linkedType,
      linkedId,
      linkedTitle:    meta.title || linkedId,
      linkedProcessArea: meta.processArea || '',
    }
  })
}

export async function saveLink(sourceType, sourceId, targetType, targetId, relType, comment, createdBy) {
  const { error } = await supabase
    .from('links')
    .upsert({
      source_type: sourceType,
      source_id: sourceId,
      target_type: targetType,
      target_id: targetId,
      relationship_type: relType,
      comment: comment || null,
      created_by: createdBy || 'You',
    }, { onConflict: 'source_type,source_id,target_type,target_id,relationship_type' })
  return !error
}

export async function deleteLink(linkId) {
  await supabase.from('links').delete().eq('id', linkId)
}

// Search rules + assertions by title for the link editor
export async function searchKnowledge(query, excludeType, excludeId) {
  if (!query?.trim()) return []
  const q = query.trim()
  const [rulesRes, assertRes] = await Promise.all([
    supabase.from('rules').select('id, title, process_area').ilike('title', `%${q}%`).eq('plant_id', PLANT_ID()).limit(8),
    supabase.from('assertions').select('id, title, process_area').ilike('title', `%${q}%`).eq('plant_id', PLANT_ID()).limit(8),
  ])

  // Fallback to in-memory if DB empty
  const rules = rulesRes.data?.length
    ? rulesRes.data.map(r => ({ id: r.id, type: 'rule', title: r.title, processArea: r.process_area }))
    : INITIAL_RULES.filter(r => r.title.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
      .map(r => ({ id: r.id, type: 'rule', title: r.title, processArea: r.processArea }))

  const assertions = assertRes.data?.length
    ? assertRes.data.map(a => ({ id: a.id, type: 'assertion', title: a.title, processArea: a.process_area }))
    : INITIAL_ASSERTIONS.filter(a => a.title.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
      .map(a => ({ id: a.id, type: 'assertion', title: a.title, processArea: a.processArea }))

  return [...rules, ...assertions].filter(x => !(x.type === excludeType && x.id === excludeId))
}

// Fetch a single rule or assertion by type+id (for the cross-type detail modal)
export async function fetchItemById(type, id) {
  if (type === 'rule') {
    const seed = INITIAL_RULES.find(r => r.id === id)
    const [itemRes, evidenceRes, versionsRes] = await Promise.all([
      supabase.from('rules').select('*').eq('id', id).single(),
      supabase.from('evidence').select('*').eq('parent_type', 'rule').eq('parent_id', id),
      supabase.from('versions').select('*').eq('target_type', 'rule').eq('target_id', id),
    ])
    if (!itemRes.data) return seed || null
    const item = normaliseRule(itemRes.data, evidenceRes.data || [], versionsRes.data || [], [])
    // Fill null fields from in-memory seed as fallback (handles items seeded without metadata)
    if (!item.createdBy && seed?.createdBy) item.createdBy = seed.createdBy
    if (!item.createdAt && seed?.createdAt) item.createdAt = seed.createdAt
    if (!item.evidence?.length && seed?.evidence?.length) item.evidence = seed.evidence
    return item
  }
  if (type === 'assertion') {
    const seed = INITIAL_ASSERTIONS.find(a => a.id === id)
    const [itemRes, evidenceRes, versionsRes] = await Promise.all([
      supabase.from('assertions').select('*').eq('id', id).single(),
      supabase.from('evidence').select('*').eq('parent_type', 'assertion').eq('parent_id', id),
      supabase.from('versions').select('*').eq('target_type', 'assertion').eq('target_id', id),
    ])
    if (!itemRes.data) return seed || null
    const item = normaliseAssertion(itemRes.data, evidenceRes.data || [], versionsRes.data || [], [])
    if (!item.createdBy && seed?.createdBy) item.createdBy = seed.createdBy
    if (!item.createdAt && seed?.createdAt) item.createdAt = seed.createdAt
    if (!item.evidence?.length && seed?.evidence?.length) item.evidence = seed.evidence
    return item
  }
  return null
}

// ─── Create rule/assertion from extraction ────────────────────────────────────

export async function addRuleFromExtraction(rule) {
  const id = await nextId('rules', 'R')
  const { data, error } = await supabase
    .from('rules')
    .insert({
      id,
      plant_id: PLANT_ID(),
      title: rule.title,
      status: 'Proposed',
      confidence: rule.confidence || 'Medium',
      category: rule.category || 'Process',
      process_area: rule.processArea,
      scope: '',
      rationale: rule.rationale || '',
      tags: rule.tags || [],
      created_by: rule.createdBy || 'You',
    })
    .select()
    .single()

  if (error) return null
  await supabase.from('versions').insert({
    target_type: 'rule', target_id: id, version_num: 1,
    date: data.created_at, author: data.created_by,
    change_note: 'Extracted from Q&A', snapshot_title: rule.title,
  })
  return normaliseRule(data, [], [], [])
}

export async function addAssertionFromExtraction(assertion) {
  const id = await nextId('assertions', 'A')
  const { data, error } = await supabase
    .from('assertions')
    .insert({
      id,
      plant_id: PLANT_ID(),
      title: assertion.title,
      status: 'Proposed',
      confidence: assertion.confidence || 'Medium',
      category: assertion.category || 'Process',
      process_area: assertion.processArea,
      scope: '',
      tags: assertion.tags || [],
      created_by: assertion.createdBy || 'You',
    })
    .select()
    .single()

  if (error) return null
  await supabase.from('versions').insert({
    target_type: 'assertion', target_id: id, version_num: 1,
    date: data.created_at, author: data.created_by,
    change_note: 'Extracted from Q&A', snapshot_title: assertion.title,
  })
  return normaliseAssertion(data, [], [], [])
}

// ─── Create rule / assertion (from Add form) ──────────────────────────────────

async function nextId(table, prefix) {
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('plant_id', PLANT_ID())
    .order('id', { ascending: false })
    .limit(1)
    .single()
  const num = data ? parseInt(data.id.replace(`${prefix}-`, ''), 10) + 1 : 1
  return `${prefix}-${String(num).padStart(3, '0')}`
}

export async function createRule({ title, category, processArea, scope, rationale, confidence, status, tags, evidenceText, createdBy }) {
  const id = await nextId('rules', 'R')
  const { data, error } = await supabase
    .from('rules')
    .insert({
      id,
      plant_id: PLANT_ID(),
      title,
      category: category || 'Process',
      process_area: processArea || '',
      scope: scope || '',
      rationale: rationale || '',
      confidence: confidence || 'Medium',
      status: status || 'Proposed',
      tags: tags || [],
      created_by: createdBy || getDisplayName(),
    })
    .select()
    .single()
  if (error) throw new Error(error.message)

  const now = data.created_at
  const versionRow = { target_id: id, version_num: 1, date: now, author: data.created_by, change_note: 'Initial version', snapshot_title: title }
  await supabase.from('versions').insert({ target_type: 'rule', ...versionRow })

  const evidenceRows = []
  if (evidenceText?.trim()) {
    const ev = { parent_type: 'rule', parent_id: id, type: 'observation', text: evidenceText.trim(), date: now.split('T')[0], source: data.created_by }
    await supabase.from('evidence').insert(ev)
    evidenceRows.push(ev)
  }

  return normaliseRule(data, evidenceRows.map(e => ({ ...e, parent_id: id })), [{ ...versionRow, target_id: id }], [])
}

export async function createAssertion({ title, category, processArea, scope, confidence, status, tags, evidenceText, createdBy }) {
  const id = await nextId('assertions', 'A')
  const { data, error } = await supabase
    .from('assertions')
    .insert({
      id,
      plant_id: PLANT_ID(),
      title,
      category: category || 'Process',
      process_area: processArea || '',
      scope: scope || '',
      confidence: confidence || 'Medium',
      status: status || 'Proposed',
      tags: tags || [],
      created_by: createdBy || getDisplayName(),
    })
    .select()
    .single()
  if (error) throw new Error(error.message)

  const now = data.created_at
  const versionRow = { target_id: id, version_num: 1, date: now, author: data.created_by, change_note: 'Initial version', snapshot_title: title }
  await supabase.from('versions').insert({ target_type: 'assertion', ...versionRow })

  const evidenceRows = []
  if (evidenceText?.trim()) {
    const ev = { parent_type: 'assertion', parent_id: id, type: 'observation', text: evidenceText.trim(), date: now.split('T')[0], source: data.created_by }
    await supabase.from('evidence').insert(ev)
    evidenceRows.push(ev)
  }

  return normaliseAssertion(data, evidenceRows.map(e => ({ ...e, parent_id: id })), [{ ...versionRow, target_id: id }], [])
}

// ─── Update rule / assertion ──────────────────────────────────────────────────

async function nextVersionNum(targetType, targetId) {
  const { data } = await supabase
    .from('versions')
    .select('version_num')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('version_num', { ascending: false })
    .limit(1)
    .single()
  return (data?.version_num || 0) + 1
}

export async function updateRule(id, { title, category, processArea, scope, rationale, confidence, status, tags, changeNote, author }) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('rules')
    .update({ title, category, process_area: processArea, scope: scope || '', rationale: rationale || '', confidence, status, tags: tags || [], updated_at: now })
    .eq('id', id)
  if (error) throw new Error(error.message)

  const versionNum = await nextVersionNum('rule', id)
  await supabase.from('versions').insert({
    target_type: 'rule', target_id: id, version_num: versionNum,
    date: now, author: author || getDisplayName(),
    change_note: changeNote || 'Updated', snapshot_title: title,
  })
  return { version: versionNum, date: now, author: author || getDisplayName(), change: changeNote || 'Updated', snapshot: title }
}

export async function updateAssertion(id, { title, category, processArea, scope, confidence, status, tags, changeNote, author }) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('assertions')
    .update({ title, category, process_area: processArea, scope: scope || '', confidence, status, tags: tags || [], updated_at: now })
    .eq('id', id)
  if (error) throw new Error(error.message)

  const versionNum = await nextVersionNum('assertion', id)
  await supabase.from('versions').insert({
    target_type: 'assertion', target_id: id, version_num: versionNum,
    date: now, author: author || getDisplayName(),
    change_note: changeNote || 'Updated', snapshot_title: title,
  })
  return { version: versionNum, date: now, author: author || getDisplayName(), change: changeNote || 'Updated', snapshot: title }
}

// ─── Plant vocabulary (dynamic process areas + categories) ───────────────────
// Merges plant.process_areas with unique values from rules, assertions, events.
// Call with the activePlantId and the membership's processAreas array.

export async function fetchVocabulary(plantId, plantProcessAreas = []) {
  if (!plantId) return { processAreas: [], categories: [] }
  const [rulesRes, assertRes, eventsRes] = await Promise.all([
    supabase.from('rules').select('process_area, category').eq('plant_id', plantId),
    supabase.from('assertions').select('process_area, category').eq('plant_id', plantId),
    supabase.from('events').select('process_area').eq('plant_id', plantId),
  ])

  const paSet = new Set(plantProcessAreas.filter(Boolean))
  const catSet = new Set()

  ;(rulesRes.data || []).forEach(r => {
    if (r.process_area) paSet.add(r.process_area)
    if (r.category) catSet.add(r.category)
  })
  ;(assertRes.data || []).forEach(a => {
    if (a.process_area) paSet.add(a.process_area)
    if (a.category) catSet.add(a.category)
  })
  ;(eventsRes.data || []).forEach(e => {
    if (e.process_area) paSet.add(e.process_area)
  })

  return {
    processAreas: [...paSet].sort(),
    categories: [...catSet].sort(),
  }
}

// Fetch candidate links to suggest when user opens the link editor.
// Returns up to 5 items from the same process area, sorted by same-category first.
export async function fetchSuggestedLinks(sourceType, sourceId, processArea, category) {
  if (!processArea) return []
  const [rulesRes, assertRes] = await Promise.all([
    supabase.from('rules').select('id, title, process_area, category').eq('plant_id', PLANT_ID()).eq('process_area', processArea).limit(15),
    supabase.from('assertions').select('id, title, process_area, category').eq('plant_id', PLANT_ID()).eq('process_area', processArea).limit(15),
  ])
  const items = [
    ...(rulesRes.data || []).map(r => ({ id: r.id, type: 'rule', title: r.title, processArea: r.process_area, category: r.category })),
    ...(assertRes.data || []).map(a => ({ id: a.id, type: 'assertion', title: a.title, processArea: a.process_area, category: a.category })),
  ].filter(x => !(x.type === sourceType && x.id === sourceId))
  items.sort((a, b) => {
    const am = (a.category || '') === (category || ''), bm = (b.category || '') === (category || '')
    return am === bm ? 0 : am ? -1 : 1
  })
  return items.slice(0, 5)
}
