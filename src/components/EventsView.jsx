import { useState, useEffect } from 'react'
import { FNT, FNTM, iS, IMPACTS, EVENT_STATUSES, EVENT_OUTCOMES, ISHIKAWA_CATS, formatDate, outcomeColor, impactColor, eventStatusColor } from '../lib/constants.js'
import { Badge, Tag, Modal, Field, TypeaheadInput } from './shared.jsx'
import { fetchEvents, addEvent } from '../lib/db.js'
import Comments from './Comments.jsx'

const CAT_COLORS = {
  Material: '#F2652F',
  Process: '#4FA89A',
  Equipment: '#888',
  People: '#c0392b',
  Measurement: '#5a5550',
  Environment: '#666',
}

const EMPTY_FORM = {
  title: '',
  outcome: 'Negative',
  processArea: '',
  impact: 'Moderate',
  reportedBy: '',
  description: '',
  ishikawa: { Material: [''], Process: [''], Equipment: [''], People: [''], Measurement: [''], Environment: [''] },
  resolution: '',
  taggedPeople: [],
  tags: '',
}

export default function EventsView({ reportOpen, onReportClose, processAreas = [], onItemSaved }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [tagInput, setTagInput] = useState('')
  const [fOutcome, setFOutcome] = useState([])
  const [fImpact, setFImpact] = useState([])
  const [fEvStatus, setFEvStatus] = useState([])
  const [fProc, setFProc] = useState([])

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (reportOpen) {
      setShowForm(true)
      onReportClose?.()
    }
  }, [reportOpen])

  async function load() {
    setLoading(true)
    const data = await fetchEvents()
    setEvents(data)
    setLoading(false)
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = events.filter(ev =>
    (fOutcome.length === 0 || fOutcome.includes(ev.outcome)) &&
    (fImpact.length === 0 || fImpact.includes(ev.impact)) &&
    (fEvStatus.length === 0 || fEvStatus.includes(ev.status)) &&
    (fProc.length === 0 || fProc.includes(ev.processArea))
  )
  const hasFilters = fOutcome.length > 0 || fImpact.length > 0 || fEvStatus.length > 0 || fProc.length > 0

  // ── Ishikawa form helpers ──────────────────────────────────────────────────

  function updateIshikawa(cat, idx, val) {
    setForm(f => {
      const arr = [...f.ishikawa[cat]]
      arr[idx] = val
      return { ...f, ishikawa: { ...f.ishikawa, [cat]: arr } }
    })
  }

  function addIshikawaRow(cat) {
    setForm(f => ({ ...f, ishikawa: { ...f.ishikawa, [cat]: [...f.ishikawa[cat], ''] } }))
  }

  function removeIshikawaRow(cat, idx) {
    setForm(f => {
      const arr = [...f.ishikawa[cat]]
      arr.splice(idx, 1)
      return { ...f, ishikawa: { ...f.ishikawa, [cat]: arr } }
    })
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!form.title.trim()) return
    const cleanIshikawa = {}
    ISHIKAWA_CATS.forEach(c => { cleanIshikawa[c] = form.ishikawa[c].filter(s => s.trim()) })

    const now = new Date().toISOString()
    const newEvent = {
      title: form.title,
      outcome: form.outcome,
      processArea: form.processArea,
      impact: form.impact,
      reportedBy: form.reportedBy || 'You',
      description: form.description,
      ishikawa: cleanIshikawa,
      resolution: form.resolution,
      taggedPeople: form.taggedPeople,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      status: 'Open',
      date: now,
      linkedRules: [],
      linkedAssertions: [],
      generatedRules: [],
      generatedAssertions: [],
      createdAt: now,
    }

    // Optimistic add with temporary local ID
    const localId = `E-${String(events.length + 1).padStart(3, '0')}`
    const localEvent = { ...newEvent, id: localId }
    setEvents(prev => [localEvent, ...prev])
    closeForm()

    const saved = await addEvent(newEvent)
    if (saved) {
      setEvents(prev => prev.map(e => e.id === localId ? saved : e))
      onItemSaved?.()
    }
  }

  function closeForm() {
    setShowForm(false)
    setForm(EMPTY_FORM)
    setTagInput('')
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Filter row ── */}
      <div style={{ padding: '12px 28px 0', borderBottom: '1px solid #e8e4e0', background: '#FAFAF9' }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', paddingBottom: 12, alignItems: 'flex-start' }}>
          <FilterGroup label="Outcome" options={EVENT_OUTCOMES} selected={fOutcome} onToggle={v => setFOutcome(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])} colorFn={outcomeColor} />
          <FilterGroup label="Impact" options={IMPACTS} selected={fImpact} onToggle={v => setFImpact(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])} colorFn={impactColor} />
          <FilterGroup label="Status" options={EVENT_STATUSES} selected={fEvStatus} onToggle={v => setFEvStatus(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])} colorFn={eventStatusColor} />
          {processAreas.length > 0 && <FilterGroup label="Process Area" options={processAreas} selected={fProc} onToggle={v => setFProc(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])} />}
          {hasFilters && (
            <button
              onClick={() => { setFOutcome([]); setFImpact([]); setFEvStatus([]); setFProc([]) }}
              style={{ alignSelf: 'flex-end', marginBottom: 2, background: 'none', border: 'none', color: '#4FA89A', fontSize: 11, cursor: 'pointer', fontFamily: FNT }}
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* ── List ── */}
      <div style={{ flex: 1, padding: '20px 28px', overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#b0a898', fontFamily: FNT, fontSize: 12 }}>Loading events…</div>
        )}

        {!loading && (
          <>
            <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, marginBottom: 12, letterSpacing: 0.8 }}>
              {filtered.length} EVENTS · SORTED BY DATE
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: '#D8CEC3', fontFamily: FNT, fontSize: 13 }}>
                No events match your filters.
              </div>
            )}

            {filtered.map(ev => (
              <EventCard key={ev.id} ev={ev} selected={sel?.id === ev.id} onClick={() => setSel(ev)} />
            ))}
          </>
        )}
      </div>

      {/* ── Detail modal ── */}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Event ${sel.id}` : ''} width={760}>
        {sel && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge label={sel.outcome} colorFn={outcomeColor} />
              <Badge label={sel.impact} colorFn={impactColor} />
              <Badge label={sel.status} colorFn={eventStatusColor} />
              <Tag label={sel.processArea} />
              <span style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, marginLeft: 'auto' }}>
                {formatDate(sel.date)} · {sel.reportedBy}
              </span>
            </div>

            <h3 style={{ fontSize: 16, color: '#062044', fontWeight: 700, lineHeight: 1.4, marginBottom: 12, fontFamily: FNT }}>
              {sel.title}
            </h3>

            <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.6, marginBottom: 16, padding: '10px 14px', background: '#f8f6f4', borderRadius: 3, border: `1px solid ${sel.outcome === 'Positive' ? '#4FA89A20' : '#D8CEC380'}` }}>
              {sel.description}
            </div>

            {/* Tagged people */}
            {(sel.taggedPeople || []).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT }}>Tagged:</span>
                {sel.taggedPeople.map((p, i) => (
                  <span key={i} style={{ padding: '3px 10px', borderRadius: 3, background: '#e8edf4', color: '#062044', fontSize: 10, fontFamily: FNT, fontWeight: 600 }}>{p}</span>
                ))}
              </div>
            )}

            {/* Ishikawa display */}
            <div style={{ fontSize: 10, color: '#F2652F', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, fontFamily: FNT, fontWeight: 700 }}>
              {sel.outcome === 'Positive' ? 'SUCCESS FACTOR ANALYSIS — ISHIKAWA' : 'ROOT CAUSE ANALYSIS — ISHIKAWA'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {ISHIKAWA_CATS.map(cat => {
                const items = (sel.ishikawa || {})[cat] || []
                if (!items.length) return null
                return (
                  <div key={cat} style={{ padding: '10px 12px', background: '#f8f6f4', borderRadius: 3, border: `1px solid ${CAT_COLORS[cat]}25` }}>
                    <div style={{ fontSize: 10, color: CAT_COLORS[cat], fontWeight: 700, fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{cat}</div>
                    {items.map((item, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#1F1F1F', lineHeight: 1.4, marginBottom: 3, paddingLeft: 8, borderLeft: `2px solid ${CAT_COLORS[cat]}40` }}>{item}</div>
                    ))}
                  </div>
                )
              })}
            </div>

            {/* Resolution */}
            {sel.resolution && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: '#4FA89A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: FNT, fontWeight: 700 }}>
                  {sel.outcome === 'Positive' ? 'Outcome & Takeaways' : 'Resolution'}
                </div>
                <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.5 }}>{sel.resolution}</div>
              </div>
            )}

            {/* Linked knowledge */}
            {((sel.linkedRules || []).length > 0 || (sel.linkedAssertions || []).length > 0) && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                {(sel.linkedRules || []).length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: FNT }}>Linked Rules</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {sel.linkedRules.map(lid => (
                        <span key={lid} style={{ padding: '2px 8px', borderRadius: 2, fontSize: 11, background: '#f0eeec', color: '#4FA89A', fontFamily: FNT, fontWeight: 600, border: '1px solid #4FA89A30' }}>{lid}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(sel.linkedAssertions || []).length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: FNT }}>Linked Assertions</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {sel.linkedAssertions.map(lid => (
                        <span key={lid} style={{ padding: '2px 8px', borderRadius: 2, fontSize: 11, background: '#f0eeec', color: '#8a8278', fontFamily: FNT, fontWeight: 600, border: '1px solid #D8CEC3' }}>{lid}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Generated knowledge */}
            {((sel.generatedRules || []).length > 0 || (sel.generatedAssertions || []).length > 0) && (
              <div style={{ padding: '10px 14px', background: '#e6f5f1', border: '1px solid #4FA89A20', borderRadius: 3, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: '#4FA89A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: FNT, fontWeight: 700 }}>Knowledge Generated From This Incident</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[...(sel.generatedRules || []), ...(sel.generatedAssertions || [])].map(id => (
                    <span key={id} style={{ padding: '2px 8px', borderRadius: 2, fontSize: 11, background: '#f0eeec', color: '#4FA89A', fontFamily: FNT, fontWeight: 600 }}>{id}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Generate button */}
            <button style={{ width: '100%', padding: '12px 0', borderRadius: 3, fontSize: 13, background: '#F2652F', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.4, marginBottom: 4 }}>
              {`Generate ${sel.outcome === 'Positive' ? 'Best-Practice' : 'Preventive'} Rules & Assertions`}
            </button>
            <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, textAlign: 'center', marginBottom: 16 }}>AI generation — coming soon</div>

            {/* Tags */}
            {(sel.tags || []).length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                {sel.tags.map(t => <Tag key={t} label={t} />)}
              </div>
            )}

            {/* Comments */}
            <Comments targetType="event" targetId={sel.id} />
          </div>
        )}
      </Modal>

      {/* ── Report Event form modal ── */}
      <Modal open={showForm} onClose={closeForm} title="Report Event" width={760}>
        <div style={{ fontSize: 12, color: '#8a8278', lineHeight: 1.6, marginBottom: 16 }}>
          Document an operational event — positive or negative — with structured Ishikawa analysis. Each Ishikawa category captures contributing factors. After filing, you can generate rules and assertions that capture what worked or what to prevent.
        </div>

        <Field label="Event Title">
          <input style={iS} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Zero-defect HSLA campaign — Heats #4810–4818" />
        </Field>

        {/* Outcome toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {EVENT_OUTCOMES.map(o => (
            <button
              key={o}
              onClick={() => setForm({ ...form, outcome: o })}
              style={{
                flex: 1, padding: 10, borderRadius: 3, fontSize: 13, fontWeight: 700, fontFamily: FNT,
                letterSpacing: 0.4, cursor: 'pointer', transition: 'all 0.15s',
                border: form.outcome === o ? `2px solid ${o === 'Positive' ? '#4FA89A' : '#F2652F'}` : '2px solid #D8CEC3',
                background: form.outcome === o ? (o === 'Positive' ? '#e6f5f1' : '#fde8e5') : '#FFFFFF',
                color: form.outcome === o ? (o === 'Positive' ? '#4FA89A' : '#F2652F') : '#b0a898',
              }}
            >
              {o === 'Positive' ? '✓ Positive Outcome' : '✗ Negative Outcome'}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Process Area">
            <TypeaheadInput value={form.processArea} onChange={v => setForm({ ...form, processArea: v })} options={processAreas} placeholder="Type process area..." />
          </Field>
          <Field label="Impact">
            <select style={{ ...iS, cursor: 'pointer' }} value={form.impact} onChange={e => setForm({ ...form, impact: e.target.value })}>
              {IMPACTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Reported By">
            <input style={iS} value={form.reportedBy} onChange={e => setForm({ ...form, reportedBy: e.target.value })} placeholder="Name" />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            style={{ ...iS, height: 70, resize: 'vertical', lineHeight: 1.5 }}
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder={form.outcome === 'Positive' ? 'What went well? Include heat numbers, product grades, conditions that drove success...' : 'What happened? Include heat numbers, product grades, timing...'}
          />
        </Field>

        {/* Tag people */}
        <Field label="Tag People" hint="Tag team members to review, comment, or contribute to this event">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {form.taggedPeople.map((p, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 3, background: '#e8edf4', color: '#062044', fontSize: 10, fontFamily: FNT, fontWeight: 600 }}>
                {p}
                <button
                  onClick={() => setForm(f => ({ ...f, taggedPeople: f.taggedPeople.filter((_, j) => j !== i) }))}
                  style={{ background: 'none', border: 'none', color: '#8a8278', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
                >✕</button>
              </span>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              style={{ ...iS, fontSize: 11 }}
              placeholder="Type a name to tag..."
              onKeyDown={e => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  e.preventDefault()
                  setForm(f => ({ ...f, taggedPeople: [...f.taggedPeople, tagInput.trim()] }))
                  setTagInput('')
                }
              }}
            />
            <div style={{ position: 'absolute', right: 8, top: 7, fontSize: 9, color: '#b0a898', fontFamily: FNT }}>Enter to add</div>
          </div>
        </Field>

        {/* Ishikawa input grid */}
        <div style={{ fontSize: 10, color: '#F2652F', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, fontFamily: FNT, fontWeight: 700, marginTop: 8 }}>
          {form.outcome === 'Positive' ? 'SUCCESS FACTOR ANALYSIS — ISHIKAWA' : 'ROOT CAUSE ANALYSIS — ISHIKAWA'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {ISHIKAWA_CATS.map(cat => (
            <div key={cat} style={{ padding: '10px 12px', background: '#f8f6f4', borderRadius: 3, border: `1px solid ${CAT_COLORS[cat]}20` }}>
              <div style={{ fontSize: 10, color: CAT_COLORS[cat], fontWeight: 700, fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{cat}</div>
              {form.ishikawa[cat].map((val, i) => (
                <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <input
                    style={{ ...iS, fontSize: 11, padding: '4px 8px' }}
                    value={val}
                    onChange={e => updateIshikawa(cat, i, e.target.value)}
                    placeholder={`${cat} factor...`}
                  />
                  {form.ishikawa[cat].length > 1 && (
                    <button onClick={() => removeIshikawaRow(cat, i)} style={{ background: 'none', border: 'none', color: '#b0a898', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={() => addIshikawaRow(cat)} style={{ background: 'none', border: 'none', color: CAT_COLORS[cat], cursor: 'pointer', fontSize: 10, fontFamily: FNT, fontWeight: 600, padding: '2px 0' }}>
                + Add {cat.toLowerCase()} factor
              </button>
            </div>
          ))}
        </div>

        <Field
          label={form.outcome === 'Positive' ? 'Outcome & Takeaways' : 'Resolution / Corrective Actions'}
          hint={form.outcome === 'Positive' ? 'What made this successful? What should be replicated?' : 'Leave blank if still investigating'}
        >
          <textarea
            style={{ ...iS, height: 50, resize: 'vertical' }}
            value={form.resolution}
            onChange={e => setForm({ ...form, resolution: e.target.value })}
            placeholder={form.outcome === 'Positive' ? 'What conditions, decisions, or practices drove this success?' : 'What was done to resolve this?'}
          />
        </Field>

        <Field label="Tags" hint="Comma separated">
          <input
            style={iS}
            value={form.tags}
            onChange={e => setForm({ ...form, tags: e.target.value })}
            placeholder={form.outcome === 'Positive' ? 'hsla, zero-defect, best-practice, casting' : 'cracking, hsla, sims, casting'}
          />
        </Field>

        <button
          onClick={handleSubmit}
          disabled={!form.title.trim()}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 3, fontSize: 13, marginTop: 8, letterSpacing: 0.4,
            background: form.title.trim() ? (form.outcome === 'Positive' ? '#4FA89A' : '#c0392b') : '#f0eeec',
            border: 'none',
            color: form.title.trim() ? '#FFFFFF' : '#888',
            cursor: form.title.trim() ? 'pointer' : 'not-allowed',
            fontFamily: FNT, fontWeight: 700,
          }}
        >
          File Event Report
        </button>
      </Modal>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EventCard({ ev, selected, onClick }) {
  const [hovered, setHovered] = useState(false)
  const accentColor = ev.outcome === 'Positive' ? '#4FA89A' : '#c0392b'
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '16px 20px', marginBottom: 8, borderRadius: 3, cursor: 'pointer', transition: 'all 0.12s',
        background: selected ? '#f0eeec' : hovered ? '#f8f6f4' : '#FFFFFF',
        border: selected ? `1px solid ${accentColor}40` : '1px solid #e8e4e0',
        borderLeft: `3px solid ${accentColor}50`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#b0a898', fontFamily: FNT, fontWeight: 600 }}>{ev.id}</span>
          <Badge label={ev.outcome} colorFn={outcomeColor} />
          <Badge label={ev.impact} colorFn={impactColor} />
          <Badge label={ev.status} colorFn={eventStatusColor} />
        </div>
        <span style={{ fontSize: 9, color: '#D8CEC3', fontFamily: FNT }}>{formatDate(ev.date)}</span>
      </div>

      <div style={{ fontSize: 14, color: '#1F1F1F', fontWeight: 500, lineHeight: 1.4, marginBottom: 8 }}>
        {ev.title}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Tag label={ev.processArea} />
          {(ev.tags || []).slice(0, 3).map(t => <Tag key={t} label={t} />)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(ev.linkedRules || []).length > 0 && (
            <span style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT }}>{ev.linkedRules.length}R</span>
          )}
          {(ev.generatedRules || []).length > 0 && (
            <span style={{ fontSize: 10, color: '#4FA89A', fontFamily: FNT }}>+{ev.generatedRules.length} generated</span>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterGroup({ label, options, selected, onToggle, colorFn }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5, fontFamily: FNT }}>{label}</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {options.map(o => {
          const active = selected.includes(o)
          const c = colorFn ? colorFn(o) : { bg: '#f0eeec', text: '#1F1F1F' }
          return (
            <button
              key={o}
              onClick={() => onToggle(o)}
              style={{ padding: '3px 10px', borderRadius: 3, fontSize: 11, fontWeight: active ? 700 : 400, background: active ? c.bg : 'transparent', color: active ? c.text : '#8a8278', border: active ? `1px solid ${c.text}44` : '1px solid #D8CEC3', cursor: 'pointer', fontFamily: FNT }}
            >
              {o}
            </button>
          )
        })}
      </div>
    </div>
  )
}
