import { useState, useEffect, useRef } from 'react'
import { FNT, iS } from '../lib/constants.js'
import { fetchLinks, saveLink, deleteLink, searchKnowledge, fetchSuggestedLinks } from '../lib/db.js'
import { getDisplayName } from '../lib/userContext.js'
import { supabase, getStoredJwt } from '../lib/supabase.js'

// ── Relationship type config ───────────────────────────────────────────────────

const REL_TYPES = [
  'supports',
  'contradicts',
  'relates_to',
  'derived_from',
  'supersedes',
  'caused_by',
  'mitigates',
]

function relColor(r) {
  return ({
    supports:     { bg: '#e6f5f1', text: '#4FA89A' },
    contradicts:  { bg: '#fde8e5', text: '#c0392b' },
    relates_to:   { bg: '#f0eeec', text: '#8a8278' },
    derived_from: { bg: '#e8edf4', text: '#062044' },
    supersedes:   { bg: '#fef3e2', text: '#F2652F' },
    caused_by:    { bg: '#fde8e5', text: '#c0392b' },
    mitigates:    { bg: '#e6f5f1', text: '#16a085' },
  })[r] || { bg: '#f0eeec', text: '#8a8278' }
}

function relLabel(r) {
  return r.replace(/_/g, ' ')
}

// ── Main component ─────────────────────────────────────────────────────────────
//
// Props:
//   sourceType  — 'rule' | 'assertion'
//   sourceId    — e.g. 'R-001'
//   onOpenItem  — (type, id) => void  called when user clicks a linked item

export default function LinkEditor({ sourceType, sourceId, onOpenItem, sourceMeta }) {
  const [links, setLinks] = useState([])
  const [editMode, setEditMode] = useState(false)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)   // { id, type, title, processArea }
  const [relType, setRelType] = useState('supports')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [dbg, setDbg] = useState(null)
  const searchRef = useRef(null)
  const debounce = useRef(null)

  useEffect(() => {
    load()
  }, [sourceType, sourceId])

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => doSearch(search), 220)
    return () => clearTimeout(debounce.current)
  }, [search])

  useEffect(() => {
    if (editMode && sourceMeta?.processArea) {
      setSuggestionsLoading(true)
      fetchSuggestedLinks(sourceType, sourceId, sourceMeta.processArea, sourceMeta.category)
        .then(res => {
          const linkedKeys = new Set(links.map(l => `${l.linkedType}:${l.linkedId}`))
          setSuggestions(res.filter(r => !linkedKeys.has(`${r.type}:${r.id}`)))
        })
        .finally(() => setSuggestionsLoading(false))
    } else {
      setSuggestions([])
    }
  }, [editMode, sourceType, sourceId, sourceMeta])

  async function load() {
    // ── DEBUG: raw queries ──────────────────────────────────────────────────
    const jwt = getStoredJwt()
    const [srcRaw, tgtRaw, anyRaw] = await Promise.all([
      supabase.from('links').select('source_type,source_id,target_type,target_id,relationship_type').eq('source_type', sourceType).eq('source_id', sourceId),
      supabase.from('links').select('source_type,source_id,target_type,target_id,relationship_type').eq('target_type', sourceType).eq('target_id', sourceId),
      supabase.from('links').select('source_type,source_id,target_type,target_id,relationship_type').limit(5),
    ])
    setDbg({
      jwt: jwt ? jwt.substring(0, 30) + '…' : 'MISSING — using anon key!',
      jwtPresent: !!jwt,
      srcRows: srcRaw.data,
      srcError: srcRaw.error ? `${srcRaw.error.code}: ${srcRaw.error.message}` : null,
      tgtRows: tgtRaw.data,
      tgtError: tgtRaw.error ? `${tgtRaw.error.code}: ${tgtRaw.error.message}` : null,
      anyRows: anyRaw.data,
      anyError: anyRaw.error ? `${anyRaw.error.code}: ${anyRaw.error.message}` : null,
    })
    // ── END DEBUG ───────────────────────────────────────────────────────────
    const data = await fetchLinks(sourceType, sourceId)
    setLinks(data)
  }

  async function doSearch(q) {
    const res = await searchKnowledge(q, sourceType, sourceId)
    // Exclude items already linked
    const linkedKeys = new Set(links.map(l => `${l.linkedType}:${l.linkedId}`))
    setResults(res.filter(r => !linkedKeys.has(`${r.type}:${r.id}`)))
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    await saveLink(sourceType, sourceId, selected.type, selected.id, relType, comment, getDisplayName())
    await load()
    setSelected(null)
    setSearch('')
    setResults([])
    setComment('')
    setRelType('supports')
    setSaving(false)
  }

  async function handleDelete(linkId) {
    await deleteLink(linkId)
    setLinks(prev => prev.filter(l => l.id !== linkId))
  }

  return (
    <div>
      {/* ── DEBUG PANEL (remove when links confirmed working) ── */}
      {dbg && (
        <div style={{ marginBottom: 10, padding: '8px 10px', background: '#1a1a2e', borderRadius: 3, fontFamily: 'monospace', fontSize: 10, color: '#a0f0a0', lineHeight: 1.7 }}>
          <div style={{ color: '#ffcc00', fontWeight: 700, marginBottom: 4 }}>DEBUG — {sourceType}/{sourceId}</div>

          <div style={{ color: dbg.jwtPresent ? '#a0f0a0' : '#ff4040', marginBottom: 6 }}>
            JWT: {dbg.jwt}
          </div>

          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#80d8ff' }}>Q1</span> source_type='{sourceType}' AND source_id='{sourceId}':&nbsp;
            {dbg.srcError
              ? <span style={{ color: '#ff4040' }}>ERROR {dbg.srcError}</span>
              : <span style={{ color: '#a0f0a0' }}>{dbg.srcRows?.length ?? 0} rows</span>}
            {dbg.srcRows?.map((r, i) => (
              <div key={i} style={{ paddingLeft: 8, color: '#e0e0e0' }}>
                {r.source_type}/{r.source_id} → {r.target_type}/{r.target_id} [{r.relationship_type}]
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#80d8ff' }}>Q2</span> target_type='{sourceType}' AND target_id='{sourceId}':&nbsp;
            {dbg.tgtError
              ? <span style={{ color: '#ff4040' }}>ERROR {dbg.tgtError}</span>
              : <span style={{ color: '#a0f0a0' }}>{dbg.tgtRows?.length ?? 0} rows</span>}
            {dbg.tgtRows?.map((r, i) => (
              <div key={i} style={{ paddingLeft: 8, color: '#e0e0e0' }}>
                {r.source_type}/{r.source_id} → {r.target_type}/{r.target_id} [{r.relationship_type}]
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 4 }}>
            <span style={{ color: '#80d8ff' }}>Q3</span> SELECT * FROM links LIMIT 5 (any data visible?):&nbsp;
            {dbg.anyError
              ? <span style={{ color: '#ff4040' }}>ERROR {dbg.anyError}</span>
              : <span style={{ color: '#a0f0a0' }}>{dbg.anyRows?.length ?? 0} rows</span>}
            {dbg.anyRows?.map((r, i) => (
              <div key={i} style={{ paddingLeft: 8, color: '#e0e0e0' }}>
                {r.source_type}/{r.source_id} → {r.target_type}/{r.target_id} [{r.relationship_type}]
              </div>
            ))}
          </div>

          <div style={{ color: '#ffcc00', borderTop: '1px solid #333', paddingTop: 4, marginTop: 2 }}>
            fetchLinks result: {links.length} normalised link{links.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT }}>
          Links{links.length > 0 && <span style={{ color: '#4FA89A', marginLeft: 4 }}>({links.length})</span>}
        </div>
        <button
          onClick={() => { setEditMode(p => !p); setSelected(null); setSearch(''); setResults([]); setSuggestions([]) }}
          style={{
            fontSize: 9, padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: FNT, fontWeight: 600,
            background: editMode ? '#062044' : 'transparent',
            border: '1px solid ' + (editMode ? '#062044' : '#D8CEC3'),
            color: editMode ? '#fff' : '#8a8278',
          }}
        >
          {editMode ? 'Done' : 'Edit Links'}
        </button>
      </div>

      {/* Existing links list */}
      {links.length === 0 && !editMode && (
        <div style={{ fontSize: 11, color: '#D8CEC3', fontFamily: FNT, marginBottom: 4 }}>No links yet</div>
      )}

      {links.map(link => {
        const rc = relColor(link.relType)
        return (
          <div
            key={link.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5,
              padding: '6px 10px', background: '#f8f6f4', borderRadius: 3, border: '1px solid #e8e4e0',
            }}
          >
            {/* Direction arrow + rel type badge */}
            <span style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 2, flexShrink: 0,
              background: rc.bg, color: rc.text,
              fontFamily: FNT, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {link.direction === 'incoming' ? '← ' : ''}{relLabel(link.relType)}
            </span>

            {/* Linked item — clickable */}
            <button
              onClick={() => onOpenItem(link.linkedType, link.linkedId)}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 5, flex: 1,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
                minWidth: 0,
              }}
            >
              <span style={{ fontSize: 10, color: '#4FA89A', fontFamily: FNT, fontWeight: 700, flexShrink: 0 }}>
                {link.linkedId}
              </span>
              <span style={{ fontSize: 11, color: '#1F1F1F', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {link.linkedTitle}
              </span>
            </button>

            {/* Comment */}
            {link.comment && (
              <span style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, fontStyle: 'italic', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                "{link.comment}"
              </span>
            )}

            {/* Process area pill */}
            {link.linkedProcessArea && !editMode && (
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 2, background: '#f0eeec', color: '#8a8278', fontFamily: FNT, flexShrink: 0 }}>
                {link.linkedProcessArea}
              </span>
            )}

            {/* Delete button (edit mode only) */}
            {editMode && (
              <button
                onClick={() => handleDelete(link.id)}
                title="Remove link"
                style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 15, padding: '0 2px', flexShrink: 0, lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>
        )
      })}

      {/* Add link panel (edit mode) */}
      {editMode && (
        <div style={{ marginTop: 10, padding: '12px 14px', background: '#FFFFFF', border: '1px solid #D8CEC3', borderRadius: 4 }}>
          <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            Add Link
          </div>

          {/* Suggested links */}
          {(suggestionsLoading || suggestions.length > 0) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: '#b0a898', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Suggested
              </div>
              {suggestionsLoading && (
                <div style={{ fontSize: 11, color: '#D8CEC3', fontFamily: FNT }}>Loading…</div>
              )}
              {suggestions.map(s => (
                <div key={`${s.type}-${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, padding: '5px 8px', background: '#f8f6f4', borderRadius: 3, border: '1px solid #e8e4e0' }}>
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 2, flexShrink: 0, background: s.type === 'rule' ? '#e8edf4' : '#f0eeec', color: s.type === 'rule' ? '#062044' : '#8a8278', fontFamily: FNT, fontWeight: 700, textTransform: 'uppercase' }}>
                    {s.type}
                  </span>
                  <span style={{ fontSize: 10, color: '#4FA89A', fontFamily: FNT, fontWeight: 700, flexShrink: 0 }}>{s.id}</span>
                  <span style={{ fontSize: 11, color: '#1F1F1F', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                  <button
                    onClick={() => { setSelected(s); setSuggestions([]) }}
                    style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, background: '#062044', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, flexShrink: 0 }}
                  >
                    Link
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search input */}
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => { setSearch(e.target.value); if (selected) setSelected(null) }}
              placeholder="Search rules and assertions…"
              style={{ ...iS, fontSize: 11 }}
              autoFocus
            />
          </div>

          {/* Search results dropdown */}
          {results.length > 0 && !selected && (
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #D8CEC3', borderRadius: 3, marginBottom: 8, background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              {results.map(r => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => { setSelected(r); setSearch(''); setResults([]) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 10px', background: 'none', border: 'none',
                    borderBottom: '1px solid #f0eeec', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8f6f4'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <span style={{
                    fontSize: 9, padding: '1px 5px', borderRadius: 2, flexShrink: 0,
                    background: r.type === 'rule' ? '#e8edf4' : '#f0eeec',
                    color: r.type === 'rule' ? '#062044' : '#8a8278',
                    fontFamily: FNT, fontWeight: 700, textTransform: 'uppercase',
                  }}>
                    {r.type}
                  </span>
                  <span style={{ fontSize: 10, color: '#4FA89A', fontFamily: FNT, fontWeight: 700, flexShrink: 0 }}>{r.id}</span>
                  <span style={{ fontSize: 11, color: '#1F1F1F', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  {r.processArea && (
                    <span style={{ fontSize: 9, color: '#b0a898', fontFamily: FNT, flexShrink: 0 }}>{r.processArea}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Selected target indicator */}
          {selected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: '#e6f5f1', borderRadius: 3, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#4FA89A', fontFamily: FNT, fontWeight: 700 }}>{selected.id}</span>
              <span style={{ fontSize: 11, color: '#1F1F1F', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.title}</span>
              <button
                onClick={() => { setSelected(null); setSearch('') }}
                style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}
              >×</button>
            </div>
          )}

          {/* Relationship type + comment */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: '#b0a898', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Relationship</div>
              <select
                value={relType}
                onChange={e => setRelType(e.target.value)}
                style={{ ...iS, fontSize: 11 }}
              >
                {REL_TYPES.map(r => (
                  <option key={r} value={r}>{relLabel(r)}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: '#b0a898', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Comment (optional)</div>
              <input
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add context…"
                style={{ ...iS, fontSize: 11 }}
              />
            </div>
          </div>

          {/* Rel type preview */}
          {selected && (
            <div style={{ fontSize: 11, color: '#5a5550', fontFamily: FNT, marginBottom: 10, lineHeight: 1.5 }}>
              <span style={{ ...relColor(relType), padding: '1px 6px', borderRadius: 2, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>
                {relLabel(relType)}
              </span>
              {' '}→{' '}
              <span style={{ color: '#4FA89A', fontWeight: 600 }}>{selected.id}</span>
              {' '}{selected.title}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!selected || saving}
            style={{
              padding: '6px 16px', borderRadius: 3, fontSize: 11, fontFamily: FNT, fontWeight: 700, border: 'none',
              background: selected && !saving ? '#062044' : '#e8e4e0',
              color: selected && !saving ? '#fff' : '#b0a898',
              cursor: selected && !saving ? 'pointer' : 'default',
            }}
          >
            {saving ? 'Saving…' : 'Add Link'}
          </button>
        </div>
      )}
    </div>
  )
}
