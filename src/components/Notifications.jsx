import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { FNT } from '../lib/constants.js'

const SEED = [
  { text: 'R-003 was promoted to Verified status', date: '2025-02-20T10:00:00Z', read: false, target: { view: 'rules' } },
  { text: 'M. Rossi commented on R-003: "Also applies when using Turkish shredded"', date: '2025-02-14T14:30:00Z', read: false, target: { view: 'rules' } },
  { text: 'L. Chen verified R-001 from experience', date: '2025-02-12T09:00:00Z', read: false, target: { view: 'rules' } },
  { text: 'R-005 was promoted to Established status', date: '2025-02-18T11:00:00Z', read: true, target: { view: 'rules' } },
  { text: 'R-021 flagged as contradicting R-003 — review needed', date: '2025-02-22T08:00:00Z', read: false, target: { view: 'health' } },
]

const Notifications = forwardRef(function Notifications({ onNavigate, onOpen, light }, ref) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(SEED)
  const wrapRef = useRef(null)

  // Expose close() so parent can shut this when another panel opens
  useImperativeHandle(ref, () => ({
    close: () => setOpen(false),
  }))

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unread = items.filter(n => !n.read).length

  function toggle() {
    if (!open) onOpen?.()
    setOpen(p => !p)
  }

  function markRead(i) {
    setItems(p => p.map((x, j) => j === i ? { ...x, read: true } : x))
  }

  function markAllRead() {
    setItems(p => p.map(n => ({ ...n, read: true })))
  }

  function handleClick(n, i) {
    markRead(i)
    setOpen(false)
    if (n.target?.view) onNavigate?.(n.target.view)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={toggle}
        aria-label="Notifications"
        style={{
          padding: '7px 10px', borderRadius: 3, background: 'transparent',
          border: `1px solid ${light ? 'rgba(255,255,255,0.2)' : '#8a827840'}`, cursor: 'pointer',
          position: 'relative', display: 'flex', alignItems: 'center',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={light ? 'rgba(255,255,255,0.8)' : '#8a8278'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 16, height: 16, borderRadius: '50%',
            background: '#F2652F', color: '#fff',
            fontSize: 8, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 38, right: 0, width: 320,
          background: '#fff', border: '1px solid #e8e4e0', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 999,
          maxHeight: 400, overflow: 'auto',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #e8e4e0',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            position: 'sticky', top: 0, background: '#fff',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#062044', fontFamily: FNT }}>
              Notifications
              {unread > 0 && (
                <span style={{ marginLeft: 6, fontSize: 10, color: '#F2652F' }}>{unread} unread</span>
              )}
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{ fontSize: 9, color: '#8a8278', background: 'none', border: 'none', cursor: 'pointer', fontFamily: FNT }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification rows */}
          {items.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: '#b0a898', fontFamily: FNT }}>
              No notifications
            </div>
          ) : items.map((n, i) => (
            <div
              key={i}
              onClick={() => handleClick(n, i)}
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid #f0eeec',
                background: n.read ? 'transparent' : '#fef9f0',
                cursor: 'pointer',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8f6f4'}
              onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : '#fef9f0'}
            >
              {/* Unread indicator dot */}
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                background: n.read ? 'transparent' : '#F2652F',
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#1F1F1F', lineHeight: 1.4 }}>{n.text}</div>
                <div style={{ fontSize: 9, color: '#b0a898', fontFamily: FNT, marginTop: 3 }}>
                  {new Date(n.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {n.target?.view && (
                    <span style={{ marginLeft: 6, color: '#4FA89A', fontWeight: 600 }}>
                      → {n.target.view}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

export default Notifications
