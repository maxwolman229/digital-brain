import { useState, useEffect } from 'react'
import { FNT, FNTM, statusColor } from '../lib/constants.js'
import { Badge, Tag } from './shared.jsx'
import { fetchRules, fetchAssertions, fetchEvents, fetchComments, fetchVerifications } from '../lib/db.js'

// ─── Contradiction detection ───────────────────────────────────────────────────
const OPPOSE = [
  [/\breduce\b/i, /\bmaintain\b|\bstandard\b|\bnormal\b/i],
  [/\bslow\b|\bdecrease\b|\blower\b/i, /\bfast\b|\bincrease\b|\bhigher\b|\bstandard\b/i],
  [/\bavoid\b|\bnever\b|\bdo not\b|\bprohibit\b/i, /\buse\b|\ballow\b|\bpermit\b/i],
  [/\bextend\b|\blonger\b/i, /\bshorten\b|\bshorter\b|\breduce time\b/i],
  [/\brequire\b|\bmandatory\b|\balways\b/i, /\boptional\b|\bskip\b|\bnot required\b/i],
]

function detectContradictions(allRules) {
  const contradictions = []
  for (let i = 0; i < allRules.length; i++) {
    for (let j = i + 1; j < allRules.length; j++) {
      const a = allRules[i], b = allRules[j]
      if (a.status === 'Retired' || b.status === 'Retired') continue
      if (a.status === 'Superseded' || b.status === 'Superseded') continue
      const shareArea = a.processArea && b.processArea && a.processArea === b.processArea
      const shareCat = a.category && b.category &&
        (a.category.includes(b.category) || b.category.includes(a.category))
      if (!shareArea && !shareCat) continue
      const tA = (a.title || '').toLowerCase()
      const tB = (b.title || '').toLowerCase()
      for (const [pat1, pat2] of OPPOSE) {
        if ((pat1.test(tA) && pat2.test(tB)) || (pat1.test(tB) && pat2.test(tA))) {
          const scopeOverlap = !a.scope || !b.scope || a.scope === b.scope ||
            (a.scope || '').split(/[\s;,]+/).some(w =>
              w.length > 2 && (b.scope || '').toLowerCase().includes(w.toLowerCase())
            )
          if (scopeOverlap) {
            contradictions.push({
              ruleA: a, ruleB: b,
              reason: 'Opposing directives in same area',
              shared: shareArea ? a.processArea : a.category,
            })
            break
          }
        }
      }
    }
  }
  return contradictions
}

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
  const [rules, setRules] = useState([])
  const [assertions, setAssertions] = useState([])
  const [events, setEvents] = useState([])
  const [verifications, setVerifications] = useState({})
  const [comments, setComments] = useState({})
  const [loading, setLoading] = useState(true)
  const [topPeriod, setTopPeriod] = useState('all')

  useEffect(() => {
    Promise.all([
      fetchRules(),
      fetchAssertions(),
      fetchEvents(),
      fetchVerifications('rule'),
      fetchVerifications('assertion'),
      fetchComments('rule'),
      fetchComments('assertion'),
    ]).then(([r, a, ev, vr, va, cr, ca]) => {
      setRules(r)
      setAssertions(a)
      setEvents(ev)
      setVerifications({ ...vr, ...va })
      setComments({ ...cr, ...ca })
      setLoading(false)
    })
  }, [])

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b0a898', fontFamily: FNT, fontSize: 13 }}>
      Loading health data…
    </div>
  )

  const allItems = [...rules, ...assertions]
  const contradictions = detectContradictions(rules)
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Sticky stats bar ── */}
      <div style={{ flexShrink: 0, padding: '16px 28px', borderBottom: '1px solid #e8e4e0', background: '#FAFAF9' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div style={{ padding: 16, background: contradictions.length > 0 ? '#fde8e5' : '#e6f5f1', borderRadius: 3, border: `1px solid ${contradictions.length > 0 ? '#c0392b20' : '#4FA89A20'}` }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: contradictions.length > 0 ? '#c0392b' : '#4FA89A', fontFamily: FNT }}>{contradictions.length}</div>
            <div style={{ fontSize: 11, color: '#5a5550', fontFamily: FNT, fontWeight: 600 }}>Contradicted</div>
          </div>
          <div style={{ padding: 16, background: staleItems.length > 0 ? '#fef3e2' : '#e6f5f1', borderRadius: 3, border: `1px solid ${staleItems.length > 0 ? '#F2652F20' : '#4FA89A20'}` }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: staleItems.length > 0 ? '#F2652F' : '#4FA89A', fontFamily: FNT }}>{staleItems.length}</div>
            <div style={{ fontSize: 11, color: '#5a5550', fontFamily: FNT, fontWeight: 600 }}>Stale</div>
          </div>
          <div style={{ padding: 16, background: '#e6f5f1', borderRadius: 3, border: '1px solid #4FA89A20' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#4FA89A', fontFamily: FNT }}>{activeCount}</div>
            <div style={{ fontSize: 11, color: '#5a5550', fontFamily: FNT, fontWeight: 600 }}>Active Knowledge</div>
          </div>
        </div>
      </div>

      {/* ── 3-column body, each scrolls independently ── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', overflow: 'hidden' }}>

        {/* ── Column 1: Needs Review ── */}
        <div style={{ borderRight: '1px solid #e8e4e0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, padding: '14px 20px 12px', borderBottom: '1px solid #e8e4e0' }}>
            <div style={{ fontSize: 13, color: '#c0392b', fontFamily: FNT, fontWeight: 700 }}>Needs Review</div>
          </div>
          <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>

            {(contradictions.length > 0 || staleItems.length > 0) ? (
              <>
                {contradictions.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: '#c0392b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontFamily: FNT, fontWeight: 700 }}>Contradicted</div>
                    {contradictions.map((c, i) => (
                      <div key={i} style={{ padding: '14px 16px', background: '#fff', border: '1px solid #c0392b20', borderRadius: 3, marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#c0392b', fontFamily: FNT, fontWeight: 700, marginBottom: 6 }}>
                          CONFLICT IN {c.shared?.toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                          <div style={{ flex: 1, padding: '8px 10px', background: '#f8f6f4', borderRadius: 3, borderLeft: '3px solid #F2652F' }}>
                            <div style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT, fontWeight: 600, marginBottom: 2 }}>{c.ruleA.id}</div>
                            <div style={{ fontSize: 12, color: '#1F1F1F', lineHeight: 1.3 }}>{c.ruleA.title}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', fontSize: 16, color: '#c0392b', fontWeight: 900 }}>⇄</div>
                          <div style={{ flex: 1, padding: '8px 10px', background: '#f8f6f4', borderRadius: 3, borderLeft: '3px solid #F2652F' }}>
                            <div style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT, fontWeight: 600, marginBottom: 2 }}>{c.ruleB.id}</div>
                            <div style={{ fontSize: 12, color: '#1F1F1F', lineHeight: 1.3 }}>{c.ruleB.title}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => onNavigate?.('rules')}
                            style={{ padding: '4px 10px', fontSize: 10, background: '#fff', border: '1px solid #D8CEC3', borderRadius: 3, cursor: 'pointer', fontFamily: FNT, fontWeight: 600, color: '#5a5550' }}
                          >Edit {c.ruleA.id}</button>
                          <button
                            onClick={() => onNavigate?.('rules')}
                            style={{ padding: '4px 10px', fontSize: 10, background: '#fff', border: '1px solid #D8CEC3', borderRadius: 3, cursor: 'pointer', fontFamily: FNT, fontWeight: 600, color: '#5a5550' }}
                          >Edit {c.ruleB.id}</button>
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
                        <div key={item.id} style={{ padding: '12px 16px', background: '#fff', border: '1px solid #D8CEC3', borderRadius: 3, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{ flex: 1, cursor: 'pointer' }}
                            onClick={() => onNavigate?.(item.type === 'rule' ? 'rules' : 'assertions')}
                          >
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 11, color: '#4FA89A', fontFamily: FNT, fontWeight: 600, textDecoration: 'underline' }}>{item.id}</span>
                              <Badge label={item.status} colorFn={statusColor} />
                              <span style={{ fontSize: 10, color: '#F2652F', fontFamily: FNT, fontWeight: 600 }}>{st.daysSince}d without activity</span>
                            </div>
                            <div style={{ fontSize: 13, color: '#1F1F1F', lineHeight: 1.3 }}>{item.title}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button
                              onClick={() => confirmValid(item)}
                              style={{ padding: '4px 10px', fontSize: 10, background: '#e6f5f1', border: '1px solid #4FA89A30', borderRadius: 3, cursor: 'pointer', fontFamily: FNT, fontWeight: 700, color: '#4FA89A' }}
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
                <div style={{ fontSize: 14, color: '#4FA89A', fontWeight: 700, fontFamily: FNT }}>No items need review</div>
              </div>
            )}

          </div>
        </div>

        {/* ── Column 2: Top Knowledge ── */}
        <div style={{ borderRight: '1px solid #e8e4e0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, padding: '14px 20px 12px', borderBottom: '1px solid #e8e4e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#062044', fontFamily: FNT, fontWeight: 700 }}>Top Knowledge</div>
            <div style={{ display: 'flex', gap: 3 }}>
              {['day', 'week', 'month', 'year', 'all'].map(p => (
                <button
                  key={p}
                  onClick={() => setTopPeriod(p)}
                  style={{
                    padding: '2px 8px', borderRadius: 3, fontSize: 9, fontFamily: FNT,
                    fontWeight: topPeriod === p ? 700 : 400,
                    background: topPeriod === p ? '#062044' : 'transparent',
                    color: topPeriod === p ? '#fff' : '#8a8278',
                    border: topPeriod === p ? 'none' : '1px solid #D8CEC3',
                    cursor: 'pointer',
                  }}
                >{p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>

            {topItems.length > 0 ? topItems.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => onNavigate?.(item.type === 'rule' ? 'rules' : 'assertions')}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 3, marginBottom: 3, background: '#fff', border: '1px solid #e8e4e0', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8f6f4'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                <span style={{ fontSize: 14, fontWeight: 800, color: '#D8CEC3', fontFamily: FNT, width: 24, textAlign: 'right', flexShrink: 0 }}>{idx + 1}</span>
                <span style={{ fontSize: 10, color: '#4FA89A', fontFamily: FNT, fontWeight: 600, width: 40, flexShrink: 0 }}>{item.id}</span>
                <Badge label={item.status} colorFn={statusColor} />
                <div style={{ flex: 1, fontSize: 12, color: '#1F1F1F', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{item.title}</div>
                {(verifications[item.id] || []).length > 0 && (
                  <span style={{ fontSize: 9, color: '#4FA89A', fontFamily: FNT, flexShrink: 0 }}>✓{(verifications[item.id] || []).length}</span>
                )}
                {(comments[item.id] || []).length > 0 && (
                  <span style={{ fontSize: 9, color: '#8a8278', fontFamily: FNT, flexShrink: 0 }}>{(comments[item.id] || []).length}c</span>
                )}
              </div>
            )) : (
              <div style={{ padding: 20, textAlign: 'center', color: '#D8CEC3', fontSize: 12 }}>No knowledge items in this period.</div>
            )}

          </div>
        </div>

        {/* ── Column 3: Knowledge Archive ── */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, padding: '14px 20px 12px', borderBottom: '1px solid #e8e4e0' }}>
            <div style={{ fontSize: 13, color: '#8a8278', fontFamily: FNT, fontWeight: 700 }}>Knowledge Archive</div>
          </div>
          <div style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}>

            <div style={{ fontSize: 11, color: '#b0a898', fontFamily: FNT, marginBottom: 14, lineHeight: 1.6 }}>
              Retired knowledge is preserved for reference. These items are no longer active but remain part of the plant's institutional memory.
            </div>

            {retiredItems.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#D8CEC3', fontSize: 12 }}>No retired knowledge yet.</div>
            ) : retiredItems.map(item => (
              <div
                key={item.id}
                onClick={() => onNavigate?.(item.type === 'rule' ? 'rules' : 'assertions')}
                style={{ padding: '10px 14px', background: '#f8f6f4', border: '1px solid #e8e4e0', borderRadius: 3, marginBottom: 4, cursor: 'pointer', opacity: 0.7 }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, fontWeight: 600 }}>{item.id}</span>
                  <Badge label="Retired" colorFn={statusColor} />
                  {item.processArea && <Tag label={item.processArea} />}
                </div>
                <div style={{ fontSize: 12, color: '#8a8278', lineHeight: 1.3 }}>{item.title}</div>
              </div>
            ))}

          </div>
        </div>

      </div>
    </div>
  )
}
