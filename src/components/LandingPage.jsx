import { useNavigate } from 'react-router-dom'

export default function LandingPage({ loggedInAs, onLogout }) {
  const navigate = useNavigate()

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

      {/* Logged-in indicator — top right */}
      {loggedInAs && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          fontFamily: "'IBM Plex Mono', monospace",
          letterSpacing: 0.3,
        }}>
          <span>Logged in as {loggedInAs}</span>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
          <button
            onClick={onLogout}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.35)',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: "'IBM Plex Mono', monospace",
              padding: 0,
              textDecoration: 'underline',
              letterSpacing: 0.3,
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
          >
            Log Out
          </button>
        </div>
      )}

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

        <div style={{ display: 'flex', gap: 16 }}>
          <button
            onClick={() => navigate('/auth')}
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
              e.currentTarget.style.borderColor = '#FFFFFF'
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            See Demo
          </button>
          <button
            onClick={() => navigate('/bevcan')}
            style={{
              position: 'relative',
              padding: '16px 48px',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: '#062044',
              background: '#FFFFFF',
              border: '1.5px solid #FFFFFF',
              borderRadius: 2,
              cursor: 'pointer',
              transition: 'all 0.3s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.88)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#FFFFFF'
            }}
          >
            BevCan 1.0
            <span style={{
              position: 'absolute',
              top: -8,
              right: -8,
              background: '#4FA89A',
              color: '#FFFFFF',
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: 1.5,
              padding: '2px 5px',
              borderRadius: 2,
            }}>BETA</span>
          </button>
        </div>
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
