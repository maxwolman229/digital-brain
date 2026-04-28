import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { loadProfile, signOut, getRestoredSession, fetchMemberships } from './lib/auth.js'
import { setUserContext, clearUserContext, getStoredActivePlant } from './lib/userContext.js'
import { setAuthExpiredHandler, storeJwt, storeRefreshToken } from './lib/supabase.js'
import LandingPage from './components/LandingPage.jsx'
import Auth from './components/Auth.jsx'
import Onboarding from './components/Onboarding.jsx'
import PlantHome from './components/PlantHome.jsx'
import KnowledgeBank from './components/KnowledgeBank.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import BevCanSignup from './components/BevCanSignup.jsx'
import BevCanPending from './components/BevCanPending.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import ResetPassword from './components/ResetPassword.jsx'
import AcceptInvite from './components/AcceptInvite.jsx'


export default function App() {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [activePlantId, setActivePlantId] = useState(null)
  const [pendingDisplayName, setPendingDisplayName] = useState('')
  const [recoveryToken, setRecoveryToken] = useState(null)

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
    // When token refresh fails mid-session, force logout so the user re-authenticates
    setAuthExpiredHandler(() => {
      clearUserContext()
      setSession(null)
      setProfile(null)
      setMemberships([])
      setActivePlantId(null)
    })

    // Detect Supabase tokens in URL hash (#access_token=...&type=recovery|invite)
    const hash = window.location.hash.substring(1)
    if (hash) {
      const params = new URLSearchParams(hash)
      const tokenType = params.get('type')
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (tokenType === 'recovery' && accessToken) {
        setRecoveryToken(accessToken)
        window.history.replaceState(null, '', window.location.pathname)
        setLoading(false)
        return
      }

      // Invite link: user clicked the magic link from an admin invite.
      // They have a valid session but no password — route to "set password" then onboarding.
      if (tokenType === 'invite' && accessToken) {
        setRecoveryToken(accessToken) // reuse recovery flow for password setting
        storeJwt(accessToken)
        if (refreshToken) storeRefreshToken(refreshToken)
        window.history.replaceState(null, '', window.location.pathname)
        setLoading(false)
        return
      }
    }

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

    // When user returns to an idle tab, check if the JWT is still valid.
    // If it has expired, force logout so they see the login screen instead of broken state.
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        const s = getRestoredSession()
        if (!s) {
          // JWT expired while tab was hidden
          clearUserContext()
          setSession(null)
          setProfile(null)
          setMemberships([])
          setActivePlantId(null)
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
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

  function handlePlantDeleted(deletedPlantId) {
    const updated = memberships.filter(m => m.plantId !== deletedPlantId)
    setMemberships(updated)
    if (activePlantId === deletedPlantId) {
      setActivePlantId(null)
      try { localStorage.removeItem('md1-active-plant') } catch {}
    }
  }

  // Re-load session/profile/memberships from storage. Used by AcceptInvite
  // after a recipient signs up or logs in and accepts an invite.
  async function handleAuthChange() {
    const s = getRestoredSession()
    if (!s) return
    setSession(s)
    try {
      const p = await loadProfile(s.user.id)
      if (p) {
        setProfile(p)
        const membs = await fetchMemberships(s.user.id)
        setMemberships(membs)
        if (membs.length > 0) {
          const newest = membs[membs.length - 1]
          activateContext(p, membs, newest.plantId)
        }
      }
    } catch (e) {
      console.error('[handleAuthChange] error:', e.message)
    }
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
      <div style={{ minHeight: '100vh', background: 'var(--md1-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

  // Password recovery flow — show reset form regardless of route
  if (recoveryToken) {
    return (
      <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<ResetPassword accessToken={recoveryToken} />} />
        </Routes>
      </BrowserRouter>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage loggedInAs={profile?.displayName ?? null} onLogout={handleLogout} />} />

        {/* Auth */}
        <Route
          path="/auth"
          element={
            !session ? (
              <Auth
                onSignedIn={async (user) => {
                  console.log('[App.onSignedIn] start, userId:', user?.id)
                  // Load everything before setting state to avoid mid-flight redirects
                  let p = null, membs = [], plantId = null
                  try {
                    console.log('[App.onSignedIn] loading profile...')
                    p = await loadProfile(user.id)
                    console.log('[App.onSignedIn] profile:', p?.displayName ?? 'null')
                    if (p) {
                      console.log('[App.onSignedIn] fetching memberships...')
                      membs = await fetchMemberships(user.id)
                      console.log('[App.onSignedIn] memberships:', membs.length, membs.map(m => m.plantName))
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
                    console.error('[App.onSignedIn] error:', e.name, e.message)
                  }
                  console.log('[App.onSignedIn] done — setting session, profile, memberships')
                  // Batch all state updates together to avoid mid-flight redirects
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
                email={session.user.email}
                profile={profile}
                memberships={memberships}
                onJoined={handleJoinedPlant}
                onSwitchPlant={handleSwitchPlant}
                onMembershipsChanged={setMemberships}
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
            ) : memberships.length === 0 ? (
              <Navigate to="/plants" replace />
            ) : !activeMembership ? (
              // activePlantId is stale/invalid — activate first valid membership
              (() => {
                activateContext(profile, memberships, memberships[0].plantId)
                return null
              })()
            ) : (
              <KnowledgeBank
                key={activePlantId}
                user={currentUser}
                memberships={memberships}
                activePlantId={activePlantId}
                onSwitchPlant={handleSwitchPlant}
                onLogout={handleLogout}
                onPlantDeleted={handlePlantDeleted}
              />
            )
          }
        />

        {/* BevCan public knowledge bank */}
        <Route
          path="/bevcan"
          element={
            <BevCanSignup
              session={session}
              profile={profile}
              memberships={memberships}
              onSwitchToBevCan={() => {
                handleSwitchPlant('dddddddd-dddd-dddd-dddd-dddddddddddd')
              }}
              onSignedIn={async (user) => {
                let p = null, membs = [], plantId = null
                try {
                  p = await loadProfile(user.id)
                  if (p) {
                    membs = await fetchMemberships(user.id)
                    if (membs.length > 0) {
                      const bevcanId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
                      const hasBevCan = membs.some(m => m.plantId === bevcanId)
                      plantId = hasBevCan ? bevcanId : membs[0].plantId
                      const m = membs.find(x => x.plantId === plantId)
                      try { localStorage.setItem('md1-active-plant', plantId) } catch {}
                      setUserContext({ plantId, displayName: p.displayName, orgId: m?.orgId, userId: user.id, role: m?.role })
                    } else {
                      setUserContext({ displayName: p.displayName, userId: user.id })
                    }
                  }
                } catch (e) {
                  console.error('bevcan post-signin error', e)
                }
                setSession({ user })
                setProfile(p)
                setMemberships(membs)
                setActivePlantId(plantId)
              }}
            />
          }
        />

        <Route path="/bevcan/pending" element={<BevCanPending />} />

        {/* Plant invite acceptance */}
        <Route path="/accept-invite" element={
          <AcceptInvite session={session} onAuthChange={handleAuthChange} />
        } />

        {/* Admin dashboard — plant admins */}
        <Route
          path="/admin"
          element={
            !session ? <Navigate to="/auth" replace />
            : !memberships.some(m => m.role === 'admin') ? <Navigate to="/app" replace />
            : <AdminDashboard />
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
