import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, createBevcanApplication, fetchBevcanApplicationStatus } from '../lib/auth.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function registerApplicant(fields) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/bevcan-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
    },
    body: JSON.stringify({ action: 'register_applicant', ...fields }),
  })
  const json = await resp.json()
  if (!resp.ok) throw new Error(json.error || `Registration failed (${resp.status})`)
  return json // { ok: true, user_id }
}

const BEVCAN_PLANT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'

const FNT = 'var(--md1-font-sans)'

const iS = {
  width: '100%', padding: '10px 14px', fontSize: 13, fontFamily: FNT,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 3, color: '#FFFFFF', outline: 'none', boxSizing: 'border-box',
}
const iSErr = { ...iS, borderColor: '#e74c3c' }
const labelS = {
  display: 'block', fontSize: 9, color: 'rgba(255,255,255,0.4)',
  textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 5, fontFamily: FNT,
}
const sectionLabel = {
  fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
  letterSpacing: 2, fontFamily: FNT, marginBottom: 14, marginTop: 4,
  paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.07)',
}
const YEAR_OPTIONS = Array.from({ length: 2026 - 1975 + 1 }, (_, i) => 2026 - i)

function ErrBox({ msg }) {
  if (!msg) return null
  return (
    <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 3, fontSize: 12, color: '#e74c3c', lineHeight: 1.5 }}>
      {msg}
    </div>
  )
}

function BrandHeader() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: '#FFFFFF', border: '1.5px solid #FFFFFF', padding: '4px 12px 5px' }}>
          M/D/1
        </div>
        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontWeight: 300 }}>×</span>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF', letterSpacing: 1 }}>BevCan 1.0</div>
          <span style={{ position: 'absolute', top: -8, right: -28, background: 'var(--md1-accent)', color: '#fff', fontSize: 7, fontWeight: 700, letterSpacing: 1.5, padding: '2px 4px', borderRadius: 2 }}>BETA</span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, maxWidth: 340, margin: '0 auto' }}>
        The first public knowledge bank for beverage can manufacturing.
        Membership is open to industry professionals.
      </div>
    </div>
  )
}

function ApplyFields({ form, patchForm, pastInput, setPastInput }) {
  function addPastPosition() {
    if (!pastInput.trim()) return
    patchForm('pastPositions', [...form.pastPositions, pastInput.trim()])
    setPastInput('')
  }
  function removePastPosition(i) {
    patchForm('pastPositions', form.pastPositions.filter((_, idx) => idx !== i))
  }
  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={labelS}>Full Name <span style={{ color: 'rgba(255,255,255,0.2)' }}>(admin only)</span></label>
          <input style={iS} type="text" value={form.fullName} onChange={e => patchForm('fullName', e.target.value)} placeholder="Marco Rossi" required />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelS}>Display Nickname <span style={{ color: 'rgba(255,255,255,0.2)' }}>(public)</span></label>
          <input style={iS} type="text" value={form.nickname} onChange={e => patchForm('nickname', e.target.value)} placeholder="e.g. M. Rossi" required />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelS}>Current Position</label>
        <input style={iS} type="text" value={form.currentPosition} onChange={e => patchForm('currentPosition', e.target.value)} placeholder="e.g. Body Maker Operator, Quality Engineer, Plant Manager" required />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={labelS}>Current Company <span style={{ color: 'rgba(255,255,255,0.2)' }}>(optional)</span></label>
          <input style={iS} type="text" value={form.currentCompany} onChange={e => patchForm('currentCompany', e.target.value)} placeholder="e.g. Ball, Crown, Ardagh…" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelS}>Year Joined Industry</label>
          <select style={{ ...iS, appearance: 'none' }} value={form.yearJoined} onChange={e => patchForm('yearJoined', e.target.value)}>
            <option value="">Select year…</option>
            {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelS}>Past Positions <span style={{ color: 'rgba(255,255,255,0.2)' }}>(optional — add multiple)</span></label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            style={{ ...iS, flex: 1 }}
            type="text"
            value={pastInput}
            onChange={e => setPastInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPastPosition() } }}
            placeholder="e.g. Production Supervisor at Crown (2015–2021)"
          />
          <button type="button" onClick={addPastPosition} style={{ padding: '0 14px', borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18, fontFamily: FNT }}>+</button>
        </div>
        {form.pastPositions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {form.pastPositions.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 3, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                {p}
                <button type="button" onClick={() => removePastPosition(i)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={labelS}>Brief Bio <span style={{ color: 'rgba(255,255,255,0.2)' }}>(optional — 1–2 sentences about your expertise)</span></label>
        <textarea
          style={{ ...iS, height: 72, resize: 'vertical', lineHeight: 1.5 }}
          value={form.bio}
          onChange={e => patchForm('bio', e.target.value)}
          placeholder="e.g. 18 years in can making across body making and quality. Specialist in necking defect diagnosis and ERV troubleshooting."
        />
      </div>

      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
        padding: '12px 14px', borderRadius: 3, marginBottom: 20,
        background: form.confirmed ? 'rgba(var(--md1-accent-rgb),0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${form.confirmed ? 'rgba(var(--md1-accent-rgb),0.35)' : 'rgba(255,255,255,0.1)'}`,
      }}>
        <input
          type="checkbox"
          checked={form.confirmed}
          onChange={e => patchForm('confirmed', e.target.checked)}
          style={{ marginTop: 3, accentColor: 'var(--md1-accent)', width: 14, height: 14, flexShrink: 0 }}
        />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
          By joining BevCan 1.0, I agree to share only general industry knowledge and best
          practices. I will not share proprietary company information, specific production
          parameters, customer specifications, or trade secrets belonging to my employer.
          All contributions should reflect knowledge that is commonly understood across
          the industry.
        </span>
      </label>
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
// Props:
//   session       - current auth session (or null)
//   profile       - loaded profile (or null)
//   memberships   - array of membership objects
//   onSignedIn    - called with user object after successful login/signup
//   onSwitchToBevCan - called to switch active plant to BevCan before navigating
//
// States:
//   1. No session → show login/apply tabs
//   2. Session, no BevCan membership, not pending → show apply form (no account fields)
//   3. Session, has BevCan membership → auto-switch and navigate to /app

export default function BevCanSignup({ session, profile, memberships = [], onSignedIn, onSwitchToBevCan }) {
  const navigate = useNavigate()

  const hasBevCan = !!(session && memberships.some(m => m.plantId === BEVCAN_PLANT_ID))

  // State 3: already a BevCan member → switch plant and go to app
  useEffect(() => {
    if (hasBevCan) {
      onSwitchToBevCan?.()
      navigate('/app', { replace: true })
    }
  }, [hasBevCan])

  // For logged-in users without BevCan membership, check application status
  const [appStatus, setAppStatus] = useState(null)
  const [appChecking, setAppChecking] = useState(!!(session && !hasBevCan))

  useEffect(() => {
    if (session && !hasBevCan) {
      setAppChecking(true)
      fetchBevcanApplicationStatus(session.user.id).then(s => {
        setAppStatus(s)
        setAppChecking(false)
        if (s === 'pending') navigate('/bevcan/pending', { replace: true })
      }).catch(() => setAppChecking(false))
    }
  }, [session?.user?.id, hasBevCan])

  // Login form state (used when not logged in)
  const [tab, setTab] = useState('login')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPwd, setLoginPwd] = useState('')
  const [loginErr, setLoginErr] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  // Apply form state
  const [form, setForm] = useState({
    email: '', password: '', confirm: '',
    fullName: '', nickname: profile?.displayName || '',
    currentPosition: '', currentCompany: '',
    pastPositions: [], yearJoined: '', bio: '', confirmed: false,
  })
  const [pastInput, setPastInput] = useState('')
  const [applyErr, setApplyErr] = useState(null)
  const [applyLoading, setApplyLoading] = useState(false)

  const patchForm = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleLogin(e) {
    e.preventDefault()
    setLoginErr(null)
    setLoginLoading(true)
    try {
      const { user } = await signIn(loginEmail.trim(), loginPwd)
      const status = await fetchBevcanApplicationStatus(user.id)
      if (status === 'pending') {
        navigate('/bevcan/pending')
        return
      }
      if (status === 'rejected') {
        setLoginErr('Your application was not approved. Contact hello@md1.app if you believe this is an error.')
        setLoginLoading(false)
        return
      }
      // Approved or no application — load full state in App.jsx.
      // If BevCan membership exists, hasBevCan useEffect will navigate to /app.
      await onSignedIn(user)
    } catch (err) {
      setLoginErr(err.message || 'Login failed.')
    }
    setLoginLoading(false)
  }

  async function handleApply(e) {
    e.preventDefault()
    setApplyErr(null)

    if (!form.fullName.trim()) { setApplyErr('Full name is required.'); return }
    if (!form.nickname.trim()) { setApplyErr('Display nickname is required.'); return }
    if (!form.currentPosition.trim()) { setApplyErr('Current position is required.'); return }
    if (!session) {
      if (!form.email.trim()) { setApplyErr('Email is required.'); return }
      if (form.password.length < 8) { setApplyErr('Password must be at least 8 characters.'); return }
      if (form.password !== form.confirm) { setApplyErr('Passwords do not match.'); return }
    }
    if (!form.confirmed) { setApplyErr('Please read and accept the knowledge-sharing agreement.'); return }

    setApplyLoading(true)
    try {
      if (!session) {
        // New user — create account + profile + application via admin edge function
        // (auto-confirms email so no confirmation email is sent)
        await registerApplicant({
          email: form.email.trim(),
          password: form.password,
          nickname: form.nickname.trim(),
          full_name: form.fullName.trim(),
          current_position: form.currentPosition.trim(),
          current_company: form.currentCompany.trim() || null,
          past_positions: form.pastPositions,
          year_joined_industry: form.yearJoined ? parseInt(form.yearJoined) : null,
          bio: form.bio.trim() || null,
          confirmed_industry: form.confirmed,
        })
      } else {
        // Existing account (already logged in) — just insert the application
        await createBevcanApplication(session.user.id, {
          email: session.user.email,
          full_name: form.fullName.trim(),
          nickname: form.nickname.trim(),
          current_position: form.currentPosition.trim(),
          current_company: form.currentCompany.trim() || null,
          past_positions: form.pastPositions,
          year_joined_industry: form.yearJoined ? parseInt(form.yearJoined) : null,
          bio: form.bio.trim() || null,
          confirmed_industry: form.confirmed,
          status: 'pending',
        })
      }

      navigate('/bevcan/pending')
    } catch (err) {
      setApplyErr(err.message || 'Sign up failed. Please try again.')
    }
    setApplyLoading(false)
  }

  const wrapperStyle = {
    minHeight: '100vh', background: 'var(--md1-primary)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    fontFamily: FNT, padding: '40px 24px',
  }
  const gridStyle = {
    position: 'fixed', inset: 0,
    backgroundImage: 'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)',
    backgroundSize: '60px 60px', pointerEvents: 'none',
  }

  // Redirecting (state 3)
  if (hasBevCan) return null

  // Checking app status
  if (appChecking) {
    return (
      <div style={wrapperStyle}>
        <div style={gridStyle} />
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Checking membership…</div>
      </div>
    )
  }

  // ── State 2: logged in, no BevCan membership (not pending) ──────────────────
  if (session && profile) {
    return (
      <div style={wrapperStyle}>
        <div style={gridStyle} />
        <div style={{ width: '100%', maxWidth: 480, position: 'relative' }}>
          <BrandHeader />

          {appStatus === 'rejected' && (
            <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(192,57,43,0.12)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 3, fontSize: 12, color: '#e87e6a', lineHeight: 1.5 }}>
              Your previous application was not approved. You can reapply below.
            </div>
          )}

          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            Logged in as <span style={{ color: 'rgba(255,255,255,0.8)' }}>{session.user.email}</span>
          </div>

          <form onSubmit={handleApply} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '24px 24px 20px' }}>
            <div style={sectionLabel}>Apply for BevCan 1.0 Access</div>
            <ApplyFields form={form} patchForm={patchForm} pastInput={pastInput} setPastInput={setPastInput} />
            <ErrBox msg={applyErr} />
            <button type="submit" disabled={applyLoading} style={{
              width: '100%', padding: '13px 0', borderRadius: 3,
              background: applyLoading ? 'rgba(var(--md1-accent-rgb),0.3)' : 'var(--md1-accent)',
              border: 'none', color: '#FFFFFF',
              fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
              cursor: applyLoading ? 'default' : 'pointer', fontFamily: FNT,
            }}>
              {applyLoading ? 'Submitting…' : 'Submit Application →'}
            </button>
            <div style={{ marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6, textAlign: 'center' }}>
              Applications are reviewed within 48 hours. You'll be notified by email when approved.
            </div>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <a href="/" style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textDecoration: 'none', letterSpacing: 0.5, fontFamily: FNT }}>← Back to home</a>
          </div>
        </div>
      </div>
    )
  }

  // ── State 1: not logged in → login / apply tabs ──────────────────────────────
  return (
    <div style={wrapperStyle}>
      <div style={gridStyle} />
      <div style={{ width: '100%', maxWidth: 480, position: 'relative' }}>
        <BrandHeader />

        {/* Tab bar */}
        <div style={{ display: 'flex', marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {[['login', 'Log In'], ['apply', 'Apply for Access']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: '9px 0', background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === id ? 'var(--md1-accent)' : 'transparent'}`,
              color: tab === id ? '#fff' : 'rgba(255,255,255,0.4)',
              fontSize: 12, fontWeight: tab === id ? 700 : 400, letterSpacing: 1.2,
              textTransform: 'uppercase', cursor: 'pointer', fontFamily: FNT, marginBottom: -1,
            }}>{label}</button>
          ))}
        </div>

        {/* Login tab */}
        {tab === 'login' && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '24px 24px 20px' }}>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelS}>Email</label>
                <input style={iS} type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@company.com" autoFocus required />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={labelS}>Password</label>
                <input style={iS} type="password" value={loginPwd} onChange={e => setLoginPwd(e.target.value)} placeholder="••••••••" required />
              </div>
              <ErrBox msg={loginErr} />
              <button type="submit" disabled={loginLoading} style={{
                width: '100%', padding: '12px 0', borderRadius: 3,
                background: loginLoading ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
                border: 'none', color: loginLoading ? 'rgba(255,255,255,0.4)' : 'var(--md1-primary)',
                fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                cursor: loginLoading ? 'default' : 'pointer', fontFamily: FNT,
              }}>
                {loginLoading ? 'Signing in…' : 'Log In →'}
              </button>
            </form>
          </div>
        )}

        {/* Apply tab */}
        {tab === 'apply' && (
          <form onSubmit={handleApply} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '24px 24px 20px' }}>
            <div style={sectionLabel}>Account</div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelS}>Email</label>
              <input style={iS} type="email" value={form.email} onChange={e => patchForm('email', e.target.value)} placeholder="you@company.com" autoFocus required />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelS}>Password</label>
                <input style={form.password && form.password.length < 8 ? iSErr : iS} type="password" value={form.password} onChange={e => patchForm('password', e.target.value)} placeholder="8+ characters" required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelS}>Confirm Password</label>
                <input style={form.confirm && form.password !== form.confirm ? iSErr : iS} type="password" value={form.confirm} onChange={e => patchForm('confirm', e.target.value)} placeholder="Repeat password" required />
              </div>
            </div>
            <div style={{ ...sectionLabel, marginTop: 20 }}>About You</div>
            <ApplyFields form={form} patchForm={patchForm} pastInput={pastInput} setPastInput={setPastInput} />
            <ErrBox msg={applyErr} />
            <button type="submit" disabled={applyLoading} style={{
              width: '100%', padding: '13px 0', borderRadius: 3,
              background: applyLoading ? 'rgba(var(--md1-accent-rgb),0.3)' : 'var(--md1-accent)',
              border: 'none', color: '#FFFFFF',
              fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
              cursor: applyLoading ? 'default' : 'pointer', fontFamily: FNT,
            }}>
              {applyLoading ? 'Submitting application…' : 'Submit Application →'}
            </button>
            <div style={{ marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6, textAlign: 'center' }}>
              Applications are reviewed within 48 hours. You'll be notified by email when approved.
            </div>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/" style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textDecoration: 'none', letterSpacing: 0.5, fontFamily: FNT }}>← Back to home</a>
        </div>
      </div>
    </div>
  )
}
