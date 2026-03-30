import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { findOrCreateOrg, createPlant, createMembership, joinPlantByCode } from '../lib/auth.js'

const FNT = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif"
const FNTM = "'IBM Plex Mono', 'Courier New', monospace"


const iS = {
  width: '100%', padding: '10px 14px', fontSize: 13, fontFamily: FNT,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 3, color: '#FFFFFF', outline: 'none', boxSizing: 'border-box',
}

const INDUSTRY_OPTIONS = [
  'Steel - EAF (Electric Arc Furnace)',
  'Steel - BOF (Basic Oxygen Furnace)',
  'Steel - Continuous Casting',
  'Aluminum Smelting',
  'Aluminum Rolling',
  'Beverage Can Manufacturing',
  'Cement',
  'Glass',
  'Chemicals',
  'Pharmaceuticals',
  'Food & Beverage',
  'Pulp & Paper',
  'Oil & Gas - Refining',
  'Power Generation',
  'Mining & Minerals Processing',
  'Automotive Assembly',
]

const labelS = {
  display: 'block', fontSize: 9, color: 'rgba(255,255,255,0.4)',
  textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 5, fontFamily: FNT,
}

function ErrorBox({ msg }) {
  return (
    <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(231,76,60,0.15)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 3, fontSize: 12, color: '#e74c3c', lineHeight: 1.5 }}>
      {msg}
    </div>
  )
}

const roleColors = { admin: '#4FA89A', contributor: '#b0e0ff', viewer: '#8a8278' }

export default function PlantHome({ userId, profile, memberships, onJoined, onSwitchPlant }) {
  const navigate = useNavigate()
  const [panel, setPanel] = useState(null) // null | 'join' | 'create'
  const [joinCode, setJoinCode] = useState('')
  const [orgName, setOrgName] = useState('')
  const [plantName, setPlantName] = useState('')
  const [industry, setIndustry] = useState('')
  const [shortCode, setShortCode] = useState('')
  const [showIndustrySuggestions, setShowIndustrySuggestions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function resetPanels() {
    setPanel(null); setJoinCode(''); setOrgName(''); setPlantName(''); setIndustry(''); setShortCode(''); setError(null)
  }

  async function handleJoin() {
    if (!joinCode.trim()) { setError('Enter an invite code.'); return }
    setSaving(true); setError(null)
    try {
      const membership = await joinPlantByCode(joinCode)
      onJoined(membership)
      navigate('/app')
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  async function handleCreate() {
    if (!orgName.trim()) { setError('Organisation name is required.'); return }
    if (!plantName.trim()) { setError('Plant name is required.'); return }
    const code = shortCode.trim().toUpperCase()
    if (!code || !/^[A-Z]{2,4}$/.test(code)) { setError('Plant code must be 2–4 letters (e.g. EAF, BEV).'); return }
    setSaving(true); setError(null)
    try {
      const org = await findOrCreateOrg(orgName)
      const plant = await createPlant(org.id, plantName, industry, code)
      await createMembership(userId, plant.id, 'admin')
      const membership = {
        membershipId: null,
        plantId: plant.id,
        plantName: plant.name,
        processAreas: plant.process_areas || [],
        inviteCode: plant.invite_code,
        orgId: org.id,
        orgName: org.name,
        industry: plant.industry || industry,
        shortCode: plant.short_code || code,
        role: 'admin',
        joinedAt: new Date().toISOString(),
      }
      onJoined(membership)
      navigate('/app')
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  function handleEnter(plantId) {
    onSwitchPlant(plantId)
    navigate('/app')
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#062044',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 24px 60px', fontFamily: FNT,
    }}>
      {/* Grid background */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)',
        backgroundSize: '60px 60px', pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 520, position: 'relative' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-block',
            fontSize: 28, fontWeight: 700, letterSpacing: 4, color: '#FFFFFF',
            border: '2px solid #FFFFFF', padding: '5px 14px 7px',
          }}>
            M/D/1
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 8, fontFamily: FNT }}>
            {profile.displayName} · Knowledge Bank
          </div>
        </div>

        {/* Existing plants */}
        {memberships.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: FNT, marginBottom: 10 }}>
              Your Plants
            </div>
            {memberships.map(m => (
              <div
                key={m.plantId}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 18px', marginBottom: 8,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 4,
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{m.plantName}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: FNT }}>
                    {m.orgName && <span>{m.orgName} · </span>}
                    <span style={{ color: roleColors[m.role] || '#b0e0ff' }}>{m.role}</span>
                  </div>
                  {m.industry && (
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: FNT, marginTop: 2 }}>
                      {m.industry}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleEnter(m.plantId)}
                  style={{
                    padding: '7px 16px', borderRadius: 3, fontSize: 11,
                    background: '#FFFFFF', border: 'none', color: '#062044',
                    fontFamily: FNT, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer',
                  }}
                >
                  Enter →
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Join / Create panel toggles */}
        {!panel && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setPanel('join'); setError(null) }}
              style={{
                flex: 1, padding: '12px', borderRadius: 3, fontSize: 12,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontFamily: FNT, fontWeight: 700,
              }}
            >
              + Join a Plant
            </button>
            <button
              onClick={() => { setPanel('create'); setError(null) }}
              style={{
                flex: 1, padding: '12px', borderRadius: 3, fontSize: 12,
                background: '#FFFFFF', border: 'none',
                color: '#062044', cursor: 'pointer', fontFamily: FNT, fontWeight: 700,
              }}
            >
              + Create a Plant
            </button>
          </div>
        )}

        {/* Join panel */}
        {panel === 'join' && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '24px 24px 20px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Join a Plant</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20, lineHeight: 1.6 }}>
              Enter the 8-character invite code from your plant administrator.
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelS}>Invite Code</label>
              <input
                style={{ ...iS, textTransform: 'uppercase', letterSpacing: 3, fontSize: 16, fontWeight: 700 }}
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                placeholder="XXXXXXXX"
                maxLength={8}
                autoFocus
              />
            </div>
            {error && <ErrorBox msg={error} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={resetPanels} style={{ padding: '10px 16px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: FNT }}>
                ← Back
              </button>
              <button
                onClick={handleJoin}
                disabled={saving}
                style={{ flex: 1, padding: '10px', borderRadius: 3, fontSize: 12, background: '#FFFFFF', border: 'none', color: '#062044', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Joining…' : 'Join Plant →'}
              </button>
            </div>
          </div>
        )}

        {/* Create panel */}
        {panel === 'create' && (
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '24px 24px 20px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Create a Plant</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20, lineHeight: 1.6 }}>
              You'll be set as admin and receive an invite code to share with your team.
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelS}>Organisation Name</label>
              <input style={iS} type="text" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="e.g. Korf Steel" autoFocus />
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4, fontFamily: FNT }}>
                If your company is already in M/D/1, we'll link you to it.
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelS}>Plant Name</label>
              <input style={iS} type="text" value={plantName} onChange={e => setPlantName(e.target.value)} placeholder="e.g. Contrecoeur Meltshop" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelS}>Plant Code (2–4 letters)</label>
              <input
                style={{ ...iS, textTransform: 'uppercase', letterSpacing: 3, fontSize: 15, fontWeight: 700, fontFamily: FNTM, maxWidth: 140 }}
                type="text"
                value={shortCode}
                onChange={e => setShortCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
                placeholder="EAF"
                maxLength={4}
              />
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4, fontFamily: FNT }}>
                Used in IDs like R-EAF-001. Must be unique across all plants.
              </div>
            </div>

            <div style={{ marginBottom: 14, position: 'relative' }}>
              <label style={labelS}>Industry / Plant Type</label>
              <input
                style={iS}
                type="text"
                value={industry}
                onChange={e => { setIndustry(e.target.value); setShowIndustrySuggestions(true) }}
                onFocus={() => setShowIndustrySuggestions(true)}
                onBlur={() => setTimeout(() => setShowIndustrySuggestions(false), 150)}
                placeholder="e.g. Beverage Can Manufacturing, Cement…"
                autoComplete="off"
              />
              {showIndustrySuggestions && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: '#0d2d55', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 3, maxHeight: 160, overflowY: 'auto',
                }}>
                  {INDUSTRY_OPTIONS
                    .filter(o => o.toLowerCase().includes(industry.toLowerCase()))
                    .map(opt => (
                      <div
                        key={opt}
                        onMouseDown={() => { setIndustry(opt); setShowIndustrySuggestions(false) }}
                        style={{
                          padding: '8px 12px', fontSize: 12, color: 'rgba(255,255,255,0.8)',
                          cursor: 'pointer', fontFamily: FNT,
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {opt}
                      </div>
                    ))
                  }
                  {INDUSTRY_OPTIONS.filter(o => o.toLowerCase().includes(industry.toLowerCase())).length === 0 && industry && (
                    <div style={{ padding: '8px 12px', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: FNT }}>
                      Custom entry — press Enter or continue
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && <ErrorBox msg={error} />}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={resetPanels} style={{ padding: '10px 16px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: FNT }}>
                ← Back
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                style={{ flex: 1, padding: '10px', borderRadius: 3, fontSize: 12, background: '#FFFFFF', border: 'none', color: '#062044', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Creating…' : 'Launch Knowledge Bank →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
