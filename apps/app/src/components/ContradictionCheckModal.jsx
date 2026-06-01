import { useMemo } from 'react'

const FNT = "var(--md1-font-sans)"
const FNTM = "var(--md1-font-mono)"

// Modal shown after a single createRule / createAssertion when the
// contradiction-check edge function flags one or more candidates.
//
// Props:
//   results:  array of { candidate_id, candidate_internal_id, candidate_type,
//                        candidate_title, relationship, confidence,
//                        explanation, conditions_differ, shared_conditions }
//             (already filtered to ones the user should see — see decideUserAction).
//   newTitle: title of the new statement (for the header)
//   onCancel: () => void
//   onSaveAsRelatesTo:    () => void   — option A: save anyway + relates_to link
//   onSaveAsContradicting: () => void  — option B: save + contradicts link + flip statuses
//
// We hide low-confidence contradictions per the design doc — those are saved
// silently with a relates_to link by the caller, never reach this modal.

function relColor(rel) {
  return ({
    contradicts: { bg: '#fde8e5', border: '#c0392b', text: '#c0392b', label: 'Contradicts' },
    refines:     { bg: '#fff4d6', border: '#b8860b', text: '#7a5800', label: 'Refines' },
    complements: { bg: '#e8edf4', border: '#4a6785', text: '#4a6785', label: 'Complements' },
    unrelated:   { bg: '#f0eeec', border: '#999',    text: '#666',    label: 'Unrelated' },
  })[rel] || { bg: '#f0eeec', border: '#999', text: '#666', label: rel }
}

function confidenceLabel(c) {
  return ({ high: 'high confidence', medium: 'medium confidence', low: 'low confidence' })[c] || c
}

export default function ContradictionCheckModal({
  results, newTitle, onCancel, onSaveAsRelatesTo, onSaveAsContradicting,
}) {
  // Stable order: high-confidence first, then medium, then low.
  const sorted = useMemo(() => {
    const order = { high: 0, medium: 1, low: 2 }
    return [...(results || [])].sort((a, b) => (order[a.confidence] ?? 9) - (order[b.confidence] ?? 9))
  }, [results])

  // Detect near-duplicate (explanation starts with "Near-duplicate of")
  const nearDuplicate = sorted.find(r =>
    r.relationship === 'unrelated' &&
    /^near-duplicate of/i.test(r.explanation || '')
  )

  // If every flagged result has conditions_differ=true, the user is more
  // likely to want option A (relates_to). We don't disable the other option,
  // but we surface the suggestion in the copy.
  const allDiffer = sorted.length > 0 && sorted.every(r => r.conditions_differ)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div style={{
        width: 600, maxWidth: '95vw', maxHeight: '85vh', overflow: 'hidden',
        background: '#fff', borderRadius: 6,
        boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e8e4e0', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c0392b', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>
            ⚠ Potential contradiction
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--md1-primary)', fontFamily: FNT }}>
            {nearDuplicate ? 'This looks like an existing item' : 'Review before saving'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, marginTop: 4 }}>
            {newTitle}
          </div>
        </div>

        {/* Body — scrollable list */}
        <div style={{ padding: '14px 22px', overflowY: 'auto', flex: 1 }}>
          {nearDuplicate && (
            <div style={{ padding: '12px 14px', background: '#fff8e1', border: '1px solid #ffd54f', borderRadius: 4, marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#7a5800', fontFamily: FNT, marginBottom: 4 }}>
                Near-duplicate of an existing item
              </div>
              <div style={{ fontSize: 11, color: '#7a5800', fontFamily: FNT, lineHeight: 1.5 }}>
                {nearDuplicate.explanation}. Are you sure you want to add it?
              </div>
            </div>
          )}

          {sorted.map((r, i) => {
            const c = relColor(r.relationship)
            return (
              <div key={r.candidate_id + i} style={{
                padding: 12, border: `1px solid ${c.border}`, background: c.bg,
                borderRadius: 4, marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px',
                      background: c.text, color: '#fff', borderRadius: 2,
                      letterSpacing: 0.5, textTransform: 'uppercase',
                      fontFamily: FNT, marginRight: 6,
                    }}>{c.label}</span>
                    <span style={{ fontSize: 11, color: c.text, fontFamily: FNT, fontStyle: 'italic' }}>
                      {confidenceLabel(r.confidence)}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.text, fontFamily: FNTM, flexShrink: 0 }}>
                    {r.candidate_id}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--md1-text)', fontFamily: FNT, marginBottom: 6 }}>
                  {r.candidate_title}
                </div>
                <div style={{ fontSize: 11, color: '#5a5550', fontFamily: FNT, lineHeight: 1.5 }}>
                  {r.explanation}
                </div>
                {r.shared_conditions && (r.relationship === 'contradicts' || r.relationship === 'refines') && (
                  <div style={{ marginTop: 6, fontSize: 10, color: c.text, fontFamily: FNT, fontStyle: 'italic', lineHeight: 1.4 }}>
                    Both apply to: {r.shared_conditions}
                  </div>
                )}
              </div>
            )
          })}

          {!nearDuplicate && sorted.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8f6f4', borderRadius: 4, fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, lineHeight: 1.5 }}>
              {allDiffer
                ? 'Looks like these apply in different conditions. If so, save with a "relates to" link rather than flagging as contradicting.'
                : 'Review carefully. If you and the other rule apply under the same conditions, flag as contradicting and an admin can resolve.'}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid #e8e4e0', display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', flexShrink: 0 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 14px', fontSize: 12, fontWeight: 600, fontFamily: FNT,
              background: 'transparent', border: '1px solid var(--md1-border)',
              color: 'var(--md1-muted)', borderRadius: 3, cursor: 'pointer',
            }}
          >
            Cancel — let me revise
          </button>
          {!nearDuplicate && (
            <>
              <button
                onClick={onSaveAsRelatesTo}
                style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: 600, fontFamily: FNT,
                  background: '#fff', border: '1px solid var(--md1-primary)',
                  color: 'var(--md1-primary)', borderRadius: 3, cursor: 'pointer',
                }}
              >
                Different conditions — save as related
              </button>
              <button
                onClick={onSaveAsContradicting}
                style={{
                  padding: '8px 14px', fontSize: 12, fontWeight: 700, fontFamily: FNT,
                  background: '#c0392b', border: 'none',
                  color: '#fff', borderRadius: 3, cursor: 'pointer',
                }}
              >
                Save and flag as contradicting
              </button>
            </>
          )}
          {nearDuplicate && (
            <button
              onClick={onSaveAsRelatesTo}
              style={{
                padding: '8px 14px', fontSize: 12, fontWeight: 700, fontFamily: FNT,
                background: 'var(--md1-primary)', border: 'none',
                color: '#fff', borderRadius: 3, cursor: 'pointer',
              }}
            >
              Save anyway as a related item
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
