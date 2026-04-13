import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { storeJwt, storeRefreshToken } from '../lib/supabase.js'

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
  letterSpacing: 0.3,
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

export default function ResetPassword({ accessToken }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user`,
        {
          method: 'PUT',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password }),
        }
      )

      const json = await resp.json()
      if (!resp.ok) {
        throw new Error(json.error_description || json.msg || json.message || 'Failed to update password')
      }

      setSuccess(true)
      setTimeout(() => navigate('/auth'), 2500)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--md1-primary)',
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
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Set New Password
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 24, lineHeight: 1.6 }}>
            Enter your new password below.
          </div>

          {success ? (
            <div style={{
              padding: '14px 16px',
              background: 'rgba(var(--md1-accent-rgb),0.15)',
              border: '1px solid rgba(var(--md1-accent-rgb),0.3)',
              borderRadius: 3,
              fontSize: 13,
              color: 'var(--md1-accent)',
              lineHeight: 1.5,
              textAlign: 'center',
            }}>
              Password updated successfully. Redirecting to login…
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>New Password</label>
                <input
                  style={inputStyle}
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
                  required
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Confirm Password</label>
                <input
                  style={password && confirm && password !== confirm
                    ? { ...inputStyle, borderColor: '#e74c3c' }
                    : inputStyle
                  }
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                />
              </div>

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
                  color: loading ? 'rgba(255,255,255,0.4)' : 'var(--md1-primary)',
                  fontSize: 13, fontWeight: 700, letterSpacing: 1.2,
                  textTransform: 'uppercase', cursor: loading ? 'default' : 'pointer',
                  fontFamily: FNT, transition: 'all 0.15s',
                }}
              >
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/auth" style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textDecoration: 'none', letterSpacing: 0.5, fontFamily: FNT }}>
            ← Back to login
          </a>
        </div>
      </div>
    </div>
  )
}
