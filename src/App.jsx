import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { loadProfile, signOut, getRestoredSession, fetchMemberships } from './lib/auth.js'
import { setUserContext, clearUserContext, getStoredActivePlant } from './lib/userContext.js'
import LandingPage from './components/LandingPage.jsx'
import Auth from './components/Auth.jsx'
import Onboarding from './components/Onboarding.jsx'
import PlantHome from './components/PlantHome.jsx'
import KnowledgeBank from './components/KnowledgeBank.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'


export default function App() {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [activePlantId, setActivePlantId] = useState(null)
  const [pendingDisplayName, setPendingDisplayName] = useState('')

  // Activate a plant: update userContext (synchronous module store), localStorage, and React state
  function activateContext(p, membs, plantId) {
    const m = membs.find(x => x.plantId === plantId) || membs[0]
    const effectivePlant = m?.plantId || null
    try { if (effectivePlant) localStorage.setItem('md1-active-plant', effectivePlant) } catch {}
    setUserContext({
      plantId: effectivePlant,
      displayName: p.displayName,
      orgId: m?.orgId,
      userId: p.userId,
      role: m?.role,
    })
    setActivePlantId(effectivePlant)
  }

  useEffect(() => {
    async function restore() {
      const s = getRestoredSession()
      if (s) {
        setSession(s)
        try {
          const p = await loadProfile(s.user.id)
          if (p) {
            setProfile(p)
            const membs = await fetchMemberships(s.user.id)
            setMemberships(membs)
            if (membs.length > 0) {
              const stored = getStoredActivePlant()
              const valid = membs.find(m => m.plantId === stored)
              activateContext(p, membs, valid ? stored : membs[0].plantId)
            } else {
              setUserContext({ displayName: p.displayName, userId: s.user.id })
            }
          }
        } catch (e) {
          console.error('restore failed', e)
        }
      }
      setLoading(false)
    }
    restore()
  }, [])

  function handleSwitchPlant(plantId) {
    if (!profile) return
    activateContext(profile, memberships, plantId)
  }

  function handleJoinedPlant(newMembership) {
    const updated = [...memberships, newMembership]
    setMemberships(updated)
    activateContext(profile, updated, newMembership.plantId)
  }

  async function handleLogout() {
    await signOut()
    clearUserContext()
    setSession(null)
    setProfile(null)
    setMemberships([])
    setActivePlantId(null)
    setPendingDisplayName('')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#062044', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.25)', border: '2px solid rgba(255,255,255,0.15)', padding: '8px 18px 10px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
          M/D/1
        </div>
      </div>
    )
  }

  const activeMembership = memberships.find(m => m.plantId === activePlantId)
  const currentUser = profile && activeMembership ? {
    displayName: profile.displayName,
    role: activeMembership.role,
    plantId: activeMembership.plantId,
    orgId: activeMembership.orgId,
    inviteCode: activeMembership.inviteCode,
    plantName: activeMembership.plantName,
  } : null

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />

        {/* Auth */}
        <Route
          path="/auth"
          element={
            !session ? (
              <Auth
                onSignedIn={async (user) => {
                  // Load all data before setting state to avoid mid-flight redirect
                  let p = null, membs = [], plantId = null
                  try {
                    p = await loadProfile(user.id)
                    if (p) {
                      membs = await fetchMemberships(user.id)
                      if (membs.length > 0) {
                        const stored = getStoredActivePlant()
                        const valid = membs.find(m => m.plantId === stored)
                        plantId = valid ? stored : membs[0].plantId
                        const m = membs.find(x => x.plantId === plantId)
                        try { localStorage.setItem('md1-active-plant', plantId) } catch {}
                        setUserContext({ plantId, displayName: p.displayName, orgId: m?.orgId, userId: user.id, role: m?.role })
                      } else {
                        setUserContext({ displayName: p.displayName, userId: user.id })
                      }
                    }
                  } catch (e) {
                    console.error('post-signin error', e)
                  }
                  // Batch all state updates together
                  setSession({ user })
                  setProfile(p)
                  setMemberships(membs)
                  setActivePlantId(plantId)
                }}
                onNeedsOnboarding={(user, displayName) => {
                  setSession({ user })
                  setPendingDisplayName(displayName || '')
                }}
              />
            ) : profile && activePlantId ? (
              <Navigate to="/app" replace />
            ) : profile ? (
              <Navigate to="/plants" replace />
            ) : (
              <Navigate to="/onboarding" replace />
            )
          }
        />

        {/* Onboarding — collect display name only */}
        <Route
          path="/onboarding"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : profile ? (
              <Navigate to="/plants" replace />
            ) : (
              <Onboarding
                userId={session.user.id}
                displayName={pendingDisplayName || session.user.email?.split('@')[0] || ''}
                onComplete={(p) => setProfile(p)}
              />
            )
          }
        />

        {/* Plants home — join or create plants */}
        <Route
          path="/plants"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profile ? (
              <Navigate to="/onboarding" replace />
            ) : (
              <PlantHome
                userId={session.user.id}
                profile={profile}
                memberships={memberships}
                onJoined={handleJoinedPlant}
                onSwitchPlant={handleSwitchPlant}
              />
            )
          }
        />

        {/* Protected app */}
        <Route
          path="/app"
          element={
            !session ? (
              <Navigate to="/auth" replace />
            ) : !profile ? (
              <Navigate to="/onboarding" replace />
            ) : (!activePlantId && !getStoredActivePlant()) ? (
              <Navigate to="/plants" replace />
            ) : (
              <KnowledgeBank
                key={activePlantId}
                user={currentUser}
                memberships={memberships}
                activePlantId={activePlantId}
                onSwitchPlant={handleSwitchPlant}
                onLogout={handleLogout}
              />
            )
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
