import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  lookupInviteByToken,
  acceptInviteByToken,
  signIn,
  signUp,
  loadProfile,
  createProfileSimple,
} from '../lib/auth.js'
import { supabase } from '../lib/supabase.js'

const FNT = 'var(--md1-font-sans)'

const inputStyle = {
  width: '100%',
  padding: '11px 16px',
  fontSize: 14,
  fontFamily: FNT,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 3,
  color: '#FFFFFF',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block',
  fontSize: 10,
  color: 'rgba(255,255,255,0.45)',
  textTransform: 'uppercase',
  letterSpacing: 1.5,
  marginBottom: 6,
  fontFamily: FNT,
}

const Card = ({ children }) => (
  <div style={{
    minHeight: '100vh', background: 'var(--md1-primary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: FNT, position: 'relative',
  }}>
    <div style={{
      position: 'fixed', inset: 0,
      backgroundImage: 'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)',
      backgroundSize: '60px 60px', pointerEvents: 'none',
    }} />
    <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          display: 'inline-block', fontSize: 32, fontWeight: 700, letterSpacing: 4,
          color: '#fff', border: '2px solid #fff', padding: '8px 16px 10px',
        }}>M/D/1</div>
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4, padding: '28px 28px 24px',
      }}>
        {children}
      </div>
    </div>
  </div>
)

const ErrorBox = ({ msg }) => (
  <div style={{
    padding: '9px 12px', marginBottom: 14,
    background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.3)',
    borderRadius: 3, fontSize: 12, color: '#e74c3c', lineHeight: 1.5,
  }}>{msg}</div>
)

export default function AcceptInvite({ session, onAuthChange }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')

  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState(null)
  const [terminalMessage, setTerminalMessage] = useState(null) // expired/rejected/etc
  const [recipientHasAccount, setRecipientHasAccount] = useState(null)

  // Form state for signup (Case A) or login (Case B)
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Decide initial UI state
  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!token) {
        setTerminalMessage('No invite token provided. Check your invite link.')
        setLoading(false)
        return
      }
      try {
        const inv = await lookupInviteByToken(token)
        if (cancelled) return
        if (!inv) {
          setTerminalMessage('Invite not found. The link may be incorrect.')
          setLoading(false)
          return
        }
        setInvite(inv)

        // Terminal states
        if (inv.status === 'accepted') {
          setTerminalMessage('This invite has already been accepted.')
          setLoading(false)
          return
        }
        if (inv.status === 'rejected') {
          setTerminalMessage('This invite is no longer valid.')
          setLoading(false)
          return
        }
        if (inv.status === 'expired' || new Date(inv.expiresAt) < new Date()) {
          setTerminalMessage('This invite has expired. Ask the plant admin to send a new one.')
          setLoading(false)
          return
        }
        if (inv.status === 'pending_approval') {
          setTerminalMessage('This invite is still awaiting admin approval.')
          setLoading(false)
          return
        }

        // status === 'approved' — figure out if recipient has an account
        const { data: existsId } = await supabase
          .rpc('get_user_id_by_email', { lookup_email: inv.recipientEmail })
        setRecipientHasAccount(!!existsId)
      } catch (err) {
        setTerminalMessage(err.message || 'Could not load this invite.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [token])

  // If user is already logged in AND their session matches the invite recipient,
  // we skip auth and just call acceptInviteByToken.
  const sessionEmail = session?.user?.email?.toLowerCase()
  const inviteEmail = invite?.recipientEmail?.toLowerCase()
  const alreadyLoggedInAsRecipient = sessionEmail && inviteEmail && sessionEmail === inviteEmail

  async function handleAccept() {
    setSubmitting(true); setError(null)
    try {
      const result = await acceptInviteByToken(token)
      if (!result.success) {
        setError(result.message || 'Could not accept this invite.')
        setSubmitting(false)
        return
      }
      // Notify App to refresh memberships, then route into the plant
      onAuthChange?.()
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  // Case A — recipient has no account; sign them up, then accept.
  async function handleSignupAndAccept(e) {
    e?.preventDefault?.()
    if (!displayName.trim()) { setError('Your name is required.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setSubmitting(true); setError(null)
    try {
      const { user, needsConfirmation } = await signUp(invite.recipientEmail, password)
      if (needsConfirmation) {
        setError('Email confirmation is required. Please check your inbox, confirm, then return here.')
        setSubmitting(false)
        return
      }
      // Profile, then accept
      await createProfileSimple(user.id, displayName.trim())
      await loadProfile(user.id) // populate user context
      const result = await acceptInviteByToken(token)
      if (!result.success) {
        setError(result.message || 'Could not finalize the invite.')
        setSubmitting(false)
        return
      }
      onAuthChange?.()
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  // Case B — recipient has an account; log them in, then accept.
  async function handleLoginAndAccept(e) {
    e?.preventDefault?.()
    if (!password) { setError('Enter your password.'); return }
    setSubmitting(true); setError(null)
    try {
      const { user } = await signIn(invite.recipientEmail, password)
      await loadProfile(user.id)
      const result = await acceptInviteByToken(token)
      if (!result.success) {
        setError(result.message || 'Could not finalize the invite.')
        setSubmitting(false)
        return
      }
      onAuthChange?.()
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return <Card>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '20px 0' }}>
        Loading invite…
      </div>
    </Card>
  }

  if (terminalMessage) {
    return <Card>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Invite unavailable</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 18 }}>
        {terminalMessage}
      </div>
      <button
        onClick={() => navigate('/auth')}
        style={{
          width: '100%', padding: '12px 0', borderRadius: 3,
          background: '#fff', border: 'none', color: 'var(--md1-primary)',
          fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          cursor: 'pointer', fontFamily: FNT,
        }}
      >Go to Sign In</button>
    </Card>
  }

  // Already logged in as the right user — single-click accept
  if (alreadyLoggedInAsRecipient) {
    return <Card>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
        You're invited to {invite.plantName}
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 22 }}>
        You'll join as <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{invite.role}</strong>.
      </div>
      {error && <ErrorBox msg={error} />}
      <button
        onClick={handleAccept}
        disabled={submitting}
        style={{
          width: '100%', padding: '12px 0', borderRadius: 3,
          background: '#fff', border: 'none', color: 'var(--md1-primary)',
          fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          cursor: submitting ? 'default' : 'pointer', fontFamily: FNT,
          opacity: submitting ? 0.6 : 1,
        }}
      >{submitting ? 'Accepting…' : 'Accept Invite'}</button>
    </Card>
  }

  // Logged in as someone else — warn
  if (session && !alreadyLoggedInAsRecipient) {
    return <Card>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
        Wrong account
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 18 }}>
        This invite was sent to <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{invite.recipientEmail}</strong>,
        but you're signed in as <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{sessionEmail}</strong>.
        Sign out, then click the invite link again.
      </div>
      <button
        onClick={() => navigate('/auth')}
        style={{
          width: '100%', padding: '12px 0', borderRadius: 3,
          background: '#fff', border: 'none', color: 'var(--md1-primary)',
          fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
          cursor: 'pointer', fontFamily: FNT,
        }}
      >Go to Sign In</button>
    </Card>
  }

  // Not logged in — Case A (signup) or Case B (login)
  return <Card>
    <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
      You're invited to {invite.plantName}
    </div>
    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 22 }}>
      {recipientHasAccount
        ? <>Sign in as <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{invite.recipientEmail}</strong> to accept this invite.</>
        : <>Create your account as <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{invite.recipientEmail}</strong> and join as <strong style={{ color: 'rgba(255,255,255,0.85)' }}>{invite.role}</strong>.</>}
    </div>

    {error && <ErrorBox msg={error} />}

    {recipientHasAccount ? (
      <form onSubmit={handleLoginAndAccept}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Email</label>
          <input style={{ ...inputStyle, opacity: 0.7 }} type="email" value={invite.recipientEmail} readOnly />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Password</label>
          <input
            style={inputStyle} type="password"
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" autoFocus required
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 3,
            background: '#fff', border: 'none', color: 'var(--md1-primary)',
            fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            cursor: submitting ? 'default' : 'pointer', fontFamily: FNT,
            opacity: submitting ? 0.6 : 1,
          }}
        >{submitting ? '…' : 'Log In & Accept'}</button>
      </form>
    ) : (
      <form onSubmit={handleSignupAndAccept}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Your Name</label>
          <input
            style={inputStyle} type="text"
            value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="e.g. Marco Rossi" autoFocus required
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Email</label>
          <input style={{ ...inputStyle, opacity: 0.7 }} type="email" value={invite.recipientEmail} readOnly />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Password</label>
          <input
            style={inputStyle} type="password"
            value={password} onChange={e => setPassword(e.target.value)}
            placeholder="At least 8 characters" required
          />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={labelStyle}>Confirm Password</label>
          <input
            style={inputStyle} type="password"
            value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat password" required
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 3,
            background: '#fff', border: 'none', color: 'var(--md1-primary)',
            fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            cursor: submitting ? 'default' : 'pointer', fontFamily: FNT,
            opacity: submitting ? 0.6 : 1,
          }}
        >{submitting ? 'Creating account…' : 'Create Account & Accept'}</button>
      </form>
    )}
  </Card>
}
