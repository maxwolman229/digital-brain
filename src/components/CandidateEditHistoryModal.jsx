import { useState, useEffect, useRef } from 'react'
import { FNT, FNTM } from '../lib/constants.js'
import { fetchCandidateEdits } from '../lib/documents.js'

// =============================================================================
// CandidateEditHistoryModal — chronological view of edits for a candidate.
// Shows v0 (original from extraction) followed by each saved edit with the
// reviewer, date, reason, and field-by-field old → new diffs.
// =============================================================================

export default function CandidateEditHistoryModal({ candidate, onClose }) {
  const [edits, setEdits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const dialogRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchCandidateEdits(candidate.id)
        if (!cancelled) { setEdits(list); setLoading(false) }
      } catch (e) {
        if (!cancelled) { setError(e.message || String(e)); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [candidate.id])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: FNT,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog" aria-modal="true" aria-labelledby="edit-history-title"
        style={{
          width: 720, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto',
          background: '#fff', borderRadius: 6, padding: '20px 24px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)', fontFamily: FNT,
        }}
      >
        <div id="edit-history-title" style={{ fontSize: 11, fontWeight: 700, color: 'var(--md1-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          AUDIT TRAIL
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--md1-primary)', marginBottom: 16 }}>
          Edit history — {candidate.title}
        </div>

        {loading && <div style={{ color: 'var(--md1-muted)', fontSize: 12 }}>Loading edits…</div>}
        {error && <div style={{ color: '#a52a2a', fontSize: 12 }}>Failed to load: {error}</div>}

        {!loading && !error && (
          <>
            {/* Latest edits first; the list ends with v0 (original). */}
            {[...edits].reverse().map(e => <EditEntry key={e.id} entry={e} />)}
            <OriginalEntry candidate={candidate} />
          </>
        )}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 600, fontFamily: FNT,
              background: 'transparent', border: '1px solid var(--md1-border)',
              color: 'var(--md1-muted)', borderRadius: 3, cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function EditEntry({ entry }) {
  const fields = Object.keys(entry.field_changes || {})
  return (
    <div style={{ marginBottom: 14, padding: 12, border: '1px solid var(--md1-border)', borderRadius: 4, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--md1-primary)' }}>
          v{entry.version_number} — edited
        </div>
        <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNTM }}>
          {new Date(entry.edited_at).toLocaleString()}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--md1-text)', marginBottom: 8, lineHeight: 1.5 }}>
        <span style={{ fontStyle: 'italic', color: 'var(--md1-muted)' }}>Reason:</span> “{entry.reason}”
      </div>
      {fields.length === 0
        ? <div style={{ fontSize: 11, color: 'var(--md1-muted)' }}>(No field changes recorded.)</div>
        : fields.map(f => <FieldDiff key={f} field={f} change={entry.field_changes[f]} />)
      }
    </div>
  )
}

function OriginalEntry({ candidate }) {
  return (
    <div style={{ marginBottom: 14, padding: 12, border: '1px dashed var(--md1-border)', borderRadius: 4, background: '#faf9f7' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--md1-muted)', marginBottom: 4 }}>
        v0 — original extraction from document
      </div>
      <div style={{ fontSize: 12, color: 'var(--md1-muted)', lineHeight: 1.5 }}>
        Extracted on {new Date(candidate.created_at).toLocaleString()} from{' '}
        {candidate.source_section || (candidate.source_page ? `page ${candidate.source_page}` : 'unknown section')}.
      </div>
    </div>
  )
}

function FieldDiff({ field, change }) {
  const labelMap = { title: 'Title', content: 'Content', scope: 'Scope', rationale: 'Rationale' }
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700, marginBottom: 4 }}>
        {labelMap[field] || field}
      </div>
      <div style={{ marginBottom: 4, padding: '6px 10px', background: '#fde8e5', borderLeft: '3px solid #c0392b', fontSize: 12, color: '#7a1f15', whiteSpace: 'pre-wrap', borderRadius: 2 }}>
        <span style={{ fontFamily: FNTM, fontSize: 10, fontWeight: 700, marginRight: 6 }}>−</span>
        {change?.old ?? <em style={{ color: '#9a4a40' }}>(empty)</em>}
      </div>
      <div style={{ padding: '6px 10px', background: '#dff5e7', borderLeft: '3px solid #2d6b5e', fontSize: 12, color: '#1a4a3a', whiteSpace: 'pre-wrap', borderRadius: 2 }}>
        <span style={{ fontFamily: FNTM, fontSize: 10, fontWeight: 700, marginRight: 6 }}>+</span>
        {change?.new ?? <em style={{ color: '#5a7a6a' }}>(empty)</em>}
      </div>
    </div>
  )
}
