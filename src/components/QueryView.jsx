import { useState, useRef, useEffect } from 'react'
import { FNT, FNTM, iS, statusColor, paColor, formatDate } from '../lib/constants.js'
import { Badge, Tag, Modal } from './shared.jsx'
import { getStoredJwt } from '../lib/supabase.js'
import { fetchItemById, addQuestion } from '../lib/db.js'
import { getDisplayName } from '../lib/userContext.js'
import Comments from './Comments.jsx'
import Verifications from './Verifications.jsx'
import LinkEditor from './LinkEditor.jsx'

const FALLBACK_PLANT_ID = import.meta.env.VITE_PLANT_ID || 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

const QUICK_PROMPTS = [
  'What are the key checks before starting a new batch?',
  'What causes the most common defects in this process?',
  'What should I watch for with non-standard input materials?',
  'What are the early warning signs that something is going wrong?',
]

// ── Full item detail shown in the query citation modal ─────────────────────────

function QueryItemDetail({ item, onCiteClick }) {
  return (
    <div>
      {/* Badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {item.status && <Badge label={item.status} colorFn={statusColor} />}
        {item.category && <Tag label={item.category} />}
        {item.processArea && <Tag label={item.processArea} />}
      </div>

      {/* Title */}
      <h3 style={{ fontSize: 16, color: '#062044', fontWeight: 700, lineHeight: 1.4, marginBottom: 18, fontFamily: FNT }}>
        {item.title}
      </h3>

      {/* Verifications */}
      <Verifications targetType={item.type} targetId={item.id} />

      {/* Scope */}
      {item.scope && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: FNT }}>Scope</div>
          <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.5 }}>{item.scope}</div>
        </div>
      )}

      {/* Rationale */}
      {item.rationale && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: FNT }}>Rationale</div>
          <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.5 }}>{item.rationale}</div>
        </div>
      )}

      {/* Evidence */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: FNT }}>Evidence</div>
        {(item.evidence || []).length === 0 ? (
          <div style={{ fontSize: 12, color: '#D8CEC3' }}>None recorded</div>
        ) : (item.evidence || []).map((ev, i) => (
          <div key={i} style={{ padding: '8px 10px', background: '#f8f6f4', borderRadius: 4, marginBottom: 4, border: '1px solid #D8CEC3' }}>
            <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, marginBottom: 3 }}>
              {(ev.type || '').replace(/_/g, ' ').toUpperCase()} · {ev.date}
            </div>
            <div style={{ fontSize: 12, color: '#8a8278', lineHeight: 1.4 }}>{ev.text}</div>
          </div>
        ))}
      </div>

      {/* Links */}
      <div style={{ marginBottom: 18 }}>
        <LinkEditor sourceType={item.type} sourceId={item.id} onOpenItem={(type, id) => onCiteClick(id, id[0])} />
      </div>

      {/* Tags */}
      {(item.tags || []).length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: FNT }}>Tags</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {item.tags.map(t => <Tag key={t} label={t} />)}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: '10px 0', borderTop: '1px solid #D8CEC3', marginTop: 4, fontSize: 10, color: '#D8CEC3', fontFamily: FNT, lineHeight: 1.8 }}>
        <div>Created by: {item.createdBy}</div>
        <div>Created: {formatDate(item.createdAt)}</div>
        {(item.versions || []).length > 0 && <div>Versions: {item.versions.length}</div>}
      </div>

      {/* Comments */}
      <Comments targetType={item.type} targetId={item.id} />
    </div>
  )
}

// Parse Claude's response and make [R-001], [A-002], [E-003] clickable
function AnswerText({ text, onCiteClick }) {
  const parts = text.split(/(\[(?:R|A|E)-\d+\])/)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(R|A|E)-(\d+)\]$/)
        if (m) {
          const id = `${m[1]}-${m[2]}`
          return (
            <span
              key={i}
              onClick={() => onCiteClick(id, m[1])}
              style={{ color: '#4FA89A', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#4FA89A40' }}
            >{part}</span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// Source chip row shown under an answer
function SourceChips({ sources, onCiteClick }) {
  if (!sources?.length) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
      {sources.map(s => (
        <button
          key={s.id}
          onClick={() => onCiteClick(s.id, s.id[0])}
          style={{
            padding: '3px 10px', borderRadius: 3, fontSize: 10, cursor: 'pointer',
            background: '#f0eeec', border: '1px solid #D8CEC3', fontFamily: FNT,
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <span style={{ color: paColor(s.processArea), fontWeight: 700 }}>{s.id}</span>
          <span style={{ color: '#8a8278' }}>{s.title.length > 40 ? s.title.slice(0, 40) + '…' : s.title}</span>
          {s.status && <Badge label={s.status} colorFn={statusColor} />}
        </button>
      ))}
    </div>
  )
}

export default function QueryView({ onNavigate, industry, plantId }) {
  const PLANT_ID = plantId || FALLBACK_PLANT_ID
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  // ── Item detail modal ────────────────────────────────────────────────────
  const [detailItem, setDetailItem] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [crossItem, setCrossItem] = useState(null)
  const [crossLoading, setCrossLoading] = useState(false)

  // ── Ask the Team modal ───────────────────────────────────────────────────
  const [askOpen, setAskOpen] = useState(false)
  const [askText, setAskText] = useState('')
  const [askSubmitting, setAskSubmitting] = useState(false)
  const [askDone, setAskDone] = useState(false)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text = input) {
    const q = text.trim()
    if (!q || loading) return
    setInput('')
    setError(null)
    setMessages(prev => [...prev, { role: 'user', text: q, time: new Date().toISOString() }])
    setLoading(true)

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const jwt = getStoredJwt()

      const resp = await fetch(`${supabaseUrl}/functions/v1/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': 'Bearer ' + (jwt || supabaseKey),
        },
        body: JSON.stringify({ question: q, plant_id: PLANT_ID, industry }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `Edge function error (${resp.status})`)

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.answer,
        query: q,
        sources: data.sources ?? [],
        retrieved: data.totalRetrieved ?? 0,
        time: new Date().toISOString(),
      }])
    } catch (err) {
      setError(err.message)
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `⚠ Could not connect to knowledge engine.\n\n${err.message}\n\nYou can still browse rules manually in the Rules tab.`,
        sources: [],
        time: new Date().toISOString(),
        isError: true,
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  async function openItem(id, typePrefix, setItem, setLoad) {
    if (typePrefix === 'E') { onNavigate?.('events'); return }
    const type = typePrefix === 'R' ? 'rule' : 'assertion'
    setLoad(true)
    setItem(null)
    const data = await fetchItemById(type, id)
    setItem(data)
    setLoad(false)
  }

  function handleCiteClick(id, typePrefix) {
    openItem(id, typePrefix, setDetailItem, setDetailLoading)
  }

  function handleCrossCiteClick(id, typePrefix) {
    openItem(id, typePrefix, setCrossItem, setCrossLoading)
  }

  function openAsk(query) {
    setAskText(query)
    setAskDone(false)
    setAskOpen(true)
  }

  async function handleAskSubmit() {
    if (!askText.trim() || askSubmitting) return
    setAskSubmitting(true)
    await addQuestion({
      question: askText.trim(),
      processArea: '',
      askedBy: getDisplayName(),
    })
    setAskSubmitting(false)
    setAskDone(true)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Message area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>

          {/* Empty state */}
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 60 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#1F1F1F', fontFamily: FNT, marginBottom: 6 }}>Query</div>
              <div style={{ fontSize: 13, color: '#8a8278', fontFamily: FNT, lineHeight: 1.7, marginBottom: 32, maxWidth: 480, margin: '0 auto 32px' }}>
                Describe what you're about to do. The system will brief you on everything the knowledge bank says about your situation.
              </div>

              {/* Quick prompts */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 40 }}>
                {QUICK_PROMPTS.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    style={{
                      padding: '10px 16px', borderRadius: 6, fontSize: 12,
                      background: '#FFFFFF', border: '1px solid #e8e4e0',
                      color: '#5a5550', cursor: 'pointer', fontFamily: FNT,
                      fontWeight: 500, lineHeight: 1.4, textAlign: 'left', maxWidth: 280,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#062044'
                      e.currentTarget.style.color = '#fff'
                      e.currentTarget.style.borderColor = '#062044'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = '#FFFFFF'
                      e.currentTarget.style.color = '#5a5550'
                      e.currentTarget.style.borderColor = '#e8e4e0'
                    }}
                  >{q}</button>
                ))}
              </div>

              <div style={{ fontSize: 11, color: '#D8CEC3', fontFamily: FNT }}>
                Answers strictly from the validated knowledge bank · Rule IDs are clickable
              </div>
            </div>
          )}

          {/* Message thread */}
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '85%',
                padding: '14px 18px',
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: msg.role === 'user' ? '#062044' : msg.isError ? '#fef9f0' : '#FFFFFF',
                color: msg.role === 'user' ? '#FFFFFF' : '#1F1F1F',
                border: msg.role === 'user' ? 'none' : `1px solid ${msg.isError ? '#F2652F40' : '#e8e4e0'}`,
                fontSize: 13,
                fontFamily: FNT,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.role === 'assistant' ? (
                  <>
                    <AnswerText text={msg.text} onCiteClick={handleCiteClick} />
                    {!msg.isError && (
                      <SourceChips sources={msg.sources} onCiteClick={handleCiteClick} />
                    )}
                  </>
                ) : msg.text}
              </div>

              {/* Timestamp + metadata */}
              <div style={{ fontSize: 9, color: '#D8CEC3', fontFamily: FNT, marginTop: 4, paddingLeft: 4, paddingRight: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                {msg.role === 'user' ? 'You' : 'MD1 Knowledge'} · {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {msg.role === 'assistant' && msg.retrieved > 0 && (
                  <span style={{ color: '#b0a898' }}>{msg.retrieved} items retrieved</span>
                )}
                {msg.role === 'assistant' && !loading && !msg.isError && (
                  <button
                    onClick={() => openAsk(msg.query || '')}
                    style={{ background: 'none', border: '1px solid #D8CEC3', borderRadius: 3, padding: '2px 8px', fontSize: 9, color: '#8a8278', cursor: 'pointer', fontFamily: FNT, fontWeight: 600 }}
                  >? Ask the Team</button>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div style={{ padding: '14px 18px', borderRadius: '12px 12px 12px 2px', background: '#FFFFFF', border: '1px solid #e8e4e0', fontSize: 13, fontFamily: FNT, color: '#b0a898', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[0, 0.2, 0.4].map(delay => (
                    <div key={delay} style={{ width: 6, height: 6, borderRadius: '50%', background: '#062044', animation: 'chatdot 1.2s infinite', animationDelay: `${delay}s` }} />
                  ))}
                </div>
                <span>Searching knowledge bank…</span>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>
      </div>

      {/* Input bar */}
      <div style={{ borderTop: '1px solid #e8e4e0', padding: '16px 28px', background: '#FFFFFF' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
            placeholder="e.g. What are the limits when running with non-standard materials?"
            style={{ ...iS, flex: 1, height: 44, fontSize: 13, padding: '0 14px', borderRadius: 8, border: '1.5px solid #D8CEC3', fontFamily: FNT }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              padding: '10px 20px', borderRadius: 8, fontSize: 13,
              background: input.trim() && !loading ? '#062044' : '#D8CEC3',
              border: 'none', color: '#FFFFFF',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              fontFamily: FNT, fontWeight: 700, letterSpacing: 0.5,
              flexShrink: 0, height: 44,
            }}
          >{loading ? '…' : 'Query'}</button>
        </div>
        <div style={{ maxWidth: 720, margin: '6px auto 0', fontSize: 9, color: '#D8CEC3', fontFamily: FNT }}>
          Answers strictly from the validated knowledge bank · Rule IDs are clickable
        </div>
      </div>

      <style>{`@keyframes chatdot { 0%,80%,100%{opacity:0.2;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }`}</style>

      {/* ── Item detail modal ── */}
      <Modal
        open={detailLoading || !!detailItem}
        onClose={() => { setDetailItem(null); setDetailLoading(false) }}
        title={detailItem ? detailItem.id : '…'}
        width={640}
      >
        {detailLoading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#b0a898', fontFamily: FNT, fontSize: 12 }}>Loading…</div>
        )}
        {detailItem && (
          <QueryItemDetail item={detailItem} onCiteClick={handleCrossCiteClick} />
        )}
      </Modal>

      {/* ── Stacked cross-item modal ── */}
      <Modal
        open={crossLoading || !!crossItem}
        onClose={() => { setCrossItem(null); setCrossLoading(false) }}
        title={crossItem ? crossItem.id : '…'}
        width={580}
      >
        {crossLoading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#b0a898', fontFamily: FNT, fontSize: 12 }}>Loading…</div>
        )}
        {crossItem && (
          <QueryItemDetail item={crossItem} onCiteClick={() => {}} />
        )}
      </Modal>

      {/* ── Ask the Team modal ── */}
      <Modal
        open={askOpen}
        onClose={() => { setAskOpen(false); setAskDone(false) }}
        title="Ask the Team"
        width={500}
      >
        {askDone ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#062044', fontFamily: FNT, marginBottom: 8 }}>
              Question posted to Open Questions
            </div>
            <div style={{ fontSize: 12, color: '#8a8278', fontFamily: FNT, lineHeight: 1.6, marginBottom: 24 }}>
              Your team will be able to see and answer it in the Questions tab.
            </div>
            <button
              onClick={() => { setAskOpen(false); setAskDone(false) }}
              style={{ padding: '10px 24px', borderRadius: 3, fontSize: 12, background: '#062044', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: FNT, fontWeight: 700 }}
            >Close</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: '#5a5550', fontFamily: FNT, lineHeight: 1.6, marginBottom: 16, padding: '8px 12px', background: '#f8f6f4', borderRadius: 3, borderLeft: '3px solid #4FA89A' }}>
              The knowledge bank couldn't fully answer this. Post it as an open question for your team.
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 10, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 6 }}>Question</label>
              <textarea
                value={askText}
                onChange={e => setAskText(e.target.value)}
                style={{ ...iS, width: '100%', height: 90, resize: 'vertical', lineHeight: 1.6, fontSize: 13, boxSizing: 'border-box' }}
                placeholder="What do you need the team to answer?"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setAskOpen(false)}
                style={{ padding: '10px 18px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid #D8CEC3', color: '#5a5550', cursor: 'pointer', fontFamily: FNT, fontWeight: 600 }}
              >Cancel</button>
              <button
                onClick={handleAskSubmit}
                disabled={askSubmitting || !askText.trim()}
                style={{
                  padding: '10px 20px', borderRadius: 3, fontSize: 12, fontWeight: 700,
                  background: (!askSubmitting && askText.trim()) ? '#062044' : '#f0eeec',
                  border: 'none',
                  color: (!askSubmitting && askText.trim()) ? '#fff' : '#8a8278',
                  cursor: (!askSubmitting && askText.trim()) ? 'pointer' : 'not-allowed',
                  fontFamily: FNT, letterSpacing: 0.4,
                }}
              >{askSubmitting ? 'Posting…' : 'Post Question →'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
