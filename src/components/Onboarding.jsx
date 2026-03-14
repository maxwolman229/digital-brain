import { useState } from 'react'
import { createProfileSimple, loadProfile } from '../lib/auth.js'

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

export default function Onboarding({ userId, displayName: initialName, onComplete }) {
  const [displayName, setDisplayName] = useState(initialName || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleFinish() {
    if (!displayName.trim()) { setError('Your name is required.'); return }

    setSaving(true)
    setError(null)
    try {
      await createProfileSimple(userId, displayName)
      const profile = await loadProfile(userId)
      onComplete(profile)
    } catch (err) {
      setError(err.message || 'Setup failed. Please try again.')
    }
    setSaving(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#062044',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: FNT,
    }}>
      {/* Grid */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 400, padding: '0 24px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            display: 'inline-block',
            fontSize: 30, fontWeight: 700, letterSpacing: 4, color: '#FFFFFF',
            border: '2px solid #FFFFFF', padding: '6px 16px 8px', marginBottom: 10,
          }}>
            M/D/1
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
            What should we call you?
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 4,
          padding: '28px 28px 24px',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            Your name
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 22, lineHeight: 1.6 }}>
            This is how you'll appear on rules, comments, and events.
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Display Name</label>
            <input
              style={inputStyle}
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFinish()}
              placeholder="e.g. Marco Rossi"
              autoFocus
            />
          </div>

          {error && (
            <div style={{ padding: '9px 12px', marginBottom: 14, background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 3, fontSize: 12, color: '#e74c3c', lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleFinish}
            disabled={saving}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 3,
              background: '#FFFFFF', border: 'none', color: '#062044',
              fontSize: 13, fontWeight: 800, letterSpacing: 1,
              textTransform: 'uppercase', cursor: 'pointer', fontFamily: FNT,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Setting up…' : 'Continue →'}
          </button>
        </div>
      </div>
    </div>
  )
}
