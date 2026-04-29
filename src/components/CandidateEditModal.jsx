import { useState, useRef, useEffect } from 'react'
import { FNT, FNTM } from '../lib/constants.js'
import { editAndApproveCandidate, diffCandidate } from '../lib/documents.js'
import { getUserId } from '../lib/userContext.js'

// =============================================================================
// CandidateEditModal — edits a candidate's fields and approves it.
// Spec: every edit requires a reason which is captured in the audit trail
// (extraction_candidate_edits). The reason is required to save.
// =============================================================================

export default function CandidateEditModal({ candidate, onCancel, onSaved }) {
  const [title,     setTitle]     = useState(candidate.title || '')
  const [content,   setContent]   = useState(candidate.content || '')
  const [scope,     setScope]     = useState(candidate.scope || '')
  const [rationale, setRationale] = useState(candidate.rationale || '')
  const [reason,    setReason]    = useState('')
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState(null)

  const dialogRef = useRef(null)
  const titleRef  = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
    titleRef.current?.select()
  }, [])

  // Focus trap + Escape closes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCancel() }
      if (e.key === 'Tab') {
        const nodes = dialogRef.current?.querySelectorAll(
          'input, textarea, button, select, [tabindex]:not([tabindex="-1"])'
        )
        if (!nodes || nodes.length === 0) return
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const proposedDiff = diffCandidate(candidate, { title, content, scope, rationale })
  const hasChanges  = Object.keys(proposedDiff).length > 0
  const reasonValid = !hasChanges || reason.trim().length > 0

  async function handleSave() {
    if (!reasonValid) {
      setError('A reason is required when changing any field.')
      return
    }
    setBusy(true); setError(null)
    try {
      await editAndApproveCandidate({
        candidate,
        edits: { title, content, scope: scope || null, rationale: rationale || null },
        reason,
        reviewerUserId: getUserId(),
      })
      onSaved?.()
    } catch (e) {
      setError(e.message || String(e))
      setBusy(false)
    }
  }

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: FNT,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog" aria-modal="true" aria-labelledby="edit-cand-title"
        style={{
          width: 720, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto',
          background: '#fff', borderRadius: 6, padding: '20px 24px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.28)', fontFamily: FNT,
        }}
      >
        <div id="edit-cand-title" style={{ fontSize: 11, fontWeight: 700, color: 'var(--md1-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          EDIT CANDIDATE
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--md1-primary)', marginBottom: 18 }}>
          {candidate.type === 'rule' ? 'Rule' : 'Assertion'} — adjust before approving
        </div>

        <Field label="Title">
          <input
            ref={titleRef}
            value={title} onChange={e => setTitle(e.target.value)}
            style={inputStyle()}
            maxLength={120}
          />
        </Field>

        <Field label="Content">
          <textarea
            value={content} onChange={e => setContent(e.target.value)}
            style={{ ...inputStyle(), minHeight: 96, resize: 'vertical' }}
          />
        </Field>

        <Field label="Scope (optional)" hint="When does this apply? Equipment, grade, condition.">
          <input
            value={scope} onChange={e => setScope(e.target.value)}
            style={inputStyle()}
          />
        </Field>

        <Field label="Rationale (optional)" hint="Why is this true / important?">
          <textarea
            value={rationale} onChange={e => setRationale(e.target.value)}
            style={{ ...inputStyle(), minHeight: 60, resize: 'vertical' }}
          />
        </Field>

        {/* Read-only source ─────────────────────────────────────────────── */}
        <div style={{ marginTop: 18, padding: 12, background: '#faf9f7', border: '1px solid var(--md1-border)', borderRadius: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6, fontWeight: 700 }}>
            ORIGINAL SOURCE FROM DOCUMENT
          </div>
          <blockquote style={{ margin: 0, padding: '6px 12px', borderLeft: '3px solid var(--md1-accent)', fontFamily: FNT, fontSize: 12, color: 'var(--md1-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {candidate.source_excerpt}
          </blockquote>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNTM }}>
            {candidate.source_section || (candidate.source_page ? `Page ${candidate.source_page}` : 'Unknown section')}
          </div>
        </div>

        {/* Reason ───────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 18, opacity: hasChanges ? 1 : 0.55 }}>
          <Field
            label={hasChanges ? 'Why are you editing this? (required)' : 'Reason — only required if you change a field above'}
            hint="This is saved in the audit trail."
          >
            <input
              value={reason} onChange={e => setReason(e.target.value)}
              placeholder={hasChanges ? 'e.g. "Manual is outdated, current spec is 110°C"' : ''}
              disabled={!hasChanges}
              style={inputStyle()}
            />
          </Field>
        </div>

        {error && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#a52a2a', fontFamily: FNT }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel} disabled={busy}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 600, fontFamily: FNT,
              background: 'transparent', border: '1px solid var(--md1-border)',
              color: 'var(--md1-muted)', borderRadius: 3, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !reasonValid}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 700, fontFamily: FNT,
              background: !reasonValid ? '#aaa' : 'var(--md1-primary)',
              color: '#fff', border: 'none', borderRadius: 3,
              cursor: busy ? 'wait' : (!reasonValid ? 'not-allowed' : 'pointer'),
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Saving…' : 'Save and approve'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block', marginTop: 12, fontFamily: FNT }}>
      <div style={{ fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4, fontWeight: 700 }}>
        {label}
      </div>
      {children}
      {hint && <div style={{ marginTop: 3, fontSize: 11, color: 'var(--md1-muted)' }}>{hint}</div>}
    </label>
  )
}

function inputStyle() {
  return {
    width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: FNT,
    border: '1px solid var(--md1-border)', borderRadius: 3, color: 'var(--md1-text)',
    background: '#fff', boxSizing: 'border-box', lineHeight: 1.5,
  }
}
