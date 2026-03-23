import { useState, useEffect } from 'react'
import { FNT, FNTM, iS, STATUSES, formatDate, statusColor, paColor } from '../lib/constants.js'
import { Badge, Tag, Modal, Field, TypeaheadInput } from './shared.jsx'
import { fetchRules, fetchComments, fetchVerifications, fetchItemById, createRule, updateRule, requestArchive, confirmArchive, rejectArchive } from '../lib/db.js'
import { getUserId } from '../lib/userContext.js'
import Comments from './Comments.jsx'
import Verifications from './Verifications.jsx'
import LinkEditor from './LinkEditor.jsx'

export default function RulesView({ search, fStatus, fCat, fProc, addFormOpen, onAddFormClose, onViewInGraph, processAreas = [], categories = [], onItemSaved, onViewProfile, plantId }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [comments, setComments] = useState({})
  const [verifications, setVerifications] = useState({})
  const [showVer, setShowVer] = useState(false)
  const [crossSel, setCrossSel] = useState(null)   // { type, id, data } — for linked-item detail
  const [crossLoading, setCrossLoading] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [contradictLinks, setContradictLinks] = useState([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const t0 = Date.now()
    setLoading(true)
    const data = await fetchRules()
    console.log('[RulesView] fetchRules:', Date.now() - t0, 'ms,', data.length, 'rules')
    const ids = data.map(r => r.id)
    const t1 = Date.now()
    const [commentsData, verificationsData] = await Promise.all([
      fetchComments('rule', ids),
      fetchVerifications('rule', ids),
    ])
    console.log('[RulesView] fetchComments+Verifications:', Date.now() - t1, 'ms')
    setRules(data)
    setComments(commentsData)
    setVerifications(verificationsData)
    setLoading(false)
    console.log('[RulesView] total load:', Date.now() - t0, 'ms')
  }

  // ── Filtering ────────────────────────────────────────────────────────────

  const filtered = rules.filter(item => {
    const q = search.toLowerCase()
    const matchQ = !q
      || item.title.toLowerCase().includes(q)
      || item.id.toLowerCase().includes(q)
      || (item.scope || '').toLowerCase().includes(q)
      || (item.tags || []).some(t => t.includes(q))
      || (item.rationale || '').toLowerCase().includes(q)
    return (
      matchQ
      && (fStatus.length === 0 || fStatus.includes(item.status))
      && (fCat.length === 0 || fCat.some(c => (item.category || '').includes(c)))
      && (fProc.length === 0 || fProc.includes(item.processArea))
    )
  })

  // ── Open detail ───────────────────────────────────────────────────────────

  function openDetail(item) {
    setSel(item)
    setShowVer(false)
    setCrossSel(null)
    setContradictLinks([])
  }

  async function openLinkedItem(type, id) {
    // If it's a rule we already have, open it directly
    if (type === 'rule') {
      const found = rules.find(r => r.id === id)
      if (found) { openDetail(found); return }
    }
    // Otherwise fetch + show in a stacked modal
    setCrossLoading(true)
    setCrossSel({ type, id, data: null })
    const data = await fetchItemById(type, id)
    setCrossSel({ type, id, data })
    setCrossLoading(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Sticky count bar ── */}
      {!loading && (
        <div style={{ flexShrink: 0, padding: '10px 28px', borderBottom: '1px solid #e8e4e0', background: '#FAFAF9' }}>
          <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, letterSpacing: 0.8 }}>
            {filtered.length} RULES · SORTED BY DATE
          </div>
        </div>
      )}

      {/* ── Scrollable list ── */}
      <div style={{ flex: 1, padding: '20px 28px', overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#b0a898', fontFamily: FNT, fontSize: 12 }}>
            Loading rules…
          </div>
        )}

        {!loading && (
          <>
            {filtered.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: '#D8CEC3', fontFamily: FNT, fontSize: 13 }}>
                No rules match your filters.
              </div>
            )}

            {filtered.map(item => (
              <RuleCard
                key={item.id}
                item={item}
                selected={sel?.id === item.id}
                commentCount={(comments[item.id] || []).length}
                verificationCount={(verifications[item.id] || []).length}
                onClick={() => openDetail(item)}
              />
            ))}
          </>
        )}
      </div>

      {/* ── Detail Modal ── */}
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.id}${sel.versions?.length ? ' · v' + sel.versions.length : ''}` : ''} width={640}>
        {sel && (
          <div>
            {/* Action row */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              <button onClick={() => setShowEdit(true)} style={btnStyle}>Edit</button>
              <button onClick={() => setShowVer(p => !p)} style={btnStyle}>
                {showVer ? 'Hide History' : 'History'}
              </button>
              <button onClick={() => { setSel(null); onViewInGraph?.('rule', sel.id) }} style={{ ...btnStyle, border: '1px solid #4FA89A', color: '#4FA89A' }}>View in Graph</button>
            </div>

            {/* Version history (inline toggle) */}
            {showVer && (
              <div style={{ marginBottom: 20, border: '1px solid #D8CEC3', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: '#f0eeec', fontSize: 10, color: '#062044', fontFamily: FNT, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Version History
                </div>
                {[...(sel.versions || [])].reverse().map(v => (
                  <div key={v.version} style={{ padding: '12px 14px', borderTop: '1px solid #e8e4e0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#4FA89A', fontWeight: 700, fontFamily: FNT }}>v{v.version}</span>
                      <span style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT }}>{formatDate(v.date)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, padding: '6px 10px', background: '#f8f6f4', borderRadius: 2, border: '1px solid #D8CEC3' }}>
                      <div style={{ minWidth: 80 }}>
                        <div style={{ fontSize: 9, color: '#b0a898', textTransform: 'uppercase', fontFamily: FNT, marginBottom: 2 }}>Author</div>
                        <div style={{ fontSize: 12, color: '#1F1F1F', fontWeight: 600 }}>{v.author}</div>
                      </div>
                      <div style={{ flex: 1, borderLeft: '1px solid #D8CEC3', paddingLeft: 12 }}>
                        <div style={{ fontSize: 9, color: '#b0a898', textTransform: 'uppercase', fontFamily: FNT, marginBottom: 2 }}>Note</div>
                        <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.4 }}>{v.change}</div>
                      </div>
                    </div>
                    {(!v.diffs || v.diffs.length === 0) && (
                      <div style={{ fontSize: 12, color: '#8a8278', lineHeight: 1.4, padding: '6px 10px', background: '#FFFFFF', borderRadius: 2, marginTop: 4, border: '1px solid #D8CEC3' }}>
                        {v.snapshot}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Contradiction warning */}
            {contradictLinks.length > 0 && (
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fde8e5', border: '1px solid #c0392b30', borderRadius: 3 }}>
                <div style={{ fontSize: 12, color: '#c0392b', fontFamily: FNT, fontWeight: 700, marginBottom: 4 }}>
                  ⚠ Contradiction flagged
                </div>
                {contradictLinks.map(l => (
                  <div key={l.id} style={{ fontSize: 12, color: '#c0392b', fontFamily: FNT }}>
                    This item contradicts{' '}
                    <button
                      onClick={() => openLinkedItem(l.linkedType, l.linkedId)}
                      style={{ background: 'none', border: 'none', padding: 0, color: '#c0392b', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 12, fontFamily: FNT }}
                    >{l.linkedId}</button>
                    {' — '}{l.linkedTitle}
                  </div>
                ))}
              </div>
            )}

            {/* Pending Archive actions for the author */}
            {sel.status === 'Pending Archive' && getUserId() === sel.createdById && (
              <div style={{ marginBottom: 16, padding: '12px 14px', background: '#fef3e2', border: '1px solid #e67e2240', borderRadius: 3 }}>
                <div style={{ fontSize: 12, color: '#e67e22', fontFamily: FNT, fontWeight: 700, marginBottom: 8 }}>
                  Archive requested for this item — confirm or reject below.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={async () => {
                      await confirmArchive('rule', sel.id, sel.title)
                      const updated = { ...sel, status: 'Retired' }
                      setSel(updated); setRules(prev => prev.map(r => r.id === sel.id ? updated : r)); onItemSaved?.()
                    }}
                    style={{ padding: '6px 14px', borderRadius: 3, fontSize: 12, background: '#c0392b', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: FNT, fontWeight: 700 }}
                  >Confirm Archive</button>
                  <button
                    onClick={async () => {
                      const prevStatus = await rejectArchive('rule', sel.id, sel.title, sel.versions || [])
                      const updated = { ...sel, status: prevStatus }
                      setSel(updated); setRules(prev => prev.map(r => r.id === sel.id ? updated : r)); onItemSaved?.()
                    }}
                    style={{ padding: '6px 14px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer', fontFamily: FNT }}
                  >Reject Archive</button>
                </div>
              </div>
            )}

            {/* Title + badges */}
            <h3 style={{ fontSize: 16, color: '#062044', fontWeight: 700, lineHeight: 1.4, marginBottom: 16, fontFamily: FNT }}>
              {sel.title}
            </h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {sel.status && <Badge label={sel.status} colorFn={statusColor} />}
              {sel.isContradicted && (
                <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, background: '#fde8e5', color: '#c0392b', fontFamily: FNT, fontWeight: 700, border: '1px solid #c0392b30' }}>⚠ Contradicted</span>
              )}
              {sel.status === 'Stale' && (
                <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, background: '#fef3e2', color: '#e67e22', fontFamily: FNT, fontWeight: 700, border: '1px solid #e67e2230' }}>⚠ Stale</span>
              )}
              {sel.category && <Tag label={sel.category} />}
              {sel.processArea && <Tag label={sel.processArea} />}
            </div>

            {/* Verify */}
            <Verifications targetType="rule" targetId={sel.id} />

            {/* Scope */}
            <DetailSection label="Scope">
              <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.5 }}>{sel.scope || '—'}</div>
            </DetailSection>

            {/* Rationale */}
            {sel.rationale && (
              <DetailSection label="Rationale">
                <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.5 }}>{sel.rationale}</div>
              </DetailSection>
            )}

            {/* Evidence */}
            <DetailSection label="Evidence">
              {(sel.evidence || []).length === 0 && (
                <div style={{ fontSize: 12, color: '#D8CEC3' }}>None recorded</div>
              )}
              {(sel.evidence || []).map((ev, i) => (
                <div key={i} style={{ padding: '8px 10px', background: '#f8f6f4', borderRadius: 4, marginBottom: 4, border: '1px solid #D8CEC3' }}>
                  <div style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, marginBottom: 3 }}>
                    {(ev.type || '').replace(/_/g, ' ').toUpperCase()} · {ev.date}
                  </div>
                  <div style={{ fontSize: 12, color: '#8a8278', lineHeight: 1.4 }}>{ev.text}</div>
                </div>
              ))}
            </DetailSection>

            {/* Links */}
            <div style={{ marginBottom: 18 }}>
              <LinkEditor
                sourceType="rule"
                sourceId={sel.id}
                onOpenItem={openLinkedItem}
                sourceMeta={{ processArea: sel.processArea, category: sel.category, title: sel.title }}
                onLinksLoaded={links => setContradictLinks(links.filter(l => l.relType === 'contradicts'))}
              />
            </div>

            {/* Tags */}
            {(sel.tags || []).length > 0 && (
              <DetailSection label="Tags">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {sel.tags.map(t => <Tag key={t} label={t} />)}
                </div>
              </DetailSection>
            )}

            {/* Footer meta */}
            <div style={{ padding: '10px 0', borderTop: '1px solid #D8CEC3', marginTop: 12, fontSize: 10, color: '#D8CEC3', fontFamily: FNT, lineHeight: 1.8 }}>
              <div>Created by: <span
                onClick={() => sel.createdBy && onViewProfile?.(sel.createdBy)}
                style={{ cursor: onViewProfile ? 'pointer' : 'default', color: onViewProfile ? '#4FA89A' : '#D8CEC3', textDecoration: onViewProfile ? 'underline' : 'none' }}
              >{sel.createdBy}</span></div>
              <div>Created: {formatDate(sel.createdAt)}</div>
            </div>

            {/* Comments */}
            <Comments targetType="rule" targetId={sel.id} onCommentPosted={() => setComments(prev => ({ ...prev, [sel.id]: [...(prev[sel.id] || []), {}] }))} />
          </div>
        )}
      </Modal>

      {/* ── Cross-type linked item detail (stacked) ── */}
      <Modal open={!!crossSel} onClose={() => setCrossSel(null)} title={crossSel ? crossSel.id : ''} width={580}>
        {crossLoading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#b0a898', fontFamily: FNT, fontSize: 12 }}>Loading…</div>
        )}
        {crossSel?.data && (
          <LinkedItemDetail item={crossSel.data} onOpenItem={openLinkedItem} onViewProfile={onViewProfile} />
        )}
      </Modal>

      {/* ── Edit Rule form ── */}
      <Modal open={showEdit && !!sel} onClose={() => setShowEdit(false)} title={`Edit ${sel?.id}`} width={600}>
        {sel && (
          <EditRuleForm
            item={sel}
            onClose={() => setShowEdit(false)}
            processAreas={processAreas}
            categories={categories}
            onSavedFull={(updatedFields, newVersion) => {
              const updated = { ...sel, ...updatedFields, versions: [...(sel.versions || []), newVersion] }
              setSel(updated)
              setRules(prev => prev.map(r => r.id === sel.id ? updated : r))
              setShowEdit(false)
              onItemSaved?.()
            }}
            onArchived={(newStatus) => {
              const updated = { ...sel, status: newStatus }
              setSel(updated)
              setRules(prev => prev.map(r => r.id === sel.id ? updated : r))
              onItemSaved?.()
            }}
          />
        )}
      </Modal>

      {/* ── Add Rule form ── */}
      <Modal open={!!addFormOpen} onClose={onAddFormClose} title="Add Rule" width={600}>
        <AddRuleForm
          onClose={onAddFormClose}
          processAreas={processAreas}
          categories={categories}
          onCreated={rule => {
            setRules(prev => [rule, ...prev])
            onAddFormClose()
            openDetail(rule)
            onItemSaved?.()
          }}
        />
      </Modal>
    </div>
  )
}

// ── Edit Rule form ─────────────────────────────────────────────────────────────

function EditRuleForm({ item, onClose, onSavedFull, onArchived, processAreas = [], categories = [] }) {
  const [form, setForm] = useState({
    title: item.title || '',
    category: item.category || '',
    processArea: item.processArea || '',
    scope: item.scope || '',
    rationale: item.rationale || '',
    status: item.status || 'Proposed',
    tagsInput: (item.tags || []).join(', '),
    changeNote: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [archiveConfirm, setArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    try {
      const tags = form.tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      const newVersion = await updateRule(item.id, { ...form, tags })
      onSavedFull({ title: form.title, category: form.category, processArea: form.processArea, scope: form.scope, rationale: form.rationale, status: form.status, tags }, newVersion)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field label="Title *">
        <input value={form.title} onChange={e => set('title', e.target.value)} style={iS} autoFocus />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Category">
          <TypeaheadInput value={form.category} onChange={v => set('category', v)} options={categories} />
        </Field>
        <Field label="Process Area">
          <TypeaheadInput value={form.processArea} onChange={v => set('processArea', v)} options={processAreas} />
        </Field>
      </div>

      <Field label="Status">
        <select value={form.status} onChange={e => set('status', e.target.value)} style={iS}>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>

      <Field label="Scope">
        <textarea value={form.scope} onChange={e => set('scope', e.target.value)} rows={3} style={{ ...iS, resize: 'vertical' }} />
      </Field>

      <Field label="Rationale">
        <textarea value={form.rationale} onChange={e => set('rationale', e.target.value)} rows={3} style={{ ...iS, resize: 'vertical' }} />
      </Field>

      <Field label="Tags" hint="Comma-separated">
        <input value={form.tagsInput} onChange={e => set('tagsInput', e.target.value)} style={iS} />
      </Field>

      <Field label="Change Note" hint="Describe what changed">
        <input value={form.changeNote} onChange={e => set('changeNote', e.target.value)} placeholder="e.g. Updated scope based on Q-Lab data" style={iS} />
      </Field>

      {error && (
        <div style={{ padding: '8px 12px', background: '#fde8e5', border: '1px solid #c0392b40', borderRadius: 3, color: '#c0392b', fontSize: 12, fontFamily: FNT, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
        <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer', fontFamily: FNT }}>
          Cancel
        </button>
        <button type="submit" disabled={saving} style={{ padding: '8px 22px', borderRadius: 3, fontSize: 12, background: saving ? '#D8CEC3' : '#062044', border: 'none', color: '#fff', cursor: saving ? 'default' : 'pointer', fontFamily: FNT, fontWeight: 700 }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Archive section */}
      {!archiveConfirm ? (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e8e4e0' }}>
          <button
            type="button"
            onClick={() => setArchiveConfirm(true)}
            style={{ padding: '6px 14px', borderRadius: 3, fontSize: 11, background: 'transparent', border: '1px solid #D8CEC3', color: '#b0a898', cursor: 'pointer', fontFamily: FNT }}
          >
            Archive this rule…
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e8e4e0', padding: '12px 14px', background: '#fef3e2', borderRadius: 3 }}>
          <div style={{ fontSize: 12, color: '#8a8278', fontFamily: FNT, marginBottom: 10 }}>
            Are you sure you want to archive this? The author will be notified for final confirmation.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={archiving}
              onClick={async () => {
                setArchiving(true)
                try {
                  const result = await requestArchive('rule', item.id, item.status, item.title, item.createdById)
                  const newStatus = result.selfArchived ? 'Retired' : 'Pending Archive'
                  onArchived?.(newStatus)
                  onClose()
                } catch (e) { setError(e.message); setArchiving(false); setArchiveConfirm(false) }
              }}
              style={{ padding: '6px 14px', borderRadius: 3, fontSize: 12, background: archiving ? '#D8CEC3' : '#c0392b', border: 'none', color: '#fff', cursor: archiving ? 'default' : 'pointer', fontFamily: FNT, fontWeight: 700 }}
            >{archiving ? 'Archiving…' : 'Confirm Archive'}</button>
            <button type="button" onClick={() => setArchiveConfirm(false)} style={{ padding: '6px 14px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer', fontFamily: FNT }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </form>
  )
}

// ── Add Rule form ──────────────────────────────────────────────────────────────

function AddRuleForm({ onClose, onCreated, processAreas = [], categories = [] }) {
  const [form, setForm] = useState({
    title: '', category: '', processArea: '', scope: '', rationale: '',
    status: 'Proposed', tagsInput: '', evidenceText: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    try {
      const tags = form.tagsInput.split(',').map(t => t.trim()).filter(Boolean)
      const rule = await createRule({ ...form, tags, plantId })
      onCreated(rule)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field label="Title *">
        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Limit non-standard input to 40% of batch…" style={iS} autoFocus />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Category">
          <TypeaheadInput value={form.category} onChange={v => set('category', v)} options={categories} />
        </Field>
        <Field label="Process Area">
          <TypeaheadInput value={form.processArea} onChange={v => set('processArea', v)} options={processAreas} />
        </Field>
      </div>

      <Field label="Status">
        <select value={form.status} onChange={e => set('status', e.target.value)} style={iS}>
          {STATUSES.filter(s => !['Stale', 'Contradicted', 'Retired'].includes(s)).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </Field>

      <Field label="Scope" hint="What conditions or situations does this rule apply to?">
        <textarea value={form.scope} onChange={e => set('scope', e.target.value)} rows={3} placeholder="e.g. Applies when operating under non-standard conditions or with variable input materials…" style={{ ...iS, resize: 'vertical' }} />
      </Field>

      <Field label="Rationale" hint="Why does this rule exist? What's the evidence or reasoning?">
        <textarea value={form.rationale} onChange={e => set('rationale', e.target.value)} rows={3} placeholder="e.g. Off-spec input materials cause downstream quality defects if not managed at source…" style={{ ...iS, resize: 'vertical' }} />
      </Field>

      <Field label="Initial Evidence" hint="Optional — describe any observation, incident, or test that supports this rule">
        <textarea value={form.evidenceText} onChange={e => set('evidenceText', e.target.value)} rows={2} placeholder="e.g. Batch #4782 — high proportion of off-spec material resulted in quality failure…" style={{ ...iS, resize: 'vertical' }} />
      </Field>

      <Field label="Tags" hint="Comma-separated">
        <input value={form.tagsInput} onChange={e => set('tagsInput', e.target.value)} placeholder="e.g. quality, materials, best-practice" style={iS} />
      </Field>

      {error && (
        <div style={{ padding: '8px 12px', background: '#fde8e5', border: '1px solid #c0392b40', borderRadius: 3, color: '#c0392b', fontSize: 12, fontFamily: FNT, marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
        <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid #D8CEC3', color: '#8a8278', cursor: 'pointer', fontFamily: FNT }}>
          Cancel
        </button>
        <button type="submit" disabled={saving} style={{ padding: '8px 22px', borderRadius: 3, fontSize: 12, background: saving ? '#D8CEC3' : '#062044', border: 'none', color: '#fff', cursor: saving ? 'default' : 'pointer', fontFamily: FNT, fontWeight: 700 }}>
          {saving ? 'Saving…' : 'Add Rule'}
        </button>
      </div>
    </form>
  )
}

// ── Shared linked-item detail view (used in cross-type stacked modal) ─────────

function LinkedItemDetail({ item, onOpenItem, onViewProfile }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {item.status && <Badge label={item.status} colorFn={statusColor} />}
        {item.category && <Tag label={item.category} />}
        {item.processArea && <Tag label={item.processArea} />}
      </div>

      <h3 style={{ fontSize: 15, color: '#062044', fontWeight: 700, lineHeight: 1.4, marginBottom: 16, fontFamily: FNT }}>
        {item.title}
      </h3>

      {item.scope && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: FNT }}>Scope</div>
          <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.5 }}>{item.scope}</div>
        </div>
      )}

      {item.rationale && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: FNT }}>Rationale</div>
          <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.5 }}>{item.rationale}</div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <LinkEditor sourceType={item.type} sourceId={item.id} onOpenItem={onOpenItem} />
      </div>

      {(item.tags || []).length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {item.tags.map(t => <Tag key={t} label={t} />)}
        </div>
      )}

      <div style={{ padding: '8px 0', borderTop: '1px solid #D8CEC3', marginTop: 12, fontSize: 10, color: '#D8CEC3', fontFamily: FNT, lineHeight: 1.8 }}>
        <div>Created by: <span
          onClick={() => item.createdBy && onViewProfile?.(item.createdBy)}
          style={{ cursor: onViewProfile ? 'pointer' : 'default', color: onViewProfile ? '#4FA89A' : '#D8CEC3', textDecoration: onViewProfile ? 'underline' : 'none' }}
        >{item.createdBy}</span></div>
        <div>Created: {formatDate(item.createdAt)}</div>
      </div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function RuleCard({ item, selected, commentCount, verificationCount, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '16px 20px', marginBottom: 8, borderRadius: 3, cursor: 'pointer', transition: 'all 0.12s',
        background: selected ? '#f0eeec' : hovered ? '#f8f6f4' : '#FFFFFF',
        border: selected ? '1px solid #4FA89A40' : '1px solid #e8e4e0',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#b0a898', fontFamily: FNT, fontWeight: 600 }}>{item.id}</span>
          {item.status && <Badge label={item.status} colorFn={statusColor} />}
          {item.isContradicted && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: '#fde8e5', color: '#c0392b', fontWeight: 700, fontFamily: FNT }}>⚠ Contradicted</span>
          )}
          {item.status === 'Stale' && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: '#fef3e2', color: '#e67e22', fontWeight: 700, fontFamily: FNT }}>⚠ Stale</span>
          )}
          {verificationCount > 0 && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: '#e6f5f1', color: '#4FA89A', fontWeight: 700, fontFamily: FNT }}>
              ✓ {verificationCount}
            </span>
          )}
          {commentCount > 0 && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 2, background: '#f0eeec', color: '#8a8278', fontWeight: 700, fontFamily: FNT }}>
              {commentCount} comment{commentCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span style={{ fontSize: 9, color: '#D8CEC3', fontFamily: FNT }}>
          created {formatDate(item.createdAt)}
          {item.versions?.length > 1 ? ` · edited ${formatDate(item.versions[item.versions.length - 1]?.date)}` : ''}
        </span>
      </div>

      <div style={{ fontSize: 14, color: '#1F1F1F', fontWeight: 500, lineHeight: 1.4, marginBottom: 8 }}>
        {item.title}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {item.category && <Tag label={item.category} />}
          {item.processArea && <Tag label={item.processArea} />}
          {(item.tags || []).slice(0, 3).map(t => <Tag key={t} label={t} />)}
        </div>
        <span style={{ fontSize: 10, color: '#D8CEC3', fontFamily: FNT }}>
          v{(item.versions || []).length}
        </span>
      </div>
    </div>
  )
}

function DetailSection({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: FNT }}>
        {label}
      </div>
      {children}
    </div>
  )
}

const btnStyle = {
  padding: '4px 10px', borderRadius: 4, fontSize: 11,
  background: '#f0eeec', border: '1px solid #D8CEC3',
  color: '#8a8278', cursor: 'pointer', fontFamily: FNT,
}
