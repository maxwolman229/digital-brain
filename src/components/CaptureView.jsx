import { useState, useRef, useEffect } from 'react'
import { FNT, iS } from '../lib/constants.js'
import { authFetch } from '../lib/supabase.js'
import { createRule, createAssertion, fetchCaptureContext } from '../lib/db.js'
import { getDisplayName, getUserId } from '../lib/userContext.js'

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDifficulty(turn) {
  if (turn <= 2) return { level: 1, label: 'Basics' }
  if (turn <= 4) return { level: 2, label: 'Problems' }
  if (turn <= 6) return { level: 3, label: 'Edge Cases' }
  return { level: 4, label: 'Debate' }
}

function computeXp(streak) {
  return 10 + (streak >= 3 ? (streak - 2) * 3 : 0)
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m === 0) return `${s}s`
  if (rem === 0) return `${m} min`
  return `${m} min ${rem}s`
}

function TypeBadge({ type }) {
  const isRule = type === 'rule'
  return (
    <span style={{
      fontSize: 9, padding: '2px 7px', borderRadius: 2, fontWeight: 700, fontFamily: FNT,
      textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0,
      background: isRule ? '#e8edf4' : '#f0eeec',
      color: isRule ? '#062044' : '#8a8278',
    }}>
      {type}
    </span>
  )
}

function Dots() {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '6px 0' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: '#4FA89A',
          animation: `dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`@keyframes dot-pulse{0%,80%,100%{opacity:.2;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  )
}

const CATEGORIES = ['Material', 'Process', 'Equipment', 'People', 'Measurement', 'Environment']

// ── Main component ─────────────────────────────────────────────────────────────

export default function CaptureView({ processAreas = [], industry, plantName, plantId, onNavigate, onItemSaved }) {
  const [phase, setPhase] = useState('setup')

  // Setup
  const [processArea, setProcessArea] = useState('')
  const [operatorName, setOperatorName] = useState(getDisplayName() || '')
  const [topic, setTopic] = useState('')

  // Interview
  const [apiHistory, setApiHistory] = useState([])
  const [displayTurns, setDisplayTurns] = useState([])
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [turnNum, setTurnNum] = useState(0)
  const [extracted, setExtracted] = useState([])

  // Gamification
  const [answeredCount, setAnsweredCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [streak, setStreak] = useState(0)
  const [maxStreak, setMaxStreak] = useState(0)
  const [xp, setXp] = useState(0)
  const [countFlash, setCountFlash] = useState(false)
  const [levelFlash, setLevelFlash] = useState(false)
  const [shared, setShared] = useState(false)

  // Review
  const [reviewItems, setReviewItems] = useState([])
  const [saving, setSaving] = useState(false)

  // Done
  const [savedCounts, setSavedCounts] = useState({ rules: 0, assertions: 0 })
  const [sessionStats, setSessionStats] = useState({})
  const [saveError, setSaveError] = useState(null)

  const scrollRef = useRef(null)
  const answerRef = useRef(null)
  const startTimeRef = useRef(null)
  const prevExtractedLen = useRef(0)
  const prevLevel = useRef(1)
  const captureContextRef = useRef(null)

  useEffect(() => {
    if (phase === 'interview') {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [displayTurns, currentQuestion, loading])

  useEffect(() => {
    if (phase === 'interview' && !loading && currentQuestion) {
      answerRef.current?.focus()
    }
  }, [loading, currentQuestion, phase])

  // Flash knowledge counter when new items extracted
  useEffect(() => {
    if (extracted.length > prevExtractedLen.current) {
      setCountFlash(true)
      setTimeout(() => setCountFlash(false), 700)
    }
    prevExtractedLen.current = extracted.length
  }, [extracted.length])

  // Flash level badge when difficulty advances
  useEffect(() => {
    const newLevel = getDifficulty(turnNum).level
    if (newLevel > prevLevel.current) {
      setLevelFlash(true)
      setTimeout(() => setLevelFlash(false), 1200)
    }
    prevLevel.current = newLevel
  }, [turnNum])

  const ruleCount = extracted.filter(x => x.type === 'rule').length
  const assertionCount = extracted.filter(x => x.type === 'assertion').length
  const progress = Math.min((answeredCount + skippedCount) / 8, 1) * 100
  const difficulty = getDifficulty(turnNum)

  async function callCapture(history, context) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const resp = await authFetch(`${supabaseUrl}/functions/v1/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, context }),
      timeout: 60000,
    })
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${resp.status}`)
    }
    return resp.json()
  }

  async function startInterview(e) {
    e.preventDefault()
    if (!topic.trim()) return
    const resolvedName = getDisplayName() || 'Operator'
    setOperatorName(resolvedName)
    startTimeRef.current = new Date()
    setPhase('interview')
    setLoading(true)
    setError(null)

    // Read local profile extras (position, years)
    let position = ''
    let yearsInIndustry = ''
    const userId = getUserId()
    if (userId) {
      try {
        const raw = localStorage.getItem(`md1_profile_extra_${userId}`)
        if (raw) {
          const extra = JSON.parse(raw)
          position = extra.position || ''
          yearsInIndustry = extra.years || ''
        }
      } catch {}
    }

    // Fetch knowledge gaps + relevant rules in parallel with starting the interview
    const { gapsSummary, relevantRules } = await fetchCaptureContext(plantId, processArea, topic.trim()).catch(() => ({
      gapsSummary: 'No gap information available.',
      relevantRules: 'No existing rules found for this topic.',
    }))

    captureContextRef.current = {
      display_name: resolvedName,
      position: position || 'operator',
      years_in_industry: yearsInIndustry || 'unknown',
      plant_name: plantName || 'the plant',
      industry: industry || 'manufacturing',
      topic: topic.trim(),
      gaps_summary: gapsSummary,
      relevant_rules: relevantRules,
    }

    const setupMsg = {
      role: 'user',
      content: [
        'INTERVIEW SETUP',
        `Operator: ${resolvedName}`,
        `Topic: ${topic.trim()}`,
        '',
        "Please ask your opening question to start capturing this operator's knowledge.",
      ].join('\n'),
    }

    try {
      const result = await callCapture([setupMsg], captureContextRef.current)
      const assistantMsg = {
        role: 'assistant',
        content: JSON.stringify({ question: result.question, done: result.done, extracted: result.extracted || [] }),
      }
      setApiHistory([setupMsg, assistantMsg])
      setCurrentQuestion(result.question || '')
      setTurnNum(1)
    } catch (err) {
      setError(err.name === 'AbortError' || err.message?.includes('aborted')
        ? 'Claude is taking longer than usual — please try again.'
        : err.message)
      setPhase('setup')
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

    const newStreak = streak + 1
    const earned = computeXp(newStreak)
    setStreak(newStreak)
    setMaxStreak(prev => Math.max(prev, newStreak))
    setAnsweredCount(c => c + 1)
    setXp(prev => prev + earned)

    try {
      const result = await callCapture(newHistory, captureContextRef.current)
      const assistantMsg = {
        role: 'assistant',
        content: JSON.stringify({ question: result.question, done: result.done, extracted: result.extracted || [] }),
      }
      setApiHistory([...newHistory, assistantMsg])

      const newItems = (result.extracted || []).map((item, i) => ({
        ...item,
        _id: `t${turnNum}_i${i}`,
        _sourceAnswer: trimmed,
        decision: 'pending',
        editing: false,
        _expanded: false,
      }))
      const nextExtracted = [...extracted, ...newItems]
      setExtracted(nextExtracted)
      setTurnNum(t => t + 1)

      if (result.done || !result.question) {
        setReviewItems(nextExtracted.map(x => ({ ...x })))
        setPhase('review')
      } else {
        setCurrentQuestion(result.question)
      }
    } catch (err) {
      setError(err.message)
      setDisplayTurns(prev => prev.slice(0, -1))
      setAnswer(trimmed)
      setStreak(streak)
      setAnsweredCount(c => c - 1)
      setXp(prev => prev - earned)
    } finally {
      setLoading(false)
    }
  }

  async function skipQuestion() {
    if (loading) return
    setLoading(true)
    setError(null)
    setStreak(0)
    setSkippedCount(s => s + 1)

    const skipMsg = { role: 'user', content: '[SKIP]' }
    const newHistory = [...apiHistory, skipMsg]
    setDisplayTurns(prev => [...prev, { question: currentQuestion, answer: null, skipped: true }])

    try {
      const result = await callCapture(newHistory, captureContextRef.current)
      const assistantMsg = {
        role: 'assistant',
        content: JSON.stringify({ question: result.question, done: result.done, extracted: result.extracted || [] }),
      }
      setApiHistory([...newHistory, assistantMsg])
      setTurnNum(t => t + 1)

      if (result.done || !result.question) {
        setReviewItems(extracted.map(x => ({ ...x })))
        setPhase('review')
      } else {
        setCurrentQuestion(result.question)
      }
    } catch (err) {
      setError(err.message)
      setDisplayTurns(prev => prev.slice(0, -1))
      setSkippedCount(s => s - 1)
      setStreak(0)
    } finally {
      setLoading(false)
    }
  }

  function finishEarly() {
    setReviewItems(extracted.map(x => ({ ...x })))
    setPhase('review')
  }

  function updateItem(id, field, val) {
    setReviewItems(prev => prev.map(item => item._id === id ? { ...item, [field]: val } : item))
  }

  function approveAll() {
    setReviewItems(prev => prev.map(item =>
      item.decision === 'pending' ? { ...item, decision: 'approved' } : item
    ))
  }

  async function saveApproved() {
    const toSave = reviewItems.filter(x => x.decision !== 'rejected')
    if (!toSave.length) return
    setSaving(true)
    setSaveError(null)

    const duration = startTimeRef.current ? new Date() - startTimeRef.current : 0

    // Count from user decisions NOW — before any async DB work.
    // The done screen shows what the user approved, not what the DB accepted.
    const approvedRules      = toSave.filter(x => x.type === 'rule').length
    const approvedAssertions = toSave.filter(x => x.type === 'assertion').length

    console.log('[capture] saving', approvedRules, 'rules and', approvedAssertions, 'assertions to plant', plantId)

    const failures = []

    const sessionDate = startTimeRef.current
      ? startTimeRef.current.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const captureSource = `Knowledge capture interview — ${sessionDate}`

    for (const item of toSave) {
      try {
        if (item.type === 'rule') {
          await createRule({
            title: item.title,
            category: item.category || 'Process',
            processArea: item.processArea || processArea,
            scope: item.scope || '',
            rationale: item.rationale || '',
            status: 'Proposed',
            tags: [],
            captureSource,
            plantId,
          })
        } else {
          await createAssertion({
            title: item.title,
            category: item.category || 'Process',
            processArea: item.processArea || processArea,
            scope: item.scope || '',
            status: 'Proposed',
            tags: [],
            captureSource,
            plantId,
          })
        }
      } catch (err) {
        console.error('[capture] save failed:', item.type, item.title, '—', err.message)
        failures.push(`${item.type} "${item.title.slice(0, 40)}": ${err.message}`)
      }
    }

    if (failures.length > 0) {
      setSaveError(`${failures.length} item${failures.length > 1 ? 's' : ''} failed to save. Check console for details.`)
    }

    onItemSaved?.()
    setSavedCounts({ rules: approvedRules, assertions: approvedAssertions })
    setSessionStats({ duration, answered: answeredCount, skipped: skippedCount, xp, maxStreak })
    setSaving(false)
    setPhase('done')
  }

  function restart() {
    captureContextRef.current = null
    setPhase('setup')
    setProcessArea('')
    setOperatorName(getDisplayName() || '')
    setTopic('')
    setApiHistory([])
    setDisplayTurns([])
    setCurrentQuestion('')
    setAnswer('')
    setTurnNum(0)
    setExtracted([])
    setAnsweredCount(0)
    setSkippedCount(0)
    setStreak(0)
    setMaxStreak(0)
    setXp(0)
    setCountFlash(false)
    setLevelFlash(false)
    setShared(false)
    setReviewItems([])
    setSavedCounts({ rules: 0, assertions: 0 })
    setSessionStats({})
    setError(null)
    setSaveError(null)
    prevExtractedLen.current = 0
    prevLevel.current = 1
  }

  // ── Setup phase ──────────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 32 }}>
        <div style={{ width: '100%', maxWidth: 480 }}>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, color: '#4FA89A', textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: FNT, fontWeight: 700, marginBottom: 8 }}>
              Knowledge Capture
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#062044', fontFamily: FNT, marginBottom: 8 }}>
              Guided Interview
            </div>
            <div style={{ fontSize: 13, color: '#8a8278', fontFamily: FNT, lineHeight: 1.6 }}>
              The system asks one question at a time, listens to your answers, and structures everything it hears into rules and assertions. You just talk.
            </div>
          </div>

          <form onSubmit={startInterview}>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 8 }}>
                What should we chat about?
              </div>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. quality issues we've been seeing lately, how we handle unusual situations…"
                required
                autoFocus
                style={{ ...iS, fontSize: 14 }}
              />
              <div style={{ fontSize: 11, color: '#b0a898', fontFamily: FNT, marginTop: 6 }}>
                The topic seeds the first question. You can go anywhere from there.
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fde8e5', borderRadius: 3, fontSize: 12, color: '#c0392b', fontFamily: FNT }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!topic.trim()}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 3, fontSize: 13,
                fontFamily: FNT, fontWeight: 700, border: 'none',
                cursor: !topic.trim() ? 'default' : 'pointer',
                background: !topic.trim() ? '#D8CEC3' : '#062044',
                color: !topic.trim() ? '#8a8278' : '#fff',
                letterSpacing: 0.5,
              }}
            >
              Begin Interview →
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Interview phase ──────────────────────────────────────────────────────────

  if (phase === 'interview') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Progress bar strip */}
      <div style={{ height: 3, background: '#e8e4e0', flexShrink: 0 }}>
        <div style={{
          height: '100%', background: '#4FA89A',
          width: `${progress}%`, transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
        }} />
      </div>

      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '9px 20px', borderBottom: '1px solid #e8e4e0',
        display: 'flex', alignItems: 'center', gap: 10, background: '#FAFAF9',
      }}>
        {/* Level badge */}
        <div style={{
          fontSize: 10, padding: '3px 9px', borderRadius: 2, fontFamily: FNT, fontWeight: 700,
          background: levelFlash ? '#4FA89A' : '#062044',
          color: '#fff', letterSpacing: 0.4, flexShrink: 0,
          transition: 'background 0.4s ease',
        }}>
          L{difficulty.level} · {difficulty.label}
        </div>

        <span style={{ color: '#D8CEC3', fontSize: 11 }}>·</span>

        {/* Answered / skipped count */}
        <div style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT, whiteSpace: 'nowrap' }}>
          {answeredCount} answered
          {skippedCount > 0 && <span style={{ color: '#b0a898' }}> · {skippedCount} skipped</span>}
        </div>

        <div style={{ flex: 1 }} />

        {/* Streak badge */}
        {streak >= 3 && (
          <div style={{
            fontSize: 10, padding: '3px 9px', borderRadius: 2, fontFamily: FNT, fontWeight: 700,
            background: '#fef3e2', color: '#F2652F', border: '1px solid rgba(242,101,47,0.25)',
            letterSpacing: 0.3, flexShrink: 0,
          }}>
            🔥 {streak} streak
          </div>
        )}

        {/* Knowledge counter */}
        {(ruleCount > 0 || assertionCount > 0) && (
          <div style={{
            fontSize: 10, padding: '3px 9px', borderRadius: 2, fontFamily: FNT, fontWeight: 700,
            background: countFlash ? '#e6f5f1' : '#f0eeec',
            color: countFlash ? '#2d6b5e' : '#4FA89A',
            border: `1px solid ${countFlash ? '#4FA89A' : 'transparent'}`,
            transition: 'background 0.3s, color 0.3s, border-color 0.3s',
            letterSpacing: 0.3, flexShrink: 0,
          }}>
            {ruleCount > 0 && `${ruleCount}R`}
            {ruleCount > 0 && assertionCount > 0 && ' · '}
            {assertionCount > 0 && `${assertionCount}A`}
            {' '}captured
          </div>
        )}

        <button
          onClick={finishEarly}
          style={{
            padding: '4px 11px', borderRadius: 3, fontSize: 10, fontFamily: FNT, fontWeight: 700,
            background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Finish
        </button>
      </div>

      {/* Conversation scroll area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>

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
                <div style={{
                  marginLeft: 17, padding: '9px 13px',
                  background: '#f8f6f4', borderRadius: 3, border: '1px solid #e8e4e0',
                }}>
                  <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {operatorName}
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
            <div style={{ borderLeft: '3px solid #4FA89A', paddingLeft: 14 }}>
              <div style={{ fontSize: 10, color: '#4FA89A', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 6 }}>
                Q{displayTurns.length + 1}
              </div>
              <Dots />
            </div>
          ) : currentQuestion ? (
            <div>
              <div style={{ borderLeft: '3px solid #4FA89A', paddingLeft: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: '#4FA89A', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 6 }}>
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
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAnswer()
                  }}
                  placeholder="Share what you know… (⌘↵ to continue)"
                  rows={5}
                  style={{
                    ...iS, fontSize: 13, resize: 'vertical', lineHeight: 1.6,
                    width: '100%', boxSizing: 'border-box', minHeight: 100,
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
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
                  <button
                    onClick={finishEarly}
                    style={{
                      padding: '9px 14px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 600,
                      background: 'transparent', border: 'none', color: '#b0a898', cursor: 'pointer',
                    }}
                  >
                    I'm done talking
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

  // ── Review phase ─────────────────────────────────────────────────────────────

  if (phase === 'review') {
    const approvedCount    = reviewItems.filter(x => x.decision === 'approved').length
    const editedCount      = reviewItems.filter(x => x.decision === 'edited').length
    const rejectedCount    = reviewItems.filter(x => x.decision === 'rejected').length
    const pendingCount     = reviewItems.filter(x => x.decision === 'pending').length
    const toSaveCount      = reviewItems.filter(x => x.decision !== 'rejected').length
    // Real-time counts for session summary (update as user approves/rejects)
    const toSaveRules      = reviewItems.filter(x => x.type === 'rule' && x.decision !== 'rejected').length
    const toSaveAssertions = reviewItems.filter(x => x.type === 'assertion' && x.decision !== 'rejected').length

    const counterParts = []
    if (approvedCount > 0) counterParts.push(`${approvedCount} approved`)
    if (editedCount > 0)   counterParts.push(`${editedCount} edited`)
    if (rejectedCount > 0) counterParts.push(`${rejectedCount} rejected`)
    if (pendingCount > 0)  counterParts.push(`${pendingCount} pending`)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <style>{`
          @keyframes approve-flash { 0% { background-color: #b8ead9; } 100% { background-color: #f4fbf8; } }
          @keyframes reject-flash  { 0% { background-color: #fcd8d4; } 100% { background-color: #fef7f6; } }
          .capture-card { transition: background-color 0.3s ease, border-color 0.3s ease, opacity 0.3s ease, transform 0.2s ease; }
          .capture-card:hover { transform: translateY(-1px); }
        `}</style>

        {/* ── Sticky header ── */}
        <div style={{
          flexShrink: 0, padding: '14px 28px', borderBottom: '1px solid #e8e4e0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAF9',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#062044', fontFamily: FNT }}>
              Review extracted knowledge
            </div>
            <div style={{ fontSize: 11, color: '#8a8278', fontFamily: FNT, marginTop: 2 }}>
              {counterParts.length > 0 ? counterParts.join(' · ') : `${reviewItems.length} items to review`}
            </div>
          </div>
          <button
            onClick={saveApproved}
            disabled={saving || toSaveCount === 0}
            style={{
              padding: '9px 22px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 700,
              border: 'none', cursor: toSaveCount > 0 && !saving ? 'pointer' : 'default',
              background: toSaveCount > 0 && !saving ? '#062044' : '#e8e4e0',
              color: toSaveCount > 0 && !saving ? '#fff' : '#b0a898',
            }}
          >
            {saving ? 'Saving…' : `Save ${toSaveCount} item${toSaveCount !== 1 ? 's' : ''} →`}
          </button>
        </div>
        {saveError && (
          <div style={{ flexShrink: 0, padding: '8px 28px', background: '#fde8e5', borderBottom: '1px solid #f5c6c0', fontSize: 11, color: '#c0392b', fontFamily: FNT }}>
            ⚠ {saveError}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 60px' }}>

          {/* ── Session summary card ── */}
          <div style={{
            margin: '20px 0 20px',
            padding: '16px 24px',
            background: '#062044',
            borderRadius: 4,
            display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: FNT, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, flexShrink: 0 }}>
              Session
            </div>
            {[
              { val: formatDuration(startTimeRef.current ? new Date() - startTimeRef.current : 0), label: 'duration' },
              { val: answeredCount, label: 'answered' },
              { val: skippedCount, label: 'skipped' },
              { val: toSaveRules, label: 'rules', accent: true },
              { val: toSaveAssertions, label: 'assertions', accent: true },
              { val: `+${xp}`, label: 'XP', warm: true },
            ].map(({ val, label, accent, warm }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 18, fontWeight: 700, fontFamily: FNT, lineHeight: 1,
                  color: accent ? '#4FA89A' : warm ? '#F2652F' : '#fff',
                }}>{val}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 3 }}>{label}</div>
              </div>
            ))}
            <div style={{ flex: 1 }} />
            {/* Approve All */}
            {pendingCount > 0 && (
              <button
                onClick={approveAll}
                style={{
                  padding: '8px 16px', borderRadius: 3, fontSize: 11, fontFamily: FNT, fontWeight: 700,
                  background: 'rgba(79,168,154,0.15)', border: '1px solid rgba(79,168,154,0.4)',
                  color: '#4FA89A', cursor: 'pointer', flexShrink: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,168,154,0.25)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(79,168,154,0.15)'}
              >
                ✓ Approve All
              </button>
            )}
          </div>

          {/* ── Empty state ── */}
          {reviewItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#b0a898', fontFamily: FNT, fontSize: 13 }}>
              No knowledge items were extracted from this interview.
              <div style={{ marginTop: 16 }}>
                <button onClick={restart} style={{ fontSize: 12, color: '#4FA89A', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FNT }}>
                  Start another interview
                </button>
              </div>
            </div>
          )}

          {/* ── Item cards ── */}
          {reviewItems.map(item => {
            const isApproved = item.decision === 'approved'
            const isEdited   = item.decision === 'edited'
            const isRejected = item.decision === 'rejected'
            const willSave   = !isRejected

            return (
              <div
                key={item._id}
                className="capture-card"
                style={{
                  marginBottom: 10,
                  padding: '14px 16px',
                  borderRadius: 4,
                  borderTop: '1px solid',
                  borderRight: '1px solid',
                  borderBottom: '1px solid',
                  borderTopColor:    isRejected ? '#f0d8d5' : (isApproved || isEdited) ? 'rgba(79,168,154,0.3)' : '#D8CEC3',
                  borderRightColor:  isRejected ? '#f0d8d5' : (isApproved || isEdited) ? 'rgba(79,168,154,0.3)' : '#D8CEC3',
                  borderBottomColor: isRejected ? '#f0d8d5' : (isApproved || isEdited) ? 'rgba(79,168,154,0.3)' : '#D8CEC3',
                  borderLeft: `3px solid ${isRejected ? '#e74c3c' : (isApproved || isEdited) ? '#4FA89A' : '#D8CEC3'}`,
                  backgroundColor: isRejected ? '#fef7f6' : (isApproved || isEdited) ? '#f4fbf8' : '#FFFFFF',
                  opacity: isRejected ? 0.6 : 1,
                  animation: item._flash === 'approved' ? 'approve-flash 0.5s ease-out' : item._flash === 'rejected' ? 'reject-flash 0.5s ease-out' : 'none',
                }}
              >
                {/* ── Top row: badges + action buttons ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: item.editing ? 12 : 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => !isRejected && !item.editing && updateItem(item._id, 'type', item.type === 'rule' ? 'assertion' : 'rule')}
                    title="Click to toggle Rule ↔ Assertion"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: isRejected || item.editing ? 'default' : 'pointer', flexShrink: 0 }}
                  >
                    <TypeBadge type={item.type} />
                  </button>
                  {item.processArea && !item.editing && (
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: '#f0eeec', color: '#8a8278', fontFamily: FNT, flexShrink: 0 }}>
                      {item.processArea}
                    </span>
                  )}
                  {item.category && !item.editing && (
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: '#f0eeec', color: '#8a8278', fontFamily: FNT, flexShrink: 0 }}>
                      {item.category}
                    </span>
                  )}
                  {isEdited && !item.editing && (
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: '#e6f5f1', color: '#2d6b5e', fontFamily: FNT, fontWeight: 700, flexShrink: 0 }}>
                      edited
                    </span>
                  )}

                  <div style={{ flex: 1 }} />

                  {/* Action buttons */}
                  {item.editing ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => {
                          setReviewItems(prev => prev.map(x =>
                            x._id === item._id ? { ...x, editing: false, decision: 'edited', _flash: 'approved' } : x
                          ))
                          setTimeout(() => updateItem(item._id, '_flash', null), 600)
                        }}
                        style={{
                          padding: '5px 14px', borderRadius: 3, fontSize: 10, fontFamily: FNT, fontWeight: 700,
                          background: '#4FA89A', border: 'none', color: '#fff', cursor: 'pointer',
                        }}
                      >
                        ✓ Save edit
                      </button>
                      <button
                        onClick={() => updateItem(item._id, 'editing', false)}
                        style={{
                          padding: '5px 10px', borderRadius: 3, fontSize: 10, fontFamily: FNT,
                          background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : isRejected ? (
                    <button
                      onClick={() => updateItem(item._id, 'decision', 'pending')}
                      style={{ fontSize: 10, fontFamily: FNT, fontWeight: 700, color: '#4FA89A', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}
                    >
                      ↩ Restore
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {(isApproved || isEdited) && (
                        <span style={{ fontSize: 13, color: '#4FA89A', fontWeight: 700, marginRight: 2 }}>✓</span>
                      )}
                      {item.decision === 'pending' && (
                        <button
                          onClick={() => {
                            setReviewItems(prev => prev.map(x =>
                              x._id === item._id ? { ...x, decision: 'approved', _flash: 'approved' } : x
                            ))
                            setTimeout(() => updateItem(item._id, '_flash', null), 600)
                          }}
                          style={{
                            padding: '5px 12px', borderRadius: 3, fontSize: 10, fontFamily: FNT, fontWeight: 700,
                            background: '#e6f5f1', border: '1px solid rgba(79,168,154,0.35)', color: '#2d6b5e', cursor: 'pointer',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#d0ede6'}
                          onMouseLeave={e => e.currentTarget.style.background = '#e6f5f1'}
                        >
                          ✓ Approve
                        </button>
                      )}
                      <button
                        onClick={() => updateItem(item._id, 'editing', true)}
                        style={{
                          padding: '5px 10px', borderRadius: 3, fontSize: 10, fontFamily: FNT, fontWeight: 600,
                          background: 'transparent', border: '1px solid #D8CEC3', color: '#5a5550', cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8f6f4' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        ✏ Edit
                      </button>
                      <button
                        onClick={() => {
                          setReviewItems(prev => prev.map(x =>
                            x._id === item._id ? { ...x, decision: 'rejected', _flash: 'rejected' } : x
                          ))
                          setTimeout(() => updateItem(item._id, '_flash', null), 600)
                        }}
                        style={{
                          padding: '5px 10px', borderRadius: 3, fontSize: 10, fontFamily: FNT, fontWeight: 600,
                          background: 'transparent', border: '1px solid #f0d8d5', color: '#e74c3c', cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#fef0ee' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        title="Reject — won't be saved"
                      >
                        ✗
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Edit mode form ── */}
                {item.editing ? (
                  <div>
                    <div style={{ fontSize: 9, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 4 }}>Title</div>
                    <input
                      value={item.title}
                      onChange={e => updateItem(item._id, 'title', e.target.value)}
                      style={{ ...iS, fontSize: 13, fontWeight: 600, color: '#062044', width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
                      autoFocus
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 9, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 4 }}>Process area</div>
                        <input
                          value={item.processArea || ''}
                          onChange={e => updateItem(item._id, 'processArea', e.target.value)}
                          placeholder="Type or select a process area…"
                          style={{ ...iS, fontSize: 12, width: '100%', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 4 }}>Category</div>
                        <select
                          value={item.category || 'Process'}
                          onChange={e => updateItem(item._id, 'category', e.target.value)}
                          style={{ ...iS, fontSize: 12, width: '100%', boxSizing: 'border-box' }}
                        >
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    {item.type === 'rule' && (
                      <div>
                        <div style={{ fontSize: 9, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 4 }}>Rationale</div>
                        <textarea
                          value={item.rationale || ''}
                          onChange={e => updateItem(item._id, 'rationale', e.target.value)}
                          rows={2}
                          style={{ ...iS, fontSize: 12, resize: 'vertical', width: '100%', boxSizing: 'border-box', lineHeight: 1.5 }}
                          placeholder="Why does this rule exist? What happens if you ignore it?"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Normal display mode ── */
                  <div>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: '#062044', fontFamily: FNT, lineHeight: 1.4,
                      textDecoration: isRejected ? 'line-through' : 'none',
                      marginBottom: item._sourceAnswer ? 8 : 0,
                    }}>
                      {item.title}
                    </div>
                    {item.type === 'rule' && item.rationale && !isRejected && (
                      <div style={{ fontSize: 11, color: '#8a8278', fontFamily: FNT, lineHeight: 1.5, marginBottom: item._sourceAnswer ? 8 : 0 }}>
                        {item.rationale}
                      </div>
                    )}
                    {/* Source answer (collapsible) */}
                    {item._sourceAnswer && (
                      <div>
                        <button
                          onClick={() => updateItem(item._id, '_expanded', !item._expanded)}
                          style={{
                            fontSize: 9, color: '#b0a898', background: 'none', border: 'none', cursor: 'pointer',
                            fontFamily: FNT, padding: 0, textTransform: 'uppercase', letterSpacing: 0.6,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          <span style={{ fontSize: 7 }}>{item._expanded ? '▼' : '▶'}</span> Source answer
                        </button>
                        {item._expanded && (
                          <div style={{
                            marginTop: 6, padding: '8px 12px',
                            background: '#f8f6f4', borderRadius: 3, border: '1px solid #e8e4e0',
                            fontSize: 11, color: '#5a5550', fontFamily: FNT, lineHeight: 1.6,
                            fontStyle: 'italic',
                          }}>
                            "{item._sourceAnswer}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Done phase ───────────────────────────────────────────────────────────────

  const totalSaved = savedCounts.rules + savedCounts.assertions
  const coverageGain = (totalSaved * 0.6).toFixed(1)
  const targetPlant = plantName || processArea || 'your plant'

  return (
    <div style={{
      flex: 1, background: '#062044',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'auto', padding: '32px 24px', position: 'relative',
    }}>
      {/* Subtle grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)',
        backgroundSize: '60px 60px', pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 520, position: 'relative', textAlign: 'center' }}>

        {/* Check circle */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(79,168,154,0.15)', border: '1px solid rgba(79,168,154,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 22px', fontSize: 26, color: '#4FA89A',
        }}>
          ✓
        </div>

        {/* Session complete label */}
        <div style={{ fontSize: 10, color: '#4FA89A', fontFamily: FNT, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>
          Session Complete
        </div>

        {/* Headline */}
        <div style={{ fontSize: 26, fontWeight: 700, color: '#FFFFFF', fontFamily: FNT, lineHeight: 1.25, marginBottom: 10 }}>
          {totalSaved > 0
            ? <>{totalSaved} piece{totalSaved !== 1 ? 's' : ''} of knowledge<br />added to {targetPlant}</>
            : <>Session complete</>
          }
        </div>

        {/* Coverage gain */}
        {totalSaved > 0 && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: FNT, lineHeight: 1.5, marginBottom: 32 }}>
            Your plant knowledge coverage increased by approximately{' '}
            <span style={{ color: '#4FA89A', fontWeight: 700 }}>{coverageGain}%</span>
          </div>
        )}

        {/* Stats strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1, borderRadius: 4, overflow: 'hidden', marginBottom: 24,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {[
            { val: formatDuration(sessionStats.duration || 0), label: 'Duration' },
            { val: sessionStats.answered || 0, label: 'Answered' },
            { val: savedCounts.rules, label: 'Rules', accent: true },
            { val: savedCounts.assertions, label: 'Assertions', accent: true },
          ].map(({ val, label, accent }) => (
            <div key={label} style={{
              padding: '16px 8px', textAlign: 'center',
              background: 'rgba(255,255,255,0.04)',
            }}>
              <div style={{
                fontSize: 20, fontWeight: 700, fontFamily: FNT, lineHeight: 1,
                color: accent ? '#4FA89A' : '#fff', marginBottom: 5,
              }}>
                {val}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* XP badge */}
        {(sessionStats.xp || 0) > 0 && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 16px', borderRadius: 20, marginBottom: 32,
            background: 'rgba(242,101,47,0.12)', border: '1px solid rgba(242,101,47,0.25)',
          }}>
            <span style={{ fontSize: 14 }}>⚡</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#F2652F', fontFamily: FNT }}>
              +{sessionStats.xp} XP earned
            </span>
            {(sessionStats.maxStreak || 0) >= 3 && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: FNT }}>
                · {sessionStats.maxStreak} streak
              </span>
            )}
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={restart}
            style={{
              padding: '12px 24px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 700,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.25)',
              color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
          >
            Start Another Session
          </button>
          <button
            onClick={() => onNavigate?.(savedCounts.rules > 0 ? 'rules' : 'assertions')}
            style={{
              padding: '12px 24px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 700,
              background: '#4FA89A', border: 'none', color: '#fff', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#3d9487'}
            onMouseLeave={e => e.currentTarget.style.background = '#4FA89A'}
          >
            View in Knowledge Bank →
          </button>
        </div>
      </div>
    </div>
  )
}
