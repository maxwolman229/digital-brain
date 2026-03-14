import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { FNT, FNTM, STATUSES, statusColor } from '../lib/constants.js'
import { fetchVocabulary } from '../lib/db.js'
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

const TABS = [
  { id: 'query',      icon: '⌕', label: 'Query' },
  { id: 'rules',      icon: '◆', label: 'Rules' },
  { id: 'assertions', icon: '◇', label: 'Assertions' },
  { id: 'events',     icon: '●', label: 'Events' },
  { id: 'health',     icon: '♥', label: 'Knowledge Health' },
  { id: 'graph',      icon: '⬡', label: 'Relationship Graph' },
  { id: 'questions',  icon: '?', label: 'Open Questions' },
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

export default function KnowledgeBank({ user, memberships, activePlantId, onSwitchPlant, onLogout }) {
  const navigate = useNavigate()
  const [view, setView] = useState('rules')
  const [search, setSearch] = useState('')
  const [fStatus, setFStatus] = useState([])
  const [fCat, setFCat] = useState([])
  const [fProc, setFProc] = useState([])
  const [showProfile, setShowProfile] = useState(false)
  const [showPlantMenu, setShowPlantMenu] = useState(false)
  const [showPlantSettings, setShowPlantSettings] = useState(false)
  const [ruleCounts, setRuleCounts] = useState({ total: 0, byStatus: {} })
  const [graphHighlight, setGraphHighlight] = useState(null)
  const [reportEventOpen, setReportEventOpen] = useState(false)
  const [addFormOpen, setAddFormOpen] = useState(false)
  const [narrativeOpen, setNarrativeOpen] = useState(false)
  const [vocabulary, setVocabulary] = useState({ processAreas: [], categories: [] })
  const notifRef = useRef(null)

  const activeMembership = memberships.find(m => m.plantId === activePlantId)

  async function refreshVocabulary() {
    const v = await fetchVocabulary(activePlantId, activeMembership?.processAreas || [])
    setVocabulary(v)
  }

  useEffect(() => { refreshVocabulary() }, [activePlantId])

  const tog = (arr, setArr, v) => setArr(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])

  function switchView(v) {
    setView(v)
    setSearch('')
    setFStatus([])
    setFCat([])
    setFProc([])
  }

  const showSearch = view === 'rules' || view === 'assertions'
  const showFilters = view === 'rules' || view === 'assertions'
  const hasFilters = fStatus.length > 0 || fCat.length > 0 || fProc.length > 0

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FFFFFF', color: '#1F1F1F', fontFamily: FNT }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 16, background: '#062044' }}>

        {/* Logo */}
        <div style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', fontFamily: FNT, letterSpacing: 3, border: '1.5px solid rgba(255,255,255,0.85)', padding: '3px 9px 4px', lineHeight: 1, flexShrink: 0 }}>
          M/D/1
        </div>

        {/* Plant switcher */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
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
                  <div style={{ fontSize: 12, fontWeight: m.plantId === activePlantId ? 700 : 500, color: '#062044' }}>
                    {m.plantId === activePlantId ? '◆ ' : ''}{m.plantName}
                  </div>
                  <div style={{ fontSize: 10, color: '#8a8278', marginTop: 1 }}>{m.orgName} · {m.role}</div>
                </button>
              ))}
              <div style={{ borderTop: '1px solid #e8e4e0' }}>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => { setShowPlantMenu(false); setShowPlantSettings(true) }}
                    style={{ display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FNT, fontSize: 11, color: '#5a5550' }}
                  >
                    ⚙ Plant Settings
                  </button>
                )}
                <button
                  onClick={() => { setShowPlantMenu(false); navigate('/plants') }}
                  style={{ display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FNT, fontSize: 11, color: '#5a5550' }}
                >
                  + Join or Create Plant
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Search — only on rules/assertions views */}
        {showSearch && (
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

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          <button
            onClick={() => setAddFormOpen(true)}
            style={{ padding: '6px 13px', borderRadius: 3, fontSize: 11, background: '#FFFFFF', border: 'none', color: '#062044', cursor: 'pointer', fontFamily: FNT, fontWeight: 800, letterSpacing: 0.4 }}
          >
            + Add {view === 'assertions' ? 'Assertion' : 'Rule'}
          </button>

          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.15)', margin: '0 2px' }} />

          {/* Notification bell */}
          <Notifications
            ref={notifRef}
            light
            onNavigate={switchView}
            onOpen={() => setShowProfile(false)}
          />

          {/* Profile */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowProfile(p => !p); notifRef.current?.close() }}
              style={{ padding: '5px 10px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontFamily: FNT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>
                {initials(user?.displayName)}
              </div>
              {shortName(user?.displayName)}
            </button>
            {showProfile && (
              <div style={{ position: 'absolute', top: 38, right: 0, width: 260, background: '#fff', border: '1px solid #e8e4e0', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 999, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#062044', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                    {initials(user?.displayName)}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#062044', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.displayName || 'You'}</div>
                    <div style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT, textTransform: 'capitalize' }}>{user?.role || 'Member'}</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #e8e4e0', paddingTop: 10 }}>
                  <button
                    onClick={() => { setShowProfile(false); onLogout?.() }}
                    style={{ width: '100%', padding: '8px 0', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid #D8CEC3', color: '#5a5550', cursor: 'pointer', fontFamily: FNT, fontWeight: 700, textAlign: 'center', letterSpacing: 0.4 }}
                  >
                    Log Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary bar ── */}
      <div style={{ flexShrink: 0, padding: '12px 28px', display: 'flex', gap: 24, borderBottom: '1px solid #e8e4e0', fontSize: 11, fontFamily: FNT, color: '#b0a898', flexWrap: 'wrap', alignItems: 'center' }}>
        <span><span style={{ color: '#F2652F', fontWeight: 700 }}>{ruleCounts.total}</span> Rules</span>
        <span style={{ color: '#D8CEC3' }}>│</span>
        {['Proposed', 'Active', 'Verified', 'Established'].map(s =>
          ruleCounts.byStatus[s] ? (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Badge label={s} colorFn={statusColor} />
              <span style={{ color: '#b0a898' }}>{ruleCounts.byStatus[s]}</span>
            </span>
          ) : null
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <div style={{ width: 220, borderRight: '1px solid #e8e4e0', padding: '20px 16px', flexShrink: 0, overflowY: 'auto', background: '#FAFAF9' }}>

          {/* Nav tabs */}
          <div style={{ marginBottom: 24 }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => switchView(tab.id)}
                style={{
                  display: 'block', width: '100%', padding: '8px 12px', marginBottom: 2,
                  borderRadius: 3, fontSize: 12, fontWeight: view === tab.id ? 700 : 400,
                  background: view === tab.id ? '#f0eeec' : 'transparent',
                  color: view === tab.id ? '#062044' : '#555',
                  border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: FNT,
                }}
              >
                {tab.icon} {tab.label}
                {tab.id === 'rules' && ruleCounts.total > 0 && (
                  <span style={{ float: 'right', color: '#D8CEC3', fontSize: 11 }}>{ruleCounts.total}</span>
                )}
              </button>
            ))}
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
                  style={{ marginTop: 8, background: 'none', border: 'none', color: '#4FA89A', fontSize: 11, cursor: 'pointer', fontFamily: FNT }}
                >
                  ✕ Clear filters
                </button>
              )}
            </>
          )}

          {view === 'query' && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, color: '#4FA89A', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12, fontFamily: FNT, fontWeight: 700 }}>ASK THE KNOWLEDGE BANK</div>
              <div style={{ fontSize: 11, color: '#8a8278', fontFamily: FNT, lineHeight: 1.7 }}>
                Tell the system what you're about to do. Answers come strictly from the validated knowledge bank.
              </div>
            </div>
          )}
        </div>

        {/* ── Main content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {view === 'rules' && (
            <RulesView
              search={search}
              fStatus={fStatus}
              fCat={fCat}
              fProc={fProc}
              onCountsChange={setRuleCounts}
              addFormOpen={addFormOpen}
              onAddFormClose={() => setAddFormOpen(false)}
              onViewInGraph={(type, id) => { switchView('graph'); setGraphHighlight(id) }}
              processAreas={vocabulary.processAreas}
              categories={vocabulary.categories}
              onItemSaved={refreshVocabulary}
            />
          )}

          {view === 'assertions' && (
            <AssertionsView
              search={search}
              fStatus={fStatus}
              fCat={fCat}
              fProc={fProc}
              addFormOpen={addFormOpen}
              onAddFormClose={() => setAddFormOpen(false)}
              onViewInGraph={(type, id) => { switchView('graph'); setGraphHighlight(id) }}
              processAreas={vocabulary.processAreas}
              categories={vocabulary.categories}
              onItemSaved={refreshVocabulary}
            />
          )}

          {view === 'events' && (
            <EventsView
              reportOpen={reportEventOpen}
              onReportClose={() => setReportEventOpen(false)}
              processAreas={vocabulary.processAreas}
              onItemSaved={refreshVocabulary}
            />
          )}

          {view === 'questions' && (
            <QuestionsView
              processAreas={vocabulary.processAreas}
              onItemSaved={refreshVocabulary}
            />
          )}

          {view === 'health' && <HealthDashboard onNavigate={switchView} />}

          {view === 'graph' && (
            <RelationshipGraph
              onNavigate={switchView}
              highlightId={graphHighlight}
              onClearHighlight={() => setGraphHighlight(null)}
              processAreas={vocabulary.processAreas}
              categories={vocabulary.categories}
            />
          )}

          {view === 'query' && <QueryView onNavigate={switchView} />}

          {view !== 'rules' && view !== 'assertions' && view !== 'events' && view !== 'questions' && view !== 'health' && view !== 'graph' && view !== 'query' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 32, color: '#D8CEC3' }}>{TABS.find(t => t.id === view)?.icon}</div>
              <div style={{ fontSize: 13, color: '#b0a898', fontFamily: FNT }}>{TABS.find(t => t.id === view)?.label} — coming soon</div>
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
        onItemSaved={refreshVocabulary}
      />

      {showPlantSettings && user && (
        <PlantSettings
          membership={{
            plantId: user.plantId,
            plantName: user.plantName,
            orgId: user.orgId,
            orgName: '',
            role: user.role,
            inviteCode: user.inviteCode,
          }}
          onClose={() => setShowPlantSettings(false)}
        />
      )}

      {/* Backdrop to close plant menu */}
      {showPlantMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowPlantMenu(false)} />
      )}
    </div>
  )
}
