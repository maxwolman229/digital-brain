import { useState } from 'react'
import { signIn, signUp } from '../lib/auth.js'

const FNT = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif"

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
  letterSpacing: 0.3,
}

const inputErrStyle = { ...inputStyle, borderColor: '#e74c3c' }

const labelStyle = {
  display: 'block',
  fontSize: 10,
  color: 'rgba(255,255,255,0.45)',
  textTransform: 'uppercase',
  letterSpacing: 1.5,
  marginBottom: 6,
  fontFamily: FNT,
}

const DEMO_EMAIL = 'demo@md1.app'
const DEMO_PASSWORD = 'digitalbrain'

export default function Auth({ onSignedIn, onNeedsOnboarding }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [demoLoading, setDemoLoading] = useState(false)

  function switchMode(m) {
    setMode(m)
    setError(null)
    setEmail('')
    setPassword('')
    setConfirm('')
    setDisplayName('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (mode === 'signup') {
      if (!displayName.trim()) { setError('Display name is required.'); return }
      if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }
      if (password !== confirm)  { setError('Passwords do not match.'); return }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        const { user } = await signIn(email.trim(), password)
        onSignedIn(user)
      } else {
        const { user } = await signUp(email.trim(), password)
        onNeedsOnboarding(user, displayName.trim())
      }
    } catch (err) {
      setError(err.message || 'Authentication failed.')
    }
    setLoading(false)
  }

  async function handleDemo() {
    setDemoLoading(true)
    setError(null)
    try {
      const { user } = await signIn(DEMO_EMAIL, DEMO_PASSWORD)
      onSignedIn(user)
    } catch (err) {
      setError(err.message)
    }
    setDemoLoading(false)
  }

  const isLogin = mode === 'login'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#062044',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: FNT,
      position: 'relative',
    }}>
      {/* Subtle grid */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-block',
            fontSize: 36, fontWeight: 700, letterSpacing: 4, color: '#FFFFFF', lineHeight: 1,
            border: '2px solid #FFFFFF', padding: '8px 18px 10px', marginBottom: 10,
          }}>
            M/D/1
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 3, textTransform: 'uppercase' }}>
            Knowledge Bank
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4,
          padding: '28px 28px 24px',
        }}>

          {/* Mode tabs */}
          <div style={{ display: 'flex', marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 0 }}>
            {['login', 'signup'].map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                style={{
                  flex: 1, padding: '8px 0', background: 'none', border: 'none',
                  borderBottom: `2px solid ${mode === m ? '#4FA89A' : 'transparent'}`,
                  color: mode === m ? '#fff' : 'rgba(255,255,255,0.4)',
                  fontSize: 12, fontWeight: mode === m ? 700 : 400,
                  letterSpacing: 1.2, textTransform: 'uppercase', cursor: 'pointer',
                  fontFamily: FNT, marginBottom: -1, transition: 'all 0.15s',
                }}
              >
                {m === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>

            {!isLogin && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Your Name</label>
                <input
                  style={inputStyle}
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Marco Rossi"
                  autoFocus={!isLogin}
                  required
                />
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Email</label>
              <input
                style={inputStyle}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoFocus={isLogin}
                required
              />
            </div>

            <div style={{ marginBottom: !isLogin ? 16 : 20 }}>
              <label style={labelStyle}>Password</label>
              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isLogin ? '••••••••' : 'At least 8 characters'}
                required
              />
            </div>

            {!isLogin && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Confirm Password</label>
                <input
                  style={password && confirm && password !== confirm ? inputErrStyle : inputStyle}
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                />
              </div>
            )}

            {error && (
              <div style={{
                padding: '9px 12px', marginBottom: 14,
                background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.3)',
                borderRadius: 3, fontSize: 12, color: '#e74c3c', lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 3,
                background: loading ? 'rgba(255,255,255,0.1)' : '#FFFFFF',
                border: 'none',
                color: loading ? 'rgba(255,255,255,0.4)' : '#062044',
                fontSize: 13, fontWeight: 700, letterSpacing: 1.2,
                textTransform: 'uppercase', cursor: loading ? 'default' : 'pointer',
                fontFamily: FNT, transition: 'all 0.15s',
              }}
            >
              {loading ? '…' : isLogin ? 'Log In' : 'Create Account'}
            </button>
          </form>

          {/* Demo divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: 1, textTransform: 'uppercase' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          </div>

          <button
            onClick={handleDemo}
            disabled={demoLoading}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 3,
              background: 'transparent',
              border: '1px solid rgba(79,168,154,0.5)',
              color: demoLoading ? 'rgba(79,168,154,0.4)' : '#4FA89A',
              fontSize: 12, fontWeight: 700, letterSpacing: 0.8,
              cursor: demoLoading ? 'default' : 'pointer', fontFamily: FNT,
            }}
          >
            {demoLoading ? 'Signing in…' : 'Continue as Demo →'}
          </button>


        </div>

        {/* Back to landing */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/" style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textDecoration: 'none', letterSpacing: 0.5, fontFamily: FNT }}>
            ← Back to home
          </a>
        </div>

      </div>
    </div>
  )
}
