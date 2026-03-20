import { useState, useEffect, useRef } from 'react'
import { FNT, iS, IMPACTS, EVENT_STATUSES, EVENT_OUTCOMES, ISHIKAWA_CATS, formatDate, outcomeColor, impactColor, eventStatusColor, statusColor } from '../lib/constants.js'
import { Badge, Tag, Modal, Field, TypeaheadInput, MentionDropdown } from './shared.jsx'
import { fetchEvents, addEvent, updateEvent, updateEventStatus, fetchEventKnowledgeCounts, fetchEventConnectedKnowledge, saveLink, searchKnowledge, fetchItemById, fetchPlantMembers } from '../lib/db.js'
import { getDisplayName } from '../lib/userContext.js'
import { useMention } from '../lib/useMention.js'
import Comments from './Comments.jsx'
import EventCaptureView from './EventCaptureView.jsx'

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
  description: '',
  ishikawa: { Material: [''], Process: [''], Equipment: [''], People: [''], Measurement: [''], Environment: [''] },
  resolution: '',
  taggedPeople: [],
  tags: '',
}

export default function EventsView({ reportOpen, onReportClose, processAreas = [], industry, plantId, onItemSaved, onViewProfile }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [showModeModal, setShowModeModal] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showInterview, setShowInterview] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [tagInput, setTagInput] = useState('')
  const [members, setMembers] = useState([])
  const descRef = useRef(null)
  const { mentionQuery: descMention, handleMentionChange: handleDescChange, insertMention: insertDescMention } =
    useMention(form.description, v => setForm(f => ({ ...f, description: v })), descRef)
  const [fOutcome, setFOutcome] = useState([])
  const [fImpact, setFImpact] = useState([])
  const [fEvStatus, setFEvStatus] = useState([])
  const [fProc, setFProc] = useState([])

  // Edit / close state
  const [editingEventId, setEditingEventId] = useState(null) // id of event being edited
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closeResolution, setCloseResolution] = useState('')
  const [closeSaving, setCloseSaving] = useState(false)

  // Knowledge counts per event (for badges on cards)
  const [knowledgeCounts, setKnowledgeCounts] = useState({})

  // Connected knowledge for selected event
  const [connectedKnowledge, setConnectedKnowledge] = useState(null)
  const [connectedLoading, setConnectedLoading] = useState(false)

  // Mini knowledge item detail modal
  const [knowledgeItemSel, setKnowledgeItemSel] = useState(null) // { type, id }
  const [knowledgeItemDetail, setKnowledgeItemDetail] = useState(null)
  const [knowledgeItemLoading, setKnowledgeItemLoading] = useState(false)

  // Add Link inline state
  const [addLinkOpen, setAddLinkOpen] = useState(false)
  const [addLinkQuery, setAddLinkQuery] = useState('')
  const [addLinkResults, setAddLinkResults] = useState([])
  const [addLinkSaving, setAddLinkSaving] = useState(false)

  useEffect(() => {
    load()
    fetchPlantMembers().then(setMembers).catch(() => {})
  }, [])

  useEffect(() => {
    if (reportOpen) {
      setShowModeModal(true)
      onReportClose?.()
    }
  }, [reportOpen])

  // Load connected knowledge when event is selected
  useEffect(() => {
    if (!sel) { setConnectedKnowledge(null); return }
    setConnectedKnowledge(null)
    setConnectedLoading(true)
    setAddLinkOpen(false)
    setAddLinkQuery('')
    setAddLinkResults([])
    fetchEventConnectedKnowledge(sel.id, sel.title, sel.description)
      .then(ck => { setConnectedKnowledge(ck); setConnectedLoading(false) })
      .catch(() => setConnectedLoading(false))
  }, [sel?.id])

  // Load knowledge item detail when mini modal opens
  useEffect(() => {
    if (!knowledgeItemSel) { setKnowledgeItemDetail(null); return }
    setKnowledgeItemDetail(null)
    setKnowledgeItemLoading(true)
    fetchItemById(knowledgeItemSel.type, knowledgeItemSel.id)
      .then(item => { setKnowledgeItemDetail(item); setKnowledgeItemLoading(false) })
      .catch(() => setKnowledgeItemLoading(false))
  }, [knowledgeItemSel?.type, knowledgeItemSel?.id])

  // Debounce add-link search
  useEffect(() => {
    if (!addLinkQuery.trim()) { setAddLinkResults([]); return }
    const t = setTimeout(() => {
      searchKnowledge(addLinkQuery, 'event', sel?.id).then(setAddLinkResults)
    }, 220)
    return () => clearTimeout(t)
  }, [addLinkQuery])

  async function load() {
    setLoading(true)
    const data = await fetchEvents()
    setEvents(data)
    setLoading(false)
    if (data.length > 0) {
      fetchEventKnowledgeCounts(data.map(e => e.id)).then(setKnowledgeCounts)
    }
  }

  async function handleAddLink(item) {
    if (!sel) return
    setAddLinkSaving(true)
    await saveLink('event', sel.id, item.type, item.id, 'relates_to', null)
    // Refresh connected knowledge
    const ck = await fetchEventConnectedKnowledge(sel.id, sel.title, sel.description)
    setConnectedKnowledge(ck)
    setAddLinkOpen(false)
    setAddLinkQuery('')
    setAddLinkResults([])
    setAddLinkSaving(false)
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
      description: form.description,
      ishikawa: cleanIshikawa,
      resolution: form.resolution,
      taggedPeople: form.taggedPeople,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      status: 'Open',
      date: now,
      createdAt: now,
    }

    const localId = `E-tmp-${Date.now()}`
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
    setEditingEventId(null)
    setForm(EMPTY_FORM)
    setTagInput('')
  }

  function openEditForm(ev) {
    setEditingEventId(ev.id)
    setForm({
      title: ev.title,
      outcome: ev.outcome,
      processArea: ev.processArea || '',
      impact: ev.impact,
      description: ev.description || '',
      ishikawa: { ...EMPTY_FORM.ishikawa, ...(ev.ishikawa || {}) },
      resolution: ev.resolution || '',
      taggedPeople: [...(ev.taggedPeople || [])],
      tags: (ev.tags || []).join(', '),
    })
    setSel(null)
    setShowForm(true)
  }

  async function handleEditSubmit() {
    if (!form.title.trim() || !editingEventId) return
    const cleanIshikawa = {}
    ISHIKAWA_CATS.forEach(c => { cleanIshikawa[c] = form.ishikawa[c].filter(s => s.trim()) })

    const updated = {
      title: form.title,
      outcome: form.outcome,
      processArea: form.processArea,
      impact: form.impact,
      description: form.description,
      ishikawa: cleanIshikawa,
      resolution: form.resolution,
      taggedPeople: form.taggedPeople,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      changeNote: 'Edited by tagged member',
    }

    setEvents(prev => prev.map(e => e.id === editingEventId ? { ...e, ...updated, tags: updated.tags } : e))
    const id = editingEventId
    closeForm()

    try {
      await updateEvent(id, updated)
      onItemSaved?.()
    } catch (err) {
      console.error('[handleEditSubmit]', err.message)
    }
  }

  async function handleCloseEvent() {
    if (!sel || !closeResolution.trim()) return
    setCloseSaving(true)
    try {
      await updateEventStatus(sel.id, { status: 'Closed', resolution: closeResolution.trim() })
      setEvents(prev => prev.map(e => e.id === sel.id ? { ...e, status: 'Closed', resolution: closeResolution.trim() } : e))
      setSel(prev => prev ? { ...prev, status: 'Closed', resolution: closeResolution.trim() } : null)
      setShowCloseModal(false)
      setCloseResolution('')
    } catch (err) {
      console.error('[handleCloseEvent]', err.message)
    }
    setCloseSaving(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

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
              <EventCard
                key={ev.id}
                ev={ev}
                selected={sel?.id === ev.id}
                onClick={() => setSel(ev)}
                knowledgeCount={knowledgeCounts[ev.id]}
              />
            ))}
          </>
        )}
      </div>

      {/* ── Detail modal ── */}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Event ${sel.id}` : ''} width={760}>
        {sel && (() => {
          const me = getDisplayName()
          const canEdit = me && (sel.reportedBy === me || (sel.taggedPeople || []).includes(me))
          const canClose = canEdit && sel.status !== 'Closed'
          return (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge label={sel.outcome} colorFn={outcomeColor} />
              <Badge label={sel.impact} colorFn={impactColor} />
              <Badge label={sel.status} colorFn={eventStatusColor} />
              <Tag label={sel.processArea} />
              <span style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, marginLeft: 'auto' }}>
                {formatDate(sel.date)} · <span
                  onClick={() => sel.reportedBy && onViewProfile?.(sel.reportedBy)}
                  style={{ cursor: onViewProfile ? 'pointer' : 'default', color: onViewProfile ? '#4FA89A' : 'inherit', textDecoration: onViewProfile ? 'underline' : 'none' }}
                >{sel.reportedBy}</span>
              </span>
              {canEdit && (
                <button
                  onClick={() => openEditForm(sel)}
                  style={{ padding: '3px 10px', borderRadius: 2, fontSize: 10, fontFamily: FNT, fontWeight: 700, background: 'none', border: '1px solid #D8CEC3', color: '#5a5550', cursor: 'pointer', letterSpacing: 0.4 }}
                >
                  Edit
                </button>
              )}
              {canClose && (
                <button
                  onClick={() => { setShowCloseModal(true); setCloseResolution(sel.resolution || '') }}
                  style={{ padding: '3px 10px', borderRadius: 2, fontSize: 10, fontFamily: FNT, fontWeight: 700, background: 'none', border: '1px solid #c0392b40', color: '#c0392b', cursor: 'pointer', letterSpacing: 0.4 }}
                >
                  Close Event
                </button>
              )}
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

            {/* ── Connected Knowledge ── */}
            <ConnectedKnowledgeSection
              connectedKnowledge={connectedKnowledge}
              loading={connectedLoading}
              outcome={sel.outcome}
              onItemClick={(type, id) => setKnowledgeItemSel({ type, id })}
              addLinkOpen={addLinkOpen}
              addLinkQuery={addLinkQuery}
              addLinkResults={addLinkResults}
              addLinkSaving={addLinkSaving}
              onAddLinkOpen={() => setAddLinkOpen(true)}
              onAddLinkClose={() => { setAddLinkOpen(false); setAddLinkQuery(''); setAddLinkResults([]) }}
              onAddLinkQueryChange={setAddLinkQuery}
              onAddLinkSelect={handleAddLink}
            />

            {/* Tags */}
            {(sel.tags || []).length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                {sel.tags.map(t => <Tag key={t} label={t} />)}
              </div>
            )}

            {/* Comments */}
            <Comments targetType="event" targetId={sel.id} />
          </div>
          )
        })()}
      </Modal>

      {/* ── Close Event confirmation modal ── */}
      <Modal open={showCloseModal} onClose={() => { setShowCloseModal(false); setCloseResolution('') }} title="Close Event" width={480}>
        <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.6, marginBottom: 16 }}>
          Closing this event marks it as resolved. Provide a resolution summary — this will be saved on the event and visible to all plant members.
        </div>
        <Field label="Resolution Summary" hint="Required — describe how the event was resolved or what was learned">
          <textarea
            style={{ ...iS, height: 80, resize: 'vertical' }}
            value={closeResolution}
            onChange={e => setCloseResolution(e.target.value)}
            placeholder="What was done to resolve this? What was the outcome?"
            autoFocus
          />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => { setShowCloseModal(false); setCloseResolution('') }}
            style={{ padding: '8px 18px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer', fontFamily: FNT }}
          >
            Cancel
          </button>
          <button
            onClick={handleCloseEvent}
            disabled={!closeResolution.trim() || closeSaving}
            style={{ padding: '8px 18px', borderRadius: 3, fontSize: 12, fontWeight: 700, background: closeResolution.trim() ? '#c0392b' : '#f0eeec', border: 'none', color: closeResolution.trim() ? '#FFFFFF' : '#888', cursor: closeResolution.trim() ? 'pointer' : 'not-allowed', fontFamily: FNT }}
          >
            {closeSaving ? 'Closing…' : 'Close Event'}
          </button>
        </div>
      </Modal>

      {/* ── Knowledge item mini detail modal ── */}
      <Modal
        open={!!knowledgeItemSel}
        onClose={() => setKnowledgeItemSel(null)}
        title={knowledgeItemDetail ? `${knowledgeItemDetail.type === 'rule' ? 'Rule' : 'Assertion'} ${knowledgeItemDetail.id}` : '…'}
        width={620}
      >
        {knowledgeItemLoading && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#b0a898', fontFamily: FNT, fontSize: 12 }}>Loading…</div>
        )}
        {!knowledgeItemLoading && knowledgeItemDetail && (
          <KnowledgeItemDetail item={knowledgeItemDetail} />
        )}
      </Modal>

      {/* ── Mode choice modal ── */}
      <Modal open={showModeModal} onClose={() => setShowModeModal(false)} title="Report Event" width={480}>
        <div style={{ fontSize: 13, color: '#5a5550', fontFamily: FNT, lineHeight: 1.6, marginBottom: 20 }}>
          How would you like to file this event?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button
            onClick={() => { setShowModeModal(false); setShowForm(true) }}
            style={{
              padding: '20px 16px', borderRadius: 4, border: '2px solid #D8CEC3',
              background: '#fff', cursor: 'pointer', textAlign: 'left',
              fontFamily: FNT, transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#062044'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#D8CEC3'}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#062044', marginBottom: 4 }}>Fill out form</div>
            <div style={{ fontSize: 11, color: '#8a8278', lineHeight: 1.5 }}>
              Complete the structured event report yourself, including Ishikawa root cause analysis.
            </div>
          </button>
          <button
            onClick={() => { setShowModeModal(false); setShowInterview(true) }}
            style={{
              padding: '20px 16px', borderRadius: 4, border: '2px solid #D8CEC3',
              background: '#fff', cursor: 'pointer', textAlign: 'left',
              fontFamily: FNT, transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#F2652F'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#D8CEC3'}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#062044', marginBottom: 4 }}>Walk me through it</div>
            <div style={{ fontSize: 11, color: '#8a8278', lineHeight: 1.5 }}>
              Answer a few guided questions. The AI structures the report and extracts any rules or lessons automatically.
            </div>
          </button>
        </div>
      </Modal>

      {/* ── Guided interview overlay ── */}
      {showInterview && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#FAFAF9' }}>
          <EventCaptureView
            processAreas={processAreas}
            industry={industry}
            plantId={plantId}
            onClose={() => setShowInterview(false)}
            onItemSaved={() => { load(); onItemSaved?.() }}
          />
        </div>
      )}

      {/* ── Report / Edit Event form modal ── */}
      <Modal open={showForm} onClose={closeForm} title={editingEventId ? 'Edit Event' : 'Report Event'} width={760}>
        {!editingEventId && (
          <div style={{ fontSize: 12, color: '#8a8278', lineHeight: 1.6, marginBottom: 16 }}>
            Document an operational event — positive or negative — with structured Ishikawa analysis. Each Ishikawa category captures contributing factors.
          </div>
        )}

        <Field label="Event Title">
          <input style={iS} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Brief title describing what happened or what went well" />
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
        </div>

        <Field label="Description">
          <div style={{ position: 'relative' }}>
            <textarea
              ref={descRef}
              style={{ ...iS, height: 70, resize: 'vertical', lineHeight: 1.5, width: '100%', boxSizing: 'border-box' }}
              value={form.description}
              onChange={handleDescChange}
              placeholder={form.outcome === 'Positive' ? 'What went well? Include heat numbers, product grades, conditions that drove success...' : 'What happened? Include heat numbers, product grades, timing… (type @ to mention someone)'}
            />
            <MentionDropdown query={descMention} members={members} onSelect={insertDescMention} />
          </div>
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
            placeholder="e.g. best-practice, quality, operator-tip"
          />
        </Field>

        <button
          onClick={editingEventId ? handleEditSubmit : handleSubmit}
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
          {editingEventId ? 'Save Changes' : 'File Event Report'}
        </button>
      </Modal>
    </div>
  )
}

// ── Connected Knowledge Section ────────────────────────────────────────────────

function ConnectedKnowledgeSection({
  connectedKnowledge, loading, outcome,
  onItemClick,
  addLinkOpen, addLinkQuery, addLinkResults, addLinkSaving,
  onAddLinkOpen, onAddLinkClose, onAddLinkQueryChange, onAddLinkSelect,
}) {
  const hasDerived = (connectedKnowledge?.derived || []).length > 0
  const hasExplicit = (connectedKnowledge?.explicit || []).length > 0
  const hasRelated = (connectedKnowledge?.related || []).length > 0
  const isEmpty = !hasDerived && !hasExplicit && !hasRelated

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: '#4FA89A', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: FNT, fontWeight: 700 }}>
          Connected Knowledge
        </div>
        {!addLinkOpen && (
          <button
            onClick={onAddLinkOpen}
            style={{
              padding: '3px 10px', borderRadius: 2, fontSize: 10, fontFamily: FNT, fontWeight: 700,
              background: 'none', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer',
              letterSpacing: 0.4,
            }}
          >
            + Add Link
          </button>
        )}
      </div>

      {loading && (
        <div style={{ fontSize: 11, color: '#b0a898', fontFamily: FNT, padding: '8px 0' }}>Loading connected knowledge…</div>
      )}

      {!loading && (
        <>
          {/* Generated from this event */}
          {hasDerived && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: '#4FA89A', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, fontWeight: 700, marginBottom: 6 }}>
                Generated from this event
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {connectedKnowledge.derived.map(item => (
                  <KnowledgeChip key={item.id} item={item} accent="#4FA89A" onClick={() => onItemClick(item.type, item.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Explicitly linked */}
          {hasExplicit && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, fontWeight: 700, marginBottom: 6 }}>
                Linked knowledge
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {connectedKnowledge.explicit.map(item => (
                  <KnowledgeChip key={item.id} item={item} accent="#8a8278" onClick={() => onItemClick(item.type, item.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Related knowledge (search-based) */}
          {hasRelated && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, fontWeight: 700, marginBottom: 6 }}>
                Related knowledge
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {connectedKnowledge.related.map(item => (
                  <KnowledgeChip key={item.id} item={item} accent="#b0a898" onClick={() => onItemClick(item.type, item.id)} />
                ))}
              </div>
            </div>
          )}

          {isEmpty && !addLinkOpen && (
            <div style={{ padding: '14px 16px', border: '1px dashed #D8CEC3', borderRadius: 3, fontSize: 11, color: '#b0a898', fontFamily: FNT, textAlign: 'center' }}>
              No connected knowledge yet. Use "Walk me through it" when reporting events to generate rules automatically, or link existing knowledge manually.
            </div>
          )}
        </>
      )}

      {/* Add Link inline panel */}
      {addLinkOpen && (
        <div style={{ padding: '12px 14px', background: '#f8f6f4', border: '1px solid #D8CEC3', borderRadius: 3, marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT, fontWeight: 600 }}>Search for a rule or assertion to link</div>
            <button onClick={onAddLinkClose} style={{ background: 'none', border: 'none', color: '#b0a898', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>✕</button>
          </div>
          <input
            autoFocus
            value={addLinkQuery}
            onChange={e => onAddLinkQueryChange(e.target.value)}
            placeholder="Type to search knowledge…"
            style={{ ...iS, fontSize: 12, width: '100%', boxSizing: 'border-box' }}
          />
          {addLinkResults.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
              {addLinkResults.map(item => (
                <button
                  key={`${item.type}:${item.id}`}
                  onClick={() => !addLinkSaving && onAddLinkSelect(item)}
                  disabled={addLinkSaving}
                  style={{
                    display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px',
                    background: '#fff', border: '1px solid #e8e4e0', borderRadius: 3,
                    cursor: 'pointer', textAlign: 'left', fontFamily: FNT, width: '100%',
                    opacity: addLinkSaving ? 0.6 : 1,
                  }}
                >
                  <span style={{
                    fontSize: 8, padding: '2px 5px', borderRadius: 2, fontWeight: 700, textTransform: 'uppercase',
                    background: item.type === 'rule' ? '#e8edf4' : '#f0eeec',
                    color: item.type === 'rule' ? '#062044' : '#8a8278', flexShrink: 0,
                  }}>{item.type}</span>
                  <span style={{ fontSize: 11, color: '#1F1F1F', flex: 1 }}>{item.title}</span>
                  <span style={{ fontSize: 9, color: '#b0a898', flexShrink: 0 }}>{item.processArea}</span>
                </button>
              ))}
            </div>
          )}
          {addLinkQuery.trim() && addLinkResults.length === 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#b0a898', fontFamily: FNT }}>No matches found.</div>
          )}
        </div>
      )}
    </div>
  )
}

// Small clickable chip for a connected knowledge item
function KnowledgeChip({ item, accent, onClick }) {
  const [hovered, setHovered] = useState(false)
  const sc = statusColor(item.status)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', gap: 8, alignItems: 'center',
        padding: '8px 12px', borderRadius: 3, cursor: 'pointer',
        background: hovered ? '#f0eeec' : '#fff',
        border: `1px solid ${hovered ? accent + '40' : '#e8e4e0'}`,
        transition: 'all 0.12s',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <span style={{
        fontSize: 8, padding: '2px 5px', borderRadius: 2, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: 0.4, fontFamily: FNT, flexShrink: 0,
        background: item.type === 'rule' ? '#e8edf4' : '#f0eeec',
        color: item.type === 'rule' ? '#062044' : '#8a8278',
      }}>{item.type}</span>
      <span style={{ fontSize: 9, color: sc.text, background: sc.bg, padding: '2px 6px', borderRadius: 2, fontFamily: FNT, flexShrink: 0 }}>{item.status}</span>
      <span style={{ fontSize: 12, color: '#1F1F1F', flex: 1, lineHeight: 1.4, fontFamily: FNT }}>{item.title}</span>
      <span style={{ fontSize: 9, color: '#b0a898', fontFamily: FNT, flexShrink: 0 }}>{item.processArea}</span>
      <span style={{ fontSize: 10, color: accent, fontFamily: FNT, flexShrink: 0, opacity: hovered ? 1 : 0.4 }}>→</span>
    </div>
  )
}

// Mini detail view shown inside the knowledge item modal
function KnowledgeItemDetail({ item }) {
  const sc = statusColor(item.status)
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <span style={{
          fontSize: 9, padding: '3px 8px', borderRadius: 2, fontWeight: 700, textTransform: 'uppercase',
          background: item.type === 'rule' ? '#e8edf4' : '#f0eeec',
          color: item.type === 'rule' ? '#062044' : '#8a8278', fontFamily: FNT,
        }}>{item.type}</span>
        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 2, fontFamily: FNT, background: sc.bg, color: sc.text, fontWeight: 600 }}>{item.status}</span>
        <Tag label={item.category} />
        {item.processArea && <Tag label={item.processArea} />}
        <span style={{ fontSize: 9, padding: '3px 7px', borderRadius: 2, background: '#f8f6f4', color: '#8a8278', fontFamily: FNT }}>{item.confidence}</span>
      </div>

      <div style={{ fontSize: 15, color: '#062044', fontWeight: 700, lineHeight: 1.4, marginBottom: 14, fontFamily: FNT }}>
        {item.title}
      </div>

      {item.rationale && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Rationale</div>
          <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.6, padding: '10px 14px', background: '#f8f6f4', borderRadius: 3 }}>{item.rationale}</div>
        </div>
      )}

      {item.scope && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Scope</div>
          <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.5 }}>{item.scope}</div>
        </div>
      )}

      {(item.versions || []).length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e8e4e0' }}>
          <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 6 }}>Version history</div>
          {item.versions.map((v, i) => (
            <div key={i} style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT, marginBottom: 3 }}>
              v{v.version} · {v.author} · {v.change}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EventCard({ ev, selected, onClick, knowledgeCount }) {
  const [hovered, setHovered] = useState(false)
  const accentColor = ev.outcome === 'Positive' ? '#4FA89A' : '#c0392b'

  // Build badge text from count breakdown
  let badgeParts = []
  if (knowledgeCount?.rules > 0) badgeParts.push(`${knowledgeCount.rules} rule${knowledgeCount.rules !== 1 ? 's' : ''}`)
  if (knowledgeCount?.assertions > 0) badgeParts.push(`${knowledgeCount.assertions} assertion${knowledgeCount.assertions !== 1 ? 's' : ''}`)
  const badgeText = badgeParts.length > 0 ? badgeParts.join(' · ') + ' generated' : null

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
        {badgeText && (
          <span style={{
            fontSize: 9, padding: '3px 8px', borderRadius: 2, fontFamily: FNT, fontWeight: 700,
            background: '#e6f5f1', color: '#2d6b5e', border: '1px solid #4FA89A30', flexShrink: 0,
          }}>
            {badgeText}
          </span>
        )}
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
