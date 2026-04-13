import { useState, useEffect } from 'react'
import { FNT, FNTM, statusColor, formatDate } from '../lib/constants.js'
import { Badge, Tag, Modal } from './shared.jsx'
import { useIsMobile } from '../lib/hooks.js'
import { fetchRules, fetchAssertions, fetchEvents, fetchComments, fetchVerifications, fetchContradictions, updateRule, updateAssertion, uploadPhoto, deletePhoto, requestArchive, confirmArchive, rejectArchive } from '../lib/db.js'
import { getUserId } from '../lib/userContext.js'
import Comments from './Comments.jsx'
import Verifications from './Verifications.jsx'
import LinkEditor from './LinkEditor.jsx'

// ─── Staleness detection ────────────────────────────────────────────────────────
const STALE_DAYS = 90

function checkStaleness(item, events) {
  const now = Date.now()
  const versions = item.versions || []
  const lastActivity = versions.length > 0
    ? Math.max(...versions.map(v => new Date(v.date).getTime()))
    : new Date(item.createdAt).getTime()
  const recentEventRef = events.some(ev => {
    const evDate = new Date(ev.date || ev.createdAt).getTime()
    if (now - evDate > STALE_DAYS * 86400000) return false
    return (ev.linkedRules || []).includes(item.id) ||
      (ev.linkedAssertions || []).includes(item.id) ||
      (ev.generatedRules || []).includes(item.id) ||
      (ev.generatedAssertions || []).includes(item.id)
  })
  if (recentEventRef) return { stale: false }
  const daysSince = Math.floor((now - lastActivity) / 86400000)
  return { stale: daysSince > STALE_DAYS, daysSince }
}

// ─── Component ─────────────────────────────────────────────────────────────────
export default function HealthDashboard({ onNavigate }) {
  const isMobile = useIsMobile()
  const [rules, setRules] = useState([])
  const [assertions, setAssertions] = useState([])
  const [events, setEvents] = useState([])
  const [verifications, setVerifications] = useState({})
  const [comments, setComments] = useState({})
  const [contradictions, setContradictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [topPeriod, setTopPeriod] = useState('all')
  const [sel, setSel] = useState(null)

  useEffect(() => {
    Promise.all([fetchRules(), fetchAssertions(), fetchEvents(), fetchContradictions()]).then(async ([r, a, ev, ctrs]) => {
      const rIds = r.map(x => x.id)
      const aIds = a.map(x => x.id)
      const [vr, va, cr, ca] = await Promise.all([
        fetchVerifications('rule', rIds),
        fetchVerifications('assertion', aIds),
        fetchComments('rule', rIds),
        fetchComments('assertion', aIds),
      ])
      setRules(r)
      setAssertions(a)
      setEvents(ev)
      setContradictions(ctrs)
      setVerifications({ ...vr, ...va })
      setComments({ ...cr, ...ca })
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--md1-muted-light)', fontFamily: FNT, fontSize: 13 }}>
      Loading health data…
    </div>
  )

  const allItems = [...rules, ...assertions]
  const staleItems = allItems.filter(item => {
    if (item.status === 'Retired' || item.status === 'Superseded') return false
    return checkStaleness(item, events).stale
  })
  const activeCount = allItems.filter(i =>
    i.status !== 'Retired' && i.status !== 'Stale' && i.status !== 'Contradicted'
  ).length

  function confirmValid(item) {
    const update = p => p.map(r => r.id !== item.id ? r : {
      ...r,
      versions: [...(r.versions || []), {
        version: (r.versions || []).length + 1,
        date: new Date().toISOString(),
        author: 'Health Review',
        change: 'Confirmed still valid',
        snapshot: r.title,
      }],
    })
    if (item.type === 'rule') setRules(update)
    else setAssertions(update)
  }

  function retireItem(item) {
    const update = p => p.map(r => r.id !== item.id ? r : {
      ...r,
      status: 'Retired',
      versions: [...(r.versions || []), {
        version: (r.versions || []).length + 1,
        date: new Date().toISOString(),
        author: 'Health Review',
        change: 'Retired after staleness review',
        snapshot: r.title,
      }],
    })
    if (item.type === 'rule') setRules(update)
    else setAssertions(update)
  }

  // Top Knowledge scoring
  const CUTOFFS = {
    day: new Date(Date.now() - 86400000),
    week: new Date(Date.now() - 604800000),
    month: new Date(Date.now() - 2592000000),
    year: new Date(Date.now() - 31536000000),
    all: new Date(0),
  }
  const topItems = allItems
    .filter(i => i.status !== 'Retired' && new Date(i.createdAt) >= CUTOFFS[topPeriod])
    .map(i => ({
      ...i,
      score:
        (verifications[i.id] || []).length * 3 +
        (comments[i.id] || []).length +
        allItems.filter(x => (x.linkedAssertions || x.linkedRules || []).includes(i.id)).length * 2 +
        (i.versions || []).length * 0.5,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)

  const retiredItems = allItems.filter(i => i.status === 'Retired')
  const pendingArchiveItems = allItems.filter(i => i.status === 'Pending Archive')

  // Helper to find an item by id from either rules or assertions
  function findItem(id) {
    return rules.find(r => r.id === id) || assertions.find(a => a.id === id) || null
  }

  // Update an item in local state after modifications (photos, etc.)
  function updateLocalItem(updated) {
    if (updated.type === 'rule') setRules(prev => prev.map(r => r.id === updated.id ? updated : r))
    else setAssertions(prev => prev.map(a => a.id === updated.id ? updated : a))
    setSel(updated)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Sticky stats bar ── */}
      <div style={{ flexShrink: 0, padding: isMobile ? '12px 16px' : '16px 28px', borderBottom: '1px solid #e8e4e0', background: 'var(--md1-section-bg)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
          <div style={{ padding: 16, background: contradictions.length > 0 ? '#fde8e5' : '#e6f5f1', borderRadius: 3, border: `1px solid ${contradictions.length > 0 ? '#c0392b20' : 'var(--md1-accent)20'}` }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: contradictions.length > 0 ? '#c0392b' : 'var(--md1-accent)', fontFamily: FNT }}>{contradictions.length}</div>
            <div style={{ fontSize: 11, color: '#5a5550', fontFamily: FNT, fontWeight: 600 }}>Contradicted</div>
          </div>
          <div style={{ padding: 16, background: staleItems.length > 0 ? '#fef3e2' : '#e6f5f1', borderRadius: 3, border: `1px solid ${staleItems.length > 0 ? '#F2652F20' : 'var(--md1-accent)20'}` }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: staleItems.length > 0 ? '#F2652F' : 'var(--md1-accent)', fontFamily: FNT }}>{staleItems.length}</div>
            <div style={{ fontSize: 11, color: '#5a5550', fontFamily: FNT, fontWeight: 600 }}>Stale</div>
          </div>
          <div style={{ padding: 16, background: '#e6f5f1', borderRadius: 3, border: '1px solid var(--md1-accent)20' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--md1-accent)', fontFamily: FNT }}>{activeCount}</div>
            <div style={{ fontSize: 11, color: '#5a5550', fontFamily: FNT, fontWeight: 600 }}>Active Knowledge</div>
          </div>
        </div>
      </div>

      {/* ── Body: 3-column on desktop, stacked on mobile ── */}
      <div style={isMobile
        ? { flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }
        : { flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', overflow: 'hidden' }
      }>

        {/* ── Column 1: Needs Review ── */}
        <div style={isMobile
          ? { borderBottom: '1px solid #e8e4e0' }
          : { borderRight: '1px solid #e8e4e0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
        }>
          <div style={{ flexShrink: 0, padding: '14px 20px 12px', borderBottom: '1px solid #e8e4e0' }}>
            <div style={{ fontSize: 13, color: '#c0392b', fontFamily: FNT, fontWeight: 700 }}>Needs Review</div>
          </div>
          <div style={isMobile ? { padding: '16px 20px' } : { flex: 1, padding: '16px 20px', overflowY: 'auto' }}>

            {(contradictions.length > 0 || staleItems.length > 0) ? (
              <>
                {contradictions.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: '#c0392b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontFamily: FNT, fontWeight: 700 }}>Contradicted</div>
                    {contradictions.map(c => (
                      <div key={c.id} style={{ padding: '14px 16px', background: '#fff', border: '1px solid #c0392b20', borderRadius: 3, marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: '#c0392b', fontFamily: FNT, fontWeight: 700 }}>
                            CONTRADICTION
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', fontFamily: FNT }}>
                            flagged by {c.flaggedBy} · {formatDate(c.flaggedAt)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                          <div
                            style={{ flex: 1, padding: '8px 10px', background: '#f8f6f4', borderRadius: 3, borderLeft: '3px solid #F2652F', cursor: 'pointer' }}
                            onClick={() => { const item = findItem(c.itemA.id); if (item) setSel(item) }}
                          >
                            <div style={{ fontSize: 9, color: 'var(--md1-muted)', fontFamily: FNT, fontWeight: 600, marginBottom: 2, textTransform: 'uppercase' }}>{c.itemA.type} · {c.itemA.displayId}</div>
                            <div style={{ fontSize: 12, color: 'var(--md1-text)', lineHeight: 1.3 }}>{c.itemA.title}</div>
                            {c.itemA.processArea && <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', marginTop: 3, fontFamily: FNT }}>{c.itemA.processArea}</div>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', fontSize: 16, color: '#c0392b', fontWeight: 700 }}>⇄</div>
                          <div
                            style={{ flex: 1, padding: '8px 10px', background: '#f8f6f4', borderRadius: 3, borderLeft: '3px solid #F2652F', cursor: 'pointer' }}
                            onClick={() => { const item = findItem(c.itemB.id); if (item) setSel(item) }}
                          >
                            <div style={{ fontSize: 9, color: 'var(--md1-muted)', fontFamily: FNT, fontWeight: 600, marginBottom: 2, textTransform: 'uppercase' }}>{c.itemB.type} · {c.itemB.displayId}</div>
                            <div style={{ fontSize: 12, color: 'var(--md1-text)', lineHeight: 1.3 }}>{c.itemB.title}</div>
                            {c.itemB.processArea && <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', marginTop: 3, fontFamily: FNT }}>{c.itemB.processArea}</div>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {staleItems.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: '#F2652F', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontFamily: FNT, fontWeight: 700 }}>Stale</div>
                    {staleItems.map(item => {
                      const st = checkStaleness(item, events)
                      return (
                        <div key={item.id} style={{ padding: '12px 16px', background: '#fff', border: '1px solid var(--md1-border)', borderRadius: 3, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{ flex: 1, cursor: 'pointer' }}
                            onClick={() => setSel(item)}
                          >
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 11, color: 'var(--md1-accent)', fontFamily: FNT, fontWeight: 600, textDecoration: 'underline' }}>{item.displayId}</span>
                              <Badge label={item.status} colorFn={statusColor} />
                              <span style={{ fontSize: 10, color: '#F2652F', fontFamily: FNT, fontWeight: 600 }}>{st.daysSince}d without activity</span>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--md1-text)', lineHeight: 1.3 }}>{item.title}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button
                              onClick={() => confirmValid(item)}
                              style={{ padding: '4px 10px', fontSize: 10, background: '#e6f5f1', border: '1px solid var(--md1-accent)30', borderRadius: 3, cursor: 'pointer', fontFamily: FNT, fontWeight: 700, color: 'var(--md1-accent)' }}
                            >Confirm Valid</button>
                            <button
                              onClick={() => retireItem(item)}
                              style={{ padding: '4px 10px', fontSize: 10, background: '#fde8e5', border: '1px solid #c0392b20', borderRadius: 3, cursor: 'pointer', fontFamily: FNT, fontWeight: 700, color: '#c0392b' }}
                            >Retire</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>✓</div>
                <div style={{ fontSize: 14, color: 'var(--md1-accent)', fontWeight: 700, fontFamily: FNT }}>No items need review</div>
              </div>
            )}

          </div>
        </div>

        {/* ── Column 2: Top Knowledge ── */}
        <div style={isMobile
          ? { borderBottom: '1px solid #e8e4e0' }
          : { borderRight: '1px solid #e8e4e0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
        }>
          <div style={{ flexShrink: 0, padding: '14px 20px 12px', borderBottom: '1px solid #e8e4e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--md1-primary)', fontFamily: FNT, fontWeight: 700 }}>Top Knowledge</div>
            <div style={{ display: 'flex', gap: 3 }}>
              {['day', 'week', 'month', 'year', 'all'].map(p => (
                <button
                  key={p}
                  onClick={() => setTopPeriod(p)}
                  style={{
                    padding: '2px 8px', borderRadius: 3, fontSize: 9, fontFamily: FNT,
                    fontWeight: topPeriod === p ? 700 : 400,
                    background: topPeriod === p ? 'var(--md1-primary)' : 'transparent',
                    color: topPeriod === p ? '#fff' : 'var(--md1-muted)',
                    border: topPeriod === p ? 'none' : '1px solid var(--md1-border)',
                    cursor: 'pointer',
                  }}
                >{p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}</button>
              ))}
            </div>
          </div>
          <div style={isMobile ? { padding: '16px 20px' } : { flex: 1, padding: '16px 20px', overflowY: 'auto' }}>

            {topItems.length > 0 ? topItems.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => setSel(item)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 3, marginBottom: 3, background: '#fff', border: '1px solid #e8e4e0', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8f6f4'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--md1-border)', fontFamily: FNT, width: 24, textAlign: 'right', flexShrink: 0 }}>{idx + 1}</span>
                <span style={{ fontSize: 10, color: 'var(--md1-accent)', fontFamily: FNT, fontWeight: 600, width: 40, flexShrink: 0 }}>{item.displayId}</span>
                <Badge label={item.status} colorFn={statusColor} />
                <div style={{ flex: 1, fontSize: 12, color: 'var(--md1-text)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.title}</div>
                {(verifications[item.id] || []).length > 0 && (
                  <span style={{ fontSize: 9, color: 'var(--md1-accent)', fontFamily: FNT, flexShrink: 0 }}>✓{(verifications[item.id] || []).length}</span>
                )}
                {(comments[item.id] || []).length > 0 && (
                  <span style={{ fontSize: 9, color: 'var(--md1-muted)', fontFamily: FNT, flexShrink: 0 }}>{(comments[item.id] || []).length}c</span>
                )}
              </div>
            )) : (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--md1-border)', fontSize: 12 }}>No knowledge items in this period.</div>
            )}

          </div>
        </div>

        {/* ── Column 3: Knowledge Archive ── */}
        <div style={isMobile ? {} : { display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, padding: '14px 20px 12px', borderBottom: '1px solid #e8e4e0' }}>
            <div style={{ fontSize: 13, color: 'var(--md1-muted)', fontFamily: FNT, fontWeight: 700 }}>Knowledge Archive</div>
          </div>
          <div style={isMobile ? { padding: '16px 20px' } : { flex: 1, padding: '16px 20px', overflowY: 'auto' }}>

            <div style={{ fontSize: 11, color: 'var(--md1-muted-light)', fontFamily: FNT, marginBottom: 14, lineHeight: 1.6 }}>
              Retired knowledge is preserved for reference. These items are no longer active but remain part of the plant's institutional memory.
            </div>

            {pendingArchiveItems.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#e67e22', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontFamily: FNT, fontWeight: 700 }}>Pending Archive</div>
                {pendingArchiveItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => setSel(item)}
                    style={{ padding: '10px 14px', background: '#fef3e2', border: '1px solid #e67e2220', borderRadius: 3, marginBottom: 4, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: '#e67e22', fontFamily: FNT, fontWeight: 600 }}>{item.displayId}</span>
                      <Badge label="Pending Archive" colorFn={statusColor} />
                      {item.processArea && <Tag label={item.processArea} />}
                    </div>
                    <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.3 }}>{item.title}</div>
                  </div>
                ))}
              </div>
            )}

            {retiredItems.length === 0 && pendingArchiveItems.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--md1-border)', fontSize: 12 }}>No retired knowledge yet.</div>
            ) : retiredItems.map(item => (
              <div
                key={item.id}
                onClick={() => setSel(item)}
                style={{ padding: '10px 14px', background: '#f8f6f4', border: '1px solid #e8e4e0', borderRadius: 3, marginBottom: 4, cursor: 'pointer', opacity: 0.7 }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNT, fontWeight: 600 }}>{item.displayId}</span>
                  <Badge label="Retired" colorFn={statusColor} />
                  {item.processArea && <Tag label={item.processArea} />}
                </div>
                <div style={{ fontSize: 12, color: 'var(--md1-muted)', lineHeight: 1.3 }}>{item.title}</div>
              </div>
            ))}

          </div>
        </div>

      </div>

      {/* ── Detail Modal ── */}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.displayId}${sel.versions?.length ? ' · v' + sel.versions.length : ''}` : ''} width={640}>
        {sel && (
          <div>
            {/* Pending Archive actions for the author */}
            {sel.status === 'Pending Archive' && getUserId() === sel.createdById && (
              <div style={{ marginBottom: 16, padding: '12px 14px', background: '#fef3e2', border: '1px solid #e67e2240', borderRadius: 3 }}>
                <div style={{ fontSize: 12, color: '#e67e22', fontFamily: FNT, fontWeight: 700, marginBottom: 8 }}>
                  Archive requested for this item — confirm or reject below.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={async () => {
                      await confirmArchive(sel.type, sel.id, sel.title)
                      updateLocalItem({ ...sel, status: 'Retired' })
                    }}
                    style={{ padding: '6px 14px', borderRadius: 3, fontSize: 12, background: '#c0392b', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: FNT, fontWeight: 700 }}
                  >Confirm Archive</button>
                  <button
                    onClick={async () => {
                      const prevStatus = await rejectArchive(sel.type, sel.id, sel.title, sel.versions || [])
                      updateLocalItem({ ...sel, status: prevStatus })
                    }}
                    style={{ padding: '6px 14px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid var(--md1-border)', color: 'var(--md1-muted)', cursor: 'pointer', fontFamily: FNT }}
                  >Reject Archive</button>
                </div>
              </div>
            )}

            {/* Title + badges */}
            <h3 style={{ fontSize: 16, color: 'var(--md1-primary)', fontWeight: 700, lineHeight: 1.4, marginBottom: 16, fontFamily: FNT }}>
              {sel.title}
            </h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {sel.status && <Badge label={sel.status} colorFn={statusColor} />}
              {sel.isContradicted && (
                <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, background: '#fde8e5', color: '#c0392b', fontFamily: FNT, fontWeight: 700, border: '1px solid #c0392b30' }}>⚠ Contradicted</span>
              )}
              {sel.category && <Tag label={sel.category} />}
              {sel.processArea && <Tag label={sel.processArea} />}
            </div>

            {/* Verify */}
            <Verifications targetType={sel.type} targetId={sel.id} createdById={sel.createdById} />

            {/* Detail */}
            <DetailSection label="Detail">
              <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{sel.scope || '—'}</div>
            </DetailSection>

            {/* Photos */}
            <PhotosSection
              photos={sel.photos || []}
              onAdd={async (file) => {
                const url = await uploadPhoto(file, sel.type, sel.id)
                const updated = { ...sel, photos: [...(sel.photos || []), url] }
                const updateFn = sel.type === 'rule' ? updateRule : updateAssertion
                await updateFn(sel.id, { title: sel.title, category: sel.category, processArea: sel.processArea, scope: sel.scope, rationale: sel.rationale, status: sel.status, tags: sel.tags, photos: updated.photos, changeNote: 'Added photo' })
                updateLocalItem(updated)
              }}
              onRemove={async (url) => {
                const updated = { ...sel, photos: (sel.photos || []).filter(p => p !== url) }
                const updateFn = sel.type === 'rule' ? updateRule : updateAssertion
                await updateFn(sel.id, { title: sel.title, category: sel.category, processArea: sel.processArea, scope: sel.scope, rationale: sel.rationale, status: sel.status, tags: sel.tags, photos: updated.photos, changeNote: 'Removed photo' })
                await deletePhoto(url)
                updateLocalItem(updated)
              }}
            />

            {/* Rationale (rules only) */}
            {sel.rationale && (
              <DetailSection label="Rationale">
                <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.5 }}>{sel.rationale}</div>
              </DetailSection>
            )}

            {/* Evidence */}
            <DetailSection label="Evidence">
              {(sel.evidence || []).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--md1-border)' }}>None recorded</div>
              )}
              {(sel.evidence || []).map((ev, i) => (
                <div key={i} style={{ padding: '8px 10px', background: '#f8f6f4', borderRadius: 4, marginBottom: 4, border: '1px solid var(--md1-border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNT, marginBottom: 3 }}>
                    {(ev.type || '').replace(/_/g, ' ').toUpperCase()} · {ev.date}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--md1-muted)', lineHeight: 1.4 }}>{ev.text}</div>
                </div>
              ))}
            </DetailSection>

            {/* Links */}
            <div style={{ marginBottom: 18 }}>
              <LinkEditor
                sourceType={sel.type}
                sourceId={sel.id}
                onOpenItem={(type, id) => {
                  const item = findItem(id)
                  if (item) setSel(item)
                }}
                sourceMeta={{ processArea: sel.processArea, category: sel.category, title: sel.title }}
              />
            </div>

            {/* Tags */}
            {(sel.tags || []).length > 0 && (
              <DetailSection label="Tags">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {sel.tags.map(t => <Tag key={t} label={t} />)}
                </div>
              </DetailSection>
            )}

            {/* Footer meta */}
            <div style={{ padding: '10px 0', borderTop: '1px solid var(--md1-border)', marginTop: 12, fontSize: 10, color: 'var(--md1-border)', fontFamily: FNT, lineHeight: 1.8 }}>
              <div>Created by: {sel.createdBy}</div>
              <div>Created: {formatDate(sel.createdAt)}</div>
            </div>

            {/* Comments */}
            <Comments targetType={sel.type} targetId={sel.id} />
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Local helper components ──────────────────────────────────────────────────

function DetailSection({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: FNT }}>
        {label}
      </div>
      {children}
    </div>
  )
}

const CameraIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 4 }}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)

function PhotosSection({ photos, onAdd, onRemove }) {
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [err, setErr] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setErr(null)
    try { await onAdd(file) } catch (ex) { setErr(ex.message) }
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT }}>Photos</div>
        <label style={{ cursor: 'pointer', fontSize: 11, color: 'var(--md1-accent)', fontFamily: FNT, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
          {uploading ? 'Uploading…' : <><CameraIcon /> Add Photo</>}
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{ display: 'none' }} onChange={handleFile} disabled={uploading} />
        </label>
      </div>
      {err && <div style={{ fontSize: 11, color: '#c0392b', marginBottom: 6 }}>{err}</div>}
      {photos.length === 0 && !uploading && (
        <div style={{ fontSize: 12, color: 'var(--md1-border)' }}>No photos attached</div>
      )}
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {photos.map((url, i) => (
            <div key={url} style={{ position: 'relative', flexShrink: 0 }}>
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                onClick={() => setLightbox(url)}
                style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 3, border: '1px solid var(--md1-border)', cursor: 'pointer' }}
              />
              <button
                onClick={() => onRemove(url)}
                title="Remove photo"
                style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(192,57,43,0.85)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 11, lineHeight: '20px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >×</button>
            </div>
          ))}
        </div>
      )}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={lightbox} alt="Full size" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
