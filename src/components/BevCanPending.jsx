import { useNavigate } from 'react-router-dom'

const FNT  = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif"
const FNTM = "'IBM Plex Mono', 'Courier New', monospace"

export default function BevCanPending() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh', background: '#062044',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: FNT, padding: '40px 24px',
    }}>
      {/* Grid */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)',
        backgroundSize: '60px 60px', pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 460, position: 'relative', textAlign: 'center' }}>

        {/* Logo */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'inline-block', fontSize: 32, fontWeight: 700, letterSpacing: 4, color: '#FFFFFF', border: '2px solid #FFFFFF', padding: '8px 20px 10px', lineHeight: 1 }}>
            M/D/1
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6, padding: '36px 32px 32px',
        }}>
          {/* Check icon */}
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'rgba(79,168,154,0.15)', border: '1px solid rgba(79,168,154,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 22, color: '#4FA89A',
          }}>
            ✓
          </div>

          <div style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', marginBottom: 14 }}>
            Thank you for your application!
          </div>

          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.85, marginBottom: 28 }}>
            Our team will review your application and be in touch within 48 hours.
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 24 }} />

          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>
            In the meantime, feel free to explore the demo
          </div>

          <button
            onClick={() => navigate('/auth')}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 3,
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: 600,
              letterSpacing: 0.8, cursor: 'pointer', fontFamily: FNT,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
          >
            See Demo →
          </button>
        </div>

        <div style={{ marginTop: 24, fontSize: 10, color: 'rgba(255,255,255,0.15)', fontFamily: FNTM, letterSpacing: 1 }}>
          Questions? Email hello@md1.app
        </div>
      </div>
    </div>
  )
}
