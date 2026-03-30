import { supabase } from './supabase.js'
import { getPlantId, getDisplayName, getUserId } from './userContext.js'
import { INITIAL_RULES, INITIAL_ASSERTIONS, INITIAL_EVENTS, INITIAL_QUESTIONS } from './data.js'

// ─── Display name resolution ──────────────────────────────────────────────────
// created_by / by / asked_by etc. fields store user UUIDs. This layer
// resolves them to current display_names for rendering, with an in-memory cache.

const _nameCache = new Map()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUUID(s) { return typeof s === 'string' && UUID_RE.test(s) }

// Batch-fetches display names for an array of ids. Returns a resolver function.
// Non-UUID values (legacy display names) are returned as-is.
async function makeNameResolver(ids) {
  const toFetch = [...new Set(ids.filter(id => isUUID(id) && !_nameCache.has(id)))]
  if (toFetch.length > 0) {
    const { data } = await supabase.from('profiles').select('user_id, display_name').in('user_id', toFetch)
    for (const p of (data || [])) _nameCache.set(p.user_id, p.display_name || p.user_id)
    for (const id of toFetch) { if (!_nameCache.has(id)) _nameCache.set(id, id) }
  }
  return (id) => {
    if (!id) return id
    if (isUUID(id)) return _nameCache.get(id) || id
    return id // already a display name (legacy data) — return as-is
  }
}

// Dynamic plant ID from authenticated user context.
// Returns null when no plant is active — callers MUST guard against this before inserting.
// The old fallback to 'bbbbbbbb-...' was the root cause of cross-plant data contamination.
const PLANT_ID = () => {
  const id = getPlantId() || import.meta.env.VITE_PLANT_ID || null
  if (!id) console.error('[PLANT_ID] called with no active plant — operation will be blocked')
  return id
}
const DEMO_PLANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

// ─── Notification helpers (internal) ─────────────────────────────────────────

// Insert a notification for a specific user (by user_id, not display name).
async function notifyUser(userId, plantId, text, targetView, targetId, excludeUserId) {
  if (!userId || userId === excludeUserId) return
  await supabase.from('notifications').insert({
    user_id: userId,
    plant_id: plantId,
    text,
    read: false,
    target_view: targetView,
    target_id: targetId,
  })
}

// Look up the creator of a rule/assertion/event (stored as user_id) and notify them.
async function notifyCreatorOf(targetType, itemId, plantId, text, targetView) {
  const table = targetType === 'rule' ? 'rules' : targetType === 'assertion' ? 'assertions' : 'events'
  const field = targetType === 'event' ? 'reported_by' : 'created_by'
  const { data: item } = await supabase.from(table).select(field).eq('id', itemId).maybeSingle()
  if (!item?.[field]) return
  await notifyUser(item[field], plantId, text, targetView, itemId, getUserId())
}

// ─── Notification public API ──────────────────────────────────────────────────

export async function fetchNotifications(userId, plantId) {
  if (!userId) return []
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (plantId) query = query.eq('plant_id', plantId)
  const { data } = await query
  return (data || []).map(n => ({
    id: n.id,
    text: n.text,
    date: n.created_at,
    read: n.read,
    target: { view: n.target_view, id: n.target_id },
  }))
}

export async function markNotificationRead(notifId) {
  await supabase.from('notifications').update({ read: true }).eq('id', notifId)
}

export async function markAllNotificationsRead(userId, plantId) {
  let query = supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false)
  if (plantId) query = query.eq('plant_id', plantId)
  await query
}

// ─── Normalise snake_case Supabase rows → camelCase prototype shape ───────────

function normaliseRule(r, evidence = [], versions = [], linkedAssertions = [], resolve = x => x) {
  return {
    id: r.id,
    displayId: r.display_id || r.id,
    title: r.title,
    type: 'rule',
    status: r.status,
    category: r.category,
    processArea: r.process_area,
    scope: r.scope,
    rationale: r.rationale,
    tags: r.tags || [],
    createdBy: resolve(r.created_by),
    createdById: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    photos: r.photos || [],
    evidence: evidence
      .filter(e => e.parent_id === r.id)
      .map(e => ({ type: e.type, text: e.text, date: e.date })),
    versions: versions
      .filter(v => v.target_id === r.id)
      .sort((a, b) => a.version_num - b.version_num)
      .map(v => ({ version: v.version_num, date: v.date, author: resolve(v.author), change: v.change_note, snapshot: v.snapshot_title })),
    linkedAssertions,
  }
}

function normaliseAssertion(a, evidence = [], versions = [], linkedRules = [], resolve = x => x) {
  return {
    id: a.id,
    displayId: a.display_id || a.id,
    title: a.title,
    type: 'assertion',
    status: a.status,
    category: a.category,
    processArea: a.process_area,
    scope: a.scope,
    tags: a.tags || [],
    photos: a.photos || [],
    createdBy: resolve(a.created_by),
    createdById: a.created_by,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    evidence: evidence
      .filter(e => e.parent_id === a.id)
      .map(e => ({ type: e.type, text: e.text, date: e.date })),
    versions: versions
      .filter(v => v.target_id === a.id)
      .sort((a, b) => a.version_num - b.version_num)
      .map(v => ({ version: v.version_num, date: v.date, author: resolve(v.author), change: v.change_note, snapshot: v.snapshot_title })),
    linkedRules,
  }
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export async function fetchRules() {
  const pid = PLANT_ID()
  const t0 = Date.now()
  console.log('[fetchRules] plant_id:', pid)
  const rulesRes = await supabase.from('rules').select('*').eq('plant_id', pid).order('created_at', { ascending: false })
  console.log('[fetchRules] main query:', Date.now() - t0, 'ms, rows:', rulesRes.data?.length ?? 0, rulesRes.error?.message ?? '')
  if (!rulesRes.data?.length) {
    if (pid === DEMO_PLANT_ID) {
      console.warn('[fetchRules] EAF demo plant returned empty — using seed data fallback')
      return INITIAL_RULES
    }
    return []
  }

  const ruleIds = rulesRes.data.map(r => r.id)
  const t1 = Date.now()
  const idList = ruleIds.join(',')
  const [evidenceRes, versionsRes, linksRes, contradictSrcRes, contradictTgtRes] = await Promise.all([
    supabase.from('evidence').select('*').eq('parent_type', 'rule').in('parent_id', ruleIds),
    supabase.from('versions').select('*').eq('target_type', 'rule').in('target_id', ruleIds),
    supabase.from('links').select('source_id, target_id').eq('source_type', 'rule').eq('target_type', 'assertion').in('source_id', ruleIds),
    supabase.from('links').select('source_id').eq('relationship_type', 'contradicts').in('source_id', ruleIds),
    supabase.from('links').select('target_id').eq('relationship_type', 'contradicts').in('target_id', ruleIds),
  ])
  console.log('[fetchRules] evidence+versions+links:', Date.now() - t1, 'ms')

  const linksBySource = {}
  linksRes.data?.forEach(l => {
    if (!linksBySource[l.source_id]) linksBySource[l.source_id] = []
    linksBySource[l.source_id].push(l.target_id)
  })

  const contradictedIds = new Set([
    ...(contradictSrcRes.data || []).map(l => l.source_id),
    ...(contradictTgtRes.data || []).map(l => l.target_id),
  ])

  const resolve = await makeNameResolver([
    ...rulesRes.data.map(r => r.created_by),
    ...(versionsRes.data || []).map(v => v.author),
  ])

  return rulesRes.data.map(r => ({
    ...normaliseRule(r, evidenceRes.data || [], versionsRes.data || [], linksBySource[r.id] || [], resolve),
    isContradicted: contradictedIds.has(r.id),
  }))
}

// ─── Assertions ───────────────────────────────────────────────────────────────

export async function fetchAssertions() {
  const pid = PLANT_ID()
  console.log('[fetchAssertions] plant_id:', pid)
  const assertRes = await supabase.from('assertions').select('*').eq('plant_id', pid).order('created_at', { ascending: false })
  if (!assertRes.data?.length) {
    if (pid === DEMO_PLANT_ID) {
      console.warn('[fetchAssertions] EAF demo plant returned empty — using seed data fallback')
      return INITIAL_ASSERTIONS
    }
    return []
  }

  const assertionIds = assertRes.data.map(a => a.id)
  const [evidenceRes, versionsRes, linksRes, contradictSrcRes, contradictTgtRes] = await Promise.all([
    supabase.from('evidence').select('*').eq('parent_type', 'assertion').in('parent_id', assertionIds),
    supabase.from('versions').select('*').eq('target_type', 'assertion').in('target_id', assertionIds),
    supabase.from('links').select('source_id, target_id').eq('source_type', 'rule').eq('target_type', 'assertion').in('target_id', assertionIds),
    supabase.from('links').select('source_id').eq('relationship_type', 'contradicts').in('source_id', assertionIds),
    supabase.from('links').select('target_id').eq('relationship_type', 'contradicts').in('target_id', assertionIds),
  ])

  // Build reverse map: assertion_id → rule_ids
  const linkedRulesMap = {}
  linksRes.data?.forEach(l => {
    if (!linkedRulesMap[l.target_id]) linkedRulesMap[l.target_id] = []
    linkedRulesMap[l.target_id].push(l.source_id)
  })

  const contradictedIds = new Set([
    ...(contradictSrcRes.data || []).map(l => l.source_id),
    ...(contradictTgtRes.data || []).map(l => l.target_id),
  ])

  const resolve = await makeNameResolver([
    ...assertRes.data.map(a => a.created_by),
    ...(versionsRes.data || []).map(v => v.author),
  ])

  return assertRes.data.map(a => ({
    ...normaliseAssertion(a, evidenceRes.data || [], versionsRes.data || [], linkedRulesMap[a.id] || [], resolve),
    isContradicted: contradictedIds.has(a.id),
  }))
}

// ─── Comments (keyed by target_id) ───────────────────────────────────────────

export async function fetchComments(targetType, itemIds) {
  if (!itemIds?.length) return {}
  const { data } = await supabase
    .from('comments')
    .select('*')
    .eq('target_type', targetType)
    .in('target_id', itemIds)
    .order('created_at')

  if (!data?.length) return {}
  const resolve = await makeNameResolver(data.map(c => c.by))
  const map = {}
  data.forEach(c => {
    if (!map[c.target_id]) map[c.target_id] = []
    map[c.target_id].push({ by: resolve(c.by), text: c.text, date: c.created_at })
  })
  return map
}

// ─── Verifications (keyed by target_id, array of names) ──────────────────────

export async function fetchVerifications(targetType, itemIds) {
  if (!itemIds?.length) return {}
  const { data } = await supabase
    .from('verifications')
    .select('*')
    .eq('target_type', targetType)
    .in('target_id', itemIds)

  if (!data?.length) return {}
  const resolve = await makeNameResolver(data.map(v => v.verified_by))
  const map = {}
  data.forEach(v => {
    if (!map[v.target_id]) map[v.target_id] = []
    map[v.target_id].push(resolve(v.verified_by))
  })
  return map
}

// ─── Events ───────────────────────────────────────────────────────────────────

function normaliseEvent(e, resolve = x => x) {
  return {
    id: e.id,
    displayId: e.display_id || e.id,
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
    reportedBy: resolve(e.reported_by),
    taggedPeople: e.tagged_people || [],
    tags: e.tags || [],
    createdAt: e.created_at,
  }
}

export async function fetchEvents() {
  const pid = PLANT_ID()
  console.log('[fetchEvents] plant_id:', pid)
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('plant_id', pid)
    .order('date', { ascending: false })

  if (!data?.length) {
    if (pid === DEMO_PLANT_ID) {
      console.warn('[fetchEvents] demo plant returned empty — using seed data fallback')
      return INITIAL_EVENTS
    }
    return []
  }
  const resolve = await makeNameResolver(data.map(e => e.reported_by))
  return data.map(e => normaliseEvent(e, resolve))
}

export async function addEvent(ev) {
  const pid = PLANT_ID()
  if (!pid) return null
  const id = randomId('E')
  const display_id = await generateDisplayId(pid, 'event')
  const { data, error } = await supabase
    .from('events')
    .insert({
      id,
      display_id,
      plant_id: pid,
      title: ev.title,
      outcome: ev.outcome,
      impact: ev.impact,
      status: ev.status || 'Open',
      process_area: ev.processArea,
      date: ev.date,
      description: ev.description,
      root_cause: ev.ishikawa || {},
      resolution: ev.resolution,
      reported_by: getUserId(),
      tagged_people: ev.taggedPeople || [],
      tags: ev.tags || [],
    })
    .select()
    .single()

  if (error) {
    console.error('[addEvent] insert failed:', error.message)
    return null
  }
  const resolve = await makeNameResolver([data.reported_by])
  return normaliseEvent(data, resolve)
}

// ─── Per-item fetch — used by Comments / Verifications components ─────────────

export async function fetchItemComments(targetType, targetId) {
  const { data } = await supabase
    .from('comments')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at')

  if (!data?.length) return []
  const resolve = await makeNameResolver(data.map(c => c.by))
  return data.map(c => ({ by: resolve(c.by), text: c.text, date: c.created_at }))
}

export async function fetchItemVerifications(targetType, targetId) {
  const { data } = await supabase
    .from('verifications')
    .select('verified_by')
    .eq('target_type', targetType)
    .eq('target_id', targetId)

  if (!data?.length) return []
  const resolve = await makeNameResolver(data.map(v => v.verified_by))
  return data.map(v => resolve(v.verified_by))
}

// ─── Persist a new comment to Supabase ───────────────────────────────────────

export async function addComment(targetType, targetId, text, displayId) {
  const userId = getUserId()
  const { data, error } = await supabase
    .from('comments')
    .insert({ target_type: targetType, target_id: targetId, text, by: userId })
    .select()
    .single()

  if (error) {
    console.error('[addComment] insert failed:', error.message)
    return null
  }

  const displayName = getDisplayName() || userId
  const preview = text.length > 60 ? text.slice(0, 57) + '…' : text
  const label = displayId || targetId
  const view = targetType === 'event' ? 'events' : targetType + 's'
  notifyCreatorOf(targetType, targetId, PLANT_ID(), `${displayName} commented on ${label}: "${preview}"`, view)
    .catch(e => console.warn('[addComment] notification failed:', e.message))

  return { by: displayName, text: data.text, date: data.created_at }
}

// ─── Persist a verification ───────────────────────────────────────────────────

const VERIFICATION_THRESHOLDS = [
  { count: 1,  fromStatus: 'Proposed', toStatus: 'Active' },
  { count: 5,  fromStatus: 'Active',   toStatus: 'Verified' },
  { count: 20, fromStatus: 'Verified', toStatus: 'Established' },
]

export async function addVerification(targetType, targetId, displayId) {
  const userId = getUserId()
  const { error } = await supabase
    .from('verifications')
    .upsert({ target_type: targetType, target_id: targetId, verified_by: userId })
  if (error) {
    console.error('[addVerification] upsert failed:', error.message, { targetType, targetId })
    return
  }

  const displayName = getDisplayName() || userId
  const label = displayId || targetId
  const view = targetType + 's'
  notifyCreatorOf(targetType, targetId, PLANT_ID(), `${displayName} verified ${label} from experience`, view)
    .catch(e => console.warn('[addVerification] notification failed:', e.message))

  // ── Auto-promote status based on verification count ──────────────────────
  const table = targetType === 'rule' ? 'rules' : 'assertions'
  const { data: item } = await supabase
    .from(table)
    .select('id, title, status, created_by, display_id')
    .eq('id', targetId)
    .maybeSingle()
  if (!item) return

  const { count } = await supabase
    .from('verifications')
    .select('id', { count: 'exact', head: true })
    .eq('target_type', targetType)
    .eq('target_id', targetId)
  if (!count) return

  const threshold = VERIFICATION_THRESHOLDS.find(
    t => t.count === count && t.fromStatus === item.status
  )
  if (!threshold) return

  const now = new Date().toISOString()
  const changeNote = `Status automatically promoted to ${threshold.toStatus} after ${count} verification${count === 1 ? '' : 's'}`

  await supabase
    .from(table)
    .update({ status: threshold.toStatus, updated_at: now })
    .eq('id', targetId)

  const versionNum = await nextVersionNum(targetType, targetId)
  await supabase.from('versions').insert({
    target_type: targetType, target_id: targetId, version_num: versionNum,
    date: now, author: 'system',
    change_note: changeNote, snapshot_title: item.title,
  })

  if (item.created_by) {
    const itemLabel = targetType === 'rule' ? 'Rule' : 'Assertion'
    notifyUser(
      item.created_by,
      PLANT_ID(),
      `Your ${itemLabel} ${item.display_id || targetId} has been promoted to ${threshold.toStatus} status after ${count} verification${count === 1 ? '' : 's'}`,
      view,
      targetId,
      userId,
    ).catch(e => console.warn('[addVerification] promotion notification failed:', e.message))
  }

  console.log(`[addVerification] ${targetId} auto-promoted to ${threshold.toStatus} (${count} verifications)`)
}

// ─── Questions ────────────────────────────────────────────────────────────────

function normaliseQuestion(q, resolve = x => x) {
  return {
    id: q.id,
    displayId: q.display_id || q.id,
    question: q.question,
    detail: q.detail,
    processArea: q.process_area,
    askedBy: resolve(q.asked_by),
    askedAt: q.created_at,
    status: q.status,
    responses: [],
    generatedRules: [],
    generatedAssertions: [],
    taggedPeople: q.tagged_people || [],
  }
}

export async function fetchQuestions() {
  const pid = PLANT_ID()
  console.log('[fetchQuestions] plant_id:', pid)
  const { data } = await supabase
    .from('questions')
    .select('*')
    .eq('plant_id', pid)
    .order('created_at', { ascending: false })

  if (!data?.length) {
    if (pid === DEMO_PLANT_ID) {
      console.warn('[fetchQuestions] demo plant returned empty — using seed data fallback')
      return INITIAL_QUESTIONS
    }
    return []
  }
  const resolve = await makeNameResolver(data.map(q => q.asked_by))
  return data.map(q => normaliseQuestion(q, resolve))
}

export async function addQuestion(q) {
  const pid = PLANT_ID()
  if (!pid) return null
  const id = randomId('Q')
  const display_id = await generateDisplayId(pid, 'question')
  const { data, error } = await supabase
    .from('questions')
    .insert({
      id,
      display_id,
      plant_id: pid,
      question: q.question,
      detail: q.detail || '',
      process_area: q.processArea || '',
      asked_by: getUserId(),
      status: 'open',
      tagged_people: q.taggedPeople || [],
    })
    .select()
    .single()

  if (error) {
    console.error('[addQuestion] insert failed:', error.message)
    return null
  }
  const resolve = await makeNameResolver([data.asked_by])
  return normaliseQuestion(data, resolve)
}

export async function updateQuestionStatus(questionId, status) {
  const { error } = await supabase
    .from('questions')
    .update({ status })
    .eq('id', questionId)
  if (error) console.error('[updateQuestionStatus] failed:', error.message)
}

export async function saveResponse(questionId, text, parentId) {
  const userId = getUserId()
  const { data, error } = await supabase
    .from('responses')
    .insert({ question_id: questionId, text, by: userId, parent_id: parentId || null })
    .select()
    .single()
  if (error) {
    console.error('[saveResponse] insert failed:', error.message)
    return null
  }

  const displayName = getDisplayName() || userId
  // Notify question asker
  const { data: q } = await supabase.from('questions').select('asked_by, display_id').eq('id', questionId).maybeSingle()
  if (q?.asked_by) {
    const qLabel = q.display_id || questionId
    notifyUser(q.asked_by, PLANT_ID(), `${displayName} answered your question ${qLabel}`, 'questions', questionId, userId)
      .catch(e => console.warn('[saveResponse] notification failed:', e.message))
  }

  return { id: data.id, by: displayName, text: data.text, date: data.created_at, replyTo: data.parent_id }
}

export async function fetchResponses(questionId) {
  const { data } = await supabase
    .from('responses')
    .select('*')
    .eq('question_id', questionId)
    .order('created_at')
  if (!data?.length) return []
  const resolve = await makeNameResolver(data.map(r => r.by))
  return data.map(r => ({ id: r.id, by: resolve(r.by), text: r.text, date: r.created_at, replyTo: r.parent_id }))
}

// ─── Links ────────────────────────────────────────────────────────────────────

// Returns all links involving this item (bidirectional), with resolved titles.
export async function fetchLinks(itemType, itemId) {
  const [srcRes, tgtRes] = await Promise.all([
    supabase.from('links').select('*').eq('source_type', itemType).eq('source_id', itemId),
    supabase.from('links').select('*').eq('target_type', itemType).eq('target_id', itemId),
  ])
  const error = srcRes.error || tgtRes.error
  if (error) { console.error('[fetchLinks] error:', error.message); return [] }
  const seen = new Set()
  const data = []
  for (const row of [...(srcRes.data || []), ...(tgtRes.data || [])]) {
    if (!seen.has(row.id)) { seen.add(row.id); data.push(row) }
  }
  if (!data.length) return []

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

  const _pid = PLANT_ID()
  const [rulesRes, assertRes] = await Promise.all([
    ruleIds.size      ? supabase.from('rules').select('id, display_id, title, process_area').eq('plant_id', _pid).in('id', [...ruleIds])      : { data: [] },
    assertionIds.size ? supabase.from('assertions').select('id, display_id, title, process_area').eq('plant_id', _pid).in('id', [...assertionIds]) : { data: [] },
  ])

  const titleMap = {}
  ;(rulesRes.data || []).forEach(r => { titleMap[r.id] = { title: r.title, processArea: r.process_area, displayId: r.display_id || r.id } })
  ;(assertRes.data || []).forEach(a => { titleMap[a.id] = { title: a.title, processArea: a.process_area, displayId: a.display_id || a.id } })

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
      linkedDisplayId: meta.displayId || linkedId,
      linkedTitle:    meta.title || linkedId,
      linkedProcessArea: meta.processArea || '',
      _raw: { source_type: l.source_type, source_id: l.source_id, target_type: l.target_type, target_id: l.target_id, relationship_type: l.relationship_type },
    }
  })
}

export async function saveLink(sourceType, sourceId, targetType, targetId, relType, comment) {
  const userId = getUserId()
  const payload = {
    source_type: sourceType,
    source_id: sourceId,
    target_type: targetType,
    target_id: targetId,
    relationship_type: relType || 'relates_to',
    comment: comment || null,
    created_by: userId,
  }
  const { error } = await supabase
    .from('links')
    .upsert(payload, { onConflict: 'source_type,source_id,target_type,target_id,relationship_type' })

  if (error) {
    console.error('[saveLink] failed:', error.message)
    return false
  }

  if (relType === 'contradicts') {
    await handleContradictLink(sourceType, sourceId, targetType, targetId)
  }

  return true
}

async function handleContradictLink(sourceType, sourceId, targetType, targetId) {
  const srcTable = sourceType === 'rule' ? 'rules' : 'assertions'
  const tgtTable = targetType === 'rule' ? 'rules' : 'assertions'

  // Notify both authors — governance status is preserved; contradiction is tracked via the link
  // Notify both authors — created_by already stores user UUIDs
  const [srcRes, tgtRes] = await Promise.all([
    supabase.from(srcTable).select('created_by').eq('id', sourceId).single(),
    supabase.from(tgtTable).select('created_by').eq('id', targetId).single(),
  ])
  const authorIds = [...new Set([srcRes.data?.created_by, tgtRes.data?.created_by].filter(Boolean))]
  if (!authorIds.length) return

  const currentUserId = getUserId()
  const plant = PLANT_ID()
  const notifText = `${sourceId} has been flagged as contradicting ${targetId} — review needed`
  const targetView = sourceType === 'rule' ? 'rules' : 'assertions'

  await Promise.all(
    authorIds
      .filter(id => id !== currentUserId)
      .map(userId => notifyUser(userId, plant, notifText, targetView, sourceId, currentUserId))
  )
}

// Returns all explicit contradicts links for this plant, with both items resolved.
export async function fetchContradictions() {
  const pid = PLANT_ID()
  if (!pid) return []

  // Pre-fetch all item IDs for this plant so we can scope the links query
  const [plantRulesRes, plantAssertRes] = await Promise.all([
    supabase.from('rules').select('id').eq('plant_id', pid),
    supabase.from('assertions').select('id').eq('plant_id', pid),
  ])
  const plantItemIds = [
    ...(plantRulesRes.data || []).map(r => r.id),
    ...(plantAssertRes.data || []).map(a => a.id),
  ]
  if (!plantItemIds.length) return []

  const { data: links, error } = await supabase
    .from('links')
    .select('id, source_type, source_id, target_type, target_id, created_by, created_at')
    .eq('relationship_type', 'contradicts')
    .in('source_id', plantItemIds)
    .order('created_at', { ascending: false })

  if (error || !links?.length) return []

  const ruleIds = new Set()
  const assertionIds = new Set()
  links.forEach(l => {
    if (l.source_type === 'rule') ruleIds.add(l.source_id)
    if (l.target_type === 'rule') ruleIds.add(l.target_id)
    if (l.source_type === 'assertion') assertionIds.add(l.source_id)
    if (l.target_type === 'assertion') assertionIds.add(l.target_id)
  })

  const [rulesRes, assertRes] = await Promise.all([
    ruleIds.size
      ? supabase.from('rules').select('id, display_id, title, process_area, status').eq('plant_id', PLANT_ID()).in('id', [...ruleIds])
      : { data: [] },
    assertionIds.size
      ? supabase.from('assertions').select('id, display_id, title, process_area, status').eq('plant_id', PLANT_ID()).in('id', [...assertionIds])
      : { data: [] },
  ])

  const itemMap = {}
  ;(rulesRes.data || []).forEach(r => { itemMap[r.id] = { id: r.id, displayId: r.display_id || r.id, type: 'rule', title: r.title, processArea: r.process_area, status: r.status } })
  ;(assertRes.data || []).forEach(a => { itemMap[a.id] = { id: a.id, displayId: a.display_id || a.id, type: 'assertion', title: a.title, processArea: a.process_area, status: a.status } })

  // Only return pairs where both items belong to this plant
  return links
    .filter(l => itemMap[l.source_id] && itemMap[l.target_id])
    .map(l => ({
      id: l.id,
      itemA: itemMap[l.source_id],
      itemB: itemMap[l.target_id],
      flaggedBy: l.created_by,
      flaggedAt: l.created_at,
    }))
}

export async function deleteLink(linkId) {
  const { error } = await supabase.from('links').delete().eq('id', linkId)
  if (error) console.error('[deleteLink] failed:', error.message)
}

// Fetch all links for a set of item IDs (used by relationship graph)
export async function fetchAllLinksForGraph(itemIds) {
  if (!itemIds?.length) return []
  const [srcRes, tgtRes] = await Promise.all([
    supabase.from('links')
      .select('id, source_type, source_id, target_type, target_id, relationship_type, comment')
      .in('source_id', itemIds),
    supabase.from('links')
      .select('id, source_type, source_id, target_type, target_id, relationship_type, comment')
      .in('target_id', itemIds),
  ])
  const seen = new Set()
  const all = []
  for (const row of [...(srcRes.data || []), ...(tgtRes.data || [])]) {
    if (row.id && !seen.has(row.id)) { seen.add(row.id); all.push(row) }
  }
  return all
}

// Fetch derived_from link counts for a set of event IDs
// Returns: { [eventId]: { rules: number, assertions: number, total: number } }
export async function fetchEventKnowledgeCounts(eventIds) {
  if (!eventIds?.length) return {}
  const { data } = await supabase
    .from('links')
    .select('source_id, target_type')
    .eq('source_type', 'event')
    .eq('relationship_type', 'derived_from')
    .in('source_id', eventIds)

  const counts = {}
  ;(data || []).forEach(l => {
    if (!counts[l.source_id]) counts[l.source_id] = { rules: 0, assertions: 0, total: 0 }
    counts[l.source_id].total++
    if (l.target_type === 'rule') counts[l.source_id].rules++
    if (l.target_type === 'assertion') counts[l.source_id].assertions++
  })
  return counts
}

// Fetch all connected knowledge for an event:
// - derived: items linked via derived_from (generated by the interview)
// - explicit: items manually linked (other relationship types)
// - related: items found by keyword search against the event title/description
export async function fetchEventConnectedKnowledge(eventId, eventTitle, eventDescription) {
  const [srcRes, tgtRes] = await Promise.all([
    supabase.from('links').select('*').eq('source_type', 'event').eq('source_id', eventId),
    supabase.from('links').select('*').eq('target_type', 'event').eq('target_id', eventId),
  ])

  const allLinks = [...(srcRes.data || []), ...(tgtRes.data || [])]
  const ruleIds = new Set()
  const assertionIds = new Set()
  const linkMap = {}

  allLinks.forEach(l => {
    const isSource = l.source_type === 'event' && l.source_id === eventId
    const linkedType = isSource ? l.target_type : l.source_type
    const linkedId = isSource ? l.target_id : l.source_id
    if (linkedType === 'rule') ruleIds.add(linkedId)
    if (linkedType === 'assertion') assertionIds.add(linkedId)
    linkMap[`${linkedType}:${linkedId}`] = { relType: l.relationship_type, linkId: l.id }
  })

  const pid = PLANT_ID()
  const [rulesRes, assertRes] = await Promise.all([
    ruleIds.size ? supabase.from('rules').select('id, display_id, title, status, category, process_area').eq('plant_id', pid).in('id', [...ruleIds]) : { data: [] },
    assertionIds.size ? supabase.from('assertions').select('id, display_id, title, status, category, process_area').eq('plant_id', pid).in('id', [...assertionIds]) : { data: [] },
  ])

  const linkedItems = [
    ...(rulesRes.data || []).map(r => ({ id: r.id, displayId: r.display_id || r.id, type: 'rule', title: r.title, status: r.status, category: r.category, processArea: r.process_area, ...linkMap[`rule:${r.id}`] })),
    ...(assertRes.data || []).map(a => ({ id: a.id, displayId: a.display_id || a.id, type: 'assertion', title: a.title, status: a.status, category: a.category, processArea: a.process_area, ...linkMap[`assertion:${a.id}`] })),
  ]

  const derived = linkedItems.filter(x => x.relType === 'derived_from')
  const explicit = linkedItems.filter(x => x.relType !== 'derived_from')
  const linkedIds = new Set(linkedItems.map(x => x.id))

  // Keyword search for related items not already linked
  const allText = [eventTitle, eventDescription].filter(Boolean).join(' ')
  const keywords = allText.split(/\W+/).filter(w => w.length > 3).slice(0, 4)

  let related = []
  if (keywords.length > 0) {
    const orFilter = keywords.map(w => `title.ilike.%${w}%`).join(',')
    const [relR, relA] = await Promise.all([
      supabase.from('rules').select('id, display_id, title, status, category, process_area').eq('plant_id', PLANT_ID()).or(orFilter).limit(8),
      supabase.from('assertions').select('id, display_id, title, status, category, process_area').eq('plant_id', PLANT_ID()).or(orFilter).limit(8),
    ])
    related = [
      ...(relR.data || []).map(r => ({ id: r.id, displayId: r.display_id || r.id, type: 'rule', title: r.title, status: r.status, category: r.category, processArea: r.process_area })),
      ...(relA.data || []).map(a => ({ id: a.id, displayId: a.display_id || a.id, type: 'assertion', title: a.title, status: a.status, category: a.category, processArea: a.process_area })),
    ].filter(x => !linkedIds.has(x.id)).slice(0, 8)
  }

  return { derived, explicit, related }
}

// Search rules + assertions by title for the link editor
export async function searchKnowledge(query, excludeType, excludeId) {
  if (!query?.trim()) return []
  const q = query.trim()
  const [rulesRes, assertRes] = await Promise.all([
    supabase.from('rules').select('id, display_id, title, process_area').ilike('title', `%${q}%`).eq('plant_id', PLANT_ID()).limit(8),
    supabase.from('assertions').select('id, display_id, title, process_area').ilike('title', `%${q}%`).eq('plant_id', PLANT_ID()).limit(8),
  ])

  const rules = (rulesRes.data || []).map(r => ({ id: r.id, displayId: r.display_id || r.id, type: 'rule', title: r.title, processArea: r.process_area }))
  const assertions = (assertRes.data || []).map(a => ({ id: a.id, displayId: a.display_id || a.id, type: 'assertion', title: a.title, processArea: a.process_area }))
  return [...rules, ...assertions].filter(x => !(x.type === excludeType && x.id === excludeId))
}

// Fetch a single rule or assertion by type+id (for the cross-type detail modal)
export async function fetchItemById(type, id) {
  if (type === 'rule') {
    const [itemRes, evidenceRes, versionsRes] = await Promise.all([
      supabase.from('rules').select('*').eq('id', id).eq('plant_id', PLANT_ID()).single(),
      supabase.from('evidence').select('*').eq('parent_type', 'rule').eq('parent_id', id),
      supabase.from('versions').select('*').eq('target_type', 'rule').eq('target_id', id),
    ])
    if (!itemRes.data) return null
    const versionAuthors = (versionsRes.data || []).map(v => v.author)
    const resolve = await makeNameResolver([itemRes.data.created_by, ...versionAuthors])
    return normaliseRule(itemRes.data, evidenceRes.data || [], versionsRes.data || [], [], resolve)
  }
  if (type === 'assertion') {
    const [itemRes, evidenceRes, versionsRes] = await Promise.all([
      supabase.from('assertions').select('*').eq('id', id).eq('plant_id', PLANT_ID()).single(),
      supabase.from('evidence').select('*').eq('parent_type', 'assertion').eq('parent_id', id),
      supabase.from('versions').select('*').eq('target_type', 'assertion').eq('target_id', id),
    ])
    if (!itemRes.data) return null
    const versionAuthors = (versionsRes.data || []).map(v => v.author)
    const resolve = await makeNameResolver([itemRes.data.created_by, ...versionAuthors])
    return normaliseAssertion(itemRes.data, evidenceRes.data || [], versionsRes.data || [], [], resolve)
  }
  return null
}

// ─── Create rule/assertion from extraction ────────────────────────────────────

export async function addRuleFromExtraction(rule) {
  const pid = PLANT_ID()
  if (!pid) return null
  const id = randomId('R')
  const display_id = await generateDisplayId(pid, 'rule')
  const userId = getUserId()
  const { data, error } = await supabase
    .from('rules')
    .insert({
      id,
      display_id,
      plant_id: pid,
      title: rule.title,
      status: 'Proposed',
      category: rule.category || 'Process',
      process_area: rule.processArea,
      scope: '',
      rationale: rule.rationale || '',
      tags: rule.tags || [],
      created_by: userId,
    })
    .select()
    .single()
  if (error) { console.error('[addRuleFromExtraction] insert failed:', error.message); return null }
  const source = rule.captureSource || 'Extracted from Q&A'
  await Promise.all([
    supabase.from('versions').insert({
      target_type: 'rule', target_id: id, version_num: 1,
      date: data.created_at, author: userId,
      change_note: source, snapshot_title: rule.title,
    }),
    supabase.from('evidence').insert({
      parent_type: 'rule', parent_id: id, type: 'origin',
      text: source, date: data.created_at.split('T')[0], source: userId,
    }),
  ])
  const resolve = await makeNameResolver([userId])
  return normaliseRule(data, [], [], [], resolve)
}

export async function addAssertionFromExtraction(assertion) {
  const pid = PLANT_ID()
  if (!pid) return null
  const id = randomId('A')
  const display_id = await generateDisplayId(pid, 'assertion')
  const userId = getUserId()
  const { data, error } = await supabase
    .from('assertions')
    .insert({
      id,
      display_id,
      plant_id: pid,
      title: assertion.title,
      status: 'Proposed',
      category: assertion.category || 'Process',
      process_area: assertion.processArea,
      scope: '',
      tags: assertion.tags || [],
      created_by: userId,
    })
    .select()
    .single()
  if (error) { console.error('[addAssertionFromExtraction] insert failed:', error.message); return null }
  const source = assertion.captureSource || 'Extracted from Q&A'
  await Promise.all([
    supabase.from('versions').insert({
      target_type: 'assertion', target_id: id, version_num: 1,
      date: data.created_at, author: userId,
      change_note: source, snapshot_title: assertion.title,
    }),
    supabase.from('evidence').insert({
      parent_type: 'assertion', parent_id: id, type: 'origin',
      text: source, date: data.created_at.split('T')[0], source: userId,
    }),
  ])
  const resolve = await makeNameResolver([userId])
  return normaliseAssertion(data, [], [], [], resolve)
}

// ─── Create rule / assertion (from Add form) ──────────────────────────────────

// Generate a human-readable display_id via the DB sequence function.
// Returns e.g. "R-EAF-023". Falls back to null if the plant has no short_code yet.
async function generateDisplayId(plantId, type) {
  try {
    const { data, error } = await supabase.rpc('next_display_id', { p_plant_id: plantId, p_type: type })
    if (error) { console.warn('[generateDisplayId]', error.message); return null }
    return data
  } catch (e) { console.warn('[generateDisplayId]', e.message); return null }
}

// Generates a collision-proof ID like "R-a3f8b2".
// Uses crypto.getRandomValues for uniform distribution across 36^6 ≈ 2.2 billion possibilities.
function randomId(prefix) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  const suffix = Array.from(bytes, b => chars[b % chars.length]).join('')
  return `${prefix}-${suffix}`
}

export async function createRule({ title, category, processArea, scope, rationale, status, tags, evidenceText, captureSource, photos, plantId: explicitPlantId }) {
  const pid = explicitPlantId || PLANT_ID()
  if (!pid) throw new Error('No active plant — cannot create rule')
  const id = randomId('R')
  const display_id = await generateDisplayId(pid, 'rule')
  const userId = getUserId()
  const { data, error } = await supabase
    .from('rules')
    .insert({
      id,
      display_id,
      plant_id: pid,
      title,
      category: category || 'Process',
      process_area: processArea || '',
      scope: scope || '',
      rationale: rationale || '',
      status: status || 'Proposed',
      tags: tags || [],
      photos: photos || [],
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)

  const now = data.created_at
  const originText = captureSource || 'Manual addition'
  const versionRow = { target_id: id, version_num: 1, date: now, author: userId, change_note: 'Initial version', snapshot_title: title }

  const evidenceInserts = [
    { parent_type: 'rule', parent_id: id, type: 'origin', text: originText, date: now.split('T')[0], source: userId },
  ]
  if (evidenceText?.trim()) {
    evidenceInserts.push({ parent_type: 'rule', parent_id: id, type: 'observation', text: evidenceText.trim(), date: now.split('T')[0], source: userId })
  }

  await Promise.all([
    supabase.from('versions').insert({ target_type: 'rule', ...versionRow }),
    supabase.from('evidence').insert(evidenceInserts),
  ])

  const resolve = await makeNameResolver([userId])
  return normaliseRule(data, evidenceInserts.map(e => ({ ...e, parent_id: id })), [{ ...versionRow, target_id: id }], [], resolve)
}

export async function createAssertion({ title, category, processArea, scope, status, tags, evidenceText, captureSource, photos, plantId: explicitPlantId }) {
  const pid = explicitPlantId || PLANT_ID()
  if (!pid) throw new Error('No active plant — cannot create assertion')
  const id = randomId('A')
  const display_id = await generateDisplayId(pid, 'assertion')
  const userId = getUserId()
  const { data, error } = await supabase
    .from('assertions')
    .insert({
      id,
      display_id,
      plant_id: pid,
      title,
      category: category || 'Process',
      process_area: processArea || '',
      scope: scope || '',
      status: status || 'Proposed',
      tags: tags || [],
      photos: photos || [],
      created_by: userId,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)

  const now = data.created_at
  const originText = captureSource || 'Manual addition'
  const versionRow = { target_id: id, version_num: 1, date: now, author: userId, change_note: 'Initial version', snapshot_title: title }

  const evidenceInserts = [
    { parent_type: 'assertion', parent_id: id, type: 'origin', text: originText, date: now.split('T')[0], source: userId },
  ]
  if (evidenceText?.trim()) {
    evidenceInserts.push({ parent_type: 'assertion', parent_id: id, type: 'observation', text: evidenceText.trim(), date: now.split('T')[0], source: userId })
  }

  await Promise.all([
    supabase.from('versions').insert({ target_type: 'assertion', ...versionRow }),
    supabase.from('evidence').insert(evidenceInserts),
  ])

  const resolve = await makeNameResolver([userId])
  return normaliseAssertion(data, evidenceInserts.map(e => ({ ...e, parent_id: id })), [{ ...versionRow, target_id: id }], [], resolve)
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

export async function updateRule(id, { title, category, processArea, scope, rationale, status, tags, photos, changeNote }) {
  const { data: prev } = await supabase.from('rules').select('status, created_by, display_id').eq('id', id).maybeSingle()
  const userId = getUserId()

  const now = new Date().toISOString()
  const updatePayload = { title, category, process_area: processArea, scope: scope || '', rationale: rationale || '', status, tags: tags || [], updated_at: now }
  if (photos !== undefined) updatePayload.photos = photos
  const { error } = await supabase
    .from('rules')
    .update(updatePayload)
    .eq('id', id)
  if (error) throw new Error(error.message)

  if (prev && status && prev.status !== status && prev.created_by) {
    const label = prev.display_id || id
    notifyUser(prev.created_by, PLANT_ID(), `${label} status changed to ${status}`, 'rules', id, userId)
      .catch(e => console.warn('[updateRule] notification failed:', e.message))
  }

  const versionNum = await nextVersionNum('rule', id)
  await supabase.from('versions').insert({
    target_type: 'rule', target_id: id, version_num: versionNum,
    date: now, author: userId,
    change_note: changeNote || 'Updated', snapshot_title: title,
  })
  const displayName = getDisplayName() || userId
  return { version: versionNum, date: now, author: displayName, change: changeNote || 'Updated', snapshot: title }
}

export async function updateAssertion(id, { title, category, processArea, scope, status, tags, photos, changeNote }) {
  const { data: prev } = await supabase.from('assertions').select('status, created_by, display_id').eq('id', id).maybeSingle()
  const userId = getUserId()

  const now = new Date().toISOString()
  const updatePayload = { title, category, process_area: processArea, scope: scope || '', status, tags: tags || [], updated_at: now }
  if (photos !== undefined) updatePayload.photos = photos
  const { error } = await supabase
    .from('assertions')
    .update(updatePayload)
    .eq('id', id)
  if (error) throw new Error(error.message)

  if (prev && status && prev.status !== status && prev.created_by) {
    const label = prev.display_id || id
    notifyUser(prev.created_by, PLANT_ID(), `${label} status changed to ${status}`, 'assertions', id, userId)
      .catch(e => console.warn('[updateAssertion] notification failed:', e.message))
  }

  const versionNum = await nextVersionNum('assertion', id)
  await supabase.from('versions').insert({
    target_type: 'assertion', target_id: id, version_num: versionNum,
    date: now, author: userId,
    change_note: changeNote || 'Updated', snapshot_title: title,
  })
  const displayName = getDisplayName() || userId
  return { version: versionNum, date: now, author: displayName, change: changeNote || 'Updated', snapshot: title }
}

// ─── Archive (request / confirm / reject) ─────────────────────────────────────

export async function requestArchive(targetType, id, currentStatus, title, createdById) {
  const table = targetType === 'rule' ? 'rules' : 'assertions'
  const userId = getUserId()
  const now = new Date().toISOString()

  const isSelf = userId === createdById
  if (isSelf) {
    // Author is archiving their own item — retire immediately
    const { error } = await supabase.from(table).update({ status: 'Retired', updated_at: now }).eq('id', id)
    if (error) throw new Error(error.message)
    const versionNum = await nextVersionNum(targetType, id)
    await supabase.from('versions').insert({
      target_type: targetType, target_id: id, version_num: versionNum,
      date: now, author: userId, change_note: `Archived`, snapshot_title: title,
    })
    return { selfArchived: true }
  }

  // Requester is not the author — set to Pending Archive, notify creator
  const changeNote = `Pending archive (was: ${currentStatus})`
  const { error } = await supabase.from(table).update({ status: 'Pending Archive', updated_at: now }).eq('id', id)
  if (error) throw new Error(error.message)
  const versionNum = await nextVersionNum(targetType, id)
  await supabase.from('versions').insert({
    target_type: targetType, target_id: id, version_num: versionNum,
    date: now, author: userId, change_note: changeNote, snapshot_title: title,
  })
  const view = targetType === 'rule' ? 'rules' : 'assertions'
  const displayName = getDisplayName() || 'Someone'
  // Fetch display_id for notification text
  const { data: itemRow } = await supabase.from(table).select('display_id').eq('id', id).maybeSingle()
  const itemLabel = itemRow?.display_id || id
  await notifyUser(createdById, PLANT_ID(), `${displayName} has requested to archive ${itemLabel}: "${title}". Please confirm or reject.`, view, id, userId)
  return { selfArchived: false }
}

export async function confirmArchive(targetType, id, title) {
  const table = targetType === 'rule' ? 'rules' : 'assertions'
  const userId = getUserId()
  const now = new Date().toISOString()
  const { error } = await supabase.from(table).update({ status: 'Retired', updated_at: now }).eq('id', id)
  if (error) throw new Error(error.message)
  const versionNum = await nextVersionNum(targetType, id)
  await supabase.from('versions').insert({
    target_type: targetType, target_id: id, version_num: versionNum,
    date: now, author: userId, change_note: 'Archive confirmed', snapshot_title: title,
  })
}

export async function rejectArchive(targetType, id, title, versions) {
  const table = targetType === 'rule' ? 'rules' : 'assertions'
  const userId = getUserId()
  const now = new Date().toISOString()

  // Recover previous status from the version change_note "Pending archive (was: X)"
  const pendingVersion = [...versions].reverse().find(v => v.change?.startsWith('Pending archive (was:'))
  const prevStatus = pendingVersion?.change?.match(/was: ([^)]+)/)?.[1] || 'Active'

  const { error } = await supabase.from(table).update({ status: prevStatus, updated_at: now }).eq('id', id)
  if (error) throw new Error(error.message)
  const versionNum = await nextVersionNum(targetType, id)
  await supabase.from('versions').insert({
    target_type: targetType, target_id: id, version_num: versionNum,
    date: now, author: userId, change_note: `Archive rejected — restored to ${prevStatus}`, snapshot_title: title,
  })
  return prevStatus
}

// ─── Contribution counts (for summary bar) ───────────────────────────────────

export async function fetchContributionCounts(plantId) {
  if (!plantId) return { total: 0 }
  const [r, a, e, q] = await Promise.all([
    supabase.from('rules').select('id', { count: 'exact', head: true }).eq('plant_id', plantId),
    supabase.from('assertions').select('id', { count: 'exact', head: true }).eq('plant_id', plantId),
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('plant_id', plantId),
    supabase.from('questions').select('id', { count: 'exact', head: true }).eq('plant_id', plantId),
  ])
  return {
    rules: r.count || 0,
    assertions: a.count || 0,
    events: e.count || 0,
    questions: q.count || 0,
    total: (r.count || 0) + (a.count || 0) + (e.count || 0) + (q.count || 0),
  }
}

// ─── Update event ─────────────────────────────────────────────────────────────

export async function updateEvent(id, { title, processArea, impact, outcome, description, ishikawa, resolution, taggedPeople, tags, changeNote }) {
  const userId = getUserId()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('events')
    .update({
      title,
      process_area: processArea,
      impact,
      outcome,
      description: description || '',
      root_cause: ishikawa || {},
      resolution: resolution || '',
      tagged_people: taggedPeople || [],
      tags: tags || [],
      updated_at: now,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  const versionNum = await nextVersionNum('event', id)
  await supabase.from('versions').insert({
    target_type: 'event', target_id: id, version_num: versionNum,
    date: now, author: userId,
    change_note: changeNote || 'Updated', snapshot_title: title,
  })
}

export async function updateEventStatus(id, { status, resolution }) {
  const userId = getUserId()
  const now = new Date().toISOString()
  const updates = { status, updated_at: now }
  if (resolution !== undefined) updates.resolution = resolution

  const { error } = await supabase.from('events').update(updates).eq('id', id)
  if (error) throw new Error(error.message)

  const versionNum = await nextVersionNum('event', id)
  const note = status === 'Closed' ? 'Event closed' : `Status changed to ${status}`
  const { data: ev } = await supabase.from('events').select('title').eq('id', id).maybeSingle()
  await supabase.from('versions').insert({
    target_type: 'event', target_id: id, version_num: versionNum,
    date: now, author: userId,
    change_note: note, snapshot_title: ev?.title || id,
  })
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

// ─── Profile stats ────────────────────────────────────────────────────────────

export async function fetchProfileStats(userId, plantId) {
  const [
    rulesRes,
    assertRes,
    eventsRes,
    questionsRes,
    commentsRes,
    verificationsRes,
  ] = await Promise.all([
    supabase.from('rules').select('*', { count: 'exact', head: true }).eq('created_by', userId).eq('plant_id', plantId),
    supabase.from('assertions').select('*', { count: 'exact', head: true }).eq('created_by', userId).eq('plant_id', plantId),
    supabase.from('events').select('*', { count: 'exact', head: true }).eq('reported_by', userId).eq('plant_id', plantId),
    supabase.from('questions').select('*', { count: 'exact', head: true }).eq('asked_by', userId).eq('plant_id', plantId),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('by', userId),
    supabase.from('verifications').select('*', { count: 'exact', head: true }).eq('verified_by', userId),
  ])
  return {
    rules: rulesRes.count || 0,
    assertions: assertRes.count || 0,
    events: eventsRes.count || 0,
    questions: questionsRes.count || 0,
    comments: commentsRes.count || 0,
    verifications: verificationsRes.count || 0,
  }
}

export async function fetchRecentActivity(userId, plantId, limit = 8) {
  const [rulesRes, assertRes, eventsRes, questionsRes] = await Promise.all([
    supabase.from('rules').select('id, title, status, created_at').eq('created_by', userId).eq('plant_id', plantId).order('created_at', { ascending: false }).limit(limit),
    supabase.from('assertions').select('id, title, status, created_at').eq('created_by', userId).eq('plant_id', plantId).order('created_at', { ascending: false }).limit(limit),
    supabase.from('events').select('id, title, created_at').eq('reported_by', userId).eq('plant_id', plantId).order('created_at', { ascending: false }).limit(limit),
    supabase.from('questions').select('id, question, created_at').eq('asked_by', userId).eq('plant_id', plantId).order('created_at', { ascending: false }).limit(limit),
  ])
  const items = [
    ...(rulesRes.data || []).map(r => ({ type: 'rule', id: r.id, title: r.title, status: r.status, date: r.created_at })),
    ...(assertRes.data || []).map(a => ({ type: 'assertion', id: a.id, title: a.title, status: a.status, date: a.created_at })),
    ...(eventsRes.data || []).map(e => ({ type: 'event', id: e.id, title: e.title, date: e.created_at })),
    ...(questionsRes.data || []).map(q => ({ type: 'question', id: q.id, title: q.question, date: q.created_at })),
  ]
  return items.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit)
}

// Resolve a display name to a user UUID (used by UserProfileModal for legacy data)
export async function fetchUserIdByDisplayName(displayName, plantId) {
  const { data } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('display_name', displayName)
    .eq('plant_id', plantId)
    .maybeSingle()
  return data?.user_id || null
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

// ─── Profile update ───────────────────────────────────────────────────────────

export async function updateProfileDisplayName(userId, displayName) {
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName.trim() })
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

// ─── New-item counts for sidebar badges ──────────────────────────────────────
// Returns { rules: n, assertions: n, events: n, questions: n }
// Each count is the number of items created after the corresponding lastViewed timestamp.

export async function fetchNewCounts(plantId, lastViewed) {
  // lastViewed: { rules: iso | null, assertions: iso | null, events: iso | null, questions: iso | null }
  if (!plantId) return { rules: 0, assertions: 0, events: 0, questions: 0 }

  const since = (tab) => lastViewed?.[tab] || new Date(0).toISOString()

  const [r, a, e, q] = await Promise.all([
    supabase.from('rules').select('id', { count: 'exact', head: true }).eq('plant_id', plantId).gt('created_at', since('rules')),
    supabase.from('assertions').select('id', { count: 'exact', head: true }).eq('plant_id', plantId).gt('created_at', since('assertions')),
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('plant_id', plantId).gt('created_at', since('events')),
    supabase.from('questions').select('id', { count: 'exact', head: true }).eq('plant_id', plantId).gt('created_at', since('questions')),
  ])

  return {
    rules: r.count || 0,
    assertions: a.count || 0,
    events: e.count || 0,
    questions: q.count || 0,
  }
}

// ─── Plant members (for @mention typeahead) ───────────────────────────────────

export async function fetchPlantMembers() {
  const pid = PLANT_ID()
  if (!pid) return []
  // Join plant_memberships → profiles to get display names for all members of
  // this specific plant (profiles.plant_id is the primary plant and is unreliable
  // for multi-plant users).
  const { data } = await supabase
    .from('plant_memberships')
    .select('profiles!inner(display_name)')
    .eq('plant_id', pid)
    .order('profiles(display_name)')
  return (data || []).map(m => m.profiles?.display_name).filter(Boolean)
}

// ─── Capture context for interview edge function ──────────────────────────────
// Returns { gapsSummary, relevantRules } strings ready for template injection.

export async function fetchCaptureContext(plantId, processArea, topic) {
  if (!plantId) {
    return {
      gapsSummary: 'No gap information available.',
      relevantRules: 'No existing rules found for this topic.',
    }
  }

  const [rulesRes, assertRes] = await Promise.all([
    supabase.from('rules').select('id, display_id, title, process_area').eq('plant_id', plantId),
    supabase.from('assertions').select('id, display_id, title, process_area').eq('plant_id', plantId),
  ])

  const allItems = [
    ...(rulesRes.data || []).map(r => ({ id: r.id, displayId: r.display_id || r.id, title: r.title, processArea: r.process_area })),
    ...(assertRes.data || []).map(a => ({ id: a.id, displayId: a.display_id || a.id, title: a.title, processArea: a.process_area })),
  ]

  // ── Gaps summary ──────────────────────────────────────────────────────────
  const countsByArea = {}
  allItems.forEach(item => {
    const area = item.processArea || 'Unknown'
    countsByArea[area] = (countsByArea[area] || 0) + 1
  })

  let gapsSummary
  if (allItems.length === 0) {
    gapsSummary = 'No rules or assertions exist yet for this plant. Everything is a gap.'
  } else {
    const parts = []
    const focusCount = processArea ? (countsByArea[processArea] || 0) : null
    if (processArea) {
      parts.push(focusCount > 0
        ? `This plant has ${focusCount} item${focusCount !== 1 ? 's' : ''} about ${processArea}.`
        : `No rules or assertions exist yet for ${processArea}.`)
    }
    const sparse = Object.entries(countsByArea)
      .filter(([area, n]) => n < 5 && area !== processArea)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 4)
    if (sparse.length > 0) {
      parts.push(`Sparse areas: ${sparse.map(([area, n]) => `${area} (${n})`).join(', ')}.`)
    }
    gapsSummary = parts.join(' ') || `This plant has ${allItems.length} total items across ${Object.keys(countsByArea).length} process areas.`
  }

  // ── Relevant rules ────────────────────────────────────────────────────────
  const topicWords = (topic || '').toLowerCase().split(/\s+/).filter(w => w.length > 3)
  const areaItems = processArea
    ? allItems.filter(item => item.processArea === processArea)
    : allItems

  let ranked = areaItems
  if (topicWords.length > 0) {
    ranked = areaItems.map(item => {
      const text = (item.title || '').toLowerCase()
      const hits = topicWords.filter(w => text.includes(w)).length
      return { ...item, _score: hits }
    }).sort((a, b) => b._score - a._score)
  }

  const top = ranked.slice(0, 10)
  const relevantRules = top.length > 0
    ? top.map(item => `${item.displayId}: ${item.title}`).join('\n')
    : `No existing rules found for ${processArea || 'this topic'}.`

  return { gapsSummary, relevantRules }
}

// ─── Delete plant and all associated data ─────────────────────────────────────

export async function deletePlant(plantId) {
  // Collect all item IDs in this plant first
  const [rulesRes, assertRes, eventsRes, questionsRes] = await Promise.all([
    supabase.from('rules').select('id').eq('plant_id', plantId),
    supabase.from('assertions').select('id').eq('plant_id', plantId),
    supabase.from('events').select('id').eq('plant_id', plantId),
    supabase.from('questions').select('id').eq('plant_id', plantId),
  ])

  const ruleIds = (rulesRes.data || []).map(r => r.id)
  const assertionIds = (assertRes.data || []).map(a => a.id)
  const eventIds = (eventsRes.data || []).map(e => e.id)
  const questionIds = (questionsRes.data || []).map(q => q.id)
  const allItemIds = [...ruleIds, ...assertionIds, ...eventIds, ...questionIds]

  // Delete dependent data in parallel
  const deletes = []
  if (allItemIds.length) {
    deletes.push(
      supabase.from('links').delete().in('source_id', allItemIds),
      supabase.from('links').delete().in('target_id', allItemIds),
      supabase.from('comments').delete().in('target_id', allItemIds),
      supabase.from('versions').delete().in('target_id', allItemIds),
    )
  }
  if (ruleIds.length || assertionIds.length) {
    const raIds = [...ruleIds, ...assertionIds]
    deletes.push(
      supabase.from('verifications').delete().in('target_id', raIds),
      supabase.from('evidence').delete().in('parent_id', raIds),
    )
  }
  if (questionIds.length) {
    deletes.push(supabase.from('responses').delete().in('question_id', questionIds))
  }
  deletes.push(
    supabase.from('notifications').delete().eq('plant_id', plantId),
    supabase.from('plant_memberships').delete().eq('plant_id', plantId),
  )

  await Promise.all(deletes)

  // Delete the items themselves
  await Promise.all([
    ruleIds.length && supabase.from('rules').delete().eq('plant_id', plantId),
    assertionIds.length && supabase.from('assertions').delete().eq('plant_id', plantId),
    eventIds.length && supabase.from('events').delete().eq('plant_id', plantId),
    questionIds.length && supabase.from('questions').delete().eq('plant_id', plantId),
  ].filter(Boolean))

  // Finally delete the plant
  const { error } = await supabase.from('plants').delete().eq('id', plantId)
  if (error) throw new Error(error.message)
}

// ─── Photo upload ─────────────────────────────────────────────────────────────

export async function uploadPhoto(file, itemType, itemId) {
  const ext = file.name.split('.').pop()
  const path = `${PLANT_ID()}/${itemType}/${itemId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('knowledge-photos').upload(path, file, { upsert: false })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('knowledge-photos').getPublicUrl(path)
  return data.publicUrl
}

export async function deletePhoto(publicUrl) {
  // Extract the storage path from the public URL
  // URL format: https://<ref>.supabase.co/storage/v1/object/public/knowledge-photos/<path>
  const marker = '/storage/v1/object/public/knowledge-photos/'
  const idx = publicUrl.indexOf(marker)
  if (idx === -1) return // not a storage URL we recognise
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length))
  const { error } = await supabase.storage.from('knowledge-photos').remove([path])
  if (error) console.warn('[deletePhoto] storage remove failed:', error.message)
}
