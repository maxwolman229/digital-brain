import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { FNT, FNTM, STATUSES, statusColor } from '../lib/constants.js'
import { useIsMobile } from '../lib/hooks.js'
import { fetchVocabulary, fetchNewCounts, fetchContributionCounts } from '../lib/db.js'
import { getStoredJwt } from '../lib/supabase.js'
import { getUserId } from '../lib/userContext.js'
import { Badge, PillFilter } from './shared.jsx'
import RulesView from './RulesView.jsx'
import AssertionsView from './AssertionsView.jsx'
import EventsView from './EventsView.jsx'
import QuestionsView from './QuestionsView.jsx'
import HealthDashboard from './HealthDashboard.jsx'
import RelationshipGraph from './RelationshipGraph.jsx'
import Notifications from './Notifications.jsx'
import QueryView from './QueryView.jsx'
import NarrativeInput from './NarrativeInput.jsx'
import PlantSettings from './PlantSettings.jsx'
import CaptureView from './CaptureView.jsx'
import ProfileView from './ProfileView.jsx'
import UserProfileModal from './UserProfileModal.jsx'
import DocumentIngestionView from './DocumentIngestionView.jsx'

const BEVCAN_PLANT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL

const TABS = [
  { id: 'query',      icon: '⌕', label: 'Ask the Bank' },
  { id: 'capture',    icon: '◈', label: 'Capture Knowledge' },
  { id: 'documents',  icon: '⌬', label: 'Document Ingestion', adminOnly: true },
  { id: 'questions',  icon: '?', label: 'Ask the Team' },
  { id: 'rules',      icon: '◆', label: 'Rules' },
  { id: 'assertions', icon: '◇', label: 'Assertions' },
  { id: 'events',     icon: '●', label: 'Events' },
  { id: 'health',     icon: '♥', label: 'Knowledge Health' },
  { id: 'graph',      icon: '⬡', label: 'Relationship Graph' },
]

const initials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}
const shortName = (name) => {
  if (!name) return 'You'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
}

export default function KnowledgeBank({ user, memberships, activePlantId, onSwitchPlant, onLogout, onPlantDeleted }) {
  const navigate = useNavigate()
  const [view, setView] = useState('rules')
  const [search, setSearch] = useState('')
  const [fStatus, setFStatus] = useState([])
  const [fCat, setFCat] = useState([])
  const [fProc, setFProc] = useState([])
  const [showProfile, setShowProfile] = useState(false)
  const [showPlantMenu, setShowPlantMenu] = useState(false)
  const [viewingUser, setViewingUser] = useState(null) // display name for UserProfileModal
  const [showPlantSettings, setShowPlantSettings] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [contributions, setContributions] = useState({ total: 0, rules: 0, assertions: 0, events: 0, questions: 0 })
  const [newCounts, setNewCounts] = useState({ rules: 0, assertions: 0, events: 0, questions: 0 })
  const [graphHighlight, setGraphHighlight] = useState(null)
  const [reportEventOpen, setReportEventOpen] = useState(false)
  const [addFormOpen, setAddFormOpen] = useState(false)
  const [narrativeOpen, setNarrativeOpen] = useState(false)
  const [vocabulary, setVocabulary] = useState({ processAreas: [], categories: [] })
  const notifRef = useRef(null)
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)

  const activeMembership = memberships.find(m => m.plantId === activePlantId)
  const isPlantAdmin = user?.role === 'admin'

  async function refreshVocabulary() {
    const v = await fetchVocabulary(activePlantId, activeMembership?.processAreas || [])
    setVocabulary(v)
  }

  async function refreshAll() {
    await refreshVocabulary()
    if (activePlantId) fetchContributionCounts(activePlantId).then(setContributions).catch(() => {})
  }

  useEffect(() => { refreshVocabulary() }, [activePlantId])

  useEffect(() => {
    if (activePlantId) fetchContributionCounts(activePlantId).then(setContributions).catch(() => {})
  }, [activePlantId])

  useEffect(() => {
    if (!isPlantAdmin || activePlantId !== BEVCAN_PLANT_ID) { setPendingCount(0); return }
    const jwt = getStoredJwt()
    if (!jwt) return
    fetch(`${SUPABASE_URL}/functions/v1/bevcan-admin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list' }),
    })
      .then(r => r.json())
      .then(({ applications }) => {
        setPendingCount((applications || []).filter(a => a.status === 'pending').length)
      })
      .catch(() => {})
  }, [activePlantId, isPlantAdmin])

  const BADGE_TABS = ['rules', 'assertions', 'events', 'questions']

  function getLastViewed(plantId) {
    try {
      const raw = localStorage.getItem(`md1_lastViewed_${plantId}`)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  function markViewed(plantId, tab) {
    try {
      const current = getLastViewed(plantId) || {}
      current[tab] = new Date().toISOString()
      localStorage.setItem(`md1_lastViewed_${plantId}`, JSON.stringify(current))
    } catch {}
  }

  useEffect(() => {
    if (!activePlantId) return
    const lastViewed = getLastViewed(activePlantId)
    if (!lastViewed) return // first ever visit — no badges until user has context
    fetchNewCounts(activePlantId, lastViewed).then(setNewCounts).catch(() => {})
  }, [activePlantId])

  const tog = (arr, setArr, v) => setArr(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])

  function switchView(v) {
    setMenuOpen(false)
    setView(v)
    setSearch('')
    setFStatus([])
    setFCat([])
    setFProc([])
    setAddFormOpen(false)
    setReportEventOpen(false)
    if (activePlantId && BADGE_TABS.includes(v)) {
      markViewed(activePlantId, v)
      setNewCounts(prev => ({ ...prev, [v]: 0 }))
    }
  }

  const showSearch = view === 'rules' || view === 'assertions'
  const showFilters = view === 'rules' || view === 'assertions'
  const hasFilters = fStatus.length > 0 || fCat.length > 0 || fProc.length > 0

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FFFFFF', color: 'var(--md1-text)', fontFamily: FNT }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.1)', padding: isMobile ? '0 12px' : '10px 24px', minHeight: isMobile ? 52 : 'auto', display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 16, background: 'var(--md1-primary)' }}>

        {/* Logo */}
        <div
          onClick={() => switchView('query')}
          style={{ position: 'relative', flexShrink: 0, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', fontFamily: FNT, letterSpacing: 3, border: '1.5px solid rgba(255,255,255,0.85)', padding: '3px 9px 4px', lineHeight: 1 }}>
            M/D/1
          </div>
          <span style={{
            position: 'absolute', top: -7, right: -22,
            fontSize: 7, fontWeight: 700, letterSpacing: 0.8,
            background: 'var(--md1-accent)', color: '#fff',
            padding: '2px 5px', borderRadius: 2,
            fontFamily: FNT, textTransform: 'uppercase',
          }}>
            BETA
          </span>
        </div>

        {/* Plant switcher — desktop only */}
        {!isMobile && <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => { setShowPlantMenu(p => !p); setShowProfile(false); notifRef.current?.close() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 3, fontSize: 11,
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.9)', cursor: 'pointer', fontFamily: FNT, fontWeight: 600,
              maxWidth: 200,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.plantName || 'Select Plant'}
            </span>
            <span style={{ opacity: 0.5, fontSize: 9, flexShrink: 0 }}>▼</span>
          </button>

          {showPlantMenu && (
            <div style={{
              position: 'absolute', top: 36, left: 0, minWidth: 220,
              background: '#fff', border: '1px solid #e8e4e0', borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 999,
              overflow: 'hidden',
            }}>
              {memberships.map(m => (
                <button
                  key={m.plantId}
                  onClick={() => { onSwitchPlant(m.plantId); setShowPlantMenu(false); navigate('/app') }}
                  style={{
                    display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left',
                    background: m.plantId === activePlantId ? '#f0f4fb' : 'transparent',
                    border: 'none', cursor: 'pointer', fontFamily: FNT,
                    borderBottom: '1px solid #f0eeec',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: m.plantId === activePlantId ? 700 : 500, color: 'var(--md1-primary)' }}>
                    {m.plantId === activePlantId ? '◆ ' : ''}{m.plantName}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--md1-muted)', marginTop: 1 }}>{m.orgName} · {m.role}</div>
                  {m.industry && <div style={{ fontSize: 9, color: 'var(--md1-muted-light)', marginTop: 1 }}>{m.industry}</div>}
                </button>
              ))}
              <div style={{ borderTop: '1px solid #e8e4e0' }}>
                <button
                  onClick={() => { setShowPlantMenu(false); setShowPlantSettings(true) }}
                  style={{ display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FNT, fontSize: 11, color: '#5a5550' }}
                >
                  ⚙ Members{pendingCount > 0 ? ` (${pendingCount})` : ''}
                </button>
                <button
                  onClick={() => { setShowPlantMenu(false); navigate('/plants') }}
                  style={{ display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FNT, fontSize: 11, color: '#5a5550' }}
                >
                  + Create a Plant
                </button>
              </div>
            </div>
          )}
        </div>}

        {/* Settings button — all members, desktop only */}
        {!isMobile && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => { setShowPlantSettings(true); setShowPlantMenu(false) }}
              title="Members"
              style={{
                position: 'relative', padding: '5px 9px', borderRadius: 3, fontSize: 13,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.75)', cursor: 'pointer', lineHeight: 1,
              }}
            >
              ⚙
              {pendingCount > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -5,
                  minWidth: 15, height: 15, background: '#e74c3c', color: '#fff',
                  borderRadius: 8, fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px', fontFamily: FNT,
                }}>
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Search — only on rules/assertions views, desktop only */}
        {!isMobile && showSearch && (
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <input
              placeholder="Search rules, tags, scope…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '6px 10px 6px 30px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 3,
                fontSize: 11, color: '#fff',
                fontFamily: FNT,
                outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.45)', fontSize: 13, pointerEvents: 'none' }}>⌕</span>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Desktop right-side controls */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(view === 'rules' || view === 'assertions') && (
              <button
                onClick={() => setAddFormOpen(true)}
                style={{ padding: '6px 13px', borderRadius: 3, fontSize: 11, background: '#FFFFFF', border: 'none', color: 'var(--md1-primary)', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.4 }}
              >
                + Add {view === 'assertions' ? 'Assertion' : 'Rule'}
              </button>
            )}
            <button
              onClick={() => { switchView('events'); setReportEventOpen(true) }}
              style={{ padding: '6px 13px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.4 }}
            >
              + Report Event
            </button>
            <button
              onClick={() => setNarrativeOpen(true)}
              style={{ padding: '6px 13px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid rgba(242,101,47,0.6)', color: '#F2652F', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.4 }}
            >
              + Narrative Input
            </button>

            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />

            {isPlantAdmin && (
              <button
                onClick={() => navigate('/admin')}
                title="Admin Dashboard"
                style={{ padding: '5px 10px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: FNT }}
              >
                ⚙ Admin
              </button>
            )}

            <Notifications
              ref={notifRef}
              light
              onNavigate={switchView}
              onOpen={() => setShowProfile(false)}
              userId={getUserId()}
              plantId={activePlantId}
            />

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowProfile(p => !p); notifRef.current?.close() }}
                style={{ padding: '5px 10px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontFamily: FNT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                  {initials(user?.displayName)}
                </div>
                {shortName(user?.displayName)}
              </button>
              {showProfile && (
                <div style={{ position: 'absolute', top: 38, right: 0, width: 240, background: '#fff', border: '1px solid #e8e4e0', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 999, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #e8e4e0', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--md1-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                      {initials(user?.displayName)}
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--md1-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.displayName || 'You'}</div>
                      <div style={{ fontSize: 10, color: 'var(--md1-muted)', fontFamily: FNT, textTransform: 'capitalize' }}>{user?.role || 'Member'}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowProfile(false); switchView('profile') }}
                    style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid #f0eeec', cursor: 'pointer', fontFamily: FNT, fontSize: 12, color: 'var(--md1-text)' }}
                  >
                    ◉ My Profile
                  </button>
                  <button
                    onClick={() => { setShowProfile(false); onLogout?.() }}
                    style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FNT, fontSize: 12, color: '#c0392b' }}
                  >
                    ← Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mobile right-side: notification bell + hamburger */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Notifications
              ref={notifRef}
              light
              onNavigate={v => { switchView(v) }}
              onOpen={() => {}}
              userId={getUserId()}
              plantId={activePlantId}
            />
            <button
              onClick={() => setMenuOpen(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#FFFFFF', fontSize: 22, lineHeight: 1,
                minWidth: 44, minHeight: 44,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Open menu"
            >
              ≡
            </button>
          </div>
        )}
      </div>

      {/* ── Summary bar — desktop only ── */}
      {!isMobile && <div style={{ flexShrink: 0, padding: '12px 28px', display: 'flex', gap: 24, borderBottom: '1px solid #e8e4e0', fontSize: 11, fontFamily: FNT, color: 'var(--md1-muted-light)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span><span style={{ color: '#F2652F', fontWeight: 700 }}>{contributions.total}</span> Contributions</span>
        <span style={{ color: 'var(--md1-border)' }}>│</span>
        <span><span style={{ color: 'var(--md1-primary)', fontWeight: 600 }}>{contributions.rules}</span> Rules</span>
        <span><span style={{ color: 'var(--md1-primary)', fontWeight: 600 }}>{contributions.assertions}</span> Assertions</span>
        <span><span style={{ color: 'var(--md1-primary)', fontWeight: 600 }}>{contributions.events}</span> Events</span>
        <span><span style={{ color: 'var(--md1-primary)', fontWeight: 600 }}>{contributions.questions}</span> Questions</span>
      </div>}

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar — desktop only ── */}
        {!isMobile && <div style={{ width: 220, borderRight: '1px solid #e8e4e0', padding: '20px 16px', flexShrink: 0, overflowY: 'auto', background: 'var(--md1-section-bg)' }}>

          {/* Nav tabs */}
          <div style={{ marginBottom: 24 }}>
            {TABS.filter(t => !t.adminOnly || isPlantAdmin).map(tab => {
              const countKey = tab.id === 'questions' ? 'questions' : tab.id.replace(/s$/, '') + 's'
              // map tab id → newCounts key: rules→rules, assertions→assertions, events→events, questions→questions
              const badgeCount = BADGE_TABS.includes(tab.id) ? (newCounts[tab.id] || 0) : 0
              return (
                <button
                  key={tab.id}
                  onClick={() => switchView(tab.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '8px 12px', marginBottom: 2,
                    borderRadius: 3, fontSize: 12, fontWeight: view === tab.id ? 700 : 400,
                    background: view === tab.id ? '#f0eeec' : 'transparent',
                    color: view === tab.id ? 'var(--md1-primary)' : '#555',
                    border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FNT,
                    boxSizing: 'border-box',
                  }}
                >
                  <span>{tab.icon} {tab.label}</span>
                  {badgeCount > 0 && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 18, height: 18, padding: '0 5px',
                      background: 'var(--md1-accent)', color: '#fff',
                      borderRadius: 9, fontSize: 9, fontWeight: 700, fontFamily: FNT,
                      flexShrink: 0,
                    }}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Filters */}
          {showFilters && (
            <>
              <PillFilter
                label="Status"
                options={STATUSES}
                selected={fStatus}
                onToggle={v => tog(fStatus, setFStatus, v)}
                colorFn={statusColor}
              />
              {vocabulary.categories.length > 0 && (
                <PillFilter
                  label="Category"
                  options={vocabulary.categories}
                  selected={fCat}
                  onToggle={v => tog(fCat, setFCat, v)}
                />
              )}
              {vocabulary.processAreas.length > 0 && (
                <PillFilter
                  label="Process Area"
                  options={vocabulary.processAreas}
                  selected={fProc}
                  onToggle={v => tog(fProc, setFProc, v)}
                />
              )}
              {hasFilters && (
                <button
                  onClick={() => { setFStatus([]); setFCat([]); setFProc([]) }}
                  style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--md1-accent)', fontSize: 11, cursor: 'pointer', fontFamily: FNT }}
                >
                  ✕ Clear filters
                </button>
              )}
            </>
          )}

          {view === 'query' && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--md1-accent)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12, fontFamily: FNT, fontWeight: 700 }}>ASK THE KNOWLEDGE BANK</div>
              <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, lineHeight: 1.7 }}>
                Tell the system what you're about to do. Answers come strictly from the validated knowledge bank.
              </div>
            </div>
          )}

          {view === 'capture' && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--md1-accent)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12, fontFamily: FNT, fontWeight: 700 }}>KNOWLEDGE CAPTURE</div>
              <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, lineHeight: 1.7 }}>
                Adaptive interview — the system asks one question at a time, extracts rules and assertions from your answers, then presents them for review.
              </div>
            </div>
          )}
        </div>}

        {/* ── Main content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {view === 'rules' && (
            <RulesView
              key={activePlantId}
              search={search}
              fStatus={fStatus}
              fCat={fCat}
              fProc={fProc}

              addFormOpen={addFormOpen}
              onAddFormClose={() => setAddFormOpen(false)}
              onViewInGraph={(type, id) => { switchView('graph'); setGraphHighlight(id) }}
              processAreas={vocabulary.processAreas}
              categories={vocabulary.categories}
              onItemSaved={refreshAll}
              onViewProfile={name => setViewingUser(name)}
              plantId={activePlantId}
            />
          )}

          {view === 'assertions' && (
            <AssertionsView
              key={activePlantId}
              search={search}
              fStatus={fStatus}
              fCat={fCat}
              fProc={fProc}
              addFormOpen={addFormOpen}
              onAddFormClose={() => setAddFormOpen(false)}
              onViewInGraph={(type, id) => { switchView('graph'); setGraphHighlight(id) }}
              processAreas={vocabulary.processAreas}
              categories={vocabulary.categories}
              onItemSaved={refreshAll}
              onViewProfile={name => setViewingUser(name)}
              plantId={activePlantId}
            />
          )}

          {view === 'events' && (
            <EventsView
              key={activePlantId}
              reportOpen={reportEventOpen}
              onReportClose={() => setReportEventOpen(false)}
              processAreas={vocabulary.processAreas}
              industry={activeMembership?.industry}
              plantId={activePlantId}
              onItemSaved={refreshAll}
              onViewProfile={name => setViewingUser(name)}
            />
          )}

          {view === 'questions' && (
            <QuestionsView
              key={activePlantId}
              processAreas={vocabulary.processAreas}
              industry={activeMembership?.industry}
              onItemSaved={refreshAll}
              onViewProfile={name => setViewingUser(name)}
            />
          )}

          {view === 'health' && <HealthDashboard key={activePlantId} onNavigate={switchView} onViewProfile={name => setViewingUser(name)} />}

          {view === 'graph' && (
            <RelationshipGraph
              key={activePlantId}
              onNavigate={switchView}
              highlightId={graphHighlight}
              onClearHighlight={() => setGraphHighlight(null)}
              processAreas={vocabulary.processAreas}
              categories={vocabulary.categories}
              onViewProfile={name => setViewingUser(name)}
            />
          )}

          {view === 'query' && <QueryView key={activePlantId} onNavigate={switchView} industry={activeMembership?.industry} plantId={activePlantId} onViewProfile={name => setViewingUser(name)} />}

          {view === 'capture' && (
            <CaptureView
              key={activePlantId}
              processAreas={vocabulary.processAreas}
              industry={activeMembership?.industry}
              plantName={activeMembership?.plantName || user?.plantName}
              plantId={activePlantId}
              onNavigate={switchView}
              onItemSaved={refreshAll}
            />
          )}

          {view === 'profile' && (
            <ProfileView
              user={user}
              plantId={activePlantId}
              memberships={memberships}
              onNavigate={switchView}
            />
          )}

          {view === 'documents' && isPlantAdmin && (
            <DocumentIngestionView
              key={activePlantId}
              plantId={activePlantId}
              processAreas={vocabulary.processAreas}
            />
          )}

          {view !== 'rules' && view !== 'assertions' && view !== 'events' && view !== 'questions' && view !== 'health' && view !== 'graph' && view !== 'query' && view !== 'capture' && view !== 'profile' && view !== 'documents' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 32, color: 'var(--md1-border)' }}>{TABS.find(t => t.id === view)?.icon}</div>
              <div style={{ fontSize: 13, color: 'var(--md1-muted-light)', fontFamily: FNT }}>{TABS.find(t => t.id === view)?.label} — coming soon</div>
            </div>
          )}
        </div>
      </div>

      <NarrativeInput
        open={narrativeOpen}
        onClose={() => setNarrativeOpen(false)}
        onCreated={() => {}}
        processAreas={vocabulary.processAreas}
        categories={vocabulary.categories}
        industry={activeMembership?.industry}
        onItemSaved={refreshVocabulary}
        plantId={activePlantId}
      />

      {showPlantSettings && user && (
        <PlantSettings
          membership={{
            plantId: user.plantId,
            plantName: user.plantName,
            orgId: user.orgId,
            orgName: activeMembership?.orgName || '',
            role: user.role,
            industry: activeMembership?.industry || '',
          }}
          isPlantAdmin={isPlantAdmin}
          onPendingCountChange={setPendingCount}
          onClose={() => setShowPlantSettings(false)}
          onDeleted={(deletedId) => { setShowPlantSettings(false); onPlantDeleted?.(deletedId); navigate('/plants') }}
        />
      )}

      {/* Backdrop to close plant menu */}
      {showPlantMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowPlantMenu(false)} />
      )}

      {/* ── Mobile hamburger overlay ── */}
      {isMobile && menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'var(--md1-section-bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Overlay header */}
          <div style={{ flexShrink: 0, padding: '0 16px', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--md1-primary)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', fontFamily: FNT, letterSpacing: 0.5 }}>
              {user?.plantName || 'Navigation'}
            </div>
            <button
              onClick={() => setMenuOpen(false)}
              style={{ background: 'none', border: 'none', color: '#FFFFFF', fontSize: 22, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >✕</button>
          </div>

          {/* Overlay body — scrollable */}
          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

            {/* Action buttons — always at the top */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e8e4e0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(view === 'rules' || view === 'assertions') && (
                <button
                  onClick={() => { setAddFormOpen(true); setMenuOpen(false) }}
                  style={{ padding: '13px 16px', minHeight: 48, borderRadius: 4, fontSize: 13, background: 'var(--md1-primary)', border: 'none', color: '#FFFFFF', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, textAlign: 'left' }}
                >
                  + Add {view === 'assertions' ? 'Assertion' : 'Rule'}
                </button>
              )}
              <button
                onClick={() => { switchView('events'); setReportEventOpen(true); setMenuOpen(false) }}
                style={{ padding: '13px 16px', minHeight: 48, borderRadius: 4, fontSize: 13, background: 'transparent', border: '1px solid var(--md1-border)', color: '#333', cursor: 'pointer', fontFamily: FNT, fontWeight: 600, textAlign: 'left' }}
              >
                + Report Event
              </button>
              <button
                onClick={() => { setNarrativeOpen(true); setMenuOpen(false) }}
                style={{ padding: '13px 16px', minHeight: 48, borderRadius: 4, fontSize: 13, background: 'transparent', border: '1px solid rgba(242,101,47,0.4)', color: '#F2652F', cursor: 'pointer', fontFamily: FNT, fontWeight: 600, textAlign: 'left' }}
              >
                + Narrative Input
              </button>
              <button
                onClick={() => { switchView('capture'); setMenuOpen(false) }}
                style={{ padding: '13px 16px', minHeight: 48, borderRadius: 4, fontSize: 13, background: 'transparent', border: '1px solid rgba(var(--md1-accent-rgb),0.5)', color: 'var(--md1-accent)', cursor: 'pointer', fontFamily: FNT, fontWeight: 600, textAlign: 'left' }}
              >
                ◈ Capture Knowledge
              </button>
            </div>

            {/* Search — if on rules/assertions view */}
            {showSearch && (
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #e8e4e0' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    placeholder="Search rules, tags, scope…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '10px 12px 10px 32px', minHeight: 44,
                      background: '#FFFFFF', border: '1px solid var(--md1-border)', borderRadius: 4,
                      fontSize: 13, color: 'var(--md1-text)', fontFamily: FNT, outline: 'none',
                    }}
                  />
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--md1-muted-light)', fontSize: 15, pointerEvents: 'none' }}>⌕</span>
                </div>
              </div>
            )}

            {/* Nav tabs (capture is an action, not a tab here) */}
            <div style={{ padding: '8px 0', borderBottom: '1px solid #e8e4e0' }}>
              {TABS.filter(tab => tab.id !== 'capture' && (!tab.adminOnly || isPlantAdmin)).map(tab => {
                const badgeCount = BADGE_TABS.includes(tab.id) ? (newCounts[tab.id] || 0) : 0
                return (
                  <button
                    key={tab.id}
                    onClick={() => { switchView(tab.id); setMenuOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '12px 20px', minHeight: 52,
                      background: view === tab.id ? '#f0eeec' : 'transparent',
                      border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FNT,
                      fontSize: 14, fontWeight: view === tab.id ? 700 : 400,
                      color: view === tab.id ? 'var(--md1-primary)' : '#333',
                      boxSizing: 'border-box',
                    }}
                  >
                    <span>{tab.icon} {tab.label}</span>
                    {badgeCount > 0 && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 20, height: 20, padding: '0 5px',
                        background: 'var(--md1-accent)', color: '#fff',
                        borderRadius: 10, fontSize: 10, fontWeight: 700, fontFamily: FNT,
                      }}>
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Filters — if on rules/assertions view */}
            {showFilters && (
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #e8e4e0' }}>
                <PillFilter label="Status" options={STATUSES} selected={fStatus} onToggle={v => tog(fStatus, setFStatus, v)} colorFn={statusColor} />
                {vocabulary.categories.length > 0 && (
                  <PillFilter label="Category" options={vocabulary.categories} selected={fCat} onToggle={v => tog(fCat, setFCat, v)} />
                )}
                {vocabulary.processAreas.length > 0 && (
                  <PillFilter label="Process Area" options={vocabulary.processAreas} selected={fProc} onToggle={v => tog(fProc, setFProc, v)} />
                )}
                {hasFilters && (
                  <button
                    onClick={() => { setFStatus([]); setFCat([]); setFProc([]) }}
                    style={{ marginTop: 4, background: 'none', border: 'none', color: 'var(--md1-accent)', fontSize: 12, cursor: 'pointer', fontFamily: FNT, minHeight: 36, padding: '4px 0' }}
                  >
                    ✕ Clear filters
                  </button>
                )}
              </div>
            )}

            {/* Plant switcher */}
            {memberships.length > 0 && (
              <div style={{ padding: '12px 0', borderBottom: '1px solid #e8e4e0' }}>
                {memberships.map(m => (
                  <button
                    key={m.plantId}
                    onClick={() => { onSwitchPlant(m.plantId); setMenuOpen(false); navigate('/app') }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '10px 20px', minHeight: 48,
                      background: m.plantId === activePlantId ? '#f0f4fb' : 'transparent',
                      border: 'none', cursor: 'pointer', fontFamily: FNT, textAlign: 'left',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: m.plantId === activePlantId ? 700 : 500, color: 'var(--md1-primary)' }}>
                        {m.plantId === activePlantId ? '◆ ' : ''}{m.plantName}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--md1-muted)', marginTop: 1 }}>{m.orgName} · {m.role}</div>
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => { setMenuOpen(false); navigate('/plants') }}
                  style={{ display: 'block', width: '100%', padding: '10px 20px', minHeight: 48, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FNT, fontSize: 13, color: 'var(--md1-accent)', fontWeight: 600 }}
                >
                  + Create a Plant
                </button>
              </div>
            )}

            {/* Profile & settings */}
            <div style={{ padding: '8px 0' }}>
              <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f0eeec' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--md1-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {initials(user?.displayName)}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--md1-primary)', fontFamily: FNT }}>{user?.displayName}</div>
                  <div style={{ fontSize: 10, color: 'var(--md1-muted)', textTransform: 'capitalize' }}>{user?.role}</div>
                </div>
              </div>
              <button
                onClick={() => { switchView('profile'); setMenuOpen(false) }}
                style={{ display: 'block', width: '100%', padding: '13px 20px', minHeight: 48, textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid #f0eeec', cursor: 'pointer', fontFamily: FNT, fontSize: 13, color: 'var(--md1-text)' }}
              >
                ◉ My Profile
              </button>
              <button
                onClick={() => { setShowPlantSettings(true); setMenuOpen(false) }}
                style={{ display: 'block', width: '100%', padding: '13px 20px', minHeight: 48, textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid #f0eeec', cursor: 'pointer', fontFamily: FNT, fontSize: 13, color: 'var(--md1-text)' }}
              >
                ⚙ Members{pendingCount > 0 ? ` (${pendingCount})` : ''}
              </button>
              {isPlantAdmin && (
                <button
                  onClick={() => { navigate('/admin'); setMenuOpen(false) }}
                  style={{ display: 'block', width: '100%', padding: '13px 20px', minHeight: 48, textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid #f0eeec', cursor: 'pointer', fontFamily: FNT, fontSize: 13, color: '#5a5550' }}
                >
                  ⚙ Admin Dashboard
                </button>
              )}
              <button
                onClick={() => { setMenuOpen(false); onLogout?.() }}
                style={{ display: 'block', width: '100%', padding: '13px 20px', minHeight: 48, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FNT, fontSize: 13, color: '#c0392b', fontWeight: 600 }}
              >
                ← Log Out
              </button>
            </div>

          </div>
        </div>
      )}

      {/* User profile modal (opened by clicking any username in the app) */}
      {viewingUser && (
        <UserProfileModal
          displayName={viewingUser}
          plantId={activePlantId}
          onClose={() => setViewingUser(null)}
          onNavigate={switchView}
        />
      )}
    </div>
  )
}
