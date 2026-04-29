// =============================================================================
// src/lib/documents.js
//
// Document Ingestion — admin uploads source documents (PDF or TXT in v1) which
// are extracted into rule/assertion candidates by the extract-from-document
// edge function. This module wraps the storage + DB + edge function calls the
// UI uses.
// =============================================================================

import { supabase, authFetch, getStoredJwt } from './supabase.js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const ANON_KEY      = import.meta.env.VITE_SUPABASE_ANON_KEY
const STORAGE_URL   = `${SUPABASE_URL}/storage/v1`
const EXTRACT_URL   = `${SUPABASE_URL}/functions/v1/extract-from-document`
const BUCKET        = 'plant-documents'

export const ACCEPTED_MIME = {
  'application/pdf': 'PDF',
  'text/plain':      'TXT',
}
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024  // 25 MB

export const DOCUMENT_TYPES = [
  { value: 'manual',                label: 'Manual' },
  { value: 'sop',                   label: 'SOP' },
  { value: 'technical_bulletin',    label: 'Technical Bulletin' },
  { value: 'commissioning_report',  label: 'Commissioning Report' },
  { value: 'training_material',     label: 'Training Material' },
  { value: 'other',                 label: 'Other' },
]

export const STATUS_DISPLAY = {
  uploading:          { label: 'Uploading',         color: '#8a8278', bg: '#f0eeec' },
  extracting:         { label: 'Extracting',        color: '#7a5800', bg: '#fff8e1' },
  ready_for_review:   { label: 'Ready for review',  color: '#2d6b5e', bg: '#b8e0d8' },
  review_in_progress: { label: 'Review in progress',color: '#7a5800', bg: '#fff4d6' },
  review_complete:    { label: 'Review complete',   color: '#2d6b5e', bg: '#b8e0d8' },
  failed:             { label: 'Failed',            color: '#a52a2a', bg: '#fde8e5' },
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function fetchDocuments(plantId) {
  const r = await supabase
    .from('documents')
    .select('*')
    .eq('plant_id', plantId)
    .order('created_at', { ascending: false })
  if (r.error) throw new Error(`fetchDocuments failed: ${r.error.message}`)
  return r.data || []
}

// Returns { [docId]: { pending_review, approved, rejected, promoted, total } }
export async function fetchCandidateCounts(documentIds) {
  if (!documentIds.length) return {}
  const r = await supabase
    .from('extraction_candidates')
    .select('document_id, status')
    .in('document_id', documentIds)
  if (r.error) throw new Error(`fetchCandidateCounts failed: ${r.error.message}`)
  const out = {}
  for (const row of r.data || []) {
    if (!out[row.document_id]) {
      out[row.document_id] = { pending_review: 0, approved: 0, rejected: 0, promoted: 0, total: 0 }
    }
    out[row.document_id][row.status] = (out[row.document_id][row.status] || 0) + 1
    out[row.document_id].total++
  }
  return out
}

export async function fetchDocumentById(id) {
  const r = await supabase.from('documents').select('*').eq('id', id).single()
  if (r.error) throw new Error(`fetchDocumentById failed: ${r.error.message}`)
  return r.data
}

// ── Upload + trigger ────────────────────────────────────────────────────────

export async function uploadDocument({
  plantId, userId, file, title, documentType, processArea, equipmentReference,
}) {
  if (!file) throw new Error('No file selected')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 25 MB.`)
  }
  if (!ACCEPTED_MIME[file.type]) {
    throw new Error(`Unsupported file type: ${file.type || 'unknown'}. Supported: PDF, TXT.`)
  }

  const documentId = crypto.randomUUID()
  const path = `${plantId}/${documentId}/${file.name}`

  // 1. Upload to storage. authFetch attaches the bearer JWT.
  const upRes = await authFetch(
    `${STORAGE_URL}/object/${BUCKET}/${encodeURI(path)}`,
    {
      method: 'POST',
      headers: { 'content-type': file.type, 'x-upsert': 'false' },
      body: file,
      timeout: 60000,
    }
  )
  if (!upRes.ok) {
    const text = await upRes.text().catch(() => '')
    throw new Error(`Storage upload failed (${upRes.status}): ${text.slice(0, 200)}`)
  }

  // 2. Insert documents row.
  const ins = await supabase.from('documents').insert({
    id:                  documentId,
    plant_id:            plantId,
    uploaded_by:         userId,
    title,
    document_type:       documentType,
    process_area:        processArea || null,
    equipment_reference: equipmentReference || null,
    file_path:           path,
    file_size_bytes:     file.size,
    mime_type:           file.type,
    status:              'uploading',
  })
  if (ins.error) {
    // Roll back the upload so we don't leak orphan storage objects.
    await deleteStorageObject(path).catch(() => {})
    throw new Error(`Document insert failed: ${ins.error.message}`)
  }

  // 3. Fire the extraction trigger. Don't await — UI polls for status.
  triggerExtraction(documentId).catch(err => {
    console.warn('[uploadDocument] extraction trigger failed:', err.message)
  })

  return documentId
}

export async function triggerExtraction(documentId) {
  return authFetch(EXTRACT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ document_id: documentId }),
    timeout: 30000,
  })
}

// Frontend-driven continuation. Called by the UI poller when extraction looks
// stalled (status='extracting' but extraction_progress hasn't advanced).
export async function continueExtraction(documentId) {
  return authFetch(EXTRACT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ document_id: documentId, _continue: true }),
    timeout: 15000,
  })
}

// Reset to 'failed' so the function will accept a fresh trigger, then trigger.
export async function retryExtraction(documentId) {
  const upd = await supabase.from('documents').update({
    status: 'failed',
    extraction_progress: null,
    extraction_error: null,
  }).eq('id', documentId)
  if (upd.error) throw new Error(`retryExtraction reset failed: ${upd.error.message}`)
  // wipe non-promoted candidates from any prior partial run
  await supabase.from('extraction_candidates')
    .delete()
    .eq('document_id', documentId)
    .neq('status', 'promoted')
  return triggerExtraction(documentId)
}

// ── Delete ──────────────────────────────────────────────────────────────────

export async function deleteDocument(id) {
  // Need the file_path before deleting the row.
  const { data: row, error: gErr } = await supabase
    .from('documents').select('file_path').eq('id', id).single()
  if (gErr) throw new Error(`fetch for delete failed: ${gErr.message}`)

  // Delete candidates first; the BEFORE DELETE trigger on documents flags
  // any orphan source links on rules/assertions.
  await supabase.from('extraction_candidates').delete().eq('document_id', id)
  const del = await supabase.from('documents').delete().eq('id', id)
  if (del.error) throw new Error(`document delete failed: ${del.error.message}`)

  if (row?.file_path) await deleteStorageObject(row.file_path).catch(() => {})
}

async function deleteStorageObject(path) {
  return authFetch(`${STORAGE_URL}/object/${BUCKET}/${encodeURI(path)}`, {
    method: 'DELETE',
  })
}

// ── Signed URL for "view original" ──────────────────────────────────────────

// ── Candidates: read ────────────────────────────────────────────────────────

export async function fetchCandidates(documentId) {
  const r = await supabase
    .from('extraction_candidates')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })
  if (r.error) throw new Error(`fetchCandidates failed: ${r.error.message}`)
  return r.data || []
}

export async function fetchCandidateEdits(candidateId) {
  const r = await supabase
    .from('extraction_candidate_edits')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('version_number', { ascending: true })
  if (r.error) throw new Error(`fetchCandidateEdits failed: ${r.error.message}`)
  return r.data || []
}

// ── Candidates: write ───────────────────────────────────────────────────────

export async function updateCandidateStatus(id, nextStatus, reviewerUserId) {
  if (!['pending_review', 'approved', 'rejected'].includes(nextStatus)) {
    throw new Error(`Bad status: ${nextStatus}`)
  }
  const patch = {
    status: nextStatus,
    reviewed_by: nextStatus === 'pending_review' ? null : reviewerUserId,
    reviewed_at: nextStatus === 'pending_review' ? null : new Date().toISOString(),
  }
  const r = await supabase.from('extraction_candidates').update(patch).eq('id', id)
  if (r.error) throw new Error(`updateCandidateStatus failed: ${r.error.message}`)
}

export async function bulkUpdateCandidateStatus(ids, nextStatus, reviewerUserId) {
  if (!ids?.length) return
  if (!['approved', 'rejected'].includes(nextStatus)) throw new Error(`Bad bulk status: ${nextStatus}`)
  const patch = {
    status: nextStatus,
    reviewed_by: reviewerUserId,
    reviewed_at: new Date().toISOString(),
  }
  // PostgREST in() supports up to a few thousand IDs comfortably.
  const r = await supabase.from('extraction_candidates').update(patch).in('id', ids)
  if (r.error) throw new Error(`bulkUpdateCandidateStatus failed: ${r.error.message}`)
}

// Edit + approve atomically (best-effort: insert audit row, then update fields).
// Diff is computed client-side from `before` vs `next`. If no fields changed,
// just mark approved without writing an audit row.
const EDITABLE_FIELDS = ['title', 'content', 'scope', 'rationale']

export function diffCandidate(before, next) {
  const changes = {}
  for (const f of EDITABLE_FIELDS) {
    const oldV = before[f] ?? null
    const newV = next[f] ?? null
    if ((oldV ?? '') !== (newV ?? '')) {
      changes[f] = { old: oldV, new: newV }
    }
  }
  return changes
}

export async function editAndApproveCandidate({
  candidate, edits, reason, reviewerUserId,
}) {
  const changes = diffCandidate(candidate, edits)
  // Insert audit row first (only if anything actually changed).
  if (Object.keys(changes).length > 0) {
    if (!reason || !reason.trim()) throw new Error('Reason required for edits')
    const ins = await supabase.from('extraction_candidate_edits').insert({
      candidate_id: candidate.id,
      edited_by:    reviewerUserId,
      field_changes: changes,
      reason:       reason.trim(),
      // version_number is auto-assigned by trigger
    })
    if (ins.error) throw new Error(`audit insert failed: ${ins.error.message}`)
  }
  // Apply edits + flip to approved.
  const patch = {
    title:       edits.title       ?? candidate.title,
    content:     edits.content     ?? candidate.content,
    scope:       edits.scope       ?? candidate.scope,
    rationale:   edits.rationale   ?? candidate.rationale,
    status:      'approved',
    reviewed_by: reviewerUserId,
    reviewed_at: new Date().toISOString(),
  }
  const upd = await supabase.from('extraction_candidates').update(patch).eq('id', candidate.id)
  if (upd.error) throw new Error(`candidate update failed: ${upd.error.message}`)
  return { changedFields: Object.keys(changes) }
}

// ── Approved candidates / promotion ─────────────────────────────────────────

// Pulls every approved candidate in a plant, plus their parent documents,
// plus per-candidate edit history (for the was_edited_from_source flag).
// Returned shape:
//   {
//     totalCount: number,
//     groups: [{ doc, candidates: [{...candidate, hasEdits: boolean}] }, ...]
//   }
export async function fetchApprovedCandidatesGroupedByDoc(plantId) {
  // 1. All documents for this plant.
  const { data: docs, error: docErr } = await supabase
    .from('documents')
    .select('id, title, document_type, process_area, file_path, created_at, updated_at, status')
    .eq('plant_id', plantId)
    .order('created_at', { ascending: false })
  if (docErr) throw new Error(`fetchApprovedCandidatesGroupedByDoc[docs]: ${docErr.message}`)

  if (!docs?.length) return { totalCount: 0, groups: [] }
  const docIds = docs.map(d => d.id)

  // 2. Approved candidates across those documents.
  const { data: cands, error: cErr } = await supabase
    .from('extraction_candidates')
    .select('*')
    .in('document_id', docIds)
    .eq('status', 'approved')
    .order('document_id')
    .order('created_at', { ascending: true })
  if (cErr) throw new Error(`fetchApprovedCandidatesGroupedByDoc[cands]: ${cErr.message}`)

  // 3. Edit-presence flag (any rows in extraction_candidate_edits).
  const editedSet = new Set()
  if (cands?.length) {
    const { data: edits, error: eErr } = await supabase
      .from('extraction_candidate_edits')
      .select('candidate_id')
      .in('candidate_id', cands.map(c => c.id))
    if (eErr) console.warn('[approved candidates: edits lookup]', eErr.message)
    for (const e of (edits || [])) editedSet.add(e.candidate_id)
  }

  const byDoc = new Map()
  for (const c of (cands || [])) {
    const list = byDoc.get(c.document_id) || []
    list.push({ ...c, hasEdits: editedSet.has(c.id) })
    byDoc.set(c.document_id, list)
  }

  const groups = docs
    .filter(d => byDoc.has(d.id))
    .map(d => ({ doc: d, candidates: byDoc.get(d.id) }))

  return { totalCount: cands?.length || 0, groups }
}

// Builds an in-memory dedup index for a plant's existing rules + assertions.
// Match keys (normalised):
//   • type::title (exact)
//   • type::contentPrefix (first 100 chars of rationale)
// Returned: { byTitle: Map<string, row>, byPrefix: Map<string, row> }
async function buildDedupIndex(plantId) {
  const [rRes, aRes] = await Promise.all([
    supabase.from('rules')
      .select('id, display_id, title, rationale').eq('plant_id', plantId),
    supabase.from('assertions')
      .select('id, display_id, title, rationale').eq('plant_id', plantId),
  ])
  if (rRes.error) throw new Error(`dedup index[rules]: ${rRes.error.message}`)
  if (aRes.error) throw new Error(`dedup index[assertions]: ${aRes.error.message}`)

  const byTitle = new Map()
  const byPrefix = new Map()
  const add = (row, type) => {
    const titleKey  = `${type}::${normTitle(row.title)}`
    const prefixKey = `${type}::${normPrefix(row.rationale, 100)}`
    if (!byTitle.has(titleKey))   byTitle.set(titleKey, { ...row, type })
    if (prefixKey.endsWith('::')) return  // empty rationale, skip
    if (!byPrefix.has(prefixKey)) byPrefix.set(prefixKey, { ...row, type })
  }
  ;(rRes.data || []).forEach(r => add(r, 'rule'))
  ;(aRes.data || []).forEach(a => add(a, 'assertion'))
  return { byTitle, byPrefix }
}

function normTitle(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}
function normPrefix(s, n) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, n)
}

function findDuplicate({ byTitle, byPrefix }, candidate) {
  const tKey = `${candidate.type}::${normTitle(candidate.title)}`
  if (byTitle.has(tKey)) return byTitle.get(tKey)
  const pKey = `${candidate.type}::${normPrefix(candidate.content, 100)}`
  if (byPrefix.has(pKey)) return byPrefix.get(pKey)
  return null
}

// Promotes a single candidate. Returns a summary object describing the outcome:
//   { kind: 'promoted', newId, newDisplayId } — created a new rule/assertion
//   { kind: 'duplicate', existingId, existingDisplayId } — matched an existing one
//   { kind: 'failed', error } — error during the transaction
async function promoteCandidate({ candidate, doc, plantId, userId, dedupIndex }) {
  try {
    const dup = findDuplicate(dedupIndex, candidate)
    if (dup) {
      // Mark candidate as promoted, pointing at the existing target.
      const upd = await supabase.from('extraction_candidates').update({
        status:           'promoted',
        promoted_at:      new Date().toISOString(),
        promoted_to_id:   dup.id,
        promoted_to_type: dup.type,
      }).eq('id', candidate.id)
      if (upd.error) throw new Error(upd.error.message)

      // Add an audit annotation on the existing rule/assertion.
      const note = `Confirmed by source: ${doc.title}${candidate.source_page ? `, page ${candidate.source_page}` : ''}`
      // versions.version_num must be unique-ish; we use timestamp seconds as a
      // monotonically-increasing tag — no fk relationship required since we're
      // just appending an audit row.
      await supabase.from('versions').insert({
        target_type:    dup.type,
        target_id:      dup.id,
        version_num:    Math.floor(Date.now() / 1000),
        date:           new Date().toISOString(),
        author:         userId,
        change_note:    note,
        snapshot_title: dup.title,
      })
      return { kind: 'duplicate', existingId: dup.id, existingDisplayId: dup.display_id }
    }

    // Create new rule/assertion.
    const newId = randomShortId(candidate.type === 'rule' ? 'R' : 'A')
    const displayId = await nextDisplayId(plantId, candidate.type)

    const rationaleCombined = candidate.rationale
      ? `${candidate.content}\n\n${candidate.rationale}`
      : candidate.content

    const row = {
      id:                  newId,
      display_id:          displayId,
      plant_id:            plantId,
      title:               candidate.title,
      category:            'Process',
      process_area:        doc.process_area || null,
      scope:               candidate.scope || '',
      status:              'Proposed',
      confidence:          'Medium',
      tags:                [],
      created_by:          userId,
      // Source-citation columns from migration 034:
      source_document_id:             doc.id,
      source_excerpt:                 candidate.source_excerpt,
      source_extraction_candidate_id: candidate.id,
      was_edited_from_source:         !!candidate.hasEdits,
    }
    if (candidate.type === 'rule') row.rationale = rationaleCombined

    const insTable = candidate.type === 'rule' ? 'rules' : 'assertions'
    const ins = await supabase.from(insTable).insert(row)
    if (ins.error) throw new Error(`insert ${insTable}: ${ins.error.message}`)

    // Mark candidate promoted.
    const upd = await supabase.from('extraction_candidates').update({
      status:           'promoted',
      promoted_at:      new Date().toISOString(),
      promoted_to_id:   newId,
      promoted_to_type: candidate.type,
    }).eq('id', candidate.id)
    if (upd.error) throw new Error(`candidate update: ${upd.error.message}`)

    // First version row so the audit trail starts populated.
    await supabase.from('versions').insert({
      target_type:    candidate.type,
      target_id:      newId,
      version_num:    1,
      date:           new Date().toISOString(),
      author:         userId,
      change_note:    `Promoted from document: ${doc.title}${candidate.source_page ? `, page ${candidate.source_page}` : ''}`,
      snapshot_title: candidate.title,
    })
    return { kind: 'promoted', newId, newDisplayId: displayId }
  } catch (e) {
    return { kind: 'failed', error: e?.message || String(e) }
  }
}

// Local copies of the id helpers from db.js — kept here so the promote path
// doesn't reach into db.js's internal helpers and so this module stays
// importable from anywhere.
function randomShortId(prefix) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  const suffix = Array.from(bytes, b => chars[b % chars.length]).join('')
  return `${prefix}-${suffix}`
}

async function nextDisplayId(plantId, type) {
  try {
    const r = await supabase.rpc('next_display_id', { p_plant_id: plantId, p_type: type })
    if (r.error) { console.warn('[nextDisplayId]', r.error.message); return null }
    return r.data
  } catch (e) { console.warn('[nextDisplayId]', e.message); return null }
}

export async function bulkPromoteCandidates({ candidates, plantId, userId }) {
  if (!candidates?.length) return { promoted: [], duplicates: [], failed: [] }

  // Build dedup index once.
  const dedupIndex = await buildDedupIndex(plantId)

  // Group candidates by document so we hit the documents table once per doc.
  const docIds = [...new Set(candidates.map(c => c.document_id))]
  const { data: docs, error: dErr } = await supabase
    .from('documents').select('*').in('id', docIds)
  if (dErr) throw new Error(`bulkPromote[docs]: ${dErr.message}`)
  const docById = new Map((docs || []).map(d => [d.id, d]))

  // Per-doc counters for promoted_count increment at the end.
  const promotedCountDelta = new Map()

  const results = { promoted: [], duplicates: [], failed: [] }

  for (const c of candidates) {
    const doc = docById.get(c.document_id)
    if (!doc) {
      results.failed.push({ candidate: c, error: 'Source document missing or being re-extracted' })
      continue
    }
    const out = await promoteCandidate({
      candidate: c, doc, plantId, userId, dedupIndex,
    })
    if (out.kind === 'promoted') {
      results.promoted.push({ candidate: c, ...out })
      // Add the new row to the dedup index so subsequent candidates in this
      // batch see it (avoids two near-identical candidates both promoting).
      dedupIndex.byTitle.set(`${c.type}::${normTitle(c.title)}`, {
        id: out.newId, display_id: out.newDisplayId, title: c.title, type: c.type,
        rationale: c.content,
      })
      dedupIndex.byPrefix.set(`${c.type}::${normPrefix(c.content, 100)}`, {
        id: out.newId, display_id: out.newDisplayId, title: c.title, type: c.type,
        rationale: c.content,
      })
      promotedCountDelta.set(doc.id, (promotedCountDelta.get(doc.id) || 0) + 1)
    } else if (out.kind === 'duplicate') {
      results.duplicates.push({ candidate: c, ...out })
      promotedCountDelta.set(doc.id, (promotedCountDelta.get(doc.id) || 0) + 1)
    } else {
      results.failed.push({ candidate: c, error: out.error })
    }
  }

  // Increment documents.promoted_count for each affected doc.
  for (const [docId, delta] of promotedCountDelta) {
    const doc = docById.get(docId)
    if (!doc) continue
    const next = (doc.promoted_count || 0) + delta
    await supabase.from('documents').update({ promoted_count: next }).eq('id', docId)
  }

  return results
}

// ── Signed URLs ─────────────────────────────────────────────────────────────

export async function getSignedUrl(filePath, expiresIn = 300) {
  const res = await authFetch(`${STORAGE_URL}/object/sign/${BUCKET}/${encodeURI(filePath)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`signed URL failed: ${data?.message || res.status}`)
  // Storage returns either signedURL (legacy) or signedUrl (newer); both are
  // relative to /storage/v1 (e.g. "/object/sign/<bucket>/<path>?token=…").
  const rel = data.signedURL || data.signedUrl
  return rel.startsWith('http') ? rel : `${SUPABASE_URL}/storage/v1${rel}`
}
