import { useState, useEffect } from 'react'
import { FNTM, iS } from '../lib/constants.js'
import { fetchItemComments, addComment } from '../lib/db.js'
import { getDisplayName } from '../lib/userContext.js'

export default function Comments({ targetType, targetId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')

  useEffect(() => {
    if (!targetId) return
    setLoading(true)
    fetchItemComments(targetType, targetId).then(data => {
      setItems(data)
      setLoading(false)
    })
  }, [targetType, targetId])

  async function handlePost() {
    if (!text.trim()) return
    const by = getDisplayName()
    const comment = { by, text, date: new Date().toISOString() }
    setItems(prev => [...prev, comment])
    setText('')
    await addComment(targetType, targetId, text, by)
  }

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #D8CEC3', paddingTop: 12 }}>
      <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontFamily: FNT }}>
        Comments ({loading ? '…' : items.length})
      </div>

      {!loading && items.map((c, i) => (
        <div key={i} style={{ padding: '8px 10px', background: '#fff', borderRadius: 3, marginBottom: 6, border: '1px solid #e8e4e0' }}>
          <div style={{ fontSize: 11, color: '#1F1F1F', lineHeight: 1.5 }}>{c.text}</div>
          <div style={{ fontSize: 9, color: '#b0a898', fontFamily: FNT, marginTop: 4 }}>
            — {c.by} · {new Date(c.date).toLocaleDateString()}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a comment..."
          style={{ ...iS, flex: 1, fontSize: 11, padding: '6px 10px' }}
          onKeyDown={e => { if (e.key === 'Enter' && text.trim()) handlePost() }}
        />
        <button
          onClick={handlePost}
          style={{ padding: '6px 12px', borderRadius: 3, fontSize: 10, background: '#062044', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, flexShrink: 0 }}
        >
          Post
        </button>
      </div>
    </div>
  )
}
