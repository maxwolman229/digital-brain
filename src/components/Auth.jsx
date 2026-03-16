import { useState, useEffect } from 'react'
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

  // Visible debug state
  const [debug, setDebug] = useState({ status: 'checking…', url: '', keyPrefix: '' })
  const [rawTest, setRawTest] = useState(null)

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!url || !key) {
      setDebug({ status: '❌ Env vars missing — check .env.local', url: url ?? 'MISSING', keyPrefix: key ? key.slice(0, 20) : 'MISSING' })
      return
    }

    const shortUrl = url.replace('https://', '').slice(0, 32)
    setDebug({ status: 'testing raw connection…', url: shortUrl, keyPrefix: key.slice(0, 20) + '…' })

    // Raw fetch — no Supabase client, just a plain HTTP GET to the auth health endpoint
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)

    fetch(url + '/auth/v1/health', {
      signal: controller.signal,
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key },
    })
      .then(async r => {
        clearTimeout(timer)
        const text = await r.text().catch(() => r.status)
        setDebug(d => ({ ...d, status: `✅ HTTP ${r.status} — ${String(text).slice(0, 60)}` }))
      })
      .catch(err => {
        clearTimeout(timer)
        const msg = err.name === 'AbortError' ? 'Timed out (8s) — no response from Supabase' : err.message
        setDebug(d => ({ ...d, status: '❌ ' + msg }))
      })

    return () => { clearTimeout(timer); controller.abort() }
  }, [])

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
    setRawTest('signing in…')
    try {
      const { user } = await signIn(DEMO_EMAIL, DEMO_PASSWORD)
      setRawTest('✅ signed in as ' + (user?.email ?? user?.id))
      onSignedIn(user)
    } catch (err) {
      setRawTest('❌ ' + err.message)
      setError(err.message)
    }
    setDemoLoading(false)
  }

  const isLogin = mode === 'login'
  const debugOk = debug.status.startsWith('✅')
  const debugFail = debug.status.startsWith('❌')

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

        {/* Debug panel — always visible */}
        <div style={{
          marginBottom: 16,
          padding: '10px 12px',
          borderRadius: 3,
          background: debugFail ? 'rgba(231,76,60,0.12)' : debugOk ? 'rgba(79,168,154,0.1)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${debugFail ? 'rgba(231,76,60,0.3)' : debugOk ? 'rgba(79,168,154,0.3)' : 'rgba(255,255,255,0.1)'}`,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          lineHeight: 1.7,
          color: debugFail ? '#e74c3c' : debugOk ? '#4FA89A' : 'rgba(255,255,255,0.4)',
        }}>
          <div>status: {debug.status}</div>
          <div>url: {debug.url || '…'}</div>
          <div>key: {debug.keyPrefix || '…'}</div>
          {rawTest && <div style={{ marginTop: 4, color: rawTest.startsWith('HTTP 200') ? '#4FA89A' : '#e74c3c' }}>auth: {rawTest}</div>}
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

          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: FNT }}>
            demo@md1.app · digitalbrain
          </div>

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
