import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { FNT, FNTM } from '../lib/constants.js'
import { getUserId, getDisplayName } from '../lib/userContext.js'
import {
  fetchDocuments, fetchCandidateCounts, uploadDocument,
  deleteDocument, retryExtraction, continueExtraction, getSignedUrl,
  ACCEPTED_MIME, MAX_UPLOAD_BYTES, DOCUMENT_TYPES, STATUS_DISPLAY,
} from '../lib/documents.js'

// =============================================================================
// Document Ingestion landing page (admin-only).
//
// Three sections, top to bottom:
//   1. Upload area (drag-drop + inline metadata form)
//   2. Documents table
//   3. Promotion CTA — visible only when ≥1 doc has approved candidates not
//      yet promoted to the live knowledge bank
//
// Polling: while any document is in `extracting` status, refresh every 8s.
// If `extraction_progress` doesn't advance in two consecutive polls, fire
// continueExtraction() — the user-active companion to the pg_cron watchdog.
// =============================================================================

const POLL_INTERVAL_MS = 8000
const STALL_POLLS = 2  // ticks without progress before nudging

export default function DocumentIngestionView({ plantId, processAreas, onOpenDocument }) {
  const [docs, setDocs] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const stallTracker = useRef(new Map())  // docId -> { processed, ticks }

  const refresh = useCallback(async () => {
    try {
      const ds = await fetchDocuments(plantId)
      setDocs(ds)
      const ids = ds.map(d => d.id)
      const cs = await fetchCandidateCounts(ids)
      setCounts(cs)
      setErr(null)
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [plantId])

  useEffect(() => { refresh() }, [refresh])

  // Poll while any doc is extracting; nudge stalled ones.
  useEffect(() => {
    const anyExtracting = docs.some(d => d.status === 'extracting' || d.status === 'uploading')
    if (!anyExtracting) return undefined
    const t = setInterval(async () => {
      // Stall detection — for each extracting doc, compare processed count to
      // last seen. Two consecutive ticks without movement → continueExtraction.
      for (const d of docs) {
        if (d.status !== 'extracting') continue
        const proc = d.extraction_progress?.processed?.length ?? 0
        const failed = d.extraction_progress?.failed?.length ?? 0
        const tracked = stallTracker.current.get(d.id) || { processed: -1, ticks: 0 }
        if (proc + failed === tracked.processed) {
          tracked.ticks++
        } else {
          tracked.processed = proc + failed
          tracked.ticks = 0
        }
        stallTracker.current.set(d.id, tracked)
        if (tracked.ticks >= STALL_POLLS) {
          continueExtraction(d.id).catch(() => {})
          tracked.ticks = 0
        }
      }
      refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [docs, refresh])

  const promotionReadyCount = useMemo(() => {
    let approved = 0, docsWithApproved = 0
    for (const d of docs) {
      const c = counts[d.id]
      if (c && c.approved > 0) {
        approved += c.approved
        docsWithApproved++
      }
    }
    return { approved, docsWithApproved }
  }, [docs, counts])

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, fontFamily: FNT, color: 'var(--md1-text)' }}>
      <style>{`@keyframes md1-spin { to { transform: rotate(360deg); } }`}</style>
      <Header />
      <UploadSection plantId={plantId} processAreas={processAreas} onUploaded={refresh} />
      <DocumentsTable
        docs={docs}
        counts={counts}
        loading={loading}
        err={err}
        onOpen={onOpenDocument}
        onRefresh={refresh}
      />
      {promotionReadyCount.approved > 0 && (
        <PromotionCallout
          approved={promotionReadyCount.approved}
          docs={promotionReadyCount.docsWithApproved}
          onClick={() => onOpenDocument?.('__promote__')}
        />
      )}
    </div>
  )
}

// ── Header ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: 'var(--md1-accent)', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>
        ADMIN · DOCUMENT INGESTION
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--md1-primary)', marginBottom: 4 }}>
        Extract knowledge from documents
      </div>
      <div style={{ fontSize: 12, color: 'var(--md1-muted)', maxWidth: 700, lineHeight: 1.6 }}>
        Upload manuals, SOPs, or technical bulletins. The system extracts rule and assertion
        candidates that you can review, edit, and promote into the live knowledge bank.
      </div>
    </div>
  )
}

// ── Upload Section ──────────────────────────────────────────────────────────

function UploadSection({ plantId, processAreas, onUploaded }) {
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState('manual')
  const [processArea, setProcessArea] = useState('')
  const [equipment, setEquipment] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef(null)

  function handleFile(f) {
    if (!f) return
    if (f.size > MAX_UPLOAD_BYTES) {
      setError(`File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 25 MB.`)
      return
    }
    if (!ACCEPTED_MIME[f.type]) {
      setError(`${f.type || 'Unknown'} not supported. Use PDF or TXT (DOCX: save as PDF and re-upload).`)
      return
    }
    setError(null)
    setFile(f)
    const cleaned = f.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ')
    setTitle(cleaned)
  }

  async function submit() {
    if (!file || !title.trim()) {
      setError('Title and file are required')
      return
    }
    setUploading(true); setError(null)
    try {
      await uploadDocument({
        plantId,
        userId: getUserId(),
        file,
        title: title.trim(),
        documentType: docType,
        processArea: processArea || null,
        equipmentReference: equipment.trim() || null,
      })
      // Reset
      setFile(null); setTitle(''); setDocType('manual')
      setProcessArea(''); setEquipment('')
      onUploaded?.()
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setUploading(false)
    }
  }

  return (
    <section style={{ marginBottom: 28 }}>
      {!file ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false)
            const f = e.dataTransfer.files?.[0]; if (f) handleFile(f)
          }}
          onClick={() => fileInput.current?.click()}
          style={{
            border: dragOver ? '2px solid var(--md1-accent)' : '2px dashed var(--md1-border)',
            background: dragOver ? '#f4f1ed' : 'transparent',
            borderRadius: 4, padding: 32, textAlign: 'center', cursor: 'pointer',
            transition: 'all 120ms ease',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--md1-primary)' }}>
            Drop a file here, or click to choose
          </div>
          <div style={{ fontSize: 11, color: 'var(--md1-muted)', marginBottom: 4 }}>
            PDF or TXT · max 25 MB · DOCX: save as PDF and re-upload
          </div>
          <input
            type="file" accept=".pdf,.txt,application/pdf,text/plain"
            ref={fileInput} hidden
            onChange={e => handleFile(e.target.files?.[0])}
          />
        </div>
      ) : (
        <div style={{ border: '1px solid var(--md1-border)', borderRadius: 4, padding: 16, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--md1-primary)' }}>{file.name}</div>
              <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNTM, marginTop: 2 }}>
                {ACCEPTED_MIME[file.type]} · {(file.size / 1024).toFixed(0)} KB
              </div>
            </div>
            <button
              onClick={() => { setFile(null); setError(null) }}
              style={{ background: 'transparent', border: 'none', color: 'var(--md1-muted)', cursor: 'pointer', fontSize: 12 }}
            >✕ Choose different file</button>
          </div>

          <FormGrid>
            <Field label="Title">
              <input
                value={title} onChange={e => setTitle(e.target.value)}
                style={inputStyle()}
              />
            </Field>
            <Field label="Document type">
              <select value={docType} onChange={e => setDocType(e.target.value)} style={inputStyle()}>
                {DOCUMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Process area">
              <select value={processArea} onChange={e => setProcessArea(e.target.value)} style={inputStyle()}>
                <option value="">— General —</option>
                {(processAreas || []).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Equipment reference (optional)">
              <input
                value={equipment} onChange={e => setEquipment(e.target.value)}
                placeholder="e.g. EAF #2"
                style={inputStyle()}
              />
            </Field>
          </FormGrid>

          {error && <div style={{ marginTop: 10, color: '#a52a2a', fontSize: 12 }}>{error}</div>}

          <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={submit}
              disabled={uploading || !title.trim()}
              style={primaryButton(uploading || !title.trim())}
            >
              {uploading ? 'Uploading…' : 'Extract knowledge'}
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--md1-muted)' }}>
            Extraction takes several minutes on large documents — you can leave this page and come back.
            Status updates automatically.
          </div>
        </div>
      )}
      {!file && error && <div style={{ marginTop: 8, color: '#a52a2a', fontSize: 12 }}>{error}</div>}
    </section>
  )
}

// ── Documents Table ─────────────────────────────────────────────────────────

function DocumentsTable({ docs, counts, loading, err, onOpen, onRefresh }) {
  if (loading) {
    return <div style={{ color: 'var(--md1-muted)', padding: 12 }}>Loading documents…</div>
  }
  if (err) {
    return <div style={{ color: '#a52a2a', padding: 12 }}>Failed to load documents: {err}</div>
  }
  if (docs.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--md1-muted)', border: '1px dashed var(--md1-border)', borderRadius: 4, fontSize: 12 }}>
        No documents uploaded yet. Upload your first source above.
      </div>
    )
  }
  return (
    <section>
      <div style={{ fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, fontWeight: 700 }}>
        Documents · {docs.length}
      </div>
      <div style={{ border: '1px solid var(--md1-border)', borderRadius: 4, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 0.9fr 0.7fr 1fr 0.6fr 0.7fr 0.7fr 110px', padding: '10px 14px', fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, background: '#faf9f7', borderBottom: '1px solid var(--md1-border)' }}>
          <div>Title</div>
          <div>Type</div>
          <div>Process</div>
          <div>Uploaded</div>
          <div>Status</div>
          <div style={{ textAlign: 'right' }}>Cand.</div>
          <div style={{ textAlign: 'right' }}>Approved</div>
          <div style={{ textAlign: 'right' }}>Promoted</div>
          <div></div>
        </div>
        {docs.map(d => (
          <DocumentRow key={d.id} doc={d} counts={counts[d.id]} onOpen={onOpen} onRefresh={onRefresh} />
        ))}
      </div>
    </section>
  )
}

function DocumentRow({ doc, counts, onOpen, onRefresh }) {
  const [busy, setBusy] = useState(false)
  const total = counts?.total || 0
  const approved = counts?.approved || 0
  const promoted = counts?.promoted || 0

  async function handleDelete(e) {
    e.stopPropagation()
    if (!confirm(`Delete "${doc.title}"? This removes the file and all its candidates. Promoted rules/assertions are preserved but lose their source link.`)) return
    setBusy(true)
    try { await deleteDocument(doc.id); onRefresh?.() }
    catch (err) { alert(`Delete failed: ${err.message}`); setBusy(false) }
  }

  async function handleRetry(e) {
    e.stopPropagation()
    setBusy(true)
    try { await retryExtraction(doc.id); onRefresh?.() }
    catch (err) { alert(`Retry failed: ${err.message}`) }
    finally { setBusy(false) }
  }

  async function handleViewOriginal(e) {
    e.stopPropagation()
    try {
      const url = await getSignedUrl(doc.file_path, 600)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) { alert(`Could not open document: ${err.message}`) }
  }

  return (
    <div
      onClick={() => onOpen?.(doc.id)}
      style={{
        display: 'grid',
        gridTemplateColumns: '1.6fr 0.9fr 0.9fr 0.7fr 1fr 0.6fr 0.7fr 0.7fr 110px',
        padding: '12px 14px', fontSize: 12, alignItems: 'center',
        borderBottom: '1px solid #f0eeec', cursor: doc.status === 'ready_for_review' ? 'pointer' : 'default',
        opacity: busy ? 0.5 : 1,
      }}
    >
      <div>
        <div style={{ fontWeight: 600, color: 'var(--md1-primary)' }}>{doc.title}</div>
        <div style={{ fontSize: 10, color: 'var(--md1-muted)', fontFamily: FNTM, marginTop: 2 }}>
          {(doc.file_size_bytes / 1024).toFixed(0)} KB · {doc.mime_type}
        </div>
      </div>
      <div style={{ color: 'var(--md1-muted)' }}>
        {DOCUMENT_TYPES.find(t => t.value === doc.document_type)?.label || doc.document_type}
      </div>
      <div style={{ color: 'var(--md1-muted)' }}>{doc.process_area || '—'}</div>
      <div style={{ color: 'var(--md1-muted)', fontFamily: FNTM, fontSize: 11 }}>{relativeDate(doc.created_at)}</div>
      <div><StatusBadge doc={doc} /></div>
      <div style={{ textAlign: 'right', fontFamily: FNTM, color: 'var(--md1-muted)' }}>{total || '—'}</div>
      <div style={{ textAlign: 'right', fontFamily: FNTM, color: approved > 0 ? '#2d6b5e' : 'var(--md1-muted)' }}>
        {total > 0 ? `${approved}/${total}` : '—'}
      </div>
      <div style={{ textAlign: 'right', fontFamily: FNTM, color: 'var(--md1-muted)' }}>{promoted || '—'}</div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        {doc.status === 'failed' && (
          <button onClick={handleRetry} disabled={busy} style={smallButton('#7a5800', '#fff8e1')}>Retry</button>
        )}
        {(doc.status === 'ready_for_review' || doc.status === 'review_in_progress' || doc.status === 'review_complete') && total > 0 && (
          <button onClick={() => onOpen?.(doc.id)} style={smallButton('var(--md1-primary)', '#fff')}>Review</button>
        )}
        <button onClick={handleViewOriginal} style={smallButton('var(--md1-muted)', 'transparent')} title="Open original">⇗</button>
        <button onClick={handleDelete} disabled={busy} style={smallButton('#a52a2a', 'transparent')} title="Delete">×</button>
      </div>
    </div>
  )
}

// ── Status badge with extraction progress ──────────────────────────────────

function StatusBadge({ doc }) {
  const meta = STATUS_DISPLAY[doc.status] || { label: doc.status, color: '#555', bg: '#eee' }
  if (doc.status === 'extracting') {
    const proc = doc.extraction_progress?.processed?.length ?? 0
    const failed = doc.extraction_progress?.failed?.length ?? 0
    const total = doc.extraction_progress?.total_chunks
    const hasProgress = total != null && total > 0
    const pct = hasProgress ? Math.round(((proc + failed) / total) * 100) : null
    return (
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: meta.bg, color: meta.color, borderRadius: 2, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          <Spinner /> {meta.label}{hasProgress ? ` · ${proc + failed}/${total}` : ''}
        </div>
        {hasProgress && (
          <div style={{ marginTop: 4, height: 3, background: '#f0eeec', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: meta.color, transition: 'width 400ms ease' }} />
          </div>
        )}
      </div>
    )
  }
  if (doc.status === 'failed') {
    return (
      <div title={doc.extraction_error || ''}>
        <span style={{ display: 'inline-block', padding: '3px 8px', background: meta.bg, color: meta.color, borderRadius: 2, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          ⚠ {meta.label}
        </span>
        {doc.extraction_error && (
          <div style={{ marginTop: 3, fontSize: 10, color: '#a52a2a', maxWidth: 220, lineHeight: 1.4 }}>
            {doc.extraction_error}
          </div>
        )}
      </div>
    )
  }
  return (
    <span style={{ display: 'inline-block', padding: '3px 8px', background: meta.bg, color: meta.color, borderRadius: 2, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
      {meta.label}
    </span>
  )
}

function Spinner() {
  return (
    <span style={{
      display: 'inline-block', width: 9, height: 9, border: '2px solid currentColor',
      borderTopColor: 'transparent', borderRadius: '50%', animation: 'md1-spin 0.8s linear infinite',
    }} />
  )
}

// ── Promotion Callout ───────────────────────────────────────────────────────

function PromotionCallout({ approved, docs, onClick }) {
  return (
    <section style={{ marginTop: 28, padding: 16, background: '#b8e0d8', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#2d6b5e' }}>Ready to promote</div>
        <div style={{ fontSize: 12, color: '#2d6b5e', marginTop: 3 }}>
          {approved} approved candidate{approved === 1 ? '' : 's'} across {docs} document{docs === 1 ? '' : 's'} can be promoted to the knowledge bank.
        </div>
      </div>
      <button onClick={onClick} style={{ padding: '8px 14px', background: '#2d6b5e', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FNT }}>
        Review and promote →
      </button>
    </section>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function FormGrid({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4, fontWeight: 700 }}>{label}</div>
      {children}
    </label>
  )
}

function inputStyle() {
  return {
    width: '100%', padding: '8px 10px', fontSize: 12, fontFamily: FNT,
    border: '1px solid var(--md1-border)', borderRadius: 3, color: 'var(--md1-text)',
    background: '#fff', boxSizing: 'border-box',
  }
}

function primaryButton(disabled) {
  return {
    padding: '9px 16px', fontSize: 12, fontWeight: 700, fontFamily: FNT,
    background: disabled ? '#aaa' : 'var(--md1-primary)', color: '#fff',
    border: 'none', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: 0.4,
  }
}

function smallButton(color, bg) {
  return {
    padding: '4px 8px', fontSize: 11, fontWeight: 600, fontFamily: FNT,
    background: bg, color, border: bg === 'transparent' ? `1px solid ${color}33` : 'none',
    borderRadius: 3, cursor: 'pointer',
  }
}

function relativeDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1)        return 'just now'
  if (min < 60)       return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24)        return `${hr}h ago`
  const dy = Math.floor(hr / 24)
  if (dy < 7)         return `${dy}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
