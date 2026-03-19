import { useState, useEffect, useRef } from 'react'
import { FNT, FNTM, statusColor } from '../lib/constants.js'
import { fetchProfileStats, fetchRecentActivity, fetchUserIdByDisplayName } from '../lib/db.js'

const initials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

const xpFor = (stats) => (
  (stats.rules || 0) * 10 +
  (stats.assertions || 0) * 8 +
  (stats.events || 0) * 6 +
  (stats.questions || 0) * 4 +
  (stats.verifications || 0) * 5 +
  (stats.comments || 0) * 3
)

const STAT_ITEMS = [
  { key: 'rules', label: 'Rules' },
  { key: 'assertions', label: 'Assertions' },
  { key: 'events', label: 'Events' },
  { key: 'questions', label: 'Questions' },
  { key: 'verifications', label: 'Verifications' },
  { key: 'comments', label: 'Comments' },
]

const TYPE_LABELS = {
  rule: { label: 'Rule', color: '#062044', bg: '#e8f0fb' },
  assertion: { label: 'Assertion', color: '#4FA89A', bg: '#e6f4f2' },
  event: { label: 'Event', color: '#8a4a1a', bg: '#fdf0e6' },
  question: { label: 'Question', color: '#5a5550', bg: '#f4f1ed' },
}

export default function UserProfileModal({ displayName, plantId, onClose, onNavigate }) {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const backdropRef = useRef(null)

  useEffect(() => {
    if (!displayName || !plantId) { setLoading(false); return }
    setLoading(true)
    fetchUserIdByDisplayName(displayName, plantId).then(userId => {
      if (!userId) { setLoading(false); return }
      return Promise.all([
        fetchProfileStats(userId, plantId),
        fetchRecentActivity(userId, plantId, 6),
      ])
    }).then(result => {
      if (!result) return
      const [s, a] = result
      setStats(s)
      setActivity(a)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [displayName, plantId])

  function handleBackdrop(e) {
    if (e.target === backdropRef.current) onClose?.()
  }

  const xp = stats ? xpFor(stats) : 0

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 6, width: '100%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          background: '#062044', padding: '20px 24px',
          display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: '#4FA89A', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, fontFamily: FNT,
          }}>
            {initials(displayName)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: FNT }}>{displayName}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: FNT, marginTop: 2 }}>
              {xp > 0 ? `${xp.toLocaleString()} XP` : 'Plant member'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#b0a898', fontFamily: FNT, fontSize: 12 }}>
              Loading...
            </div>
          ) : stats && (
            <>
              {/* Stats row */}
              <div style={{ fontSize: 10, fontWeight: 700, color: '#8a8278', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
                Contributions
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 24 }}>
                {STAT_ITEMS.map(({ key, label }) => (
                  <div key={key} style={{
                    background: '#f8f6f4', border: '1px solid #e8e4e0', borderRadius: 4,
                    padding: '10px 12px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#062044', fontFamily: FNT, lineHeight: 1 }}>{stats[key] || 0}</div>
                    <div style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT, marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Recent activity */}
              {activity.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8a8278', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
                    Recent Activity
                  </div>
                  <div style={{ border: '1px solid #e8e4e0', borderRadius: 4, overflow: 'hidden' }}>
                    {activity.map((item, i) => {
                      const t = TYPE_LABELS[item.type] || TYPE_LABELS.rule
                      return (
                        <div
                          key={item.id + i}
                          onClick={() => { onNavigate?.(item.type === 'question' ? 'questions' : item.type + 's'); onClose?.() }}
                          style={{
                            display: 'flex', gap: 10, padding: '9px 14px',
                            borderBottom: i < activity.length - 1 ? '1px solid #f0eeec' : 'none',
                            cursor: 'pointer', alignItems: 'flex-start',
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8f6f4'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{
                            fontSize: 9, fontWeight: 700, fontFamily: FNT,
                            padding: '2px 5px', borderRadius: 2,
                            background: t.bg, color: t.color,
                            textTransform: 'uppercase', letterSpacing: 0.5,
                            flexShrink: 0, marginTop: 1,
                          }}>
                            {t.label}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: '#1F1F1F', fontFamily: FNT, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.title}
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                              <span style={{ fontSize: 9, color: '#b0a898', fontFamily: FNT }}>
                                {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                              {item.id && (
                                <span style={{ fontSize: 9, color: '#D8CEC3', fontFamily: FNTM }}>{item.id}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {stats.rules === 0 && stats.assertions === 0 && stats.events === 0 && stats.questions === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#b0a898', fontFamily: FNT, fontSize: 12 }}>
                  No contributions yet on this plant
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
