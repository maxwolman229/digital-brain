import { useState, useEffect } from 'react'
import { FNT, FNTM, statusColor } from '../lib/constants.js'
import { fetchProfileStats, fetchRecentActivity, updateProfileDisplayName } from '../lib/db.js'
import { getUserId } from '../lib/userContext.js'

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

const TYPE_LABELS = {
  rule: { label: 'Rule', color: '#062044', bg: '#e8f0fb' },
  assertion: { label: 'Assertion', color: '#4FA89A', bg: '#e6f4f2' },
  event: { label: 'Event', color: '#8a4a1a', bg: '#fdf0e6' },
  question: { label: 'Question', color: '#5a5550', bg: '#f4f1ed' },
}

function StatCard({ value, label, sub }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e8e4e0', borderRadius: 4,
      padding: '14px 18px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: '#062044', fontFamily: FNT, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1F1F1F', fontFamily: FNT, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: '#b0a898', fontFamily: FNT, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function loadLocalProfile(userId) {
  if (!userId) return {}
  try {
    const raw = localStorage.getItem(`md1_profile_extra_${userId}`)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveLocalProfile(userId, data) {
  if (!userId) return
  try { localStorage.setItem(`md1_profile_extra_${userId}`, JSON.stringify(data)) } catch {}
}

function EditProfileModal({ displayName, userId, onSave, onClose }) {
  const local = loadLocalProfile(userId)
  const [name, setName] = useState(displayName)
  const [position, setPosition] = useState(local.position || '')
  const [years, setYears] = useState(local.years || '')
  const [bio, setBio] = useState(local.bio || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await updateProfileDisplayName(userId, name.trim())
      saveLocalProfile(userId, { position: position.trim(), years: years.trim(), bio: bio.trim() })
      onSave({ displayName: name.trim(), position: position.trim(), years: years.trim(), bio: bio.trim() })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const iS = {
    width: '100%', padding: '9px 12px', fontSize: 13, fontFamily: FNT,
    border: '1px solid #D8CEC3', borderRadius: 3, outline: 'none', boxSizing: 'border-box',
    color: '#1F1F1F', background: '#fff',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: 440, maxWidth: '90vw', background: '#fff', borderRadius: 6, boxShadow: '0 16px 48px rgba(0,0,0,0.22)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', background: '#062044', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: FNT }}>Edit Profile</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>✕</button>
        </div>
        <form onSubmit={handleSave} style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Display Name *</div>
            <input value={name} onChange={e => setName(e.target.value)} required autoFocus style={iS} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Current Position</div>
            <input value={position} onChange={e => setPosition(e.target.value)} placeholder="e.g. Line Supervisor, Process Engineer" style={iS} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Years in Industry</div>
            <input value={years} onChange={e => setYears(e.target.value)} placeholder="e.g. 12" style={{ ...iS, width: 120 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: FNT, marginBottom: 5 }}>Bio</div>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} placeholder="A few words about your experience or focus area" style={{ ...iS, resize: 'vertical', lineHeight: 1.6 }} />
          </div>
          {error && (
            <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 3, fontSize: 11, color: '#c0392b', fontFamily: FNT }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer', fontFamily: FNT }}>Cancel</button>
            <button type="submit" disabled={saving || !name.trim()} style={{ padding: '8px 20px', borderRadius: 3, fontSize: 12, fontWeight: 700, background: '#062044', border: 'none', color: '#fff', cursor: saving ? 'default' : 'pointer', fontFamily: FNT }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProfileView({ user, plantId, memberships, onNavigate }) {
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [localDisplayName, setLocalDisplayName] = useState(null)
  const [localExtra, setLocalExtra] = useState(null)

  const userId = getUserId()
  const displayName = localDisplayName ?? user?.displayName ?? 'You'
  const extra = localExtra ?? loadLocalProfile(userId)
  const activeMembership = memberships?.find(m => m.plantId === plantId)

  useEffect(() => {
    if (!userId || !plantId) return
    setLoading(true)
    Promise.all([
      fetchProfileStats(userId, plantId),
      fetchRecentActivity(userId, plantId, 10),
    ]).then(([s, a]) => {
      setStats(s)
      setActivity(a)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [userId, plantId])

  const xp = stats ? xpFor(stats) : 0

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#f4f1ed', padding: 32 }}>
      <div style={{ maxWidth: 740, margin: '0 auto' }}>

        {/* ── Profile header card ── */}
        <div style={{
          background: '#062044', borderRadius: 6, padding: '28px 32px',
          display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 24,
        }}>
          {/* Avatar */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
            background: '#4FA89A', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, fontFamily: FNT,
          }}>
            {initials(displayName)}
          </div>

          {/* Name + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: FNT, lineHeight: 1 }}>
              {displayName}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {user?.role && (
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: FNT, textTransform: 'uppercase',
                  letterSpacing: 0.8, padding: '3px 8px', borderRadius: 2,
                  background: 'rgba(79,168,154,0.25)', color: '#7dd5cc',
                }}>
                  {user.role}
                </span>
              )}
              {activeMembership?.plantName && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: FNT }}>
                  {activeMembership.plantName}
                </span>
              )}
              {activeMembership?.orgName && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: FNT }}>
                  · {activeMembership.orgName}
                </span>
              )}
            </div>
          </div>

          {/* XP badge + Edit button */}
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#F2652F', fontFamily: FNT, lineHeight: 1 }}>
                {xp.toLocaleString()}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.45)', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 1 }}>
                XP
              </div>
            </div>
            <button
              onClick={() => setShowEdit(true)}
              style={{ padding: '5px 12px', borderRadius: 3, fontSize: 10, fontWeight: 700, fontFamily: FNT, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase' }}
            >
              Edit Profile
            </button>
          </div>
        </div>

        {/* Bio / extra info strip */}
        {(extra.position || extra.years || extra.bio) && (
          <div style={{ background: '#fff', border: '1px solid #e8e4e0', borderRadius: 4, padding: '14px 18px', marginBottom: 24 }}>
            {extra.position && (
              <div style={{ fontSize: 12, fontWeight: 600, color: '#062044', fontFamily: FNT, marginBottom: extra.years || extra.bio ? 4 : 0 }}>
                {extra.position}{extra.years ? <span style={{ fontWeight: 400, color: '#8a8278' }}> · {extra.years} yr{extra.years !== '1' ? 's' : ''} experience</span> : ''}
              </div>
            )}
            {!extra.position && extra.years && (
              <div style={{ fontSize: 12, color: '#8a8278', fontFamily: FNT, marginBottom: extra.bio ? 4 : 0 }}>{extra.years} year{extra.years !== '1' ? 's' : ''} in industry</div>
            )}
            {extra.bio && (
              <div style={{ fontSize: 12, color: '#5a5550', fontFamily: FNT, lineHeight: 1.6 }}>{extra.bio}</div>
            )}
          </div>
        )}

        {/* ── Stats grid ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#b0a898', fontFamily: FNT, fontSize: 12 }}>
            Loading...
          </div>
        ) : stats && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#8a8278', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
              CONTRIBUTIONS — {activeMembership?.plantName || 'This Plant'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 28 }}>
              <StatCard value={stats.rules} label="Rules Created" sub="10 XP each" />
              <StatCard value={stats.assertions} label="Assertions" sub="8 XP each" />
              <StatCard value={stats.events} label="Events Filed" sub="6 XP each" />
              <StatCard value={stats.questions} label="Questions Asked" sub="4 XP each" />
              <StatCard value={stats.verifications} label="Verifications" sub="5 XP each" />
              <StatCard value={stats.comments} label="Comments" sub="3 XP each" />
            </div>

            {/* ── Recent activity ── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#8a8278', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>
              RECENT ACTIVITY
            </div>
            <div style={{ background: '#fff', border: '1px solid #e8e4e0', borderRadius: 4, overflow: 'hidden' }}>
              {activity.length === 0 ? (
                <div style={{ padding: '20px 18px', textAlign: 'center', fontSize: 12, color: '#b0a898', fontFamily: FNT }}>
                  No activity yet on this plant
                </div>
              ) : activity.map((item, i) => {
                const t = TYPE_LABELS[item.type] || TYPE_LABELS.rule
                return (
                  <div
                    key={item.id + i}
                    onClick={() => onNavigate?.(item.type === 'question' ? 'questions' : item.type + 's')}
                    style={{
                      display: 'flex', gap: 12, padding: '10px 16px',
                      borderBottom: i < activity.length - 1 ? '1px solid #f0eeec' : 'none',
                      alignItems: 'flex-start', cursor: 'pointer',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8f6f4'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{
                      fontSize: 9, fontWeight: 700, fontFamily: FNT,
                      padding: '2px 6px', borderRadius: 2,
                      background: t.bg, color: t.color,
                      textTransform: 'uppercase', letterSpacing: 0.5,
                      flexShrink: 0, marginTop: 1,
                    }}>
                      {t.label}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#1F1F1F', fontFamily: FNT, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT }}>
                          {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                        {item.id && (
                          <span style={{ fontSize: 10, color: '#D8CEC3', fontFamily: FNTM }}>
                            {item.id}
                          </span>
                        )}
                        {item.status && (() => {
                          const sc = statusColor(item.status)
                          return (
                            <span style={{
                              fontSize: 9, fontWeight: 600, fontFamily: FNT,
                              padding: '1px 5px', borderRadius: 2,
                              background: sc.bg, color: sc.text,
                            }}>
                              {item.status}
                            </span>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Plant memberships ── */}
            {memberships?.length > 1 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8a8278', fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 28, marginBottom: 10 }}>
                  PLANT MEMBERSHIPS
                </div>
                <div style={{ background: '#fff', border: '1px solid #e8e4e0', borderRadius: 4, overflow: 'hidden' }}>
                  {memberships.map((m, i) => (
                    <div key={m.plantId} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 16px',
                      borderBottom: i < memberships.length - 1 ? '1px solid #f0eeec' : 'none',
                      background: m.plantId === plantId ? '#f0f4fb' : 'transparent',
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: m.plantId === plantId ? 700 : 500, color: '#062044', fontFamily: FNT }}>
                          {m.plantId === plantId ? '◆ ' : ''}{m.plantName}
                        </div>
                        <div style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT, marginTop: 1 }}>{m.orgName}</div>
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 700, fontFamily: FNT,
                        padding: '2px 7px', borderRadius: 2,
                        background: '#e8f0fb', color: '#062044',
                        textTransform: 'capitalize', letterSpacing: 0.5,
                      }}>
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {showEdit && (
        <EditProfileModal
          displayName={displayName}
          userId={userId}
          onSave={({ displayName: newName, position, years, bio }) => {
            setLocalDisplayName(newName)
            setLocalExtra({ position, years, bio })
            setShowEdit(false)
          }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  )
}
