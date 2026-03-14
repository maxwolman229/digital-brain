import { useState, useEffect } from 'react'
import { fetchPlantMembers, updateMemberRole, removeMember } from '../lib/auth.js'

const FNT = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif"
const FNTM = "'IBM Plex Mono', 'Courier New', monospace"

const ROLES = ['admin', 'contributor', 'viewer']

export default function PlantSettings({ membership, onClose }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)

  const isAdmin = membership.role === 'admin'

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return }
    fetchPlantMembers(membership.plantId)
      .then(m => { setMembers(m); setLoading(false) })
      .catch(() => setLoading(false))
  }, [membership.plantId, isAdmin])

  function copyCode() {
    navigator.clipboard.writeText(membership.inviteCode || '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function handleRoleChange(membershipId, role) {
    try {
      await updateMemberRole(membershipId, role)
      setMembers(prev => prev.map(m => m.membershipId === membershipId ? { ...m, role } : m))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemove(membershipId, displayName) {
    if (!window.confirm(`Remove ${displayName} from this plant?`)) return
    try {
      await removeMember(membershipId)
      setMembers(prev => prev.filter(m => m.membershipId !== membershipId))
    } catch (err) {
      setError(err.message)
    }
  }

  const roleColor = { admin: '#4FA89A', contributor: '#b0e0ff', viewer: '#8a8278' }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: 480, maxWidth: '90vw', background: '#fff', borderRadius: 6, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8e4e0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#062044' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{membership.plantName}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: FNT, marginTop: 2 }}>
              {membership.orgName} · {membership.role}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>✕</button>
        </div>

        <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>

          {/* Invite code */}
          {membership.inviteCode && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8, fontFamily: FNT }}>
                Invite Code
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  flex: 1, padding: '10px 14px', background: '#f4f1ed', border: '1px solid #D8CEC3', borderRadius: 3,
                  fontFamily: FNT, fontSize: 22, fontWeight: 700, letterSpacing: 6, color: '#062044',
                }}>
                  {membership.inviteCode}
                </div>
                <button
                  onClick={copyCode}
                  style={{
                    padding: '10px 14px', borderRadius: 3, fontSize: 11,
                    background: copied ? '#4FA89A' : '#062044', border: 'none',
                    color: '#fff', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, flexShrink: 0,
                    transition: 'background 0.15s',
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: '#b0a898', marginTop: 6, fontFamily: FNT }}>
                Share this code so team members can join the plant.
              </div>
            </div>
          )}

          {/* Member list (admins only) */}
          {isAdmin && (
            <div>
              <div style={{ fontSize: 10, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, fontFamily: FNT }}>
                Members {!loading && `(${members.length})`}
              </div>

              {error && (
                <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 3, fontSize: 12, color: '#e74c3c' }}>
                  {error}
                </div>
              )}

              {loading ? (
                <div style={{ fontSize: 12, color: '#b0a898', fontFamily: FNT, padding: '8px 0' }}>Loading…</div>
              ) : members.length === 0 ? (
                <div style={{ fontSize: 12, color: '#b0a898', fontFamily: FNT, padding: '8px 0' }}>No members found.</div>
              ) : (
                members.map(m => (
                  <div key={m.membershipId} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                    borderBottom: '1px solid #f0eeec',
                  }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#062044', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {m.displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#062044', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.displayName}</div>
                      {m.invitedBy && <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT }}>Invited by {m.invitedBy}</div>}
                    </div>
                    <select
                      value={m.role}
                      onChange={e => handleRoleChange(m.membershipId, e.target.value)}
                      style={{
                        padding: '4px 8px', borderRadius: 3, fontSize: 11, fontFamily: FNT,
                        border: '1px solid #D8CEC3', background: '#f4f1ed', color: roleColor[m.role] || '#1F1F1F',
                        cursor: 'pointer', fontWeight: 700,
                      }}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                      onClick={() => handleRemove(m.membershipId, m.displayName)}
                      style={{ padding: '4px 8px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid #D8CEC3', color: '#b0a898', cursor: 'pointer', fontFamily: FNT, flexShrink: 0 }}
                      title="Remove member"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Non-admin: just show membership info */}
          {!isAdmin && (
            <div style={{ fontSize: 13, color: '#5a5550', lineHeight: 1.7 }}>
              You are a <strong style={{ color: '#062044' }}>{membership.role}</strong> of this plant.
              Contact an admin to change your role or get the invite code.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
