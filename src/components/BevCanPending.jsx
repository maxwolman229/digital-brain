import { useNavigate } from 'react-router-dom'

const FNT = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif"
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

      <div style={{ width: '100%', maxWidth: 480, position: 'relative', textAlign: 'center' }}>

        {/* Logo + brand */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: '#FFFFFF', border: '1.5px solid #FFFFFF', padding: '4px 12px 5px' }}>
              M/D/1
            </div>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontWeight: 300 }}>×</span>
            <div style={{ position: 'relative' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF', letterSpacing: 1 }}>BevCan 1.0</div>
              <span style={{ position: 'absolute', top: -8, right: -28, background: '#4FA89A', color: '#fff', fontSize: 7, fontWeight: 700, letterSpacing: 1.5, padding: '2px 4px', borderRadius: 2 }}>BETA</span>
            </div>
          </div>
        </div>

        {/* Status card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6, padding: '36px 32px 32px',
        }}>
          {/* Icon */}
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'rgba(79,168,154,0.15)', border: '1px solid rgba(79,168,154,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 22,
          }}>
            ⧖
          </div>

          <div style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF', marginBottom: 12 }}>
            Application Under Review
          </div>

          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, marginBottom: 28, maxWidth: 360, margin: '0 auto 28px' }}>
            Thanks for applying to BevCan 1.0. We verify that all members have
            real industry experience in beverage can manufacturing.
            <br /><br />
            You'll receive an email within 48 hours when your application has been reviewed.
          </div>

          <div style={{
            padding: '12px 16px', borderRadius: 3,
            background: 'rgba(79,168,154,0.08)', border: '1px solid rgba(79,168,154,0.2)',
            fontSize: 11, color: '#4FA89A', fontFamily: FNTM, marginBottom: 28, lineHeight: 1.6,
          }}>
            Once approved, you'll have access to the full BevCan knowledge bank —
            20 reference rules seeded by the MD1 team, plus community contributions
            from verified industry professionals.
          </div>

          <button
            onClick={() => navigate('/bevcan')}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 3,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600,
              letterSpacing: 0.8, cursor: 'pointer', fontFamily: FNT,
            }}
          >
            ← Back to Login
          </button>
        </div>

        <div style={{ marginTop: 24, fontSize: 10, color: 'rgba(255,255,255,0.15)', fontFamily: FNTM, letterSpacing: 1 }}>
          Questions? Email hello@md1.app
        </div>
      </div>
    </div>
  )
}
