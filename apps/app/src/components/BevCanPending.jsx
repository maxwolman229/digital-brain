const FNT = 'var(--md1-font-sans)'
const FNTM = 'var(--md1-font-mono)'

export default function BevCanPending() {

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--md1-primary)',
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
            background: 'rgba(var(--md1-accent-rgb),0.15)', border: '1px solid rgba(var(--md1-accent-rgb),0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 22, color: 'var(--md1-accent)',
          }}>
            ✓
          </div>

          <div style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', marginBottom: 14 }}>
            Thank you for your application!
          </div>

          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.85, marginBottom: 28 }}>
            Our team will review your application and be in touch within 48 hours.
          </div>

        </div>

        <div style={{ marginTop: 24, fontSize: 10, color: 'rgba(255,255,255,0.15)', fontFamily: FNTM, letterSpacing: 1 }}>
          Questions? Email hello@md1.app
        </div>
      </div>
    </div>
  )
}
