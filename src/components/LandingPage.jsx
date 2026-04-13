import { useNavigate } from 'react-router-dom'
import { useIsMobile } from '../lib/hooks.js'

export default function LandingPage({ loggedInAs, onLogout }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--md1-primary)',
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
          top: 12,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          fontFamily: "'IBM Plex Mono', monospace",
          letterSpacing: 0.3,
        }}>
          {!isMobile && <span>Logged in as {loggedInAs}</span>}
          {!isMobile && <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>}
          <button
            onClick={onLogout}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.35)',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: "'IBM Plex Mono', monospace",
              padding: '8px 0',
              textDecoration: 'underline',
              letterSpacing: 0.3,
              minHeight: 44,
            }}
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
        padding: isMobile ? '32px 24px' : 40,
        width: '100%',
        maxWidth: 560,
        boxSizing: 'border-box',
        animation: 'fadeIn 1.2s ease-out',
      }}>
        {/* Logo */}
        <div style={{
          fontSize: isMobile ? 52 : 72,
          fontWeight: 700,
          letterSpacing: isMobile ? 4 : 6,
          color: '#FFFFFF',
          lineHeight: 1,
          border: '2.5px solid #FFFFFF',
          padding: isMobile ? '10px 20px 13px' : '12px 28px 16px',
          marginBottom: 14,
        }}>
          M/D/1
        </div>

        <div style={{
          fontSize: isMobile ? 12 : 15,
          fontWeight: 300,
          color: 'rgba(255,255,255,0.5)',
          letterSpacing: 4,
          textTransform: 'uppercase',
          marginBottom: isMobile ? 48 : 80,
        }}>
          The Knowledge Bank
        </div>

        <div style={{
          fontSize: isMobile ? 15 : 18,
          fontWeight: 400,
          color: 'rgba(255,255,255,0.35)',
          letterSpacing: 0.5,
          lineHeight: 1.6,
          maxWidth: 440,
          marginBottom: isMobile ? 40 : 60,
          padding: '0 8px',
        }}>
          The operational brain that never retires.
        </div>

        {/* Buttons — stacked on mobile, side by side on desktop */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 12,
          width: isMobile ? '100%' : 'auto',
        }}>
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
              minHeight: 52,
              width: isMobile ? '100%' : 'auto',
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
              color: 'var(--md1-primary)',
              background: '#FFFFFF',
              border: '1.5px solid #FFFFFF',
              borderRadius: 2,
              cursor: 'pointer',
              transition: 'all 0.3s',
              minHeight: 52,
              width: isMobile ? '100%' : 'auto',
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
              background: 'var(--md1-accent)',
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
