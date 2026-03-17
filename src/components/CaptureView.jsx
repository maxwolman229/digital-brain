import { useState, useRef, useEffect } from 'react'
import { FNT, iS } from '../lib/constants.js'
import { getStoredJwt } from '../lib/supabase.js'
import { createRule, createAssertion } from '../lib/db.js'
import { getDisplayName } from '../lib/userContext.js'

// ── Helpers ────────────────────────────────────────────────────────────────────

function confidenceColor(c) {
  return ({
    'Very High': { bg: '#e6f5f1', text: '#2d6b5e' },
    'High':      { bg: '#e8edf4', text: '#062044' },
    'Medium':    { bg: '#f0eeec', text: '#8a8278' },
    'Low':       { bg: '#fef3e2', text: '#F2652F' },
  })[c] || { bg: '#f0eeec', text: '#8a8278' }
}

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

// ── Main component ─────────────────────────────────────────────────────────────

export default function CaptureView({ processAreas = [], industry, onNavigate, onItemSaved }) {
  const [phase, setPhase] = useState('setup')

  // Setup
  const [processArea, setProcessArea] = useState(processAreas[0] || '')
  const [operatorName, setOperatorName] = useState(getDisplayName() || '')
  const [topic, setTopic] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

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

  const scrollRef = useRef(null)
  const answerRef = useRef(null)
  const startTimeRef = useRef(null)
  const prevExtractedLen = useRef(0)
  const prevLevel = useRef(1)

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

  useEffect(() => {
    if (processAreas.length && !processArea) setProcessArea(processAreas[0])
  }, [processAreas])

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

  async function callCapture(history) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    const jwt = getStoredJwt()
    const resp = await fetch(`${supabaseUrl}/functions/v1/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + (jwt || supabaseKey),
      },
      body: JSON.stringify({ history, industry }),
    })
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}))
      throw new Error(body.error || `HTTP ${resp.status}`)
    }
    return resp.json()
  }

  async function startInterview(e) {
    e.preventDefault()
    if (!operatorName.trim()) return
    startTimeRef.current = new Date()
    setPhase('interview')
    setLoading(true)
    setError(null)

    const setupMsg = {
      role: 'user',
      content: [
        'INTERVIEW SETUP',
        `Process area: ${processArea || 'General'}`,
        `Operator: ${operatorName.trim()}`,
        `Topic: ${topic.trim() || 'open-ended — capture their most valuable knowledge'}`,
        '',
        "Please ask your opening question to start capturing this operator's knowledge.",
      ].join('\n'),
    }

    try {
      const result = await callCapture([setupMsg])
      const assistantMsg = {
        role: 'assistant',
        content: JSON.stringify({ question: result.question, done: result.done, extracted: result.extracted || [] }),
      }
      setApiHistory([setupMsg, assistantMsg])
      setCurrentQuestion(result.question || '')
      setTurnNum(1)
    } catch (err) {
      setError(err.message)
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
      const result = await callCapture(newHistory)
      const assistantMsg = {
        role: 'assistant',
        content: JSON.stringify({ question: result.question, done: result.done, extracted: result.extracted || [] }),
      }
      setApiHistory([...newHistory, assistantMsg])

      const newItems = (result.extracted || []).map((item, i) => ({
        ...item,
        _id: `t${turnNum}_i${i}`,
        approved: true,
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
      const result = await callCapture(newHistory)
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

  function toggleApproval(id) {
    setReviewItems(prev => prev.map(item => item._id === id ? { ...item, approved: !item.approved } : item))
  }

  async function saveApproved() {
    const toSave = reviewItems.filter(x => x.approved)
    if (!toSave.length) return
    setSaving(true)

    const duration = startTimeRef.current ? new Date() - startTimeRef.current : 0
    let rules = 0, assertions = 0

    await Promise.all(toSave.map(async item => {
      try {
        if (item.type === 'rule') {
          await createRule({
            title: item.title,
            category: item.category || 'Process',
            processArea: item.processArea || processArea,
            scope: item.scope || '',
            rationale: item.rationale || '',
            confidence: item.confidence || 'Medium',
            status: 'Proposed',
            tags: [],
            createdBy: operatorName || getDisplayName(),
          })
          rules++
        } else {
          await createAssertion({
            title: item.title,
            category: item.category || 'Process',
            processArea: item.processArea || processArea,
            scope: item.scope || '',
            confidence: item.confidence || 'Medium',
            status: 'Proposed',
            tags: [],
            createdBy: operatorName || getDisplayName(),
          })
          assertions++
        }
      } catch (err) {
        console.error('[capture] save failed:', item.title, err.message)
      }
    }))

    onItemSaved?.()
    setSavedCounts({ rules, assertions })
    setSessionStats({ duration, answered: answeredCount, skipped: skippedCount, xp, maxStreak })
    setSaving(false)
    setPhase('done')
  }

  function restart() {
    setPhase('setup')
    setProcessArea(processAreas[0] || '')
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
    prevExtractedLen.current = 0
    prevLevel.current = 1
  }

  // ── Setup phase ──────────────────────────────────────────────────────────────

  if (phase === 'setup') {
    const filteredSuggestions = processAreas.filter(pa =>
      pa.toLowerCase().includes(processArea.toLowerCase()) && pa !== processArea
    )

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
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>
                Who is being interviewed?
              </div>
              <input
                value={operatorName}
                onChange={e => setOperatorName(e.target.value)}
                placeholder="Operator name"
                required
                style={{ ...iS, fontSize: 13 }}
              />
            </div>

            <div style={{ marginBottom: 16, position: 'relative' }}>
              <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>
                Process area
              </div>
              <input
                value={processArea}
                onChange={e => { setProcessArea(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="e.g. EAF, Casting, Rolling…"
                autoComplete="off"
                style={{ ...iS, fontSize: 13 }}
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  background: '#fff', border: '1px solid #D8CEC3', borderRadius: 3,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden',
                }}>
                  {filteredSuggestions.map(pa => (
                    <button
                      key={pa}
                      type="button"
                      onMouseDown={() => { setProcessArea(pa); setShowSuggestions(false) }}
                      style={{
                        display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
                        background: 'none', border: 'none', cursor: 'pointer', fontFamily: FNT,
                        fontSize: 12, color: '#1F1F1F', borderBottom: '1px solid #f0eeec',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8f6f4'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      {pa}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>
                Topic or situation <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span>
              </div>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. slag management, scrap quality issues, a recent incident…"
                style={{ ...iS, fontSize: 13 }}
              />
            </div>

            {error && (
              <div style={{ marginBottom: 16, padding: '8px 12px', background: '#fde8e5', borderRadius: 3, fontSize: 12, color: '#c0392b', fontFamily: FNT }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              style={{
                width: '100%', padding: '12px 0', borderRadius: 3, fontSize: 13,
                fontFamily: FNT, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: '#062044', color: '#fff', letterSpacing: 0.5,
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
    const approvedCount = reviewItems.filter(x => x.approved).length

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{
          flexShrink: 0, padding: '14px 28px', borderBottom: '1px solid #e8e4e0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAF9',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#062044', fontFamily: FNT }}>
              Review extracted knowledge
            </div>
            <div style={{ fontSize: 11, color: '#8a8278', fontFamily: FNT, marginTop: 2 }}>
              {approvedCount} of {reviewItems.length} items selected · edit before saving
            </div>
          </div>
          <button
            onClick={saveApproved}
            disabled={saving || approvedCount === 0}
            style={{
              padding: '9px 20px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 700,
              border: 'none', cursor: approvedCount > 0 && !saving ? 'pointer' : 'default',
              background: approvedCount > 0 && !saving ? '#062044' : '#e8e4e0',
              color: approvedCount > 0 && !saving ? '#fff' : '#b0a898',
            }}
          >
            {saving ? 'Saving…' : `Save ${approvedCount} item${approvedCount !== 1 ? 's' : ''} →`}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
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

          {reviewItems.map(item => (
            <div
              key={item._id}
              style={{
                marginBottom: 12, padding: '14px 16px',
                background: item.approved ? '#FFFFFF' : '#f8f6f4',
                border: `1px solid ${item.approved ? '#D8CEC3' : '#e8e4e0'}`,
                borderRadius: 4, opacity: item.approved ? 1 : 0.5,
                transition: 'opacity 0.15s, border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <button
                  onClick={() => updateItem(item._id, 'type', item.type === 'rule' ? 'assertion' : 'rule')}
                  title="Toggle Rule ↔ Assertion"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
                >
                  <TypeBadge type={item.type} />
                </button>
                {item.processArea && (
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: '#f0eeec', color: '#8a8278', fontFamily: FNT, flexShrink: 0 }}>
                    {item.processArea}
                  </span>
                )}
                {item.category && (
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: '#f0eeec', color: '#8a8278', fontFamily: FNT, flexShrink: 0 }}>
                    {item.category}
                  </span>
                )}
                {item.confidence && (
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, fontFamily: FNT, fontWeight: 600, flexShrink: 0, ...confidenceColor(item.confidence) }}>
                    {item.confidence}
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => toggleApproval(item._id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0,
                    fontSize: 11, fontFamily: FNT, fontWeight: 700,
                    color: item.approved ? '#c0392b' : '#4FA89A', padding: '2px 6px',
                  }}
                >
                  {item.approved ? '✕ Discard' : '↩ Restore'}
                </button>
              </div>

              <input
                value={item.title}
                onChange={e => updateItem(item._id, 'title', e.target.value)}
                style={{ ...iS, fontSize: 13, fontWeight: 600, color: '#062044', marginBottom: 8, width: '100%', boxSizing: 'border-box' }}
              />

              {item.type === 'rule' && (
                <div>
                  <div style={{ fontSize: 9, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 4 }}>Rationale</div>
                  <textarea
                    value={item.rationale || ''}
                    onChange={e => updateItem(item._id, 'rationale', e.target.value)}
                    rows={2}
                    style={{ ...iS, fontSize: 12, resize: 'vertical', width: '100%', boxSizing: 'border-box', lineHeight: 1.5 }}
                  />
                </div>
              )}

              {item.scope && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 4 }}>Scope</div>
                  <input
                    value={item.scope}
                    onChange={e => updateItem(item._id, 'scope', e.target.value)}
                    style={{ ...iS, fontSize: 12, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>
          ))}
          <div style={{ height: 40 }} />
        </div>
      </div>
    )
  }

  // ── Done phase ───────────────────────────────────────────────────────────────

  const totalSaved = savedCounts.rules + savedCounts.assertions
  const completeness = (totalSaved * 0.6).toFixed(1)

  async function handleShare() {
    const lines = [
      `Knowledge Capture — ${operatorName} · ${processArea || 'General'}`,
      `${savedCounts.rules} rule${savedCounts.rules !== 1 ? 's' : ''} · ${savedCounts.assertions} assertion${savedCounts.assertions !== 1 ? 's' : ''} captured`,
      `${sessionStats.answered || 0} questions answered in ${formatDuration(sessionStats.duration || 0)}`,
      `XP earned: ${sessionStats.xp || 0}`,
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    } catch {}
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 32 }}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 12, color: '#4FA89A', fontFamily: FNT, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 }}>
            Session complete
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#062044', fontFamily: FNT }}>
            Knowledge captured
          </div>
        </div>

        {/* Stats grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1,
          background: '#e8e4e0', borderRadius: 4, overflow: 'hidden', marginBottom: 16,
        }}>
          {[
            { label: 'Session time',    value: formatDuration(sessionStats.duration || 0) },
            { label: 'Questions answered', value: sessionStats.answered || 0 },
            { label: 'Skipped',         value: sessionStats.skipped || 0 },
            { label: 'Rules extracted',    value: savedCounts.rules, accent: true },
            { label: 'Assertions extracted', value: savedCounts.assertions, accent: true },
            { label: 'XP earned',       value: sessionStats.xp || 0, warm: true },
          ].map(({ label, value, accent, warm }) => (
            <div key={label} style={{
              padding: '16px 14px', background: '#FFFFFF', textAlign: 'center',
            }}>
              <div style={{
                fontSize: 22, fontWeight: 700, fontFamily: FNT, lineHeight: 1,
                color: accent ? '#4FA89A' : warm ? '#F2652F' : '#062044',
                marginBottom: 5,
              }}>
                {value}
              </div>
              <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Completeness bar */}
        {totalSaved > 0 && (
          <div style={{
            padding: '14px 18px', background: '#f0eeec', borderRadius: 3,
            display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#5a5550', fontFamily: FNT, lineHeight: 1.5 }}>
                Your plant knowledge bank is now approximately{' '}
                <span style={{ fontWeight: 700, color: '#062044' }}>{completeness}%</span>{' '}
                more complete from this session.
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {savedCounts.rules > 0 && (
            <button
              onClick={() => onNavigate?.('rules')}
              style={{ padding: '9px 18px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 700, background: '#062044', border: 'none', color: '#fff', cursor: 'pointer' }}
            >
              View Rules →
            </button>
          )}
          {savedCounts.assertions > 0 && (
            <button
              onClick={() => onNavigate?.('assertions')}
              style={{ padding: '9px 18px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 700, background: '#4FA89A', border: 'none', color: '#fff', cursor: 'pointer' }}
            >
              View Assertions →
            </button>
          )}
          <button
            onClick={handleShare}
            style={{
              padding: '9px 18px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 600,
              background: 'transparent', border: '1px solid #D8CEC3',
              color: shared ? '#4FA89A' : '#5a5550', cursor: 'pointer',
            }}
          >
            {shared ? '✓ Copied' : 'Share with team'}
          </button>
          <button
            onClick={restart}
            style={{ padding: '9px 18px', borderRadius: 3, fontSize: 12, fontFamily: FNT, fontWeight: 600, background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer' }}
          >
            New session
          </button>
        </div>
      </div>
    </div>
  )
}
