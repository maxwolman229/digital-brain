import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  ArrowLeft, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { FNT, FNTM } from '../lib/constants.js'
import { getUserId } from '../lib/userContext.js'
import {
  fetchApprovedCandidatesGroupedByDoc, bulkPromoteCandidates,
  DOCUMENT_TYPES,
} from '../lib/documents.js'

// =============================================================================
// DocumentPromoteView — bulk promotion of approved candidates to live rules /
// assertions in the plant's knowledge bank.
//
// Layout mirrors DocumentReviewView's sticky-header pattern.
//
// Stages:
//   • 'list'    — show approved candidates grouped by document, allow filtering
//                 + selection; "Promote N" button opens confirm
//   • 'confirm' — confirmation modal (rendered over 'list')
//   • 'running' — promotion in progress; disabled UI + spinner overlay
//   • 'done'    — dedicated success screen with per-outcome summary
// =============================================================================

const POLL_MS = 20_000

export default function DocumentPromoteView({ plantId, plantName, onBack, onViewPromotedRules }) {
  const [groups,     setGroups]     = useState([])     // [{doc, candidates}]
  const [totalCount, setTotalCount] = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [err,        setErr]        = useState(null)

  // Filters
  const [docFilter,  setDocFilter]  = useState('all')   // 'all' | docId
  const [typeFilter, setTypeFilter] = useState('all')   // 'all' | 'rule' | 'assertion'

  // Selection (Set of candidate ids)
  const [selected, setSelected] = useState(() => new Set())

  // Collapse state (Set of docIds collapsed)
  const [collapsed, setCollapsed] = useState(() => new Set())

  // Confirm / running / done stage
  const [stage, setStage] = useState('list')   // 'list' | 'confirm' | 'running' | 'done'
  const [results, setResults] = useState(null) // bulkPromoteCandidates output
  const [removedNotice, setRemovedNotice] = useState(null)

  const scrollRef = useRef(null)

  const refresh = useCallback(async ({ skipSelectAll = false } = {}) => {
    try {
      const data = await fetchApprovedCandidatesGroupedByDoc(plantId)
      setGroups(data.groups)
      setTotalCount(data.totalCount)
      setErr(null)

      if (!skipSelectAll) {
        // Default-select every approved candidate on first load.
        const allIds = new Set(data.groups.flatMap(g => g.candidates.map(c => c.id)))
        setSelected(allIds)
      } else {
        // Drop selections for candidates that no longer exist (e.g. doc was
        // re-extracted) and surface a notice.
        setSelected(prev => {
          const live = new Set(data.groups.flatMap(g => g.candidates.map(c => c.id)))
          const next = new Set([...prev].filter(id => live.has(id)))
          if (next.size !== prev.size) {
            setRemovedNotice(`${prev.size - next.size} candidate(s) were removed because their source document changed.`)
            setTimeout(() => setRemovedNotice(null), 6000)
          }
          return next
        })
      }
    } catch (e) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [plantId])

  useEffect(() => { refresh() }, [refresh])

  // Poll while user is on the screen and not confirming/running/done.
  useEffect(() => {
    if (stage !== 'list') return undefined
    const t = setInterval(() => refresh({ skipSelectAll: true }), POLL_MS)
    return () => clearInterval(t)
  }, [stage, refresh])

  // Escape returns to landing (only when no overlay).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && stage === 'list') onBack()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [stage, onBack])

  // ── Filtering ──────────────────────────────────────────────────────────

  const visibleGroups = useMemo(() => {
    return groups
      .filter(g => docFilter === 'all' || g.doc.id === docFilter)
      .map(g => ({
        ...g,
        candidates: g.candidates.filter(c => typeFilter === 'all' || c.type === typeFilter),
      }))
      .filter(g => g.candidates.length > 0)
  }, [groups, docFilter, typeFilter])

  const visibleIds = useMemo(
    () => new Set(visibleGroups.flatMap(g => g.candidates.map(c => c.id))),
    [visibleGroups]
  )

  // Selection counters — only count selected items currently visible.
  const visibleSelectedCount = useMemo(
    () => visibleGroups.reduce((acc, g) => acc + g.candidates.filter(c => selected.has(c.id)).length, 0),
    [visibleGroups, selected]
  )
  const visibleTotalCount = useMemo(
    () => visibleGroups.reduce((acc, g) => acc + g.candidates.length, 0),
    [visibleGroups]
  )

  // ── Selection helpers ──────────────────────────────────────────────────

  function toggleOne(id) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleGroup(group) {
    const ids = group.candidates.map(c => c.id)
    const allSelected = ids.every(id => selected.has(id))
    setSelected(s => {
      const n = new Set(s)
      if (allSelected) ids.forEach(id => n.delete(id))
      else             ids.forEach(id => n.add(id))
      return n
    })
  }
  function selectAllVisible() {
    setSelected(s => { const n = new Set(s); for (const id of visibleIds) n.add(id); return n })
  }
  function deselectAll() {
    setSelected(new Set())
  }
  function toggleCollapse(docId) {
    setCollapsed(c => { const n = new Set(c); n.has(docId) ? n.delete(docId) : n.add(docId); return n })
  }

  // ── Promote action ─────────────────────────────────────────────────────

  async function runPromotion() {
    setStage('running')
    try {
      const idSet = selected
      const candidates = groups.flatMap(g =>
        g.candidates.filter(c => idSet.has(c.id))
      )
      const out = await bulkPromoteCandidates({
        candidates, plantId, userId: getUserId(),
      })
      setResults(out)
      setStage('done')
    } catch (e) {
      setResults({ promoted: [], duplicates: [], failed: [{ candidate: null, error: e?.message || String(e) }] })
      setStage('done')
    }
  }

  async function retryFailed() {
    if (!results?.failed?.length) return
    const candidates = results.failed.map(f => f.candidate).filter(Boolean)
    setStage('running')
    try {
      const out = await bulkPromoteCandidates({
        candidates, plantId, userId: getUserId(),
      })
      // Merge: keep prior promoted/duplicates, replace failed with retry result.
      setResults({
        promoted:   [...(results.promoted || []),   ...out.promoted],
        duplicates: [...(results.duplicates || []), ...out.duplicates],
        failed:     out.failed,
      })
      setStage('done')
    } catch (e) {
      setStage('done')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return <SkeletonScreen onBack={onBack} />
  }

  if (stage === 'done') {
    return (
      <PromotionSuccess
        results={results}
        plantName={plantName}
        onRetryFailed={retryFailed}
        onBackToIngestion={onBack}
        onViewPromotedRules={onViewPromotedRules}
      />
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: FNT, color: 'var(--md1-text)' }}>
      <style>{`
        .md1-promote-card:hover { background: #fafaf8; }
        .md1-tab-btn:hover { background: #f0eeec; }
      `}</style>

      {/* Sticky header */}
      <div style={{
        flexShrink: 0,
        padding: '20px 24px 14px',
        borderBottom: '1px solid #e8e4e0',
        background: 'var(--md1-section-bg)',
        boxShadow: '0 2px 8px -6px rgba(0,0,0,0.18)',
        zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} aria-label="Back to documents" title="Back to documents" style={backArrowButton()}>
            <ArrowLeft size={18} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--md1-accent)', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>
              ADMIN · BULK PROMOTION
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--md1-primary)', lineHeight: 1.2 }}>
              Promote candidates to Knowledge Bank
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--md1-muted)' }}>
              <span style={{ color: 'var(--md1-text)', fontWeight: 700 }}>{totalCount}</span> approved candidate{totalCount === 1 ? '' : 's'}
              {' · '}
              <span style={{ color: 'var(--md1-text)', fontWeight: 700 }}>{groups.length}</span> document{groups.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        {removedNotice && (
          <div role="status" style={{
            marginBottom: 10, padding: '8px 12px',
            background: '#fff8e1', border: '1px solid #f0d990', borderRadius: 3,
            fontSize: 11, color: '#7a5800',
          }}>
            ⚠ {removedNotice}
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '10px 12px', background: '#faf9f7', border: '1px solid var(--md1-border)', borderRadius: 4 }}>
          <select value={docFilter} onChange={e => setDocFilter(e.target.value)} style={selectStyle()}>
            <option value="all">All documents ({totalCount})</option>
            {groups.map(g => (
              <option key={g.doc.id} value={g.doc.id}>
                {g.doc.title} ({g.candidates.length})
              </option>
            ))}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle()}>
            <option value="all">All types</option>
            <option value="rule">Rules only</option>
            <option value="assertion">Assertions only</option>
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--md1-muted)' }}>
              {visibleSelectedCount} of {visibleTotalCount} selected
            </span>
            {visibleSelectedCount === visibleTotalCount && visibleTotalCount > 0
              ? <button onClick={deselectAll}     style={subtleButton()}>Deselect all</button>
              : <button onClick={selectAllVisible} style={subtleButton()}>Select all visible</button>
            }
            <button
              onClick={() => setStage('confirm')}
              disabled={visibleSelectedCount === 0}
              style={primaryButton(visibleSelectedCount === 0)}
            >
              Promote {visibleSelectedCount}
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable list */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px', WebkitOverflowScrolling: 'touch' }}>
        {err ? (
          <div style={{ color: '#a52a2a', fontSize: 13 }}>Failed to load: {err}</div>
        ) : visibleGroups.length === 0 ? (
          <EmptyState totalCount={totalCount} hasFilter={docFilter !== 'all' || typeFilter !== 'all'} />
        ) : (
          visibleGroups.map(g => (
            <DocGroup
              key={g.doc.id}
              group={g}
              selected={selected}
              collapsed={collapsed.has(g.doc.id)}
              onToggleCollapse={() => toggleCollapse(g.doc.id)}
              onToggleGroup={() => toggleGroup(g)}
              onToggleOne={toggleOne}
            />
          ))
        )}
      </div>

      {stage === 'confirm' && (
        <ConfirmModal
          count={visibleSelectedCount}
          plantName={plantName}
          onCancel={() => setStage('list')}
          onConfirm={runPromotion}
        />
      )}
      {stage === 'running' && <RunningOverlay count={visibleSelectedCount} />}
    </div>
  )
}

// ── Group + card ───────────────────────────────────────────────────────────

function DocGroup({ group, selected, collapsed, onToggleCollapse, onToggleGroup, onToggleOne }) {
  const ids = group.candidates.map(c => c.id)
  const groupSelectedCount = ids.filter(id => selected.has(id)).length
  const allChecked = groupSelectedCount === ids.length
  const someChecked = groupSelectedCount > 0 && !allChecked
  return (
    <section style={{ marginBottom: 14, border: '1px solid var(--md1-border)', borderRadius: 4, background: '#fff' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', background: '#faf9f7',
        borderBottom: collapsed ? 'none' : '1px solid var(--md1-border)',
        cursor: 'pointer', userSelect: 'none',
      }}>
        <button
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
          style={iconBtn()}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        <input
          type="checkbox"
          checked={allChecked}
          ref={el => { if (el) el.indeterminate = someChecked }}
          onChange={onToggleGroup}
          aria-label={`Toggle all candidates from ${group.doc.title}`}
          style={{ marginRight: 4 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--md1-primary)' }}>
            {group.doc.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--md1-muted)' }}>
            {group.candidates.length} candidate{group.candidates.length === 1 ? '' : 's'}
            {' · '}
            {DOCUMENT_TYPES.find(t => t.value === group.doc.document_type)?.label || group.doc.document_type}
            {group.doc.process_area ? ` · ${group.doc.process_area}` : ''}
          </div>
        </div>
        <div style={{ fontSize: 11, color: groupSelectedCount > 0 ? 'var(--md1-accent-deep)' : 'var(--md1-muted)', fontFamily: FNTM }}>
          {groupSelectedCount} / {ids.length}
        </div>
      </header>
      {!collapsed && (
        <div style={{ padding: '6px 8px' }}>
          {group.candidates.map(c => (
            <PromoteCard
              key={c.id}
              c={c}
              checked={selected.has(c.id)}
              onToggle={() => onToggleOne(c.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function PromoteCard({ c, checked, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  const typeBadge = c.type === 'rule'
    ? { label: 'Rule', bg: '#e8edf4', text: '#062044' }
    : { label: 'Assertion', bg: '#dff2ed', text: '#2d6b5e' }
  const confColor = c.confidence === 'high' ? '#2d6b5e'
    : c.confidence === 'medium' ? '#b8860b' : '#9c9890'
  const isLong = (c.content || '').length > 200
  const display = !isLong || expanded ? c.content : c.content.slice(0, 200).trim() + '…'

  return (
    <div
      className="md1-promote-card"
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '8px 10px', borderRadius: 3,
      }}
    >
      <input
        type="checkbox" checked={checked} onChange={onToggle}
        aria-label="Select candidate" style={{ marginTop: 4 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 4 }}>
          <span style={{
            padding: '2px 8px', borderRadius: 2,
            background: typeBadge.bg, color: typeBadge.text,
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: FNT,
          }}>{typeBadge.label}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: confColor, fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: confColor, display: 'inline-block' }} />
            {c.confidence}
          </span>
          {c.hasEdits && (
            <span style={{ fontSize: 10, color: 'var(--md1-muted)', fontStyle: 'italic' }}>edited</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--md1-muted)', fontFamily: FNTM }}>
            {c.source_section || (c.source_page ? `Page ${c.source_page}` : '')}
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--md1-primary)', lineHeight: 1.4 }}>
          {c.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--md1-text)', lineHeight: 1.5, marginTop: 2 }}>
          {display}
          {isLong && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{ background: 'transparent', border: 'none', padding: 0, marginLeft: 6, color: 'var(--md1-accent)', cursor: 'pointer', fontFamily: FNT, fontSize: 11, fontWeight: 600 }}
            >
              {expanded ? 'show less' : 'show more'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Confirm modal ──────────────────────────────────────────────────────────

function ConfirmModal({ count, plantName, onCancel, onConfirm }) {
  const dialogRef = useRef(null)
  const confirmRef = useRef(null)
  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Tab') {
        const nodes = dialogRef.current?.querySelectorAll('button')
        if (!nodes?.length) return
        const first = nodes[0], last = nodes[nodes.length - 1]
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
      <div ref={dialogRef} role="dialog" aria-modal="true" style={{
        width: 520, background: '#fff', borderRadius: 6, padding: '22px 24px',
        boxShadow: '0 16px 48px rgba(0,0,0,0.28)', fontFamily: FNT,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--md1-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          PROMOTION
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--md1-primary)', marginBottom: 10 }}>
          Promote {count} candidate{count === 1 ? '' : 's'} to the Knowledge Bank?
        </div>
        <div style={{ fontSize: 13, color: 'var(--md1-text)', lineHeight: 1.55, marginBottom: 18 }}>
          These will become Proposed rules and assertions in <strong>{plantName || 'this plant'}</strong>.
          They'll enter the standard verification lifecycle and be visible to all plant members.
          Source citations remain linked to the original documents.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={subtleButton()}>Cancel</button>
          <button ref={confirmRef} onClick={onConfirm} style={primaryButton()}>
            Promote {count} candidate{count === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Running overlay ────────────────────────────────────────────────────────

function RunningOverlay({ count }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(244,241,237,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <style>{`@keyframes md1-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ background: '#fff', padding: 24, border: '1px solid var(--md1-border)', borderRadius: 6, boxShadow: '0 6px 24px rgba(0,0,0,0.12)', fontFamily: FNT, textAlign: 'center', minWidth: 320 }}>
        <span style={{
          display: 'inline-block', width: 26, height: 26, border: '3px solid var(--md1-primary)',
          borderTopColor: 'transparent', borderRadius: '50%', animation: 'md1-spin 0.8s linear infinite',
          marginBottom: 12,
        }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--md1-primary)' }}>
          Promoting {count} candidate{count === 1 ? '' : 's'}…
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--md1-muted)' }}>
          Running duplicate checks and writing to the knowledge bank.
        </div>
      </div>
    </div>
  )
}

// ── Success screen ─────────────────────────────────────────────────────────

function PromotionSuccess({ results, plantName, onRetryFailed, onBackToIngestion, onViewPromotedRules }) {
  const promoted   = results?.promoted   || []
  const duplicates = results?.duplicates || []
  const failed     = results?.failed     || []
  const headlineRef = useRef(null)
  useEffect(() => { headlineRef.current?.focus() }, [])

  const [showDups, setShowDups] = useState(false)
  const [showFails, setShowFails] = useState(false)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', padding: '40px 24px', fontFamily: FNT }}>
      <div style={{
        maxWidth: 640, margin: '0 auto', padding: 28,
        background: '#fff', border: '1px solid var(--md1-border)', borderRadius: 6,
        textAlign: 'center', boxShadow: '0 6px 24px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <CheckCircle2 size={56} color="#2d6b5e" />
        </div>
        <h1 ref={headlineRef} tabIndex={-1} style={{ fontSize: 22, fontWeight: 800, color: 'var(--md1-primary)', margin: 0, fontFamily: FNT }}>
          Promotion complete
        </h1>
        <div style={{ marginTop: 14, fontSize: 14, color: 'var(--md1-text)', lineHeight: 1.6 }}>
          <span style={{ fontWeight: 700, color: '#2d6b5e' }}>
            {promoted.length} candidate{promoted.length === 1 ? '' : 's'} promoted
          </span>
          {' '}to the {plantName || ''} knowledge bank.
        </div>

        {duplicates.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--md1-muted)' }}>
            {duplicates.length} skipped as duplicate{duplicates.length === 1 ? '' : 's'} of existing rule{duplicates.length === 1 ? '' : 's'}
          </div>
        )}
        {failed.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#a52a2a', fontWeight: 700 }}>
            <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            {failed.length} failed to promote
          </div>
        )}

        {duplicates.length > 0 && (
          <div style={{ marginTop: 18, textAlign: 'left' }}>
            <button
              onClick={() => setShowDups(s => !s)}
              style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--md1-accent)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              aria-expanded={showDups}
            >
              {showDups ? '▾' : '▸'} View skipped duplicates
            </button>
            {showDups && (
              <div style={{ marginTop: 8, padding: 10, background: '#faf9f7', borderRadius: 3, border: '1px solid var(--md1-border)' }}>
                {duplicates.map(d => (
                  <div key={d.candidate.id} style={{ fontSize: 12, color: 'var(--md1-text)', marginBottom: 6, lineHeight: 1.45 }}>
                    “{d.candidate.title}” → matched <span style={{ fontFamily: FNTM, fontWeight: 700, color: 'var(--md1-primary)' }}>{d.existingDisplayId || d.existingId}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {failed.length > 0 && (
          <div style={{ marginTop: 16, textAlign: 'left' }}>
            <button
              onClick={() => setShowFails(s => !s)}
              style={{ background: 'transparent', border: 'none', padding: 0, color: '#a52a2a', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              aria-expanded={showFails}
            >
              {showFails ? '▾' : '▸'} View failed promotions
            </button>
            {showFails && (
              <div style={{ marginTop: 8, padding: 10, background: '#fde8e5', borderRadius: 3, border: '1px solid #e8b3ad' }}>
                {failed.map((f, i) => (
                  <div key={f.candidate?.id || i} style={{ fontSize: 12, color: '#7a1f15', marginBottom: 6, lineHeight: 1.45 }}>
                    {f.candidate?.title ? `“${f.candidate.title}” — ` : ''}{f.error}
                  </div>
                ))}
                <button
                  onClick={onRetryFailed}
                  style={{
                    marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', fontSize: 11, fontWeight: 700,
                    background: '#a52a2a', color: '#fff', border: 'none', borderRadius: 3,
                    cursor: 'pointer', fontFamily: FNT,
                  }}
                >
                  <RefreshCw size={12} /> Retry failed
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 22, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={onBackToIngestion} style={subtleButton()}>Back to documents</button>
          {promoted.length > 0 && (
            <button onClick={onViewPromotedRules} style={primaryButton()}>View promoted rules</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Empty / loading states ─────────────────────────────────────────────────

function EmptyState({ totalCount, hasFilter }) {
  const msg = totalCount === 0
    ? 'No approved candidates ready to promote. Approve some candidates in the document review screens first.'
    : hasFilter
      ? 'No candidates match the current filters.'
      : 'No candidates to show.'
  return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--md1-muted)', border: '1px dashed var(--md1-border)', borderRadius: 4, fontSize: 13, fontFamily: FNT }}>
      {msg}
    </div>
  )
}

function SkeletonScreen({ onBack }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: FNT }}>
      <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #e8e4e0', background: 'var(--md1-section-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={backArrowButton()}><ArrowLeft size={18} /></button>
          <div style={{ height: 24, width: 280, background: '#eee', borderRadius: 3 }} />
        </div>
      </div>
      <div style={{ padding: 24, color: 'var(--md1-muted)', fontSize: 12 }}>Loading approved candidates…</div>
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
function iconBtn() {
  return {
    background: 'transparent', border: 'none', padding: 2, cursor: 'pointer',
    color: 'var(--md1-muted)', display: 'inline-flex', alignItems: 'center',
  }
}
function selectStyle() {
  return {
    padding: '6px 10px', fontSize: 11, fontFamily: FNT,
    border: '1px solid var(--md1-border)', borderRadius: 3,
    background: '#fff', color: 'var(--md1-text)',
  }
}
function primaryButton(disabled = false) {
  return {
    padding: '6px 14px', fontSize: 12, fontWeight: 700, fontFamily: FNT,
    background: disabled ? '#aaa' : 'var(--md1-primary)', color: '#fff',
    border: 'none', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
function subtleButton() {
  return {
    padding: '6px 10px', fontSize: 11, fontWeight: 600, fontFamily: FNT,
    background: 'transparent', color: 'var(--md1-muted)',
    border: '1px solid var(--md1-border)', borderRadius: 3, cursor: 'pointer',
  }
}
