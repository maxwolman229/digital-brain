import { useState, useEffect, useRef } from 'react'
import { FNT, iS } from '../lib/constants.js'
import { fetchItemComments, addComment, fetchPlantMembers } from '../lib/db.js'
import { getDisplayName } from '../lib/userContext.js'
import { MentionDropdown, MentionText } from './shared.jsx'
import { useMention } from '../lib/useMention.js'

export default function Comments({ targetType, targetId, onCommentPosted, onViewProfile }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [members, setMembers] = useState([])
  const inputRef = useRef(null)
  const mention = useMention(text, setText, inputRef, members)

  useEffect(() => {
    if (!targetId) return
    setLoading(true)
    fetchItemComments(targetType, targetId).then(data => {
      setItems(data)
      setLoading(false)
    })
  }, [targetType, targetId])

  useEffect(() => {
    fetchPlantMembers().then(setMembers).catch(() => {})
  }, [])

  async function handlePost() {
    if (!text.trim()) return
    const by = getDisplayName()
    const raw = text
    const comment = { by, text: raw, date: new Date().toISOString() }
    setItems(prev => [...prev, comment])
    setText('')
    onCommentPosted?.()
    await addComment(targetType, targetId, raw)
  }

  function handleKeyDown(e) {
    // Let the mention hook consume arrows/enter/tab/escape when dropdown is open
    mention.handleKeyDown(e)
    if (e.defaultPrevented) return
    // Only post on plain Enter (no shift, no modifier)
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && text.trim()) {
      e.preventDefault()
      handlePost()
    }
  }

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--md1-border)', paddingTop: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontFamily: FNT }}>
        Comments ({loading ? '…' : items.length})
      </div>

      {!loading && items.map((c, i) => (
        <div key={i} style={{ padding: '8px 10px', background: '#fff', borderRadius: 3, marginBottom: 6, border: '1px solid #e8e4e0' }}>
          <div style={{ fontSize: 11, color: 'var(--md1-text)', lineHeight: 1.5 }}>
            <MentionText
              text={c.text}
              onMentionClick={onViewProfile ? (m => onViewProfile(m.displayName)) : undefined}
            />
          </div>
          <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', fontFamily: FNT, marginTop: 4 }}>
            — {c.by} · {new Date(c.date).toLocaleDateString()}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            ref={inputRef}
            value={text}
            onChange={mention.handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment… (type @ to mention)"
            style={{ ...iS, width: '100%', boxSizing: 'border-box', fontSize: 11, padding: '6px 10px' }}
          />
          <MentionDropdown
            query={mention.query}
            members={mention.filtered}
            activeIndex={mention.activeIndex}
            onSelect={mention.insert}
          />
        </div>
        <button
          onClick={handlePost}
          style={{ padding: '6px 12px', borderRadius: 3, fontSize: 10, background: 'var(--md1-primary)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, flexShrink: 0 }}
        >
          Post
        </button>
      </div>
    </div>
  )
}
