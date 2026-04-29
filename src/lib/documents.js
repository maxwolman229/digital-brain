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
