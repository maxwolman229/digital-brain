import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LandingPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState(false)
  const navigate = useNavigate()

  function attempt() {
    if (pwd === 'digitalbrain') {
      navigate('/auth')
    } else {
      setError(true)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#062044',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'IBM Plex Sans', sans-serif",
    }}>
      {/* Grid overlay */}
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
      }} />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: 40,
        animation: 'fadeIn 1.2s ease-out',
      }}>
        {/* Logo */}
        <div style={{
          fontSize: 72,
          fontWeight: 700,
          letterSpacing: 6,
          color: '#FFFFFF',
          lineHeight: 1,
          border: '2.5px solid #FFFFFF',
          padding: '12px 28px 16px',
          marginBottom: 16,
        }}>
          M/D/1
        </div>

        <div style={{
          fontSize: 15,
          fontWeight: 300,
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: 4,
          textTransform: 'uppercase',
          marginBottom: 80,
        }}>
          The Knowledge Bank
        </div>

        <div style={{
          fontSize: 18,
          fontWeight: 400,
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: 0.5,
          lineHeight: 1.6,
          maxWidth: 440,
          marginBottom: 60,
        }}>
          The operational brain that never retires.
        </div>

        {!showPassword ? (
          <div style={{ display: 'flex', gap: 16 }}>
            <a
              href="mailto:mw@korfsteel.com"
              style={{
                display: 'inline-block',
                padding: '16px 48px',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: '#FFFFFF',
                textDecoration: 'none',
                border: '1.5px solid rgba(255,255,255,0.25)',
                borderRadius: 2,
                transition: 'all 0.3s',
              }}
              onMouseEnter={e => {
                e.target.style.borderColor = '#FFFFFF'
                e.target.style.background = 'rgba(255,255,255,0.06)'
              }}
              onMouseLeave={e => {
                e.target.style.borderColor = 'rgba(255,255,255,0.25)'
                e.target.style.background = 'transparent'
              }}
            >
              Get in Touch
            </a>
            <button
              onClick={() => setShowPassword(true)}
              style={{
                padding: '16px 48px',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: '#FFFFFF',
                background: 'transparent',
                border: '1.5px solid rgba(255,255,255,0.25)',
                borderRadius: 2,
                cursor: 'pointer',
                transition: 'all 0.3s',
              }}
              onMouseEnter={e => {
                e.target.style.borderColor = '#FFFFFF'
                e.target.style.background = 'rgba(255,255,255,0.06)'
              }}
              onMouseLeave={e => {
                e.target.style.borderColor = 'rgba(255,255,255,0.25)'
                e.target.style.background = 'transparent'
              }}
            >
              See Demo
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={pwd}
                onChange={e => { setPwd(e.target.value); setError(false) }}
                onKeyDown={e => { if (e.key === 'Enter') attempt() }}
                placeholder="Enter password"
                autoFocus
                style={{
                  padding: '12px 20px',
                  fontSize: 13,
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  background: 'rgba(255,255,255,0.08)',
                  border: error ? '1.5px solid #c0392b' : '1.5px solid rgba(255,255,255,0.25)',
                  borderRadius: 2,
                  color: '#FFFFFF',
                  outline: 'none',
                  width: 240,
                  letterSpacing: 1,
                }}
              />
              <button
                onClick={attempt}
                style={{
                  padding: '12px 24px',
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: '#062044',
                  background: '#FFFFFF',
                  border: 'none',
                  borderRadius: 2,
                  cursor: 'pointer',
                }}
              >
                Enter
              </button>
            </div>
            {error && (
              <div style={{ fontSize: 11, color: '#c0392b', letterSpacing: 0.5 }}>
                Incorrect password
              </div>
            )}
            <button
              onClick={() => { setShowPassword(false); setPwd(''); setError(false) }}
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.3)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: "'IBM Plex Sans', sans-serif",
                marginTop: 4,
              }}
            >
              ← Back
            </button>
          </div>
        )}
      </div>

      <div style={{
        position: 'fixed',
        bottom: 32,
        fontSize: 10,
        fontFamily: "'IBM Plex Mono', monospace",
        color: 'rgba(255,255,255,0.15)',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
      }}>
        Confidential
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
