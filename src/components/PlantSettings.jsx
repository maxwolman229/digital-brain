import { useState, useEffect, useRef } from 'react'
import { fetchPlantMembers, updateMemberRole, removeMember } from '../lib/auth.js'
import { getStoredJwt } from '../lib/supabase.js'
import { deletePlant } from '../lib/db.js'

const FNT  = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif"
const FNTM = "'IBM Plex Mono', 'Courier New', monospace"

const BEVCAN_PLANT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL

const ROLES = ['admin', 'contributor', 'viewer']

// ── Edge function helper ───────────────────────────────────────────────────────
async function callAdmin(action, params = {}) {
  const jwt = getStoredJwt()
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/bevcan-admin`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...params }),
  })
  const json = await resp.json()
  if (!resp.ok) throw new Error(json.error || 'Admin request failed')
  return json
}

// ── Small helpers ──────────────────────────────────────────────────────────────
const initials = name => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Tab button ─────────────────────────────────────────────────────────────────
function TabBtn({ id, active, onClick, children }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        padding: '10px 16px',
        background: 'none',
        border: 'none',
        borderBottom: `2px solid ${active ? '#4FA89A' : 'transparent'}`,
        color: active ? '#062044' : '#8a8278',
        fontSize: 11,
        fontWeight: active ? 700 : 500,
        letterSpacing: 1,
        textTransform: 'uppercase',
        cursor: 'pointer',
        fontFamily: FNT,
        marginBottom: -1,
        transition: 'color 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

// ── PENDING TAB ────────────────────────────────────────────────────────────────
function PendingTab({ onCountChange }) {
  const [apps, setApps]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [busy, setBusy]       = useState({}) // appId → 'approve'|'reject'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const { applications } = await callAdmin('list')
      const pending = (applications || []).filter(a => a.status === 'pending')
      setApps(pending)
      onCountChange?.(pending.length)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  async function approve(app) {
    if (!window.confirm(`Approve ${app.full_name || app.nickname}?`)) return
    setBusy(b => ({ ...b, [app.id]: 'approve' }))
    try {
      await callAdmin('approve', { application_id: app.id })
      setApps(prev => prev.filter(a => a.id !== app.id))
      onCountChange?.(c => Math.max(0, c - 1))
    } catch (err) {
      setError(err.message)
    }
    setBusy(b => { const n = { ...b }; delete n[app.id]; return n })
  }

  async function reject(app) {
    if (!window.confirm(`Reject ${app.full_name || app.nickname}?`)) return
    setBusy(b => ({ ...b, [app.id]: 'reject' }))
    try {
      await callAdmin('reject', { application_id: app.id })
      setApps(prev => prev.filter(a => a.id !== app.id))
      onCountChange?.(c => Math.max(0, c - 1))
    } catch (err) {
      setError(err.message)
    }
    setBusy(b => { const n = { ...b }; delete n[app.id]; return n })
  }

  if (loading) return <div style={{ padding: '20px 0', fontSize: 12, color: '#b0a898', fontFamily: FNT }}>Loading applications…</div>

  return (
    <div>
      {error && (
        <div style={{ padding: '8px 12px', marginBottom: 16, background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 3, fontSize: 12, color: '#e74c3c', fontFamily: FNT }}>
          {error}
        </div>
      )}

      {apps.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 13, color: '#b0a898', fontFamily: FNT }}>No pending applications</div>
        </div>
      ) : (
        apps.map(app => (
          <div key={app.id} style={{ padding: '14px 0', borderBottom: '1px solid #f0eeec' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#062044', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                {initials(app.full_name || app.nickname)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#062044' }}>
                  {app.full_name}
                  {app.nickname && app.nickname !== app.full_name && (
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#8a8278', marginLeft: 6 }}>"{app.nickname}"</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#5a5550', marginTop: 2, fontFamily: FNT }}>
                  {[app.current_position, app.current_company].filter(Boolean).join(' at ')}
                </div>
                {app.year_joined_industry && (
                  <div style={{ fontSize: 11, color: '#b0a898', fontFamily: FNT }}>
                    In industry since {app.year_joined_industry}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, marginTop: 4 }}>
                  Applied {fmtDate(app.applied_at)}
                  {app.email && <span> · {app.email}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, marginLeft: 48 }}>
              <button
                onClick={() => approve(app)}
                disabled={!!busy[app.id]}
                style={{
                  padding: '6px 14px', borderRadius: 3, fontSize: 11,
                  background: busy[app.id] === 'approve' ? '#3a8a7e' : '#4FA89A',
                  border: 'none', color: '#fff', cursor: busy[app.id] ? 'default' : 'pointer',
                  fontFamily: FNT, fontWeight: 700, letterSpacing: 0.4, transition: 'background 0.15s',
                }}
              >
                {busy[app.id] === 'approve' ? '…' : 'Approve'}
              </button>
              <button
                onClick={() => reject(app)}
                disabled={!!busy[app.id]}
                style={{
                  padding: '6px 14px', borderRadius: 3, fontSize: 11,
                  background: 'transparent', border: '1px solid #D8CEC3',
                  color: busy[app.id] === 'reject' ? '#b0a898' : '#8a8278',
                  cursor: busy[app.id] ? 'default' : 'pointer', fontFamily: FNT, fontWeight: 600,
                }}
              >
                {busy[app.id] === 'reject' ? '…' : 'Reject'}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── MEMBERS TAB ────────────────────────────────────────────────────────────────
function MembersTab({ plantId, isBevCan }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => { load() }, [plantId])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      if (isBevCan) {
        const { members: m } = await callAdmin('list_members')
        setMembers(m || [])
      } else {
        const m = await fetchPlantMembers(plantId)
        setMembers(m)
      }
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  async function handleRoleChange(membershipId, role) {
    try {
      if (isBevCan) {
        await callAdmin('change_role', { membership_id: membershipId, role })
      } else {
        await updateMemberRole(membershipId, role)
      }
      setMembers(prev => prev.map(m =>
        (m.membershipId || m.id) === membershipId ? { ...m, role } : m
      ))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemove(membershipId, name) {
    if (!window.confirm(`Remove ${name} from this plant?`)) return
    try {
      if (isBevCan) {
        await callAdmin('remove_member', { membership_id: membershipId })
      } else {
        await removeMember(membershipId)
      }
      setMembers(prev => prev.filter(m => (m.membershipId || m.id) !== membershipId))
    } catch (err) {
      setError(err.message)
    }
  }

  const roleColor = { admin: '#4FA89A', contributor: '#5a8cc0', viewer: '#8a8278' }

  if (loading) return <div style={{ padding: '20px 0', fontSize: 12, color: '#b0a898', fontFamily: FNT }}>Loading members…</div>

  return (
    <div>
      {error && (
        <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 3, fontSize: 12, color: '#e74c3c', fontFamily: FNT }}>
          {error}
        </div>
      )}
      <div style={{ fontSize: 11, color: '#b0a898', marginBottom: 12, fontFamily: FNT }}>
        {members.length} member{members.length !== 1 ? 's' : ''}
      </div>
      {members.length === 0 ? (
        <div style={{ fontSize: 12, color: '#b0a898', fontFamily: FNT }}>No members found.</div>
      ) : (
        members.map(m => {
          const mid  = m.membershipId || m.id
          const name = m.displayName || m.nickname || 'Unknown'
          const extra = isBevCan
            ? [m.currentPosition, m.currentCompany].filter(Boolean).join(' at ')
            : m.invitedBy ? `Invited by ${m.invitedBy}` : ''
          return (
            <div key={mid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f0eeec' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#062044', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {initials(name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#062044', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name}
                  {isBevCan && m.ruleCount > 0 && (
                    <span style={{ fontSize: 10, color: '#4FA89A', marginLeft: 8, fontWeight: 400 }}>
                      {m.ruleCount} rule{m.ruleCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {extra && <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT }}>{extra}</div>}
              </div>
              <select
                value={m.role}
                onChange={e => handleRoleChange(mid, e.target.value)}
                style={{
                  padding: '4px 8px', borderRadius: 3, fontSize: 11, fontFamily: FNT,
                  border: '1px solid #D8CEC3', background: '#f4f1ed',
                  color: roleColor[m.role] || '#1F1F1F', cursor: 'pointer', fontWeight: 700,
                }}
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button
                onClick={() => handleRemove(mid, name)}
                style={{ padding: '4px 8px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid #D8CEC3', color: '#b0a898', cursor: 'pointer', fontFamily: FNT, flexShrink: 0 }}
                title="Remove member"
              >
                ✕
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}

// ── INVITE TAB ─────────────────────────────────────────────────────────────────
function InviteTab({ inviteCode }) {
  const [copied, setCopied] = useState(false)

  function copyCode() {
    navigator.clipboard.writeText(inviteCode || '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!inviteCode) {
    return <div style={{ fontSize: 13, color: '#b0a898', fontFamily: FNT, padding: '12px 0' }}>No invite code set for this plant.</div>
  }

  return (
    <div>
      <div style={{ marginBottom: 8, fontSize: 11, color: '#8a8278', fontFamily: FNT }}>
        Share this code so team members can join the plant.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <div style={{
          flex: 1, padding: '14px 18px', background: '#f4f1ed',
          border: '1px solid #D8CEC3', borderRadius: 3,
          fontFamily: FNT, fontSize: 26, fontWeight: 700,
          letterSpacing: 8, color: '#062044',
        }}>
          {inviteCode}
        </div>
        <button
          onClick={copyCode}
          style={{
            padding: '14px 18px', borderRadius: 3, fontSize: 11,
            background: copied ? '#4FA89A' : '#062044', border: 'none',
            color: '#fff', cursor: 'pointer', fontFamily: FNT,
            fontWeight: 700, flexShrink: 0, transition: 'background 0.15s',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function PlantSettings({ membership, isSuperAdmin, onClose, onPendingCountChange, onDeleted }) {
  const isBevCan  = membership.plantId === BEVCAN_PLANT_ID
  const isAdmin   = membership.role === 'admin' || isSuperAdmin
  const showPending = isBevCan && isAdmin

  const [tab, setTab]               = useState(showPending ? 'pending' : 'members')
  const [pendingCount, setPending]  = useState(0)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting]     = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  function handleCountChange(val) {
    const next = typeof val === 'function' ? val(pendingCount) : val
    setPending(next)
    onPendingCountChange?.(next)
  }

  async function handleDeletePlant() {
    if (deleteConfirmText !== membership.plantName) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deletePlant(membership.plantId)
      onClose()
      onDeleted?.(membership.plantId)
    } catch (err) {
      setDeleteError(err.message)
      setDeleting(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: 540, maxWidth: '92vw', background: '#fff', borderRadius: 6, boxShadow: '0 16px 48px rgba(0,0,0,0.22)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: '#062044', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: FNT }}>{membership.plantName}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: FNT, marginTop: 2, textTransform: 'capitalize', letterSpacing: 0.4 }}>
              {membership.orgName ? `${membership.orgName} · ` : ''}{membership.role}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px', fontFamily: FNT }}>✕</button>
        </div>

        {/* Tabs */}
        {isAdmin && (
          <div style={{ display: 'flex', borderBottom: '1px solid #e8e4e0', paddingLeft: 20, paddingRight: 20, background: '#fff', flexShrink: 0 }}>
            {showPending && (
              <TabBtn id="pending" active={tab === 'pending'} onClick={setTab}>
                Pending {pendingCount > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, background: '#e74c3c', color: '#fff', borderRadius: 8, fontSize: 9, fontWeight: 700, marginLeft: 5, padding: '0 4px' }}>
                    {pendingCount}
                  </span>
                )}
              </TabBtn>
            )}
            <TabBtn id="members" active={tab === 'members'} onClick={setTab}>Members</TabBtn>
            <TabBtn id="invite"  active={tab === 'invite'}  onClick={setTab}>Invite</TabBtn>
          </div>
        )}

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {tab === 'pending' && (
            <PendingTab onCountChange={handleCountChange} />
          )}
          {tab === 'members' && (
            <MembersTab plantId={membership.plantId} isBevCan={isBevCan} />
          )}
          {tab === 'invite' && (
            <InviteTab inviteCode={membership.inviteCode} />
          )}

          {/* Non-admin view */}
          {!isAdmin && (
            <div>
              {membership.inviteCode && <InviteTab inviteCode={membership.inviteCode} />}
              <div style={{ fontSize: 13, color: '#5a5550', lineHeight: 1.7, marginTop: 20 }}>
                You are a <strong style={{ color: '#062044' }}>{membership.role}</strong> of this plant.
                Contact an admin to change your role.
              </div>
            </div>
          )}

          {/* Danger Zone — super admins only */}
          {isSuperAdmin && (
            <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #f0eeec' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#c0392b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontFamily: FNT }}>
                Danger Zone
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid #f5c6c6', borderRadius: 3, background: '#fffafa' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1F1F1F', fontFamily: FNT }}>Delete this plant</div>
                  <div style={{ fontSize: 11, color: '#8a8278', fontFamily: FNT, marginTop: 2 }}>Permanently deletes all rules, assertions, events, and questions.</div>
                </div>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  style={{ padding: '7px 14px', borderRadius: 3, fontSize: 11, fontWeight: 700, background: 'transparent', border: '1px solid #c0392b', color: '#c0392b', cursor: 'pointer', fontFamily: FNT, flexShrink: 0, marginLeft: 16 }}
                >
                  Delete Plant
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => e.target === e.currentTarget && !deleting && setShowDeleteModal(false)}
        >
          <div style={{ width: 440, maxWidth: '90vw', background: '#fff', borderRadius: 6, boxShadow: '0 16px 48px rgba(0,0,0,0.28)', padding: 28 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#c0392b', fontFamily: FNT, marginBottom: 10 }}>Delete "{membership.plantName}"?</div>
            <div style={{ fontSize: 12, color: '#5a5550', fontFamily: FNT, lineHeight: 1.7, marginBottom: 18 }}>
              This will permanently delete the plant and all its data — rules, assertions, events, questions, comments, and links. <strong>This cannot be undone.</strong>
            </div>
            <div style={{ fontSize: 11, color: '#8a8278', fontFamily: FNT, marginBottom: 6 }}>
              Type <strong style={{ color: '#1F1F1F' }}>{membership.plantName}</strong> to confirm:
            </div>
            <input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={membership.plantName}
              autoFocus
              style={{ width: '100%', padding: '9px 12px', fontSize: 13, fontFamily: FNT, border: '1px solid #D8CEC3', borderRadius: 3, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
            />
            {deleteError && (
              <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 3, fontSize: 11, color: '#c0392b', fontFamily: FNT }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); setDeleteError(null) }}
                disabled={deleting}
                style={{ padding: '8px 16px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer', fontFamily: FNT }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePlant}
                disabled={deleting || deleteConfirmText !== membership.plantName}
                style={{ padding: '8px 16px', borderRadius: 3, fontSize: 12, fontWeight: 700, background: deleteConfirmText === membership.plantName ? '#c0392b' : '#e8d8d8', border: 'none', color: '#fff', cursor: deleteConfirmText === membership.plantName ? 'pointer' : 'default', fontFamily: FNT, transition: 'background 0.15s' }}
              >
                {deleting ? 'Deleting…' : 'Delete Plant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
