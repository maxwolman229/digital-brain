import { useState, useEffect, useRef } from 'react'
import { FNT, FNTM, iS, formatDate } from '../lib/constants.js'
import { Badge, Tag, Modal, Field, TypeaheadInput, MentionDropdown, MentionText } from './shared.jsx'
import {
  fetchQuestions, addQuestion, updateQuestionStatus, saveResponse, fetchResponses,
  addRuleFromExtraction, addAssertionFromExtraction, fetchPlantMembers,
} from '../lib/db.js'
import { useMention } from '../lib/useMention.js'
import { stripMentionTokens } from '../lib/mentions.js'

const EMPTY_ASK = { question: '', detail: '', processArea: '', taggedPeople: [] }

export default function QuestionsView({ processAreas = [], industry, onItemSaved, onViewProfile }) {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [showAskForm, setShowAskForm] = useState(false)
  const [askForm, setAskForm] = useState(EMPTY_ASK)
  const [askTagInput, setAskTagInput] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [replyTo, setReplyTo] = useState(null)   // responseId being replied to
  const [extracting, setExtracting] = useState(false)
  const [extractParsed, setExtractParsed] = useState(null)
  const [extractError, setExtractError] = useState(null)
  const [accepting, setAccepting] = useState(false)
  const [members, setMembers] = useState([])
  const detailRef = useRef(null)
  const answerRef = useRef(null)
  const detailMention = useMention(askForm.detail, v => setAskForm(f => ({ ...f, detail: v })), detailRef, members)
  const answerMention = useMention(answerText, setAnswerText, answerRef, members)

  useEffect(() => {
    load()
    fetchPlantMembers().then(setMembers).catch(() => {})
  }, [])

  // Load responses from DB when opening a question
  useEffect(() => {
    if (!sel) return
    // Only fetch from DB if this looks like a real DB question (not in-memory seed)
    if (!sel.id.startsWith('Q-')) return
    fetchResponses(sel.id).then(responses => {
      if (responses.length > 0 || sel.responses.length === 0) {
        setSel(prev => prev ? { ...prev, responses } : prev)
      }
    })
  }, [sel?.id])

  async function load() {
    setLoading(true)
    const data = await fetchQuestions()
    setQuestions(data)
    setLoading(false)
  }

  // ── Submit question ───────────────────────────────────────────────────────

  async function handleAsk() {
    if (!askForm.question.trim()) return
    const now = new Date().toISOString()
    const localId = `Q-${String(questions.length + 1).padStart(3, '0')}`
    const newQ = {
      id: localId,
      question: askForm.question,
      detail: askForm.detail,
      processArea: askForm.processArea || 'General',
      askedAt: now,
      status: 'open',
      responses: [],
      generatedRules: [],
      generatedAssertions: [],
      taggedPeople: askForm.taggedPeople,
    }
    setQuestions(prev => [newQ, ...prev])
    setShowAskForm(false)
    setAskForm(EMPTY_ASK)
    setAskTagInput('')
    const saved = await addQuestion({ ...newQ, askedAt: now })
    if (saved) {
      setQuestions(prev => prev.map(q => q.id === localId ? saved : q))
      onItemSaved?.()
    }
  }

  // ── Submit response ───────────────────────────────────────────────────────

  async function handleSubmitResponse() {
    if (!answerText.trim() || !sel) return
    const optimistic = {
      id: `r${Date.now()}`,
      by: 'You',
      text: answerText,
      date: new Date().toISOString(),
      replyTo: replyTo,
    }
    const updatedResponses = [...(sel.responses || []), optimistic]
    const updated = { ...sel, responses: updatedResponses, status: 'answered' }
    setQuestions(prev => prev.map(q => q.id === sel.id ? updated : q))
    setSel(updated)
    setAnswerText('')
    setReplyTo(null)
    setExtractParsed(null)
    const saved = await saveResponse(sel.id, answerText, replyTo)
    if (saved) {
      // Replace optimistic entry with real DB row (gets real UUID)
      setSel(prev => prev ? { ...prev, responses: prev.responses.map(r => r.id === optimistic.id ? saved : r) } : prev)
    }
    await updateQuestionStatus(sel.id, 'answered')
  }

  // ── Extract rules/assertions from answers via Edge Function ──────────────────

  async function handleExtract() {
    setExtracting(true)
    setExtractError(null)
    setExtractParsed(null)

    const answerContent = (sel.responses || []).map(r => `${r.by}: ${stripMentionTokens(r.text)}`).join('\n\n')
    const narrative = `QUESTION: ${stripMentionTokens(sel.question)}\nCONTEXT: ${stripMentionTokens(sel.detail || '')}\n\nANSWERS:\n${answerContent}`

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const { getStoredJwt } = await import('../lib/supabase.js')
      const jwt = getStoredJwt()

      const resp = await fetch(`${supabaseUrl}/functions/v1/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': 'Bearer ' + (jwt || supabaseKey),
        },
        body: JSON.stringify({ narrative, process_area: sel.processArea, industry }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Extraction failed')

      setExtractParsed({
        rules: (data.rules || []).map((r, i) => ({ ...r, id: i, category: r.category || '', processArea: r.process_area || sel.processArea, tags: ['from-question', sel.id.toLowerCase()] })),
        assertions: (data.assertions || []).map((a, i) => ({ ...a, id: i, category: a.category || '', processArea: a.process_area || sel.processArea, tags: ['from-question', sel.id.toLowerCase()] })),
      })
    } catch (err) {
      setExtractError(err.message || 'Extraction failed.')
    }
    setExtracting(false)
  }

  async function handleAcceptExtraction() {
    if (!extractParsed || !sel) return
    setAccepting(true)
    const now = new Date().toISOString()
    const createdRuleIds = []
    const createdAssertionIds = []

    for (const r of extractParsed.rules) {
      const saved = await addRuleFromExtraction({ ...r, processArea: sel.processArea, createdAt: now, captureSource: `Extracted from Question ${sel.displayId || sel.id}` })
      if (saved) createdRuleIds.push(saved.id)
    }
    for (const a of extractParsed.assertions) {
      const saved = await addAssertionFromExtraction({ ...a, processArea: sel.processArea, createdAt: now, captureSource: `Extracted from Question ${sel.displayId || sel.id}` })
      if (saved) createdAssertionIds.push(saved.id)
    }

    const updatedGenRules = [...(sel.generatedRules || []), ...createdRuleIds]
    const updatedGenAssertions = [...(sel.generatedAssertions || []), ...createdAssertionIds]
    const updated = { ...sel, generatedRules: updatedGenRules, generatedAssertions: updatedGenAssertions }
    setQuestions(prev => prev.map(q => q.id === sel.id ? updated : q))
    setSel(updated)
    setExtractParsed(null)
    // generatedRules/Assertions are tracked in-memory only (no DB column for them)
    await updateQuestionStatus(sel.id, sel.status)
    setAccepting(false)
  }

  // ── Threaded response tree ────────────────────────────────────────────────

  function ResponseThread({ responses, parentId = null, depth = 0 }) {
    const children = responses.filter(r => (r.replyTo ?? null) === parentId)
    if (!children.length) return null
    return (
      <div style={{ marginLeft: depth > 0 ? 20 : 0 }}>
        {children.map(r => (
          <div key={r.id}>
            <div style={{
              padding: '10px 14px', marginBottom: 4,
              background: depth === 0 ? '#e6f5f1' : '#f0f8f6',
              borderRadius: 3,
              borderLeft: `3px solid ${depth === 0 ? 'var(--md1-accent)' : 'var(--md1-accent)80'}`,
            }}>
              {r.replyTo && (
                <div style={{ fontSize: 9, color: 'var(--md1-accent)', fontFamily: FNT, marginBottom: 4, opacity: 0.7 }}>
                  ↩ replying to {responses.find(x => x.id === r.replyTo)?.by || 'response'}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--md1-text)', lineHeight: 1.6 }}>
                <MentionText text={r.text} onMentionClick={onViewProfile ? (m => onViewProfile(m.displayName)) : undefined} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--md1-muted)', fontFamily: FNT }}>— <span
                  onClick={() => r.by && onViewProfile?.(r.by)}
                  style={{ cursor: onViewProfile ? 'pointer' : 'default', color: onViewProfile ? 'var(--md1-accent)' : 'inherit', textDecoration: onViewProfile ? 'underline' : 'none' }}
                >{r.by}</span> · {new Date(r.date).toLocaleDateString()}</div>
                <button
                  onClick={() => { setReplyTo(r.id); setAnswerText(''); document.getElementById('answer-input')?.focus() }}
                  style={{ fontSize: 9, color: 'var(--md1-accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FNT, fontWeight: 700 }}
                >
                  ↩ Reply
                </button>
              </div>
            </div>
            <ResponseThread responses={responses} parentId={r.id} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }

  const openQuestions = questions.filter(q => q.status === 'open')
  const answeredQuestions = questions.filter(q => q.status === 'answered')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Sticky header ── */}
      <div style={{ flexShrink: 0, padding: '14px 28px', borderBottom: '1px solid #e8e4e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--md1-section-bg)' }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNT, letterSpacing: 0.8 }}>
            {questions.length} QUESTIONS · {openQuestions.length} OPEN
          </div>
          <div style={{ fontSize: 11, color: '#5a5550', fontFamily: FNT, lineHeight: 1.5, marginTop: 2 }}>
            Questions operators couldn't answer from the knowledge bank.
          </div>
        </div>
        <button
          onClick={() => { setAskForm(EMPTY_ASK); setAskTagInput(''); setShowAskForm(true) }}
          style={{ padding: '7px 14px', borderRadius: 3, fontSize: 12, background: 'var(--md1-primary)', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.4, flexShrink: 0 }}
        >
          + Ask a Question
        </button>
      </div>

      {loading && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--md1-muted-light)', fontFamily: FNT, fontSize: 12 }}>Loading questions…</div>
      )}

      {!loading && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>

          {/* ── Panel 1: Awaiting Answers ── */}
          <div style={{ borderRight: '1px solid #e8e4e0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flexShrink: 0, padding: '12px 20px 10px', borderBottom: '1px solid #e8e4e0' }}>
              <div style={{ fontSize: 11, color: '#F2652F', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, fontWeight: 700 }}>
                ? Awaiting Answers{openQuestions.length > 0 && <span style={{ marginLeft: 6, color: 'var(--md1-muted-light)', fontWeight: 400 }}>{openQuestions.length}</span>}
              </div>
            </div>
            <div style={{ flex: 1, padding: '12px 20px', overflowY: 'auto' }}>
              {openQuestions.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--md1-border)', fontFamily: FNT, fontSize: 12 }}>No open questions.</div>
              ) : openQuestions.map(q => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  onClick={() => { setSel(q); setAnswerText(''); setReplyTo(null); setExtractParsed(null); setExtractError(null) }}
                />
              ))}
            </div>
          </div>

          {/* ── Panel 2: Answered ── */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flexShrink: 0, padding: '12px 20px 10px', borderBottom: '1px solid #e8e4e0' }}>
              <div style={{ fontSize: 11, color: 'var(--md1-accent)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, fontWeight: 700 }}>
                ✓ Answered{answeredQuestions.length > 0 && <span style={{ marginLeft: 6, color: 'var(--md1-muted-light)', fontWeight: 400 }}>{answeredQuestions.length}</span>}
              </div>
            </div>
            <div style={{ flex: 1, padding: '12px 20px', overflowY: 'auto' }}>
              {answeredQuestions.length === 0 ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--md1-border)', fontFamily: FNT, fontSize: 12 }}>No answered questions yet.</div>
              ) : answeredQuestions.map(q => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  onClick={() => { setSel(q); setAnswerText(''); setReplyTo(null); setExtractParsed(null); setExtractError(null) }}
                />
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ── Question detail modal ── */}
      <Modal
        open={!!sel}
        onClose={() => { setSel(null); setExtractParsed(null); setExtractError(null) }}
        title={sel ? `${sel.displayId || sel.id} — ${sel.status === 'open' ? 'Answer this Question' : 'Question Detail'}` : ''}
        width={680}
      >
        {sel && (
          <div>
            <div style={{ fontSize: 15, color: 'var(--md1-text)', fontWeight: 600, lineHeight: 1.5, marginBottom: 12 }}>
              <MentionText text={sel.question} onMentionClick={onViewProfile ? (m => onViewProfile(m.displayName)) : undefined} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 2, background: sel.status === 'open' ? '#fef3e2' : '#e6f5f1', color: sel.status === 'open' ? '#F2652F' : 'var(--md1-accent)', fontWeight: 700, fontFamily: FNT }}>
                {sel.status === 'open' ? 'OPEN' : 'ANSWERED'}
              </span>
              <Tag label={sel.processArea} />
              <span style={{ fontSize: 10, color: 'var(--md1-muted)', fontFamily: FNT }}>Asked by <span
                onClick={() => sel.askedBy && onViewProfile?.(sel.askedBy)}
                style={{ cursor: onViewProfile ? 'pointer' : 'default', color: onViewProfile ? 'var(--md1-accent)' : 'inherit', textDecoration: onViewProfile ? 'underline' : 'none' }}
              >{sel.askedBy}</span> · {new Date(sel.askedAt).toLocaleDateString()}</span>
            </div>

            {sel.detail && (
              <div style={{ padding: '12px 16px', background: '#f8f6f4', borderRadius: 3, marginBottom: 16, border: '1px solid #e8e4e0' }}>
                <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.8, marginBottom: 4 }}>CONTEXT</div>
                <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.6 }}>
                  <MentionText text={sel.detail} onMentionClick={onViewProfile ? (m => onViewProfile(m.displayName)) : undefined} />
                </div>
              </div>
            )}

            {/* Tagged people */}
            {(sel.taggedPeople || []).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNT }}>Tagged:</span>
                {sel.taggedPeople.map((p, i) => (
                  <span key={i} style={{ padding: '3px 10px', borderRadius: 3, background: '#e8edf4', color: 'var(--md1-primary)', fontSize: 10, fontFamily: FNT, fontWeight: 600 }}>{p}</span>
                ))}
              </div>
            )}

            {/* Threaded responses */}
            {(sel.responses || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--md1-accent)', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
                  RESPONSES ({sel.responses.length})
                </div>
                <ResponseThread responses={sel.responses} parentId={null} depth={0} />
              </div>
            )}

            {/* Generated rules/assertions */}
            {(sel.generatedRules || []).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--md1-accent)', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>GENERATED RULES</div>
                {sel.generatedRules.map(rid => (
                  <div key={rid} style={{ padding: '6px 10px', background: '#f8f6f4', borderRadius: 3, marginBottom: 4, fontSize: 11, color: 'var(--md1-accent)', fontFamily: FNT, fontWeight: 700, border: '1px solid #e8e4e0' }}>
                    {rid}
                  </div>
                ))}
              </div>
            )}
            {(sel.generatedAssertions || []).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--md1-accent)', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.8, marginBottom: 6 }}>GENERATED ASSERTIONS</div>
                {sel.generatedAssertions.map(aid => (
                  <div key={aid} style={{ padding: '6px 10px', background: '#f8f6f4', borderRadius: 3, marginBottom: 4, fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, fontWeight: 700, border: '1px solid #e8e4e0' }}>
                    {aid}
                  </div>
                ))}
              </div>
            )}

            {/* Reply target indicator */}
            {replyTo && (
              <div style={{ padding: '6px 10px', background: '#fef3e2', borderRadius: 3, marginBottom: 8, fontSize: 10, color: '#F2652F', fontFamily: FNT, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>↩ Replying to {(sel.responses || []).find(r => r.id === replyTo)?.by || 'response'}</span>
                <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#F2652F', cursor: 'pointer', fontSize: 13 }}>✕</button>
              </div>
            )}

            {/* Answer / Reply input */}
            <div style={{ borderTop: '1px solid #e8e4e0', paddingTop: 16, marginTop: 8 }}>
              <Field
                label={(sel.responses || []).length > 0 ? (replyTo ? 'Your Reply' : 'Add Another Response') : 'Your Answer'}
                hint="Share what you know — be specific and operational"
              >
                <div style={{ position: 'relative' }}>
                  <textarea
                    id="answer-input"
                    ref={answerRef}
                    style={{ ...iS, height: 90, resize: 'vertical', lineHeight: 1.5 }}
                    value={answerText}
                    onChange={answerMention.handleChange}
                    onKeyDown={answerMention.handleKeyDown}
                    placeholder="e.g. Full DRI needs a flat power profile — no need for the bore-in phase you use with scrap... (type @ to mention)"
                  />
                  <MentionDropdown query={answerMention.query} members={answerMention.filtered} activeIndex={answerMention.activeIndex} onSelect={answerMention.insert} />
                </div>
              </Field>
              <button
                onClick={handleSubmitResponse}
                disabled={!answerText.trim()}
                style={{ width: '100%', padding: '10px 0', borderRadius: 3, fontSize: 13, background: answerText.trim() ? 'var(--md1-accent)' : '#f0eeec', border: 'none', color: answerText.trim() ? '#FFFFFF' : '#444', cursor: answerText.trim() ? 'pointer' : 'not-allowed', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.4 }}
              >
                {replyTo ? 'Submit Reply' : 'Submit Answer'}
              </button>
            </div>

            {/* Extract section */}
            {(sel.responses || []).length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e8e4e0' }}>
                {extractError && (
                  <div style={{ padding: '10px 14px', background: '#fde8e5', border: '1px solid #c0392b30', borderRadius: 3, marginBottom: 8, fontSize: 11, color: '#c0392b', fontFamily: FNT, lineHeight: 1.5 }}>
                    {extractError}
                  </div>
                )}

                {extractParsed && !accepting && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--md1-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontFamily: FNT, fontWeight: 700 }}>
                      Extracted ({extractParsed.assertions.length} Assertions · {extractParsed.rules.length} Rules) — review before accepting
                    </div>

                    {extractParsed.assertions.map((a, i) => (
                      <div key={i} style={{ padding: '10px 12px', background: '#f8f6f4', borderRadius: 3, marginBottom: 6, border: '1px solid var(--md1-border)' }}>
                        <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', fontFamily: FNT, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.8 }}>Assertion</div>
                        <input
                          value={a.title}
                          onChange={e => setExtractParsed(p => ({ ...p, assertions: p.assertions.map((x, j) => j === i ? { ...x, title: e.target.value } : x) }))}
                          style={{ ...iS, fontSize: 12, fontWeight: 500, background: '#fff' }}
                        />
                      </div>
                    ))}

                    {extractParsed.rules.map((r, i) => (
                      <div key={i} style={{ padding: '10px 12px', background: '#f8f6f4', borderRadius: 3, marginBottom: 6, border: '1px solid var(--md1-border)' }}>
                        <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', fontFamily: FNT, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.8 }}>Rule</div>
                        <input
                          value={r.title}
                          onChange={e => setExtractParsed(p => ({ ...p, rules: p.rules.map((x, j) => j === i ? { ...x, title: e.target.value } : x) }))}
                          style={{ ...iS, fontSize: 12, fontWeight: 500, marginBottom: 4, background: '#fff' }}
                        />
                        <input
                          value={r.rationale || ''}
                          onChange={e => setExtractParsed(p => ({ ...p, rules: p.rules.map((x, j) => j === i ? { ...x, rationale: e.target.value } : x) }))}
                          style={{ ...iS, fontSize: 11, fontStyle: 'italic', background: '#fff' }}
                          placeholder="Rationale..."
                        />
                      </div>
                    ))}

                    <div style={{ padding: '8px 12px', background: '#fef3e2', border: '1px solid #F2652F30', borderRadius: 3, marginBottom: 8, fontSize: 10, color: '#F2652F', fontFamily: FNT, lineHeight: 1.5 }}>
                      AI-extracted — review and edit above. All items created with status Proposed.
                    </div>

                    <button
                      onClick={handleAcceptExtraction}
                      style={{ width: '100%', padding: '10px 0', borderRadius: 3, fontSize: 13, background: '#F2652F', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontFamily: FNT, fontWeight: 700 }}
                    >
                      Accept & Create {extractParsed.assertions.length} Assertions + {extractParsed.rules.length} Rules →
                    </button>
                  </div>
                )}

                {accepting && (
                  <div style={{ padding: '10px 14px', background: '#fef3e2', borderRadius: 3, marginBottom: 8, fontSize: 12, color: '#F2652F', fontFamily: FNT, textAlign: 'center' }}>
                    Creating knowledge items…
                  </div>
                )}

                {!extractParsed && !accepting && (
                  <button
                    onClick={handleExtract}
                    disabled={extracting}
                    style={{ width: '100%', padding: '12px 0', borderRadius: 3, fontSize: 12, background: extracting ? '#f0eeec' : 'var(--md1-primary)', border: 'none', color: extracting ? 'var(--md1-muted)' : '#FFFFFF', cursor: extracting ? 'default' : 'pointer', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.4 }}
                  >
                    {extracting ? 'Extracting knowledge…' : 'Extract Rules & Assertions from Answers →'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Ask a Question form modal ── */}
      <Modal open={showAskForm} onClose={() => setShowAskForm(false)} title="Ask the Team" width={600}>
        <div style={{ fontSize: 12, color: 'var(--md1-muted)', lineHeight: 1.6, marginBottom: 16 }}>
          Describe what you need in detail — experienced team members will see this in the Open Questions queue and can contribute their knowledge.
        </div>

        <Field label="Your Question" hint="What do you need to know?">
          <input
            style={{ ...iS, fontSize: 13, fontWeight: 500 }}
            value={askForm.question}
            onChange={e => setAskForm({ ...askForm, question: e.target.value })}
            placeholder="e.g. What do we do if the spectrometer goes down mid-heat?"
          />
        </Field>

        <Field label="Details" hint="Add context — what were you doing, what did you try, why does this matter?">
          <div style={{ position: 'relative' }}>
            <textarea
              ref={detailRef}
              style={{ ...iS, height: 90, resize: 'vertical', lineHeight: 1.5 }}
              value={askForm.detail}
              onChange={detailMention.handleChange}
              onKeyDown={detailMention.handleKeyDown}
              placeholder="e.g. Had this happen on night shift. Ended up calling the quality lab and waiting 20 minutes. There must be a faster backup procedure... (type @ to mention)"
            />
            <MentionDropdown query={detailMention.query} members={detailMention.filtered} activeIndex={detailMention.activeIndex} onSelect={detailMention.insert} />
          </div>
        </Field>

        <Field label="Process Area">
          <TypeaheadInput value={askForm.processArea} onChange={v => setAskForm({ ...askForm, processArea: v })} options={processAreas} placeholder="Type process area..." />
        </Field>

        <Field label="Tag People" hint="People who might know the answer">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {askForm.taggedPeople.map((p, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 3, background: '#e8edf4', color: 'var(--md1-primary)', fontSize: 10, fontFamily: FNT, fontWeight: 600 }}>
                {p}
                <button onClick={() => setAskForm(f => ({ ...f, taggedPeople: f.taggedPeople.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', color: 'var(--md1-muted)', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
              </span>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <input
              value={askTagInput}
              onChange={e => setAskTagInput(e.target.value)}
              style={{ ...iS, fontSize: 11 }}
              placeholder="Type a name..."
              onKeyDown={e => {
                if (e.key === 'Enter' && askTagInput.trim()) {
                  e.preventDefault()
                  setAskForm(f => ({ ...f, taggedPeople: [...f.taggedPeople, askTagInput.trim()] }))
                  setAskTagInput('')
                }
              }}
            />
            <div style={{ position: 'absolute', right: 8, top: 7, fontSize: 9, color: 'var(--md1-muted-light)', fontFamily: FNT }}>Enter to add</div>
          </div>
        </Field>

        <button
          onClick={handleAsk}
          disabled={!askForm.question.trim()}
          style={{ width: '100%', padding: '10px 0', borderRadius: 3, fontSize: 13, background: askForm.question.trim() ? 'var(--md1-primary)' : '#f0eeec', border: 'none', color: askForm.question.trim() ? '#FFFFFF' : '#444', cursor: askForm.question.trim() ? 'pointer' : 'not-allowed', fontFamily: FNT, fontWeight: 700, marginTop: 8, letterSpacing: 0.4 }}
        >
          Submit Question to Team
        </button>
      </Modal>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function QuestionCard({ q, onClick }) {
  const [hovered, setHovered] = useState(false)
  const isOpen = q.status === 'open'
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ padding: '16px 20px', marginBottom: 8, background: hovered ? '#f8f6f4' : '#FFFFFF', border: '1px solid #e8e4e0', borderRadius: 3, cursor: 'pointer', transition: 'all 0.12s' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--md1-muted-light)', fontFamily: FNT, fontWeight: 600 }}>{q.displayId || q.id}</span>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 2, background: isOpen ? '#fef3e2' : '#e6f5f1', color: isOpen ? '#F2652F' : 'var(--md1-accent)', fontWeight: 700, fontFamily: FNT }}>
            {isOpen ? 'OPEN' : 'ANSWERED'}
          </span>
          <Tag label={q.processArea} />
        </div>
        <span style={{ fontSize: 10, color: 'var(--md1-border)', fontFamily: FNT }}>{formatDate(q.askedAt)}</span>
      </div>

      <div style={{ fontSize: 14, color: 'var(--md1-text)', fontWeight: 500, lineHeight: 1.4, marginBottom: 6 }}>{q.question}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT }}>
          Asked by {q.askedBy}
          {!isOpen && q.responses?.length > 0 && ` · Answered by ${q.responses[0].by}`}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(q.responses || []).length > 0 && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: '#e6f5f1', color: 'var(--md1-accent)', fontFamily: FNT, fontWeight: 700 }}>
              {q.responses.length} response{q.responses.length > 1 ? 's' : ''}
            </span>
          )}
          {(q.generatedRules || []).length > 0 && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: '#e6f5f1', color: 'var(--md1-accent)', fontFamily: FNT, fontWeight: 700 }}>
              {q.generatedRules.length} rule{q.generatedRules.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
