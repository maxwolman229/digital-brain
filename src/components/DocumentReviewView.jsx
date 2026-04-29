import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { ArrowLeft, ExternalLink, ChevronDown, ChevronRight, History } from 'lucide-react'
import { FNT, FNTM } from '../lib/constants.js'
import { getUserId } from '../lib/userContext.js'
import {
  fetchDocumentById, fetchCandidates,
  updateCandidateStatus, bulkUpdateCandidateStatus,
  getSignedUrl, fetchCandidateEdits,
  DOCUMENT_TYPES, STATUS_DISPLAY,
} from '../lib/documents.js'
import CandidateEditModal from './CandidateEditModal.jsx'
import CandidateEditHistoryModal from './CandidateEditHistoryModal.jsx'

// =============================================================================
// DocumentReviewView — SME review UI for one document's candidates.
// Spec: filter (status/type/confidence), bulk actions, per-card edit/approve/
// reject, edit modal with reason audit trail, edit-history viewer.
// Filter state persists in sessionStorage keyed by docId — refresh-survival
// without requiring a router change.
// =============================================================================

const FILTER_STORAGE_PREFIX = 'md1-doc-review-filter-'

const DEFAULT_FILTERS = {
  status:     'pending',     // 'all' | 'pending' | 'approved' | 'rejected' | 'promoted'
  type:       'all',         // 'all' | 'rule' | 'assertion'
  confidence: 'all',         // 'all' | 'high' | 'medium' | 'low'
}

const CONF_RANK = { high: 3, medium: 2, low: 1 }

export default function DocumentReviewView({ docId, plantId, onBack }) {
  const [doc,        setDoc]        = useState(null)
  const [cands,      setCands]      = useState([])
  const [editsByCand,setEditsByCand]= useState({})  // candId -> [edits]
  const [loading,    setLoading]    = useState(true)
  const [err,        setErr]        = useState(null)
  const [editing,    setEditing]    = useState(null)   // candidate object
  const [showHistory,setShowHistory]= useState(null)   // candidate object
  const [selected,   setSelected]   = useState(new Set())
  const [bulkConfirm,setBulkConfirm]= useState(null)   // { ids, action: 'reject' }
  const [filters,    setFiltersRaw] = useState(() => loadFilters(docId))
  const scrollRef = useRef(null)

  function setFilters(next) {
    const merged = typeof next === 'function' ? next(filters) : { ...filters, ...next }
    const filtersChanged = (
      merged.status !== filters.status
      || merged.type !== filters.type
      || merged.confidence !== filters.confidence
    )
    setFiltersRaw(merged)
    saveFilters(docId, merged)
    // Reset scroll on actual filter change so users start at the top of the
    // new visible set. Same-filter no-ops preserve scroll naturally.
    if (filtersChanged && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }

  const refresh = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([fetchDocumentById(docId), fetchCandidates(docId)])
      setDoc(d); setCands(c); setErr(null)
      // Pull edit-counts for candidates that may have been edited.
      const editedIds = c.filter(x => x.status === 'approved' || x.status === 'rejected').map(x => x.id)
      if (editedIds.length) {
        const map = {}
        await Promise.all(editedIds.map(async id => {
          try { map[id] = await fetchCandidateEdits(id) } catch { map[id] = [] }
        }))
        setEditsByCand(map)
      }
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [docId])

  useEffect(() => { refresh() }, [refresh])

  // Escape returns to landing (only when no modal is open).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !editing && !showHistory && !bulkConfirm) onBack()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [editing, showHistory, bulkConfirm, onBack])

  // Filter + sort candidates for the visible list.
  const visible = useMemo(() => {
    let list = cands
    if (filters.status === 'pending')  list = list.filter(c => c.status === 'pending_review')
    if (filters.status === 'approved') list = list.filter(c => c.status === 'approved')
    if (filters.status === 'rejected') list = list.filter(c => c.status === 'rejected')
    if (filters.status === 'promoted') list = list.filter(c => c.status === 'promoted')
    if (filters.type === 'rule')       list = list.filter(c => c.type === 'rule')
    if (filters.type === 'assertion')  list = list.filter(c => c.type === 'assertion')
    if (filters.confidence !== 'all')  list = list.filter(c => c.confidence === filters.confidence)
    // Sort: pending → confidence desc; others → created_at desc (newest first)
    if (filters.status === 'pending') {
      return [...list].sort((a, b) => (CONF_RANK[b.confidence] ?? 0) - (CONF_RANK[a.confidence] ?? 0))
    }
    return [...list].sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
  }, [cands, filters])

  // Stats — counted off the unfiltered set.
  const stats = useMemo(() => {
    const out = { total: cands.length, pending: 0, approved: 0, rejected: 0, promoted: 0 }
    for (const c of cands) {
      if (c.status === 'pending_review') out.pending++
      else if (c.status === 'approved') out.approved++
      else if (c.status === 'rejected') out.rejected++
      else if (c.status === 'promoted') out.promoted++
    }
    return out
  }, [cands])

  // ── Local-state mutators (optimistic; refresh on error revert) ──────────

  async function setOneStatus(c, nextStatus) {
    const prev = c.status
    const optimistic = cands.map(x => x.id === c.id ? { ...x, status: nextStatus, reviewed_at: new Date().toISOString() } : x)
    setCands(optimistic)
    setSelected(s => { const n = new Set(s); n.delete(c.id); return n })
    try { await updateCandidateStatus(c.id, nextStatus, getUserId()) }
    catch (e) {
      alert(`Couldn't update: ${e.message}`)
      setCands(prevList => prevList.map(x => x.id === c.id ? { ...x, status: prev } : x))
    }
  }

  async function bulkSetStatus(ids, nextStatus) {
    if (!ids.length) return
    const idSet = new Set(ids)
    const optimistic = cands.map(x => idSet.has(x.id) ? { ...x, status: nextStatus, reviewed_at: new Date().toISOString() } : x)
    setCands(optimistic)
    setSelected(new Set())
    try { await bulkUpdateCandidateStatus(ids, nextStatus, getUserId()) }
    catch (e) {
      alert(`Bulk update failed: ${e.message}`)
      refresh()
    }
  }

  async function handleViewOriginal() {
    if (!doc) return
    try {
      const url = await getSignedUrl(doc.file_path, 600)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) { alert(`Could not open: ${e.message}`) }
  }

  // Toggle selection
  function toggleSelect(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function selectAllPending() {
    setSelected(new Set(visible.filter(c => c.status === 'pending_review').map(c => c.id)))
  }

  function clearSelection() { setSelected(new Set()) }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '20px 24px', flex: 1, fontFamily: FNT, color: 'var(--md1-muted)' }}>
        Loading…
      </div>
    )
  }
  if (err || !doc) {
    return (
      <div style={{ padding: '20px 24px', flex: 1, fontFamily: FNT }}>
        <button onClick={onBack} style={backArrowButton()}><ArrowLeft size={18} /></button>
        <div style={{ marginTop: 16, color: '#a52a2a', fontSize: 13 }}>
          {err || 'Document not found.'}
        </div>
      </div>
    )
  }

  const selectedPendingIds = visible
    .filter(c => c.status === 'pending_review' && selected.has(c.id))
    .map(c => c.id)

  const highPendingIds = cands.filter(c => c.status === 'pending_review' && c.confidence === 'high').map(c => c.id)
  const lowPendingIds  = cands.filter(c => c.status === 'pending_review' && c.confidence === 'low').map(c => c.id)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: FNT, color: 'var(--md1-text)' }}>
      <style>{`
        .md1-card-row { transition: background 120ms ease; }
        .md1-cand-card[data-status="approved"] { border-left: 3px solid #2d6b5e; background: #f6fbf8; }
        .md1-cand-card[data-status="rejected"] { opacity: 0.62; }
        .md1-cand-card[data-status="promoted"] { border-left: 3px solid var(--md1-primary); background: #f7f9fc; }
        .md1-tab-btn:hover { background: #f0eeec; }
        .md1-tab-btn[data-active="true"] { background: var(--md1-primary); color: #fff; }
      `}</style>

      {/* Fixed header zone — does not scroll. Matches HealthDashboard's
          sticky-chrome treatment: section-bg + 1px border-bottom + a soft
          shadow so the scroll boundary is unambiguous. */}
      <div style={{
        flexShrink: 0,
        padding: '20px 24px 12px',
        borderBottom: '1px solid #e8e4e0',
        background: 'var(--md1-section-bg)',
        boxShadow: '0 2px 8px -6px rgba(0,0,0,0.18)',
        zIndex: 1,
      }}>
        <Header doc={doc} onBack={onBack} onViewOriginal={handleViewOriginal} />
        <StatsBar stats={stats} />
        <FilterToolbar
          filters={filters}
          setFilters={setFilters}
          stats={stats}
          selectedCount={selected.size}
          selectedPendingIds={selectedPendingIds}
          highPendingIds={highPendingIds}
          lowPendingIds={lowPendingIds}
          onSelectAllPending={selectAllPending}
          onClearSelection={clearSelection}
          onBulkApprove={(ids) => bulkSetStatus(ids, 'approved')}
          onBulkReject={(ids)  => setBulkConfirm({ ids, action: 'reject' })}
        />
      </div>

      {/* Scrollable candidate list */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px', WebkitOverflowScrolling: 'touch' }}>
        {visible.length === 0 ? (
          <EmptyState filters={filters} stats={stats} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visible.map(c => (
              <CandidateCard
                key={c.id}
                c={c}
                selected={selected.has(c.id)}
                onSelectToggle={() => toggleSelect(c.id)}
                edits={editsByCand[c.id] || []}
                onApprove={() => setOneStatus(c, 'approved')}
                onReject={()  => setOneStatus(c, 'rejected')}
                onEdit={()    => setEditing(c)}
                onShowHistory={() => setShowHistory(c)}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <CandidateEditModal
          candidate={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      )}
      {showHistory && (
        <CandidateEditHistoryModal
          candidate={showHistory}
          onClose={() => setShowHistory(null)}
        />
      )}
      {bulkConfirm && (
        <BulkConfirmModal
          count={bulkConfirm.ids.length}
          action={bulkConfirm.action}
          onCancel={() => setBulkConfirm(null)}
          onConfirm={async () => {
            const { ids, action } = bulkConfirm
            setBulkConfirm(null)
            await bulkSetStatus(ids, action === 'reject' ? 'rejected' : 'approved')
          }}
        />
      )}
    </div>
  )
}

// ── Header ──────────────────────────────────────────────────────────────────

function Header({ doc, onBack, onViewOriginal }) {
  const meta = STATUS_DISPLAY[doc.status] || { label: doc.status, color: '#555', bg: '#eee' }
  const docTypeLabel = DOCUMENT_TYPES.find(t => t.value === doc.document_type)?.label || doc.document_type
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
      <button
        onClick={onBack} aria-label="Back to documents" title="Back to documents"
        style={backArrowButton()}
      >
        <ArrowLeft size={18} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--md1-accent)', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: FNT }}>
          DOCUMENT REVIEW
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--md1-primary)', fontFamily: FNT, lineHeight: 1.2 }}>
          {doc.title}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ padding: '2px 8px', background: '#f0eeec', borderRadius: 2, fontWeight: 600, color: 'var(--md1-text)', textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 }}>{docTypeLabel}</span>
          {doc.process_area && <span>· {doc.process_area}</span>}
          <span>· uploaded {new Date(doc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span style={{
            marginLeft: 'auto', padding: '2px 8px',
            background: meta.bg, color: meta.color, borderRadius: 2,
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
          }}>
            {meta.label}
          </span>
        </div>
      </div>
      <button
        onClick={onViewOriginal}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', fontSize: 12, fontWeight: 600, fontFamily: FNT,
          background: '#fff', color: 'var(--md1-primary)',
          border: '1px solid var(--md1-border)', borderRadius: 3, cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <ExternalLink size={14} /> View original
      </button>
    </div>
  )
}

// ── Stats bar ───────────────────────────────────────────────────────────────

function StatsBar({ stats }) {
  const segs = [
    { key: 'pending',  count: stats.pending,  color: '#7a5800' },
    { key: 'approved', count: stats.approved, color: '#2d6b5e' },
    { key: 'rejected', count: stats.rejected, color: '#9c9890' },
    { key: 'promoted', count: stats.promoted, color: 'var(--md1-primary)' },
  ]
  const total = stats.total || 1
  return (
    <div style={{ marginBottom: 16, fontFamily: FNT }}>
      <div style={{ fontSize: 12, color: 'var(--md1-muted)' }}>
        <span style={{ color: 'var(--md1-text)', fontWeight: 700 }}>{stats.total}</span> candidate{stats.total === 1 ? '' : 's'}
        {' · '}<span style={{ color: '#7a5800' }}>{stats.pending} pending</span>
        {' · '}<span style={{ color: '#2d6b5e' }}>{stats.approved} approved</span>
        {' · '}<span style={{ color: '#7a7269' }}>{stats.rejected} rejected</span>
        {' · '}<span style={{ color: 'var(--md1-primary)' }}>{stats.promoted} promoted</span>
      </div>
      {stats.total > 0 && (
        <div style={{ marginTop: 6, height: 5, display: 'flex', borderRadius: 3, overflow: 'hidden', background: '#f0eeec' }}>
          {segs.map(s => s.count > 0 && (
            <div key={s.key} title={`${s.key}: ${s.count}`} style={{ width: `${(s.count / total) * 100}%`, background: s.color, transition: 'width 200ms ease' }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Filter / bulk action toolbar ────────────────────────────────────────────

function FilterToolbar({
  filters, setFilters, stats,
  selectedCount, selectedPendingIds,
  highPendingIds, lowPendingIds,
  onSelectAllPending, onClearSelection,
  onBulkApprove, onBulkReject,
}) {
  const STATUS_TABS = [
    { key: 'all',      label: 'All',      count: stats.total },
    { key: 'pending',  label: 'Pending',  count: stats.pending },
    { key: 'approved', label: 'Approved', count: stats.approved },
    { key: 'rejected', label: 'Rejected', count: stats.rejected },
    { key: 'promoted', label: 'Promoted', count: stats.promoted },
  ]

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 12,
      alignItems: 'center', fontFamily: FNT,
      padding: '10px 12px', background: '#faf9f7',
      border: '1px solid var(--md1-border)', borderRadius: 4,
    }}>
      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            className="md1-tab-btn"
            data-active={filters.status === t.key}
            onClick={() => setFilters({ status: t.key })}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600, fontFamily: FNT,
              background: 'transparent', color: 'var(--md1-text)',
              border: '1px solid var(--md1-border)', borderRadius: 3, cursor: 'pointer',
            }}
          >
            {t.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Type filter */}
      <select
        value={filters.type} onChange={e => setFilters({ type: e.target.value })}
        style={selectStyle()}
      >
        <option value="all">All types</option>
        <option value="rule">Rules only</option>
        <option value="assertion">Assertions only</option>
      </select>

      {/* Confidence filter */}
      <select
        value={filters.confidence} onChange={e => setFilters({ confidence: e.target.value })}
        style={selectStyle()}
      >
        <option value="all">All confidence</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      {/* Bulk actions on the right */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {selectedCount > 0 ? (
          <>
            <span style={{ fontSize: 11, color: 'var(--md1-muted)' }}>{selectedCount} selected</span>
            <button onClick={onClearSelection} style={subtleButton()}>Clear</button>
            <button onClick={() => onBulkApprove(selectedPendingIds)} disabled={selectedPendingIds.length === 0} style={primaryButton()}>
              Approve {selectedPendingIds.length}
            </button>
            <button onClick={() => onBulkReject(selectedPendingIds)} disabled={selectedPendingIds.length === 0} style={dangerButton()}>
              Reject {selectedPendingIds.length}
            </button>
          </>
        ) : (
          <>
            {filters.status === 'pending' && stats.pending > 0 && (
              <button onClick={onSelectAllPending} style={subtleButton()}>Select all pending</button>
            )}
            {highPendingIds.length > 0 && (
              <button onClick={() => onBulkApprove(highPendingIds)} style={primaryButton()}>
                Approve all high-confidence ({highPendingIds.length})
              </button>
            )}
            {lowPendingIds.length > 0 && (
              <button onClick={() => onBulkReject(lowPendingIds)} style={dangerOutlineButton()}>
                Reject all low-confidence ({lowPendingIds.length})
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Candidate card ──────────────────────────────────────────────────────────

function CandidateCard({ c, selected, onSelectToggle, edits, onApprove, onReject, onEdit, onShowHistory }) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const isPending  = c.status === 'pending_review'
  const isPromoted = c.status === 'promoted'

  const typeBadge = c.type === 'rule'
    ? { label: 'Rule', bg: '#e8edf4', text: '#062044' }
    : { label: 'Assertion', bg: '#dff2ed', text: '#2d6b5e' }
  const confColor = c.confidence === 'high'
    ? '#2d6b5e' : c.confidence === 'medium' ? '#b8860b' : '#9c9890'

  return (
    <div
      className="md1-cand-card"
      data-status={c.status === 'pending_review' ? 'pending' : c.status}
      style={{
        padding: 14, border: '1px solid var(--md1-border)', background: '#fff',
        borderRadius: 4, fontFamily: FNT,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {isPending && (
          <input
            type="checkbox" checked={!!selected} onChange={onSelectToggle}
            aria-label="Select candidate" style={{ marginTop: 4 }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 2,
              background: typeBadge.bg, color: typeBadge.text,
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: FNT,
            }}>{typeBadge.label}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: confColor, fontWeight: 600, fontFamily: FNT }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: confColor }} />
              {c.confidence}
            </span>
            {c.status !== 'pending_review' && (
              <StatusChip status={c.status} promotedTo={c.promoted_to_id} />
            )}
            {edits.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--md1-muted)', fontFamily: FNT }}>
                edited {edits.length}× ·{' '}
                <button
                  onClick={onShowHistory}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--md1-accent)', cursor: 'pointer', fontFamily: FNT, fontSize: 10, fontWeight: 600 }}
                >
                  view history
                </button>
              </span>
            )}
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--md1-primary)', fontFamily: FNT, marginBottom: 6 }}>
            {c.title}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--md1-text)', fontFamily: FNT, maxWidth: 760, marginBottom: 6 }}>
            {c.content}
          </div>
          {c.scope && (
            <div style={{ fontSize: 12, color: 'var(--md1-muted)', fontFamily: FNT, marginTop: 4 }}>
              <span style={{ fontWeight: 600 }}>Scope:</span> {c.scope}
            </div>
          )}
          {c.rationale && (
            <div style={{ fontSize: 12, color: 'var(--md1-muted)', fontFamily: FNT, marginTop: 2 }}>
              <span style={{ fontWeight: 600 }}>Rationale:</span> {c.rationale}
            </div>
          )}

          {/* Source (collapsible) */}
          <button
            onClick={() => setSourceOpen(o => !o)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10,
              padding: '4px 0', background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, color: 'var(--md1-accent)', fontFamily: FNT,
            }}
            aria-expanded={sourceOpen}
          >
            {sourceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Source from document
          </button>
          {sourceOpen && (
            <div style={{ marginTop: 6, padding: 10, background: '#faf9f7', borderRadius: 3, border: '1px solid var(--md1-border)' }}>
              <blockquote style={{ margin: 0, padding: '4px 12px', borderLeft: '3px solid var(--md1-accent)', fontSize: 12, color: 'var(--md1-text)', lineHeight: 1.6, fontFamily: FNT, whiteSpace: 'pre-wrap' }}>
                {c.source_excerpt}
              </blockquote>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNTM }}>
                {c.source_section || (c.source_page ? `Page ${c.source_page}` : 'Unknown section')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions row */}
      {isPending && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onEdit}    style={subtleButton()}>Edit</button>
          <button onClick={onReject}  style={dangerOutlineButton()}>Reject</button>
          <button onClick={onApprove} style={primaryButton()}>Approve</button>
        </div>
      )}
    </div>
  )
}

function StatusChip({ status, promotedTo }) {
  if (status === 'approved') {
    return <span style={{ padding: '2px 8px', borderRadius: 2, background: '#dff2ed', color: '#2d6b5e', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: FNT }}>Approved</span>
  }
  if (status === 'rejected') {
    return <span style={{ padding: '2px 8px', borderRadius: 2, background: '#f0eeec', color: '#7a7269', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: FNT }}>Rejected</span>
  }
  if (status === 'promoted') {
    return (
      <span style={{ padding: '2px 8px', borderRadius: 2, background: '#e8edf4', color: 'var(--md1-primary)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: FNT }}>
        Promoted{promotedTo ? ` → ${promotedTo}` : ''}
      </span>
    )
  }
  return null
}

// ── Empty states ────────────────────────────────────────────────────────────

function EmptyState({ filters, stats }) {
  let msg = 'No candidates match the current filters.'
  if (stats.total === 0) {
    msg = 'No candidates were extracted from this document.'
  } else if (filters.status === 'pending' && stats.pending === 0) {
    msg = stats.approved > 0
      ? `All ${stats.total} candidates reviewed. ${stats.approved} approved, ready for promotion.`
      : 'All candidates reviewed.'
  }
  return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--md1-muted)', border: '1px dashed var(--md1-border)', borderRadius: 4, fontSize: 13, fontFamily: FNT }}>
      {msg}
    </div>
  )
}

// ── Bulk reject confirmation ────────────────────────────────────────────────

function BulkConfirmModal({ count, action, onCancel, onConfirm }) {
  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9500,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: FNT,
      }}
    >
      <div role="dialog" aria-modal="true" style={{
        width: 440, background: '#fff', borderRadius: 6, padding: '20px 22px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.28)', fontFamily: FNT,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#a52a2a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          ⚠ BULK REJECT
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--md1-primary)', marginBottom: 8 }}>
          Reject {count} candidate{count === 1 ? '' : 's'}?
        </div>
        <div style={{ fontSize: 12, color: 'var(--md1-text)', lineHeight: 1.5, marginBottom: 16 }}>
          Rejected candidates won't enter the knowledge bank. You can revisit them anytime in the
          Rejected tab.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={subtleButton()}>Cancel</button>
          <button onClick={onConfirm} style={dangerButton()}>Reject {count}</button>
        </div>
      </div>
    </div>
  )
}

// ── Style helpers ──────────────────────────────────────────────────────────

function backArrowButton() {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, padding: 0, background: 'transparent',
    border: '1px solid var(--md1-border)', borderRadius: 4,
    color: 'var(--md1-primary)', cursor: 'pointer', fontFamily: FNT, flexShrink: 0,
  }
}

function selectStyle() {
  return {
    padding: '6px 10px', fontSize: 11, fontFamily: FNT,
    border: '1px solid var(--md1-border)', borderRadius: 3,
    background: '#fff', color: 'var(--md1-text)',
  }
}

function primaryButton() {
  return {
    padding: '6px 12px', fontSize: 11, fontWeight: 700, fontFamily: FNT,
    background: 'var(--md1-primary)', color: '#fff',
    border: 'none', borderRadius: 3, cursor: 'pointer',
  }
}

function subtleButton() {
  return {
    padding: '6px 10px', fontSize: 11, fontWeight: 600, fontFamily: FNT,
    background: 'transparent', color: 'var(--md1-muted)',
    border: '1px solid var(--md1-border)', borderRadius: 3, cursor: 'pointer',
  }
}

function dangerButton() {
  return {
    padding: '6px 12px', fontSize: 11, fontWeight: 700, fontFamily: FNT,
    background: '#a52a2a', color: '#fff',
    border: 'none', borderRadius: 3, cursor: 'pointer',
  }
}

function dangerOutlineButton() {
  return {
    padding: '6px 12px', fontSize: 11, fontWeight: 600, fontFamily: FNT,
    background: 'transparent', color: '#a52a2a',
    border: '1px solid #a52a2a55', borderRadius: 3, cursor: 'pointer',
  }
}

// ── Filter persistence ─────────────────────────────────────────────────────

function loadFilters(docId) {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_PREFIX + docId)
    if (!raw) return { ...DEFAULT_FILTERS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_FILTERS, ...parsed }
  } catch { return { ...DEFAULT_FILTERS } }
}

function saveFilters(docId, filters) {
  try { sessionStorage.setItem(FILTER_STORAGE_PREFIX + docId, JSON.stringify(filters)) } catch {}
}
