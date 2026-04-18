import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStoredJwt } from '../lib/supabase.js'

const FNT = 'var(--md1-font-sans)'
const FNTM = 'var(--md1-font-mono)'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function callAdmin(action, extraFields = {}) {
  const jwt = getStoredJwt()
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/bevcan-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + (jwt || SUPABASE_KEY),
    },
    body: JSON.stringify({ action, ...extraFields }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
  return data
}

const STATUS_COLORS = {
  pending:  { bg: '#fef3e2', text: '#e67e22' },
  approved: { bg: '#e6f5f1', text: 'var(--md1-accent-deep)' },
  rejected: { bg: '#fde8e5', text: '#c0392b' },
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || { bg: '#f0eeec', text: '#888' }
  return (
    <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700, fontFamily: FNT, background: c.bg, color: c.text, textTransform: 'uppercase', letterSpacing: 0.8 }}>
      {status}
    </span>
  )
}

function RoleBadge({ role }) {
  const colors = {
    admin: { bg: '#e8edf4', text: '#4a6785' },
    contributor: { bg: '#e6f5f1', text: 'var(--md1-accent-deep)' },
    viewer: { bg: '#f0eeec', text: 'var(--md1-muted)' },
  }
  const c = colors[role] || colors.viewer
  return (
    <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700, fontFamily: FNT, background: c.bg, color: c.text, textTransform: 'uppercase', letterSpacing: 0.8 }}>
      {role}
    </span>
  )
}

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '12px 18px', borderRadius: 4, fontSize: 13, fontFamily: FNT,
      background: toast.isErr ? '#c0392b' : 'var(--md1-accent)', color: '#fff',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    }}>
      {toast.msg}
    </div>
  )
}

// ── Pending Applications Tab ───────────────────────────────────────────────────

function ApplicationCard({ app, onApprove, onReject, acting }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ border: '1px solid #e8e4e0', borderRadius: 4, marginBottom: 10, background: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--md1-primary)' }}>{app.full_name}</div>
            <StatusBadge status={app.status} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--md1-muted)' }}>
            {app.nickname} · {app.current_position}
            {app.current_company && ` · ${app.current_company}`}
            {app.year_joined_industry && ` · Since ${app.year_joined_industry}`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', marginTop: 2, fontFamily: FNTM }}>
            {app.email} · Applied {new Date(app.applied_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setExpanded(p => !p)}
            style={{ padding: '5px 10px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid var(--md1-border)', color: 'var(--md1-muted)', cursor: 'pointer', fontFamily: FNT }}
          >
            {expanded ? 'Less ↑' : 'Details ↓'}
          </button>
          {app.status === 'pending' && (
            <>
              <button
                onClick={() => onReject(app.id)}
                disabled={acting}
                style={{ padding: '5px 12px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid rgba(192,57,43,0.4)', color: '#c0392b', cursor: acting ? 'default' : 'pointer', fontFamily: FNT, fontWeight: 600, opacity: acting ? 0.5 : 1 }}
              >
                Reject
              </button>
              <button
                onClick={() => onApprove(app.id)}
                disabled={acting}
                style={{ padding: '5px 16px', borderRadius: 3, fontSize: 11, background: 'var(--md1-accent)', border: 'none', color: '#fff', cursor: acting ? 'default' : 'pointer', fontFamily: FNT, fontWeight: 700, opacity: acting ? 0.5 : 1 }}
              >
                Approve ✓
              </button>
            </>
          )}
          {app.status !== 'pending' && (
            <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNTM }}>
              {app.reviewed_by && `Reviewed by ${app.reviewed_by}`}
            </div>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 18px 16px', borderTop: '1px solid #f0eeec' }}>
          {app.bio && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4, fontFamily: FNT }}>Bio</div>
              <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.6 }}>{app.bio}</div>
            </div>
          )}
          {app.past_positions?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4, fontFamily: FNT }}>Past Positions</div>
              <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
                {app.past_positions.map((p, i) => (
                  <li key={i} style={{ fontSize: 12, color: '#5a5550', marginBottom: 2 }}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
            <div>
              <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 3, fontFamily: FNT }}>Industry confirmed</div>
              <div style={{ fontSize: 12, color: app.confirmed_industry ? 'var(--md1-accent)' : '#c0392b' }}>{app.confirmed_industry ? 'Yes ✓' : 'No ✗'}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 3, fontFamily: FNT }}>User ID</div>
              <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNTM }}>{app.user_id}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PendingTab({ apps, onApprove, onReject, acting, onReload }) {
  const pending = apps.filter(a => a.status === 'pending')
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--md1-muted)' }}>{pending.length} application{pending.length !== 1 ? 's' : ''} awaiting review</div>
        <button onClick={onReload} style={{ padding: '5px 12px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid var(--md1-border)', color: 'var(--md1-muted)', cursor: 'pointer', fontFamily: FNT }}>↻ Refresh</button>
      </div>
      {pending.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--md1-muted-light)', fontSize: 13 }}>No pending applications.</div>
      ) : (
        pending.map(app => (
          <ApplicationCard key={app.id} app={app} onApprove={onApprove} onReject={onReject} acting={acting} />
        ))
      )}
    </div>
  )
}

// ── Members Tab ────────────────────────────────────────────────────────────────

function MembersTab({ showToast }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null) // membershipId being acted on

  async function load() {
    setLoading(true)
    try {
      const { members: m } = await callAdmin('list_members')
      setMembers(m)
    } catch (err) {
      showToast(err.message, true)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleRoleChange(membershipId, newRole) {
    setActing(membershipId)
    try {
      await callAdmin('change_role', { membership_id: membershipId, role: newRole })
      setMembers(prev => prev.map(m => m.membershipId === membershipId ? { ...m, role: newRole } : m))
      showToast(`Role updated to ${newRole}.`)
    } catch (err) {
      showToast(err.message, true)
    }
    setActing(null)
  }

  async function handleRemove(membershipId, displayName) {
    if (!confirm(`Remove ${displayName} from BevCan 1.0? This will revoke their access.`)) return
    setActing(membershipId)
    try {
      await callAdmin('remove_member', { membership_id: membershipId })
      setMembers(prev => prev.filter(m => m.membershipId !== membershipId))
      showToast('Member removed.')
    } catch (err) {
      showToast(err.message, true)
    }
    setActing(null)
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--md1-muted-light)', fontSize: 13 }}>Loading members…</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--md1-muted)' }}>{members.length} active member{members.length !== 1 ? 's' : ''}</div>
        <button onClick={load} style={{ padding: '5px 12px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid var(--md1-border)', color: 'var(--md1-muted)', cursor: 'pointer', fontFamily: FNT }}>↻ Refresh</button>
      </div>
      {members.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--md1-muted-light)', fontSize: 13 }}>No approved members yet.</div>
      ) : (
        <div style={{ border: '1px solid #e8e4e0', borderRadius: 4, overflow: 'hidden' }}>
          {members.map((m, i) => (
            <div key={m.membershipId} style={{
              padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12,
              background: '#fff', borderBottom: i < members.length - 1 ? '1px solid #f0eeec' : 'none',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--md1-primary)' }}>{m.nickname || m.displayName}</div>
                  <RoleBadge role={m.role} />
                  {m.ruleCount > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--md1-accent)', fontFamily: FNTM }}>{m.ruleCount} rule{m.ruleCount !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--md1-muted)' }}>
                  {m.currentPosition}{m.currentCompany && ` · ${m.currentCompany}`}{m.yearJoined && ` · Since ${m.yearJoined}`}
                </div>
                <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNTM, marginTop: 1 }}>
                  {m.email} · Joined {new Date(m.joinedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <select
                  value={m.role}
                  onChange={e => handleRoleChange(m.membershipId, e.target.value)}
                  disabled={acting === m.membershipId}
                  style={{
                    padding: '4px 8px', borderRadius: 3, fontSize: 11, fontFamily: FNT,
                    border: '1px solid var(--md1-border)', background: '#fff', color: '#5a5550',
                    cursor: 'pointer', appearance: 'none',
                  }}
                >
                  <option value="viewer">Viewer</option>
                  <option value="contributor">Contributor</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={() => handleRemove(m.membershipId, m.nickname || m.displayName)}
                  disabled={acting === m.membershipId}
                  style={{
                    padding: '4px 10px', borderRadius: 3, fontSize: 11, fontFamily: FNT,
                    background: 'transparent', border: '1px solid rgba(192,57,43,0.3)',
                    color: '#c0392b', cursor: acting === m.membershipId ? 'default' : 'pointer',
                    opacity: acting === m.membershipId ? 0.5 : 1,
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Rejected Tab ───────────────────────────────────────────────────────────────

function RejectedTab({ apps, onReapprove, acting }) {
  const rejected = apps.filter(a => a.status === 'rejected')
  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--md1-muted)' }}>{rejected.length} rejected application{rejected.length !== 1 ? 's' : ''}</div>
      {rejected.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--md1-muted-light)', fontSize: 13 }}>No rejected applications.</div>
      ) : (
        rejected.map(app => (
          <div key={app.id} style={{ border: '1px solid #e8e4e0', borderRadius: 4, marginBottom: 10, background: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--md1-primary)' }}>{app.full_name}</div>
                <StatusBadge status={app.status} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--md1-muted)' }}>
                {app.nickname} · {app.current_position}
                {app.current_company && ` · ${app.current_company}`}
              </div>
              <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', marginTop: 2, fontFamily: FNTM }}>
                {app.email}
                {app.reviewed_by && ` · Rejected by ${app.reviewed_by}`}
                {app.reviewed_at && ` on ${new Date(app.reviewed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
              </div>
            </div>
            <button
              onClick={() => onReapprove(app.id)}
              disabled={acting}
              style={{
                padding: '5px 14px', borderRadius: 3, fontSize: 11, fontFamily: FNT, fontWeight: 700,
                background: 'var(--md1-accent)', border: 'none', color: '#fff',
                cursor: acting ? 'default' : 'pointer', opacity: acting ? 0.5 : 1,
              }}
            >
              Approve ✓
            </button>
          </div>
        ))
      )}
    </div>
  )
}

// ── Stats Tab ──────────────────────────────────────────────────────────────────

function StatsTab() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    callAdmin('get_stats')
      .then(({ stats: s }) => { setStats(s); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--md1-muted-light)', fontSize: 13 }}>Loading stats…</div>
  if (error) return <div style={{ padding: 16, background: '#fde8e5', borderRadius: 4, color: '#c0392b', fontSize: 13 }}>{error}</div>
  if (!stats) return null

  const statCards = [
    { label: 'Members', value: stats.members, icon: '◈' },
    { label: 'Rules', value: stats.rules, icon: '◆' },
    { label: 'Assertions', value: stats.assertions, icon: '◇' },
    { label: 'Events', value: stats.events, icon: '●' },
    { label: 'Questions', value: stats.questions, icon: '?' },
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 }}>
        {statCards.map(({ label, value, icon }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #e8e4e0', borderRadius: 4, padding: '20px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--md1-muted-light)', marginBottom: 4 }}>{icon}</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--md1-primary)', marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--md1-muted)' }}>{label}</div>
          </div>
        ))}
      </div>

      {stats.topContributors.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e8e4e0', borderRadius: 4, padding: '18px 20px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--md1-primary)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>Top Contributors</div>
          {stats.topContributors.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--md1-muted-light)', width: 16, textAlign: 'right', fontFamily: FNTM }}>{i + 1}</div>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--md1-primary)' }}>{c.name}</div>
              <div style={{ fontSize: 12, color: 'var(--md1-accent)', fontFamily: FNTM }}>{c.count} rule{c.count !== 1 ? 's' : ''}</div>
              <div style={{ width: 80, height: 4, borderRadius: 2, background: '#f0eeec', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, background: 'var(--md1-accent)', width: `${Math.min(100, (c.count / (stats.topContributors[0]?.count || 1)) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── All Plants Tab ─────────────────────────────────────────────────────────────

function AllPlantsTab() {
  const [plants, setPlants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    callAdmin('list_all_plants')
      .then(({ plants: p }) => { setPlants(p); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--md1-muted-light)', fontSize: 13 }}>Loading plants…</div>
  if (error) return <div style={{ padding: 16, background: '#fde8e5', borderRadius: 4, color: '#c0392b', fontSize: 13 }}>{error}</div>

  return (
    <div>
      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--md1-muted)' }}>{plants.length} plant{plants.length !== 1 ? 's' : ''} across the system</div>
      <div style={{ border: '1px solid #e8e4e0', borderRadius: 4, overflow: 'hidden' }}>
        {plants.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--md1-muted-light)', fontSize: 13 }}>No plants found.</div>
        ) : (
          plants.map((p, i) => (
            <div key={p.plantId} style={{
              padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16,
              background: '#fff', borderBottom: i < plants.length - 1 ? '1px solid #f0eeec' : 'none',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--md1-primary)', marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--md1-muted)' }}>
                  {p.orgName && `${p.orgName} · `}{p.industry || 'No industry set'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--md1-muted-light)', fontFamily: FNTM, marginTop: 2 }}>
                  {p.plantId}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, flexShrink: 0, textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--md1-primary)' }}>{p.memberCount}</div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--md1-muted-light)' }}>Members</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--md1-primary)' }}>{p.ruleCount}</div>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--md1-muted-light)' }}>Rules</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'pending',  label: 'Pending',       count: true },
  { id: 'members',  label: 'Members',       count: false },
  { id: 'rejected', label: 'Rejected',      count: true },
  { id: 'stats',    label: 'Plant Stats',   count: false },
  { id: 'plants',   label: 'All Plants',    count: false },
]

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [acting, setActing] = useState(false)
  const [activeTab, setActiveTab] = useState('pending')
  const [toast, setToast] = useState(null)

  async function loadApps() {
    setLoading(true)
    setError(null)
    try {
      const { applications } = await callAdmin('list')
      setApps(applications)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  useEffect(() => { loadApps() }, [])

  function showToast(msg, isErr = false) {
    setToast({ msg, isErr })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleApprove(id) {
    setActing(true)
    try {
      await callAdmin('approve', { application_id: id })
      setApps(prev => prev.map(a => a.id === id ? { ...a, status: 'approved' } : a))
      showToast('Approved — membership created.')
    } catch (err) {
      showToast(err.message, true)
    }
    setActing(false)
  }

  async function handleReject(id) {
    setActing(true)
    try {
      await callAdmin('reject', { application_id: id })
      setApps(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' } : a))
      showToast('Application rejected.')
    } catch (err) {
      showToast(err.message, true)
    }
    setActing(false)
  }

  async function handleReapprove(id) {
    setActing(true)
    try {
      await callAdmin('reapprove', { application_id: id })
      setApps(prev => prev.map(a => a.id === id ? { ...a, status: 'approved' } : a))
      showToast('Re-approved — membership created.')
    } catch (err) {
      showToast(err.message, true)
    }
    setActing(false)
  }

  const counts = {
    pending: apps.filter(a => a.status === 'pending').length,
    approved: apps.filter(a => a.status === 'approved').length,
    rejected: apps.filter(a => a.status === 'rejected').length,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--md1-bg)', fontFamily: FNT }}>

      {/* Header */}
      <div style={{ background: 'var(--md1-primary)', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', letterSpacing: 3, border: '1.5px solid rgba(255,255,255,0.85)', padding: '3px 9px 4px', lineHeight: 1 }}>
          M/D/1
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Admin — BevCan 1.0
        </div>
        {counts.pending > 0 && (
          <div style={{ padding: '2px 8px', borderRadius: 10, background: '#e67e22', color: '#fff', fontSize: 11, fontWeight: 700 }}>
            {counts.pending} pending
          </div>
        )}
        <div style={{ flex: 1 }} />
        <a href="/app" style={{ padding: '5px 12px', borderRadius: 3, fontSize: 11, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontFamily: FNT }}>
          ← App
        </a>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 24px' }}>

        {/* Summary stats row */}
        {!loading && !error && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Pending', value: counts.pending, tab: 'pending', accent: '#e67e22' },
              { label: 'Approved', value: counts.approved, tab: 'members', accent: 'var(--md1-accent)' },
              { label: 'Rejected', value: counts.rejected, tab: 'rejected', accent: '#c0392b' },
            ].map(({ label, value, tab, accent }) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: '16px', borderRadius: 4, cursor: 'pointer', fontFamily: FNT, textAlign: 'left',
                  background: activeTab === tab ? 'var(--md1-primary)' : '#fff',
                  border: activeTab === tab ? `1px solid var(--md1-primary)` : '1px solid #e8e4e0',
                  color: activeTab === tab ? '#fff' : 'var(--md1-primary)',
                }}
              >
                <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 2, color: activeTab === tab ? '#fff' : accent }}>{value}</div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, opacity: 0.6 }}>{label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e8e4e0', marginBottom: 20 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: FNT, fontSize: 12, fontWeight: activeTab === t.id ? 700 : 400,
                color: activeTab === t.id ? 'var(--md1-primary)' : 'var(--md1-muted)',
                borderBottom: `2px solid ${activeTab === t.id ? 'var(--md1-primary)' : 'transparent'}`,
                marginBottom: -2, letterSpacing: 0.4,
              }}
            >
              {t.label}
              {t.count && counts[t.id] > 0 && (
                <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 8, background: t.id === 'pending' ? '#e67e22' : '#c0392b', color: '#fff', fontSize: 10, fontWeight: 700 }}>
                  {counts[t.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--md1-muted-light)', fontSize: 13 }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: '16px', background: '#fde8e5', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 4, color: '#c0392b', fontSize: 13 }}>
            {error}
            {error.includes('Forbidden') && <div style={{ marginTop: 6, fontSize: 11 }}>Only plant admins can access this page.</div>}
          </div>
        ) : (
          <>
            {activeTab === 'pending' && <PendingTab apps={apps} onApprove={handleApprove} onReject={handleReject} acting={acting} onReload={loadApps} />}
            {activeTab === 'members' && <MembersTab showToast={showToast} />}
            {activeTab === 'rejected' && <RejectedTab apps={apps} onReapprove={handleReapprove} acting={acting} />}
            {activeTab === 'stats' && <StatsTab />}
            {activeTab === 'plants' && <AllPlantsTab />}
          </>
        )}
      </div>

      <Toast toast={toast} />
    </div>
  )
}
