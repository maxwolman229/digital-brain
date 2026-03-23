import { useState, useRef, useEffect } from 'react'
import { FNT, iS, ISHIKAWA_CATS, IMPACTS, EVENT_OUTCOMES } from '../lib/constants.js'
import { authFetch } from '../lib/supabase.js'
import { createRule, createAssertion, addEvent, saveLink } from '../lib/db.js'
import { getDisplayName } from '../lib/userContext.js'

const CAT_COLORS = {
  Material: '#F2652F',
  Process: '#4FA89A',
  Equipment: '#888',
  People: '#c0392b',
  Measurement: '#5a5550',
  Environment: '#666',
}

const EMPTY_ISHIKAWA = { Material: [''], Process: [''], Equipment: [''], People: [''], Measurement: [''], Environment: [''] }

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '4px 0' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#F2652F',
          animation: `dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`@keyframes dot-pulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  )
}

export default function EventCaptureView({ processAreas = [], industry, plantId, onClose, onItemSaved }) {
  const [phase, setPhase] = useState('interview')

  // Interview
  const [apiHistory, setApiHistory] = useState([])
  const [displayTurns, setDisplayTurns] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [turnNum, setTurnNum] = useState(0)
  const [extracted, setExtracted] = useState([])

  // Review — event form
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    processArea: '',
    outcome: 'Negative',
    impact: 'Moderate',
    resolution: '',
    taggedPeople: [],
    tagInput: '',
    ishikawa: EMPTY_ISHIKAWA,
  })

  // Review — knowledge items
  const [reviewItems, setReviewItems] = useState([])

  // Saving
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Done
  const [savedCounts, setSavedCounts] = useState({ rules: 0, assertions: 0 })

  const scrollRef = useRef(null)
  const answerRef = useRef(null)
  const reportedBy = getDisplayName() || 'You'

  // Auto-scroll chat
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [displayTurns, currentQuestion, loading])

  // Focus textarea after each AI response
  useEffect(() => {
    if (phase === 'interview' && !loading && currentQuestion) {
      answerRef.current?.focus()
    }
  }, [loading, currentQuestion, phase])

  // Kick off the interview immediately on mount
  useEffect(() => { startInterview() }, [])

  async function callEventInterview(history) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const resp = await authFetch(`${supabaseUrl}/functions/v1/event-interview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, industry }),
    })
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${resp.status}`)
    }
    return resp.json()
  }

  async function startInterview() {
    setLoading(true)
    setError(null)
    const setupMsg = {
      role: 'user',
      content: 'Please start the incident investigation interview.',
    }
    try {
      const result = await callEventInterview([setupMsg])
      const assistantMsg = {
        role: 'assistant',
        content: JSON.stringify({ question: result.question, done: result.done, extracted: result.extracted || [], event: result.event }),
      }
      setApiHistory([setupMsg, assistantMsg])
      setCurrentQuestion(result.question || '')
      setTurnNum(1)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function submitAnswer() {
    if (!answer.trim() || loading) return
    setLoading(true)
    setError(null)

    const trimmed = answer.trim()
    const userMsg = { role: 'user', content: trimmed }
    const newHistory = [...apiHistory, userMsg]
    setDisplayTurns(prev => [...prev, { question: currentQuestion, answer: trimmed, skipped: false }])
    setAnswer('')

    try {
      const result = await callEventInterview(newHistory)
      const assistantMsg = {
        role: 'assistant',
        content: JSON.stringify({ question: result.question, done: result.done, extracted: result.extracted || [], event: result.event }),
      }
      setApiHistory([...newHistory, assistantMsg])

      const newItems = (result.extracted || []).map((item, i) => ({
        ...item,
        _id: `t${turnNum}_i${i}`,
        decision: 'pending',
      }))
      const nextExtracted = [...extracted, ...newItems]
      setExtracted(nextExtracted)
      setTurnNum(t => t + 1)

      if (result.done || !result.question) {
        enterReview(nextExtracted, result.event)
      } else {
        setCurrentQuestion(result.question)
      }
    } catch (err) {
      setError(err.message)
      setDisplayTurns(prev => prev.slice(0, -1))
      setAnswer(trimmed)
    } finally {
      setLoading(false)
    }
  }

  async function skipQuestion() {
    if (loading) return
    setLoading(true)
    setError(null)
    const skipMsg = { role: 'user', content: '[SKIP]' }
    const newHistory = [...apiHistory, skipMsg]
    setDisplayTurns(prev => [...prev, { question: currentQuestion, answer: null, skipped: true }])
    try {
      const result = await callEventInterview(newHistory)
      const assistantMsg = {
        role: 'assistant',
        content: JSON.stringify({ question: result.question, done: result.done, extracted: result.extracted || [], event: result.event }),
      }
      setApiHistory([...newHistory, assistantMsg])
      setTurnNum(t => t + 1)
      if (result.done || !result.question) {
        enterReview(extracted, result.event)
      } else {
        setCurrentQuestion(result.question)
      }
    } catch (err) {
      setError(err.message)
      setDisplayTurns(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  function finishEarly() {
    enterReview(extracted, null)
  }

  function enterReview(items, aiEvent) {
    // Pre-fill form from AI-extracted event data
    const ish = {}
    ISHIKAWA_CATS.forEach(cat => {
      const aiItems = aiEvent?.ishikawa?.[cat] || []
      ish[cat] = aiItems.length > 0 ? aiItems : ['']
    })
    setEventForm({
      title: aiEvent?.title || '',
      description: aiEvent?.description || '',
      processArea: aiEvent?.processArea || processAreas[0] || '',
      outcome: aiEvent?.outcome || 'Negative',
      impact: aiEvent?.impact || 'Moderate',
      resolution: aiEvent?.resolution || '',
      taggedPeople: aiEvent?.taggedPeople || [],
      tagInput: '',
      ishikawa: ish,
    })
    setReviewItems(items.map(x => ({ ...x })))
    setPhase('review')
  }

  // ── Knowledge card helpers ──────────────────────────────────────────────────

  function updateItem(id, field, val) {
    setReviewItems(prev => prev.map(item => item._id === id ? { ...item, [field]: val } : item))
  }

  function approveAll() {
    setReviewItems(prev => prev.map(item =>
      item.decision === 'pending' ? { ...item, decision: 'approved' } : item
    ))
  }

  // ── Ishikawa form helpers ───────────────────────────────────────────────────

  function updateIshikawa(cat, idx, val) {
    setEventForm(f => {
      const arr = [...f.ishikawa[cat]]
      arr[idx] = val
      return { ...f, ishikawa: { ...f.ishikawa, [cat]: arr } }
    })
  }

  function addIshikawaRow(cat) {
    setEventForm(f => ({ ...f, ishikawa: { ...f.ishikawa, [cat]: [...f.ishikawa[cat], ''] } }))
  }

  function removeIshikawaRow(cat, idx) {
    setEventForm(f => {
      const arr = [...f.ishikawa[cat]]
      arr.splice(idx, 1)
      return { ...f, ishikawa: { ...f.ishikawa, [cat]: arr.length > 0 ? arr : [''] } }
    })
  }

  // ── Save all ────────────────────────────────────────────────────────────────

  async function saveAll() {
    if (!eventForm.title.trim()) return
    setSaving(true)
    setSaveError(null)

    const cleanIshikawa = {}
    ISHIKAWA_CATS.forEach(c => { cleanIshikawa[c] = (eventForm.ishikawa[c] || []).filter(s => s.trim()) })

    const toSaveItems = reviewItems.filter(x => x.decision !== 'rejected')
    const approvedRules = toSaveItems.filter(x => x.type === 'rule').length
    const approvedAssertions = toSaveItems.filter(x => x.type === 'assertion').length

    try {
      // 1. Save the event
      const savedEvent = await addEvent({
        title: eventForm.title,
        outcome: eventForm.outcome,
        processArea: eventForm.processArea,
        impact: eventForm.impact,
        description: eventForm.description,
        ishikawa: cleanIshikawa,
        resolution: eventForm.resolution,
        taggedPeople: eventForm.taggedPeople,
        tags: [],
        status: 'Open',
        date: new Date().toISOString(),
      })

      if (!savedEvent) {
        setSaveError('Failed to save event report. Please try again.')
        setSaving(false)
        return
      }

      // 2. Save approved rules/assertions sequentially, then link to event
      const failures = []
      for (const item of toSaveItems) {
        try {
          let saved = null
          if (item.type === 'rule') {
            saved = await createRule({
              title: item.title,
              category: item.category || 'Process',
              processArea: item.processArea || eventForm.processArea,
              scope: item.scope || '',
              rationale: item.rationale || '',
              status: 'Proposed',
              tags: [],
              captureSource: `Extracted from Event ${savedEvent.id}`,
              plantId,
            })
          } else {
            saved = await createAssertion({
              title: item.title,
              category: item.category || 'Process',
              processArea: item.processArea || eventForm.processArea,
              scope: item.scope || '',
              status: 'Proposed',
              tags: [],
              captureSource: `Extracted from Event ${savedEvent.id}`,
              plantId,
            })
          }
          // 3. Link each saved item back to the event
          if (saved?.id) {
            await saveLink('event', savedEvent.id, item.type, saved.id, 'derived_from', null)
          }
        } catch (err) {
          console.error('[EventCapture] save failed:', item.type, item.title, err.message)
          failures.push(`${item.type} "${item.title?.slice(0, 40)}": ${err.message}`)
        }
      }

      if (failures.length > 0) {
        setSaveError(`${failures.length} knowledge item${failures.length > 1 ? 's' : ''} failed to save.`)
      }

      onItemSaved?.()
      setSavedCounts({ rules: approvedRules, assertions: approvedAssertions })
      setPhase('done')
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Interview phase ─────────────────────────────────────────────────────────

  if (phase === 'interview') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#FAFAF9' }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '10px 20px', borderBottom: '1px solid #e8e4e0',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          fontSize: 10, padding: '3px 9px', borderRadius: 2, fontFamily: FNT, fontWeight: 700,
          background: '#F2652F', color: '#fff', letterSpacing: 0.4, flexShrink: 0,
        }}>
          Incident Investigation
        </div>
        <span style={{ color: '#D8CEC3', fontSize: 11 }}>·</span>
        <div style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT }}>
          {turnNum > 0 ? `${turnNum} question${turnNum !== 1 ? 's' : ''}` : 'Starting…'}
          {extracted.length > 0 && (
            <span style={{ marginLeft: 8, color: '#4FA89A', fontWeight: 700 }}>
              · {extracted.length} item{extracted.length !== 1 ? 's' : ''} captured
            </span>
          )}
        </div>
        <div style={{ flex: 1 }} />
        {turnNum >= 3 && (
          <button
            onClick={finishEarly}
            style={{
              padding: '4px 11px', borderRadius: 3, fontSize: 10, fontFamily: FNT, fontWeight: 700,
              background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer',
            }}
          >
            I'm done
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            padding: '4px 11px', borderRadius: 3, fontSize: 10, fontFamily: FNT,
            background: 'transparent', border: 'none', color: '#b0a898', cursor: 'pointer',
          }}
        >
          ✕ Cancel
        </button>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>

          {/* Intro label */}
          {turnNum <= 1 && !loading && (
            <div style={{ marginBottom: 20, padding: '10px 14px', background: '#fff4f0', border: '1px solid #f5c6a0', borderRadius: 3 }}>
              <div style={{ fontSize: 11, color: '#8a4a1a', fontFamily: FNT, fontWeight: 600 }}>
                Guided incident investigation
              </div>
              <div style={{ fontSize: 11, color: '#8a4a1a', fontFamily: FNT, marginTop: 3, lineHeight: 1.5 }}>
                Answer each question in your own words. The system will structure the report and extract any rules or lessons learned automatically.
              </div>
            </div>
          )}

          {/* Past turns */}
          {displayTurns.map((turn, i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <div style={{ borderLeft: '3px solid #D8CEC3', paddingLeft: 14, marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 3 }}>
                  Q{i + 1}
                </div>
                <div style={{ fontSize: 13, color: '#5a5550', fontFamily: FNT, lineHeight: 1.5 }}>
                  {turn.question}
                </div>
              </div>
              {turn.skipped ? (
                <div style={{ marginLeft: 17, fontSize: 11, color: '#D8CEC3', fontFamily: FNT, fontStyle: 'italic' }}>
                  — skipped —
                </div>
              ) : (
                <div style={{ marginLeft: 17, padding: '9px 13px', background: '#f8f6f4', borderRadius: 3, border: '1px solid #e8e4e0' }}>
                  <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {reportedBy}
                  </div>
                  <div style={{ fontSize: 13, color: '#3a3530', lineHeight: 1.6, fontFamily: FNT }}>
                    {turn.answer}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Current state */}
          {loading ? (
            <div style={{ borderLeft: '3px solid #F2652F', paddingLeft: 14 }}>
              <div style={{ fontSize: 10, color: '#F2652F', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 6 }}>
                {turnNum === 0 ? 'Starting interview…' : `Q${displayTurns.length + 1}`}
              </div>
              <Dots />
            </div>
          ) : currentQuestion ? (
            <div>
              <div style={{ borderLeft: '3px solid #F2652F', paddingLeft: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: '#F2652F', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 6 }}>
                  Q{displayTurns.length + 1}
                </div>
                <div style={{ fontSize: 15, color: '#062044', fontFamily: FNT, lineHeight: 1.55, fontWeight: 500 }}>
                  {currentQuestion}
                </div>
              </div>
              <div style={{ marginLeft: 17 }}>
                <textarea
                  ref={answerRef}
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAnswer() }}
                  placeholder="Describe what happened… (⌘↵ to continue)"
                  rows={5}
                  style={{ ...iS, fontSize: 13, resize: 'vertical', lineHeight: 1.6, width: '100%', boxSizing: 'border-box', minHeight: 100 }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={submitAnswer}
                    disabled={!answer.trim()}
                    style={{
                      padding: '9px 20px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 700,
                      border: 'none', cursor: answer.trim() ? 'pointer' : 'default',
                      background: answer.trim() ? '#062044' : '#e8e4e0',
                      color: answer.trim() ? '#fff' : '#b0a898',
                    }}
                  >
                    Continue →
                  </button>
                  <button
                    onClick={skipQuestion}
                    style={{
                      padding: '9px 14px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 600,
                      background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer',
                    }}
                  >
                    Skip →
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {error && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fde8e5', borderRadius: 3, fontSize: 12, color: '#c0392b', fontFamily: FNT }}>
              {error} — please try again.
            </div>
          )}
          <div style={{ height: 40 }} />
        </div>
      </div>
    </div>
  )

  // ── Review phase ────────────────────────────────────────────────────────────

  if (phase === 'review') {
    const toSaveCount = reviewItems.filter(x => x.decision !== 'rejected').length
    const pendingCount = reviewItems.filter(x => x.decision === 'pending').length

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f4f1ed' }}>
        <style>{`
          @keyframes approve-flash { 0%{background:#b8ead9}100%{background:#f4fbf8} }
          @keyframes reject-flash  { 0%{background:#fcd8d4}100%{background:#fef7f6} }
        `}</style>

        {/* Sticky header */}
        <div style={{
          flexShrink: 0, padding: '14px 28px', borderBottom: '1px solid #e8e4e0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAF9',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#062044', fontFamily: FNT }}>
              Review event report
            </div>
            <div style={{ fontSize: 11, color: '#8a8278', fontFamily: FNT, marginTop: 2 }}>
              Edit the pre-filled report, then approve or reject any extracted knowledge.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '9px 16px', borderRadius: 3, fontSize: 12, fontFamily: FNT,
                background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={saveAll}
              disabled={saving || !eventForm.title.trim()}
              style={{
                padding: '9px 22px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 700,
                border: 'none', cursor: !saving && eventForm.title.trim() ? 'pointer' : 'default',
                background: !saving && eventForm.title.trim() ? '#F2652F' : '#e8e4e0',
                color: !saving && eventForm.title.trim() ? '#fff' : '#b0a898',
              }}
            >
              {saving ? 'Saving…' : `Save event${toSaveCount > 0 ? ` + ${toSaveCount} knowledge item${toSaveCount !== 1 ? 's' : ''}` : ''} →`}
            </button>
          </div>
        </div>
        {saveError && (
          <div style={{ flexShrink: 0, padding: '8px 28px', background: '#fde8e5', borderBottom: '1px solid #f5c6c0', fontSize: 11, color: '#c0392b', fontFamily: FNT }}>
            ⚠ {saveError}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 60px' }}>
          <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>

            {/* ── Left: Editable event form ── */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#F2652F', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: FNT, marginBottom: 12 }}>
                Event Report
              </div>

              {/* Title */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Title</div>
                <input
                  style={iS}
                  value={eventForm.title}
                  onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Brief event title"
                />
              </div>

              {/* Outcome + Impact */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Outcome</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {EVENT_OUTCOMES.map(o => (
                      <button
                        key={o}
                        onClick={() => setEventForm(f => ({ ...f, outcome: o }))}
                        style={{
                          flex: 1, padding: '7px 0', borderRadius: 3, fontSize: 11, fontWeight: 700, fontFamily: FNT,
                          cursor: 'pointer', border: eventForm.outcome === o ? `2px solid ${o === 'Positive' ? '#4FA89A' : '#F2652F'}` : '2px solid #D8CEC3',
                          background: eventForm.outcome === o ? (o === 'Positive' ? '#e6f5f1' : '#fde8e5') : '#FFFFFF',
                          color: eventForm.outcome === o ? (o === 'Positive' ? '#4FA89A' : '#F2652F') : '#b0a898',
                        }}
                      >
                        {o === 'Positive' ? '✓ Positive' : '✗ Negative'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Impact</div>
                  <select
                    style={{ ...iS, cursor: 'pointer' }}
                    value={eventForm.impact}
                    onChange={e => setEventForm(f => ({ ...f, impact: e.target.value }))}
                  >
                    {IMPACTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Process Area */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Process Area</div>
                <input
                  style={iS}
                  value={eventForm.processArea}
                  onChange={e => setEventForm(f => ({ ...f, processArea: e.target.value }))}
                  placeholder="Type or select a process area…"
                  list="process-area-options"
                />
                <datalist id="process-area-options">
                  {processAreas.map(pa => <option key={pa} value={pa} />)}
                </datalist>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Description</div>
                <textarea
                  style={{ ...iS, height: 90, resize: 'vertical', lineHeight: 1.6 }}
                  value={eventForm.description}
                  onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What happened?"
                />
              </div>

              {/* Tagged people */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Tagged People</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {eventForm.taggedPeople.map((p, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 3, background: '#e8edf4', color: '#062044', fontSize: 10, fontFamily: FNT, fontWeight: 600 }}>
                      {p}
                      <button
                        onClick={() => setEventForm(f => ({ ...f, taggedPeople: f.taggedPeople.filter((_, j) => j !== i) }))}
                        style={{ background: 'none', border: 'none', color: '#8a8278', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
                      >✕</button>
                    </span>
                  ))}
                </div>
                <input
                  style={{ ...iS, fontSize: 11 }}
                  value={eventForm.tagInput}
                  onChange={e => setEventForm(f => ({ ...f, tagInput: e.target.value }))}
                  placeholder="Type a name and press Enter…"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && eventForm.tagInput.trim()) {
                      e.preventDefault()
                      setEventForm(f => ({ ...f, taggedPeople: [...f.taggedPeople, f.tagInput.trim()], tagInput: '' }))
                    }
                  }}
                />
              </div>

              {/* Ishikawa grid */}
              <div style={{ fontSize: 10, color: '#F2652F', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, fontFamily: FNT, fontWeight: 700 }}>
                {eventForm.outcome === 'Positive' ? 'Success Factor Analysis — Ishikawa' : 'Root Cause Analysis — Ishikawa'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {ISHIKAWA_CATS.map(cat => (
                  <div key={cat} style={{ padding: '10px 12px', background: '#fff', borderRadius: 3, border: `1px solid ${CAT_COLORS[cat]}20` }}>
                    <div style={{ fontSize: 10, color: CAT_COLORS[cat], fontWeight: 700, fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{cat}</div>
                    {(eventForm.ishikawa[cat] || ['']).map((val, i) => (
                      <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        <input
                          style={{ ...iS, fontSize: 11, padding: '4px 8px' }}
                          value={val}
                          onChange={e => updateIshikawa(cat, i, e.target.value)}
                          placeholder={`${cat} factor…`}
                        />
                        {(eventForm.ishikawa[cat] || []).length > 1 && (
                          <button onClick={() => removeIshikawaRow(cat, i)} style={{ background: 'none', border: 'none', color: '#b0a898', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => addIshikawaRow(cat)} style={{ background: 'none', border: 'none', color: CAT_COLORS[cat], cursor: 'pointer', fontSize: 10, fontFamily: FNT, fontWeight: 600, padding: '2px 0' }}>
                      + Add factor
                    </button>
                  </div>
                ))}
              </div>

              {/* Resolution */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>
                  {eventForm.outcome === 'Positive' ? 'Outcome & Takeaways' : 'Resolution / Corrective Actions'}
                </div>
                <textarea
                  style={{ ...iS, height: 60, resize: 'vertical', lineHeight: 1.5 }}
                  value={eventForm.resolution}
                  onChange={e => setEventForm(f => ({ ...f, resolution: e.target.value }))}
                  placeholder={eventForm.outcome === 'Positive' ? 'What made this successful?' : 'What was done to resolve it?'}
                />
              </div>
            </div>

            {/* ── Right: Knowledge items ── */}
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 10, fontWeight: 700, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: FNT, marginBottom: 12,
              }}>
                <span>Extracted Knowledge</span>
                {pendingCount > 0 && (
                  <button
                    onClick={approveAll}
                    style={{ background: 'none', border: '1px solid #4FA89A', color: '#4FA89A', borderRadius: 2, padding: '2px 8px', fontSize: 9, fontFamily: FNT, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 }}
                  >
                    Approve all
                  </button>
                )}
              </div>

              {reviewItems.length === 0 ? (
                <div style={{ padding: '20px 16px', background: '#fff', border: '1px solid #e8e4e0', borderRadius: 3, textAlign: 'center', fontSize: 11, color: '#b0a898', fontFamily: FNT }}>
                  No rules or assertions were extracted. You can add them manually after saving.
                </div>
              ) : (
                reviewItems.map(item => {
                  const isRejected = item.decision === 'rejected'
                  const isApproved = item.decision === 'approved' || item.decision === 'edited'
                  return (
                    <div
                      key={item._id}
                      style={{
                        marginBottom: 8, padding: '10px 12px', borderRadius: 3,
                        background: isRejected ? '#fef7f6' : isApproved ? '#f4fbf8' : '#fff',
                        border: `1px solid ${isRejected ? '#f5c6c0' : isApproved ? '#b8e0d8' : '#e8e4e0'}`,
                        opacity: isRejected ? 0.55 : 1,
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 2, fontWeight: 700, fontFamily: FNT,
                          textTransform: 'uppercase', letterSpacing: 0.5,
                          background: item.type === 'rule' ? '#e8edf4' : '#f0eeec',
                          color: item.type === 'rule' ? '#062044' : '#8a8278',
                        }}>
                          {item.type}
                        </span>
                        <div style={{ flex: 1 }} />
                        {/* Approve/reject buttons */}
                        {!isApproved && (
                          <button
                            onClick={() => updateItem(item._id, 'decision', 'approved')}
                            style={{ padding: '2px 7px', borderRadius: 2, fontSize: 10, fontFamily: FNT, fontWeight: 700, background: 'none', border: '1px solid #4FA89A', color: '#4FA89A', cursor: 'pointer' }}
                          >✓</button>
                        )}
                        {!isRejected && (
                          <button
                            onClick={() => updateItem(item._id, 'decision', 'rejected')}
                            style={{ padding: '2px 7px', borderRadius: 2, fontSize: 10, fontFamily: FNT, fontWeight: 700, background: 'none', border: '1px solid #D8CEC3', color: '#b0a898', cursor: 'pointer' }}
                          >✕</button>
                        )}
                        {isRejected && (
                          <button
                            onClick={() => updateItem(item._id, 'decision', 'pending')}
                            style={{ padding: '2px 7px', borderRadius: 2, fontSize: 10, fontFamily: FNT, background: 'none', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer' }}
                          >Undo</button>
                        )}
                      </div>
                      <input
                        value={item.title}
                        onChange={e => updateItem(item._id, 'title', e.target.value)}
                        onFocus={() => { if (item.decision === 'pending') updateItem(item._id, 'decision', 'edited') }}
                        style={{
                          ...iS, fontSize: 11, padding: '5px 8px', fontWeight: 600,
                          background: isRejected ? '#fef7f6' : isApproved ? '#f4fbf8' : '#f8f6f4',
                          border: '1px solid transparent',
                        }}
                      />
                      {item.rationale && (
                        <div style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT, marginTop: 4, lineHeight: 1.4 }}>{item.rationale}</div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

          </div>
        </div>
      </div>
    )
  }

  // ── Done phase ──────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f4f1ed', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#062044', fontFamily: FNT, marginBottom: 8 }}>
          Event filed
        </div>
        <div style={{ fontSize: 13, color: '#8a8278', fontFamily: FNT, lineHeight: 1.6, marginBottom: 24 }}>
          The event report has been saved
          {savedCounts.rules > 0 || savedCounts.assertions > 0
            ? ` along with ${[
                savedCounts.rules > 0 ? `${savedCounts.rules} rule${savedCounts.rules !== 1 ? 's' : ''}` : '',
                savedCounts.assertions > 0 ? `${savedCounts.assertions} assertion${savedCounts.assertions !== 1 ? 's' : ''}` : '',
              ].filter(Boolean).join(' and ')} linked to it`
            : ''}.
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '10px 28px', borderRadius: 3, fontSize: 13, fontFamily: FNT, fontWeight: 700,
            background: '#062044', border: 'none', color: '#fff', cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
