import { useState, useEffect } from 'react'
import {
  fetchPlantMembers, updateMemberRole, removeMember,
  sendPlantInvite, fetchPlantInvites, fetchOwnPendingInvites,
  approveInvite, rejectInvite,
} from '../lib/auth.js'
import { deletePlant, fetchPlantSettings, updatePlantSettings } from '../lib/db.js'

const FNT = 'var(--md1-font-sans)'

const ROLES = ['admin', 'contributor', 'viewer']
const INVITE_ROLES = ['contributor', 'viewer'] // admin promotion is a separate action
const roleColor = { admin: 'var(--md1-accent)', contributor: '#5a8cc0', viewer: 'var(--md1-muted)' }

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const statusBadge = {
  pending_approval: { bg: '#FFF3E0', color: '#E65100', label: 'Awaiting Approval' },
  approved:         { bg: '#E0F2F1', color: '#00695C', label: 'Approved · Email Sent' },
  rejected:         { bg: '#FFEBEE', color: '#C62828', label: 'Rejected' },
  accepted:         { bg: '#E8F5E9', color: '#2E7D32', label: 'Accepted' },
  expired:          { bg: '#ECEFF1', color: '#546E7A', label: 'Expired' },
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabBtn({ id, active, onClick, children }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        padding: '10px 16px', background: 'none', border: 'none',
        borderBottom: `2px solid ${active ? 'var(--md1-accent)' : 'transparent'}`,
        color: active ? 'var(--md1-primary)' : 'var(--md1-muted)', fontSize: 11,
        fontWeight: active ? 700 : 500, letterSpacing: 1,
        textTransform: 'uppercase', cursor: 'pointer', fontFamily: FNT,
        marginBottom: -1, transition: 'color 0.15s', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

// ── INVITE FORM ───────────────────────────────────────────────────────────────
// Visible to all members. Admins get auto-approved; non-admins get
// "pending admin approval" status.

function InviteForm({ plantId, isAdmin, onSent }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('contributor')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [ownPending, setOwnPending] = useState([])

  async function loadOwnPending() {
    if (isAdmin) return // admins see the full Pending tab instead
    const data = await fetchOwnPendingInvites(plantId).catch(() => [])
    setOwnPending(data)
  }

  useEffect(() => { loadOwnPending() }, [plantId, isAdmin])

  async function handleSend() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    setSending(true); setError(null); setSuccess(null)
    try {
      const result = await sendPlantInvite(plantId, trimmed, role)
      if (result.autoApproved) {
        setSuccess(result.emailSent
          ? `Invite email sent to ${trimmed}.`
          : `Invite created for ${trimmed}. Email delivery pending — recipient may not have received it.`)
      } else {
        setSuccess(`Invite sent for admin approval. ${trimmed} will receive an email once an admin approves.`)
      }
      setEmail('')
      onSent?.()
      loadOwnPending()
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(err.message)
    }
    setSending(false)
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, marginBottom: 8 }}>
        {isAdmin
          ? 'Invite someone by email. They\'ll get an email immediately to join.'
          : 'Invite someone by email. An admin will review before they get an email.'}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(null) }}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="colleague@company.com"
          style={{
            flex: 1, padding: '9px 12px', fontSize: 13, fontFamily: FNT,
            border: '1px solid var(--md1-border)', borderRadius: 3, outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          style={{
            padding: '9px 8px', fontSize: 12, fontFamily: FNT,
            border: '1px solid var(--md1-border)', borderRadius: 3, outline: 'none',
            background: '#fff', cursor: 'pointer',
          }}
        >
          {INVITE_ROLES.map(r => (
            <option key={r} value={r}>{r === 'contributor' ? 'Contributor' : 'Viewer'}</option>
          ))}
        </select>
        <button
          onClick={handleSend}
          disabled={sending}
          style={{
            padding: '9px 16px', borderRadius: 3, fontSize: 11, fontWeight: 700,
            background: 'var(--md1-primary)', border: 'none', color: '#fff',
            cursor: sending ? 'default' : 'pointer', fontFamily: FNT,
            opacity: sending ? 0.6 : 1, flexShrink: 0,
          }}
        >
          {sending ? 'Sending…' : 'Send Invite'}
        </button>
      </div>
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#e74c3c', fontFamily: FNT }}>{error}</div>
      )}
      {success && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--md1-accent)', fontFamily: FNT }}>{success}</div>
      )}

      {/* Non-admins: show their own pending invites awaiting approval */}
      {!isAdmin && ownPending.length > 0 && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: 3, fontSize: 11, fontFamily: FNT, color: '#5D4037' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Awaiting admin approval</div>
          {ownPending.map(inv => (
            <div key={inv.id} style={{ marginTop: 2 }}>
              · {inv.email} ({inv.role}) — sent {fmtDate(inv.invitedAt)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MEMBERS LIST (visible to all members) ─────────────────────────────────────

function MembersList({ plantId, isAdmin }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [plantId])

  async function load() {
    setLoading(true); setError(null)
    try {
      const m = await fetchPlantMembers(plantId)
      setMembers(m)
    } catch (err) { setError(err.message) }
    setLoading(false)
  }

  async function handleRoleChange(membershipId, role) {
    try {
      await updateMemberRole(membershipId, role)
      setMembers(prev => prev.map(m => m.membershipId === membershipId ? { ...m, role } : m))
    } catch (err) { setError(err.message) }
  }

  async function handleRemove(membershipId, name) {
    if (!window.confirm(`Remove ${name} from this plant?`)) return
    try {
      await removeMember(membershipId)
      setMembers(prev => prev.filter(m => m.membershipId !== membershipId))
    } catch (err) { setError(err.message) }
  }

  if (loading) return <div style={{ padding: '20px 0', fontSize: 12, color: 'var(--md1-muted-light)', fontFamily: FNT }}>Loading members…</div>

  return (
    <div>
      {error && (
        <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 3, fontSize: 12, color: '#e74c3c', fontFamily: FNT }}>
          {error}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--md1-muted-light)', marginBottom: 12, fontFamily: FNT }}>
        {members.length} member{members.length !== 1 ? 's' : ''}
      </div>
      {members.map(m => (
        <div key={m.membershipId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f0eeec' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--md1-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            {initials(m.displayName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--md1-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {m.displayName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNT }}>
              Joined {fmtDate(m.joinedAt)}
            </div>
          </div>
          {isAdmin ? (
            <>
              <select
                value={m.role}
                onChange={e => handleRoleChange(m.membershipId, e.target.value)}
                style={{
                  padding: '4px 8px', borderRadius: 3, fontSize: 11, fontFamily: FNT,
                  border: '1px solid var(--md1-border)', background: 'var(--md1-bg)',
                  color: roleColor[m.role] || 'var(--md1-text)', cursor: 'pointer', fontWeight: 700,
                }}
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button
                onClick={() => handleRemove(m.membershipId, m.displayName)}
                style={{ padding: '4px 8px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid var(--md1-border)', color: 'var(--md1-muted-light)', cursor: 'pointer', fontFamily: FNT, flexShrink: 0 }}
                title="Remove member"
              >
                ✕
              </button>
            </>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 700, color: roleColor[m.role] || 'var(--md1-muted)', fontFamily: FNT, textTransform: 'capitalize' }}>
              {m.role}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── KNOWLEDGE GOVERNANCE (admin only) ─────────────────────────────────────────

function GovernancePanel({ plantId }) {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchPlantSettings(plantId)
      .then(s => { if (!cancelled) { setEnabled(s.contradictionCheckEnabled); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [plantId])

  async function handleToggle() {
    const next = !enabled
    setEnabled(next); setError(null); setSaving(true)
    try {
      await updatePlantSettings(plantId, { contradictionCheckEnabled: next })
    } catch (e) {
      setError(e.message)
      setEnabled(!next) // revert
    }
    setSaving(false)
  }

  if (loading) return null

  return (
    <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #f0eeec' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontFamily: FNT }}>
        Knowledge Governance
      </div>
      <div style={{ padding: '12px 14px', border: '1px solid var(--md1-border)', borderRadius: 3, background: 'var(--md1-section-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--md1-text)', fontFamily: FNT }}>
              Auto-detect contradictions
            </div>
            <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, marginTop: 4, lineHeight: 1.5 }}>
              Before each new rule or assertion is saved, check it against existing knowledge and flag potential contradictions. Disable during initial bulk imports.
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={saving}
            style={{
              flexShrink: 0,
              width: 44, height: 24, borderRadius: 12,
              background: enabled ? 'var(--md1-accent)' : 'var(--md1-border)',
              border: 'none', cursor: saving ? 'default' : 'pointer',
              position: 'relative', transition: 'background 0.15s',
            }}
            aria-pressed={enabled}
            title={enabled ? 'Disable contradiction checks' : 'Enable contradiction checks'}
          >
            <span style={{
              position: 'absolute', top: 2, left: enabled ? 22 : 2,
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              transition: 'left 0.15s',
            }} />
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#c0392b', fontFamily: FNT }}>{error}</div>
        )}
      </div>
    </div>
  )
}

// ── PENDING INVITES (admin only) ──────────────────────────────────────────────

function PendingInvites({ plantId, onCountChange }) {
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState({})

  useEffect(() => { load() }, [plantId])

  async function load() {
    setLoading(true); setError(null)
    try {
      const all = await fetchPlantInvites(plantId)
      setInvites(all)
      onCountChange?.(all.filter(i => i.status === 'pending_approval').length)
    } catch (err) { setError(err.message) }
    setLoading(false)
  }

  async function handleApprove(inv) {
    setBusy(b => ({ ...b, [inv.id]: 'approve' }))
    try {
      const result = await approveInvite(inv.id)
      setInvites(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'approved' } : i))
      const remaining = invites.filter(i => i.status === 'pending_approval' && i.id !== inv.id).length
      onCountChange?.(remaining)
      if (!result.emailSent) {
        setError(`Approved, but email delivery may have failed. ${inv.email} should still see the invite in their inbox shortly — if not, ask them to log in directly.`)
        setTimeout(() => setError(null), 6000)
      }
    } catch (err) { setError(err.message) }
    setBusy(b => { const n = { ...b }; delete n[inv.id]; return n })
  }

  async function handleReject(inv) {
    if (!window.confirm(`Reject invite for ${inv.email}?`)) return
    setBusy(b => ({ ...b, [inv.id]: 'reject' }))
    try {
      await rejectInvite(inv.id)
      setInvites(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'rejected' } : i))
      const remaining = invites.filter(i => i.status === 'pending_approval' && i.id !== inv.id).length
      onCountChange?.(remaining)
    } catch (err) { setError(err.message) }
    setBusy(b => { const n = { ...b }; delete n[inv.id]; return n })
  }

  if (loading) return <div style={{ padding: '20px 0', fontSize: 12, color: 'var(--md1-muted-light)', fontFamily: FNT }}>Loading invites…</div>

  const pending = invites.filter(i => i.status === 'pending_approval')
  const history = invites.filter(i => i.status !== 'pending_approval')

  return (
    <div>
      {error && (
        <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 3, fontSize: 12, color: '#e74c3c', fontFamily: FNT }}>
          {error}
        </div>
      )}

      {/* Pending */}
      {pending.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--md1-muted-light)', fontFamily: FNT }}>No pending invites</div>
        </div>
      ) : (
        pending.map(inv => (
          <div key={inv.id} style={{ padding: '12px 0', borderBottom: '1px solid #f0eeec' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--md1-primary)', fontFamily: FNT }}>{inv.email}</div>
                <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNT, marginTop: 2 }}>
                  Invited by {inv.invitedByName} as {inv.role} · {fmtDate(inv.invitedAt)}
                </div>
              </div>
              <button
                onClick={() => handleApprove(inv)}
                disabled={!!busy[inv.id]}
                style={{
                  padding: '6px 14px', borderRadius: 3, fontSize: 11, fontWeight: 700,
                  background: busy[inv.id] === 'approve' ? '#3a8a7e' : 'var(--md1-accent)',
                  border: 'none', color: '#fff',
                  cursor: busy[inv.id] ? 'default' : 'pointer', fontFamily: FNT,
                }}
              >
                {busy[inv.id] === 'approve' ? 'Approving…' : 'Approve'}
              </button>
              <button
                onClick={() => handleReject(inv)}
                disabled={!!busy[inv.id]}
                style={{
                  padding: '6px 14px', borderRadius: 3, fontSize: 11, fontWeight: 600,
                  background: 'transparent', border: '1px solid var(--md1-border)',
                  color: busy[inv.id] === 'reject' ? 'var(--md1-muted-light)' : 'var(--md1-muted)',
                  cursor: busy[inv.id] ? 'default' : 'pointer', fontFamily: FNT,
                }}
              >
                {busy[inv.id] === 'reject' ? '…' : 'Reject'}
              </button>
            </div>
          </div>
        ))
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', textTransform: 'uppercase', letterSpacing: 1.5, fontFamily: FNT, marginBottom: 8 }}>
            Invite History
          </div>
          {history.map(inv => {
            const badge = statusBadge[inv.status] || statusBadge.pending_approval
            return (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f8f6f4' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#5a5550', fontFamily: FNT }}>{inv.email}</div>
                  <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNT }}>
                    {inv.role} · {fmtDate(inv.invitedAt)}
                  </div>
                </div>
                <span style={{
                  padding: '3px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                  background: badge.bg, color: badge.color, fontFamily: FNT,
                }}>
                  {badge.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function PlantSettings({ membership, onClose, onPendingCountChange, onDeleted }) {
  const isAdmin = membership.role === 'admin'

  const [tab, setTab] = useState('members')
  const [pendingCount, setPending] = useState(0)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [inviteRefresh, setInviteRefresh] = useState(0)

  function handleCountChange(val) {
    const next = typeof val === 'function' ? val(pendingCount) : val
    setPending(next)
    onPendingCountChange?.(next)
  }

  async function handleDeletePlant() {
    if (deleteConfirmText !== membership.plantName) return
    setDeleting(true); setDeleteError(null)
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
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'var(--md1-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: FNT }}>{membership.plantName}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: FNT, marginTop: 2, letterSpacing: 0.4 }}>
              {membership.orgName ? `${membership.orgName} · ` : ''}{membership.industry ? `${membership.industry} · ` : ''}{membership.role}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px', fontFamily: FNT }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e8e4e0', paddingLeft: 20, paddingRight: 20, background: '#fff', flexShrink: 0 }}>
          <TabBtn id="members" active={tab === 'members'} onClick={setTab}>Members</TabBtn>
          {isAdmin && (
            <TabBtn id="pending" active={tab === 'pending'} onClick={setTab}>
              Pending Invites {pendingCount > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, background: '#e74c3c', color: '#fff', borderRadius: 8, fontSize: 9, fontWeight: 700, marginLeft: 5, padding: '0 4px' }}>
                  {pendingCount}
                </span>
              )}
            </TabBtn>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>

          {tab === 'members' && (
            <div>
              <InviteForm
                plantId={membership.plantId}
                isAdmin={isAdmin}
                onSent={() => setInviteRefresh(r => r + 1)}
              />
              <MembersList plantId={membership.plantId} isAdmin={isAdmin} />
            </div>
          )}

          {tab === 'pending' && isAdmin && (
            <PendingInvites
              key={inviteRefresh}
              plantId={membership.plantId}
              onCountChange={handleCountChange}
            />
          )}

          {/* Knowledge Governance — admins only */}
          {isAdmin && <GovernancePanel plantId={membership.plantId} />}

          {/* Danger Zone — admins only */}
          {isAdmin && (
            <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #f0eeec' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#c0392b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontFamily: FNT }}>
                Danger Zone
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid #f5c6c6', borderRadius: 3, background: '#fffafa' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--md1-text)', fontFamily: FNT }}>Delete this plant</div>
                  <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, marginTop: 2 }}>Permanently deletes all rules, assertions, events, and questions.</div>
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
            <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, marginBottom: 6 }}>
              Type <strong style={{ color: 'var(--md1-text)' }}>{membership.plantName}</strong> to confirm:
            </div>
            <input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={membership.plantName}
              autoFocus
              style={{ width: '100%', padding: '9px 12px', fontSize: 13, fontFamily: FNT, border: '1px solid var(--md1-border)', borderRadius: 3, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
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
                style={{ padding: '8px 16px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid var(--md1-border)', color: 'var(--md1-muted)', cursor: 'pointer', fontFamily: FNT }}
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
