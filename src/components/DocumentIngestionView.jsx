import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MoreVertical, Download, FileSearch, Trash2 } from 'lucide-react'
import { FNT, FNTM } from '../lib/constants.js'
import { getUserId } from '../lib/userContext.js'
import {
  fetchDocuments, fetchCandidateCounts, uploadDocument,
  deleteDocument, retryExtraction, continueExtraction, getSignedUrl,
  ACCEPTED_MIME, MAX_UPLOAD_BYTES, DOCUMENT_TYPES, STATUS_DISPLAY,
} from '../lib/documents.js'
import DocumentReviewView from './DocumentReviewView.jsx'

// =============================================================================
// Document Ingestion (admin-only).
//
// Two screens, both routed from this single component:
//   • Landing — upload + documents table + promotion CTA
//   • Review  — per-document review (stub for now; real review screen TBD)
//
// Polling: while any doc is in 'extracting' status, refresh every 8s. If
// extraction_progress doesn't advance for 2 ticks, fire continueExtraction
// (UI-driven companion to the pg_cron watchdog).
// =============================================================================

const POLL_INTERVAL_MS = 8000
const STALL_POLLS = 2

export default function DocumentIngestionView({ plantId, processAreas }) {
  const [reviewingDocId, setReviewingDocId] = useState(null)
  if (reviewingDocId) {
    return (
      <DocumentReviewView
        docId={reviewingDocId}
        plantId={plantId}
        onBack={() => setReviewingDocId(null)}
      />
    )
  }
  return (
    <DocumentIngestionLanding
      plantId={plantId}
      processAreas={processAreas}
      onOpenDoc={setReviewingDocId}
    />
  )
}

// ── Landing ─────────────────────────────────────────────────────────────────

function DocumentIngestionLanding({ plantId, processAreas, onOpenDoc }) {
  const [docs, setDocs] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [removing, setRemoving] = useState(null)   // { id, title }
  const stallTracker = useRef(new Map())

  const refresh = useCallback(async () => {
    try {
      const ds = await fetchDocuments(plantId)
      setDocs(ds)
      const cs = await fetchCandidateCounts(ds.map(d => d.id))
      setCounts(cs)
      setErr(null)
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [plantId])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const anyExtracting = docs.some(d => d.status === 'extracting' || d.status === 'uploading')
    if (!anyExtracting) return undefined
    const t = setInterval(async () => {
      for (const d of docs) {
        if (d.status !== 'extracting') continue
        const proc = d.extraction_progress?.processed?.length ?? 0
        const failed = d.extraction_progress?.failed?.length ?? 0
        const tracked = stallTracker.current.get(d.id) || { processed: -1, ticks: 0 }
        if (proc + failed === tracked.processed) tracked.ticks++
        else { tracked.processed = proc + failed; tracked.ticks = 0 }
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

  const promotionReady = useMemo(() => {
    let approved = 0, docsWithApproved = 0
    for (const d of docs) {
      const c = counts[d.id]
      if (c && c.approved > 0) { approved += c.approved; docsWithApproved++ }
    }
    return { approved, docs: docsWithApproved }
  }, [docs, counts])

  // Title click → preview in a new tab. Browser renders PDF/TXT inline based
  // on the upload's Content-Type; DOCX falls back to the browser's normal
  // download prompt since browsers don't render Word docs natively.
  async function handlePreview(doc) {
    try {
      const url = await getSignedUrl(doc.file_path, 600)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      alert(`Could not open document: ${e.message}`)
    }
  }

  // Three-dot menu → explicit download to desktop. We append ?download=<name>
  // to the signed URL so Supabase Storage adds Content-Disposition: attachment
  // server-side; this is more reliable than the <a download> attribute, which
  // browsers ignore for cross-origin responses.
  async function handleDownload(doc) {
    try {
      const url = await getSignedUrl(doc.file_path, 600)
      const filename = doc.file_path.split('/').pop()
      const sep = url.includes('?') ? '&' : '?'
      const dlUrl = `${url}${sep}download=${encodeURIComponent(filename)}`
      const a = document.createElement('a')
      a.href = dlUrl
      a.download = filename
      a.rel = 'noopener noreferrer'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      alert(`Could not download: ${e.message}`)
    }
  }

  async function handleRemoveConfirmed(doc) {
    setRemoving({ id: doc.id, busy: true })
    try {
      await deleteDocument(doc.id)
      setRemoving(null)
      refresh()
    } catch (e) {
      alert(`Delete failed: ${e.message}`)
      setRemoving(null)
    }
  }

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, fontFamily: FNT, color: 'var(--md1-text)' }}>
      <style>{`
        @keyframes md1-spin { to { transform: rotate(360deg); } }
        .md1-doc-row:hover { background: #f8f6f3 !important; }
        .md1-doc-row .md1-title-link:hover { text-decoration: underline; }
        .md1-menu-item:hover { background: #f0eeec; }
      `}</style>
      <Header />
      <UploadSection plantId={plantId} processAreas={processAreas} onUploaded={refresh} />
      <DocumentsTable
        docs={docs}
        counts={counts}
        loading={loading}
        err={err}
        onOpenDoc={onOpenDoc}
        onPreview={handlePreview}
        onDownload={handleDownload}
        onRequestRemove={(d) => setRemoving({ id: d.id, title: d.title })}
        onRefresh={refresh}
      />
      {promotionReady.approved > 0 && (
        <PromotionCallout
          approved={promotionReady.approved}
          docs={promotionReady.docs}
          onClick={() => alert('Promote screen — coming soon')}
        />
      )}
      {removing && (
        <RemoveConfirmModal
          title={removing.title || ''}
          busy={removing.busy}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const doc = docs.find(d => d.id === removing.id)
            if (doc) handleRemoveConfirmed(doc)
          }}
        />
      )}
    </div>
  )
}

// ── Header ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    <div style={{ marginBottom: 18, fontFamily: FNT }}>
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
    <section style={{ marginBottom: 28, fontFamily: FNT }}>
      {!file ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false)
            const f = e.dataTransfer.files?.[0]; if (f) handleFile(f)
          }}
          onClick={() => fileInput.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click() } }}
          style={{
            border: dragOver ? '2px solid var(--md1-accent)' : '2px dashed var(--md1-border)',
            background: dragOver ? '#f4f1ed' : 'transparent',
            borderRadius: 4, padding: 32, textAlign: 'center', cursor: 'pointer',
            transition: 'all 120ms ease', fontFamily: FNT,
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
        <div style={{ border: '1px solid var(--md1-border)', borderRadius: 4, padding: 16, background: '#fff', fontFamily: FNT }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--md1-primary)', fontFamily: FNT }}>{file.name}</div>
              <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNTM, marginTop: 2 }}>
                {ACCEPTED_MIME[file.type]} · {(file.size / 1024).toFixed(0)} KB
              </div>
            </div>
            <button
              onClick={() => { setFile(null); setError(null) }}
              style={{ background: 'transparent', border: 'none', color: 'var(--md1-muted)', cursor: 'pointer', fontSize: 12, fontFamily: FNT }}
            >✕ Choose different file</button>
          </div>

          <FormGrid>
            <Field label="Title">
              <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle()} />
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
              <input value={equipment} onChange={e => setEquipment(e.target.value)} placeholder="e.g. EAF #2" style={inputStyle()} />
            </Field>
          </FormGrid>

          {error && <div style={{ marginTop: 10, color: '#a52a2a', fontSize: 12, fontFamily: FNT }}>{error}</div>}

          <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={submit} disabled={uploading || !title.trim()} style={primaryButton(uploading || !title.trim())}>
              {uploading ? 'Uploading…' : 'Extract knowledge'}
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT }}>
            Extraction takes several minutes on large documents — you can leave this page and come back.
            Status updates automatically.
          </div>
        </div>
      )}
      {!file && error && <div style={{ marginTop: 8, color: '#a52a2a', fontSize: 12, fontFamily: FNT }}>{error}</div>}
    </section>
  )
}

// ── Documents Table ─────────────────────────────────────────────────────────

const TABLE_COLS = '1.6fr 0.9fr 0.9fr 0.7fr 1fr 0.6fr 0.7fr 0.7fr 60px'

function DocumentsTable({ docs, counts, loading, err, onOpenDoc, onPreview, onDownload, onRequestRemove, onRefresh }) {
  if (loading) return <div style={{ color: 'var(--md1-muted)', padding: 12, fontFamily: FNT }}>Loading documents…</div>
  if (err)     return <div style={{ color: '#a52a2a', padding: 12, fontFamily: FNT }}>Failed to load documents: {err}</div>
  if (docs.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--md1-muted)', border: '1px dashed var(--md1-border)', borderRadius: 4, fontSize: 12, fontFamily: FNT }}>
        No documents uploaded yet. Upload your first source above.
      </div>
    )
  }
  return (
    <section style={{ fontFamily: FNT }}>
      <div style={{ fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, fontWeight: 700 }}>
        Documents · {docs.length}
      </div>
      <div style={{ border: '1px solid var(--md1-border)', borderRadius: 4, overflow: 'visible', background: '#fff' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: TABLE_COLS,
          padding: '10px 14px', fontSize: 10, color: 'var(--md1-muted)',
          textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700,
          background: '#faf9f7', borderBottom: '1px solid var(--md1-border)', fontFamily: FNT,
        }}>
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
          <DocumentRow
            key={d.id}
            doc={d}
            counts={counts[d.id]}
            onOpenDoc={onOpenDoc}
            onPreview={onPreview}
            onDownload={onDownload}
            onRequestRemove={onRequestRemove}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </section>
  )
}

function DocumentRow({ doc, counts, onOpenDoc, onPreview, onDownload, onRequestRemove, onRefresh }) {
  const total = counts?.total || 0
  const approved = counts?.approved || 0
  const promoted = counts?.promoted || 0

  // Whole row navigates to review (except clicks on title and three-dot menu).
  const canReview = total > 0 && (doc.status === 'ready_for_review' || doc.status === 'review_in_progress' || doc.status === 'review_complete')
  const handleRowClick = () => {
    if (canReview) onOpenDoc(doc.id)
  }
  const handleRowKey = (e) => {
    if (!canReview) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDoc(doc.id) }
  }

  return (
    <div
      className="md1-doc-row"
      onClick={handleRowClick}
      onKeyDown={handleRowKey}
      role={canReview ? 'button' : undefined}
      tabIndex={canReview ? 0 : -1}
      style={{
        display: 'grid', gridTemplateColumns: TABLE_COLS,
        padding: '12px 14px', fontSize: 12, alignItems: 'center',
        borderBottom: '1px solid #f0eeec',
        cursor: canReview ? 'pointer' : 'default',
        fontFamily: FNT, transition: 'background 120ms ease',
      }}
    >
      {/* Title cell — click opens a native preview in a new tab */}
      <div onClick={e => { e.stopPropagation(); onPreview(doc) }} style={{ cursor: 'pointer' }}>
        <span className="md1-title-link" style={{ fontWeight: 600, color: 'var(--md1-primary)', fontFamily: FNT, cursor: 'pointer' }}>
          {doc.title}
        </span>
        <div style={{ fontSize: 10, color: 'var(--md1-muted)', fontFamily: FNTM, marginTop: 2 }}>
          {(doc.file_size_bytes / 1024).toFixed(0)} KB · {doc.mime_type}
        </div>
      </div>
      <div style={{ color: 'var(--md1-muted)', fontFamily: FNT }}>
        {DOCUMENT_TYPES.find(t => t.value === doc.document_type)?.label || doc.document_type}
      </div>
      <div style={{ color: 'var(--md1-muted)', fontFamily: FNT }}>{doc.process_area || '—'}</div>
      <div style={{ color: 'var(--md1-muted)', fontFamily: FNTM, fontSize: 11 }}>{relativeDate(doc.created_at)}</div>
      <div><StatusBadge doc={doc} onRetry={async () => {
        try { await retryExtraction(doc.id); onRefresh?.() }
        catch (e) { alert(`Retry failed: ${e.message}`) }
      }} /></div>
      <div style={{ textAlign: 'right', fontFamily: FNTM, color: 'var(--md1-muted)' }}>{total || '—'}</div>
      <div style={{ textAlign: 'right', fontFamily: FNTM, color: approved > 0 ? '#2d6b5e' : 'var(--md1-muted)' }}>
        {total > 0 ? `${approved}/${total}` : '—'}
      </div>
      <div style={{ textAlign: 'right', fontFamily: FNTM, color: 'var(--md1-muted)' }}>{promoted || '—'}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        <ActionMenu
          canReview={canReview}
          onReview={() => onOpenDoc(doc.id)}
          onDownload={() => onDownload(doc)}
          onRemove={() => onRequestRemove(doc)}
        />
      </div>
    </div>
  )
}

// ── ActionMenu (three-dot dropdown) ─────────────────────────────────────────

function ActionMenu({ canReview, onReview, onDownload, onRemove }) {
  const [open, setOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(0)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const itemRefs = useRef([])

  const items = useMemo(() => {
    const arr = []
    if (canReview) arr.push({ key: 'review', label: 'Go to review', icon: <FileSearch size={14} />, onClick: onReview })
    arr.push({ key: 'download', label: 'Download document', icon: <Download size={14} />, onClick: onDownload })
    arr.push({ key: 'remove', label: 'Remove', icon: <Trash2 size={14} />, onClick: onRemove, danger: true })
    return arr
  }, [canReview, onReview, onDownload, onRemove])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() }
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(items.length - 1, i + 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setFocusIdx(i => Math.max(0, i - 1)) }
      if (e.key === 'Enter')     {
        e.preventDefault()
        const it = items[focusIdx]
        if (it) { setOpen(false); it.onClick() }
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, items, focusIdx])

  useEffect(() => {
    if (open) itemRefs.current[focusIdx]?.focus()
  }, [open, focusIdx])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); setFocusIdx(0) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpen(true); setFocusIdx(0) }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Actions"
        style={{
          width: 28, height: 28, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: open ? '#f0eeec' : 'transparent', border: '1px solid transparent',
          color: 'var(--md1-muted)', borderRadius: 3, cursor: 'pointer', fontFamily: FNT,
        }}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0,
            background: '#fff', border: '1px solid var(--md1-border)',
            borderRadius: 4, boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
            minWidth: 200, zIndex: 50, padding: 4, fontFamily: FNT,
          }}
        >
          {items.map((it, i) => (
            <button
              key={it.key}
              ref={el => (itemRefs.current[i] = el)}
              role="menuitem"
              tabIndex={i === focusIdx ? 0 : -1}
              className="md1-menu-item"
              onClick={() => { setOpen(false); it.onClick() }}
              onMouseEnter={() => setFocusIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '8px 10px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: FNT, fontSize: 12, fontWeight: 500,
                color: it.danger ? '#a52a2a' : 'var(--md1-text)', textAlign: 'left',
                borderRadius: 3,
              }}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ doc, onRetry }) {
  const meta = STATUS_DISPLAY[doc.status] || { label: doc.status, color: '#555', bg: '#eee' }
  if (doc.status === 'extracting') {
    const proc = doc.extraction_progress?.processed?.length ?? 0
    const failed = doc.extraction_progress?.failed?.length ?? 0
    const total = doc.extraction_progress?.total_chunks
    const hasProgress = total != null && total > 0
    const pct = hasProgress ? Math.round(((proc + failed) / total) * 100) : null
    return (
      <div style={{ fontFamily: FNT }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', background: meta.bg, color: meta.color, borderRadius: 2, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: FNT }}>
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
      <div style={{ fontFamily: FNT }} title={doc.extraction_error || ''}>
        <span style={{ display: 'inline-block', padding: '3px 8px', background: meta.bg, color: meta.color, borderRadius: 2, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: FNT }}>
          ⚠ {meta.label}
        </span>
        <button onClick={(e) => { e.stopPropagation(); onRetry?.() }} style={{ marginLeft: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, fontFamily: FNT, background: '#fff8e1', color: '#7a5800', border: '1px solid #f0d990', borderRadius: 3, cursor: 'pointer' }}>
          Retry
        </button>
        {doc.extraction_error && (
          <div style={{ marginTop: 3, fontSize: 10, color: '#a52a2a', maxWidth: 220, lineHeight: 1.4, fontFamily: FNT }}>
            {doc.extraction_error}
          </div>
        )}
      </div>
    )
  }
  return (
    <span style={{ display: 'inline-block', padding: '3px 8px', background: meta.bg, color: meta.color, borderRadius: 2, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: FNT }}>
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
    <section style={{ marginTop: 28, padding: 16, background: '#b8e0d8', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: FNT }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#2d6b5e', fontFamily: FNT }}>Ready to promote</div>
        <div style={{ fontSize: 12, color: '#2d6b5e', marginTop: 3, fontFamily: FNT }}>
          {approved} approved candidate{approved === 1 ? '' : 's'} across {docs} document{docs === 1 ? '' : 's'} can be promoted to the knowledge bank.
        </div>
      </div>
      <button onClick={onClick} style={{ padding: '8px 14px', background: '#2d6b5e', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FNT }}>
        Review and promote →
      </button>
    </section>
  )
}

// ── Remove confirmation modal ───────────────────────────────────────────────

function RemoveConfirmModal({ title, busy, onCancel, onConfirm }) {
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
      // Simple focus trap: Tab cycles between Cancel and Remove buttons.
      if (e.key === 'Tab') {
        const nodes = dialogRef.current?.querySelectorAll('button') || []
        if (nodes.length === 0) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: FNT,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog" aria-modal="true" aria-labelledby="remove-doc-title"
        style={{
          width: 480, maxWidth: '95vw', background: '#fff', borderRadius: 6,
          padding: '20px 22px', boxShadow: '0 16px 48px rgba(0,0,0,0.28)', fontFamily: FNT,
        }}
      >
        <div id="remove-doc-title" style={{ fontSize: 11, fontWeight: 700, color: '#a52a2a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: FNT }}>
          ⚠ REMOVE DOCUMENT
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--md1-primary)', marginBottom: 10, fontFamily: FNT }}>
          Remove “{title}”?
        </div>
        <div style={{ fontSize: 12, color: 'var(--md1-text)', lineHeight: 1.5, fontFamily: FNT, marginBottom: 16 }}>
          This will delete the document and all its candidates. Promoted rules will lose their source link
          but remain in the knowledge bank. This cannot be undone.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 600, fontFamily: FNT,
              background: 'transparent', border: '1px solid var(--md1-border)',
              color: 'var(--md1-muted)', borderRadius: 3, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 700, fontFamily: FNT,
              background: '#a52a2a', border: 'none', color: '#fff', borderRadius: 3,
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function FormGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', fontFamily: FNT }}>
      <div style={{ fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4, fontWeight: 700, fontFamily: FNT }}>{label}</div>
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

function relativeDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const dy = Math.floor(hr / 24)
  if (dy < 7) return `${dy}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
