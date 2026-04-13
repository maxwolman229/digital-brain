import { useState, useRef, useEffect } from 'react'
import { FNT, FNTM, iS } from '../lib/constants.js'
import { Modal, Field, TypeaheadInput, MentionDropdown } from './shared.jsx'
import { createRule, createAssertion, fetchPlantMembers } from '../lib/db.js'
import { useMention } from '../lib/useMention.js'

const EMPTY_FORM = { text: '', processArea: '', source: '' }

export default function NarrativeInput({ open, onClose, onCreated, processAreas = [], categories = [], industry, onItemSaved, plantId }) {
  const [step, setStep] = useState('input') // 'input' | 'review' | 'done'
  const [form, setForm] = useState(EMPTY_FORM)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState(null)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [saveError, setSaveError] = useState(null)
  const [members, setMembers] = useState([])
  const textRef = useRef(null)
  const { mentionQuery, handleMentionChange, insertMention } = useMention(
    form.text,
    v => setForm(f => ({ ...f, text: v })),
    textRef
  )

  useEffect(() => {
    fetchPlantMembers().then(setMembers).catch(() => {})
  }, [])

  function reset() {
    setStep('input')
    setForm(EMPTY_FORM)
    setItems([])
    setExtractError(null)
    setSavedCount(0)
    setSaveError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function patchItem(id, patch) {
    setItems(prev => prev.map(it => it._id === id ? { ...it, ...patch } : it))
  }

  function removeItem(id) {
    setItems(prev => prev.filter(it => it._id !== id))
  }

  // ── AI extraction ──────────────────────────────────────────────────────────

  async function handleExtract() {
    if (!form.text.trim()) return
    setExtracting(true)
    setExtractError(null)

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const jwt = (await import('../lib/supabase.js')).getStoredJwt()

      const resp = await fetch(`${supabaseUrl}/functions/v1/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': 'Bearer ' + (jwt || supabaseKey),
        },
        body: JSON.stringify({
          narrative: form.text,
          process_area: form.processArea,
          industry,
        }),
      })

      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || `Edge function error (${resp.status})`)

      const extracted = [
        ...(data.rules || []).map((r, i) => ({ ...r, _type: 'rule', _id: `r_${i}` })),
        ...(data.assertions || []).map((a, i) => ({ ...a, _type: 'assertion', _id: `a_${i}` })),
      ]
      if (extracted.length === 0) {
        setExtractError('No rules or assertions could be extracted. Try adding more detail to the narrative.')
        setExtracting(false)
        return
      }
      setItems(extracted)
      setStep('review')
    } catch (err) {
      setExtractError(err.message || 'Extraction failed — check network connection.')
    }
    setExtracting(false)
  }

  // ── Save approved items ────────────────────────────────────────────────────

  async function handleCreateAll() {
    if (items.length === 0) return
    setSaving(true)
    setSaveError(null)
    let count = 0
    const evidenceText = form.source?.trim() || ''

    for (const item of items) {
      try {
        if (item._type === 'rule') {
          const created = await createRule({
            title: item.title,
            category: item.category || '',
            processArea: item.process_area || form.processArea,
            scope: item.scope || '',
            rationale: item.rationale || '',
            status: 'Proposed',
            tags: ['narrative-input'],
            captureSource: 'Narrative input',
            evidenceText,
            plantId,
          })
          if (created) { count++; onCreated?.(created) }
        } else {
          const created = await createAssertion({
            title: item.title,
            category: item.category || '',
            processArea: item.process_area || form.processArea,
            scope: item.scope || '',
            status: 'Proposed',
            tags: ['narrative-input'],
            captureSource: 'Narrative input',
            evidenceText,
            plantId,
          })
          if (created) { count++; onCreated?.(created) }
        }
      } catch (e) {
        console.error('Failed to save item:', item.title, e)
      }
    }

    setSavedCount(count)
    setSaving(false)
    setStep('done')
    if (count > 0) onItemSaved?.()
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const title = step === 'input'
    ? 'Narrative Input'
    : step === 'review'
    ? `Review Extracted Knowledge — ${items.length} item${items.length !== 1 ? 's' : ''}`
    : 'Knowledge Created'

  const ruleCount = items.filter(i => i._type === 'rule').length
  const assertionCount = items.filter(i => i._type === 'assertion').length

  return (
    <Modal open={open} onClose={handleClose} title={title} width={680}>

      {/* ── Step 1: Input ── */}
      {step === 'input' && (
        <div>
          <div style={{ fontSize: 12, color: '#5a5550', fontFamily: FNT, lineHeight: 1.7, marginBottom: 20, padding: '10px 14px', background: '#f8f6f4', borderRadius: 3, borderLeft: '3px solid var(--md1-accent)' }}>
            Paste or type operator knowledge in plain language. Claude will extract structured rules and assertions that you can review before they're added to the knowledge bank.
          </div>

          <Field label="Narrative" hint="Speak naturally — include context, conditions, and consequences">
            <div style={{ position: 'relative' }}>
              <textarea
                ref={textRef}
                style={{ ...iS, height: 160, resize: 'vertical', lineHeight: 1.6, fontSize: 13 }}
                value={form.text}
                onChange={handleMentionChange}
                placeholder={'e.g. "When material quality drops below threshold we reduce line speed by 15% to avoid downstream defects. Ignoring this causes reject rates to spike — we\'ve seen this add 20+ minutes of rework..."'}
                autoFocus
              />
              <MentionDropdown query={mentionQuery} members={members} onSelect={insertMention} />
            </div>
          </Field>

          <Field label="Primary Process Area">
            <TypeaheadInput
              value={form.processArea}
              onChange={v => setForm(f => ({ ...f, processArea: v }))}
              options={processAreas}
              placeholder="Select process area..."
            />
          </Field>

          <Field label="Source" hint="Added as evidence on each created item">
            <input
              style={iS}
              value={form.source}
              onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
              placeholder="e.g. Interview with J. Smith, Line Supervisor · 12 Mar 2026"
            />
          </Field>

          {extractError && (
            <div style={{ padding: '10px 14px', background: '#fde8e5', border: '1px solid #c0392b20', borderRadius: 3, marginBottom: 12, fontSize: 11, color: '#c0392b', fontFamily: FNT, lineHeight: 1.5 }}>
              {extractError}
            </div>
          )}

          <button
            onClick={handleExtract}
            disabled={extracting || !form.text.trim()}
            style={{
              width: '100%', padding: '12px 0', borderRadius: 3, fontSize: 13,
              background: (!extracting && form.text.trim()) ? 'var(--md1-primary)' : '#f0eeec',
              border: 'none',
              color: (!extracting && form.text.trim()) ? '#FFFFFF' : 'var(--md1-muted)',
              cursor: (!extracting && form.text.trim()) ? 'pointer' : 'not-allowed',
              fontFamily: FNT, fontWeight: 700, letterSpacing: 0.4,
            }}
          >
            {extracting ? 'Extracting knowledge…' : 'Extract Rules & Assertions →'}
          </button>
        </div>
      )}

      {/* ── Step 2: Review ── */}
      {step === 'review' && (
        <div>
          {/* Source reminder */}
          {form.source && (
            <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, marginBottom: 16, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: 'var(--md1-muted-light)' }}>Source:</span>
              <span style={{ color: '#5a5550', fontWeight: 600 }}>{form.source}</span>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--md1-muted)', fontFamily: FNT, marginBottom: 16 }}>
            Review and edit each item before adding to the knowledge bank. Remove any items that aren't accurate.
          </div>

          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {items.map(item => (
              <ExtractedItem
                key={item._id}
                item={item}
                processAreas={processAreas}
                categories={categories}
                onChange={patch => patchItem(item._id, patch)}
                onRemove={() => removeItem(item._id)}
              />
            ))}
          </div>

          {items.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--md1-border)', fontFamily: FNT, fontSize: 12, marginBottom: 20 }}>
              All items removed. Go back to re-extract.
            </div>
          )}

          {saveError && (
            <div style={{ padding: '10px 14px', background: '#fde8e5', border: '1px solid #c0392b20', borderRadius: 3, marginBottom: 12, fontSize: 11, color: '#c0392b', fontFamily: FNT }}>
              {saveError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setStep('input')}
              style={{ padding: '10px 18px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid var(--md1-border)', color: '#5a5550', cursor: 'pointer', fontFamily: FNT, fontWeight: 600 }}
            >
              ← Back
            </button>
            <button
              onClick={handleCreateAll}
              disabled={saving || items.length === 0}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 3, fontSize: 13,
                background: (!saving && items.length > 0) ? 'var(--md1-primary)' : '#f0eeec',
                border: 'none',
                color: (!saving && items.length > 0) ? '#FFFFFF' : 'var(--md1-muted)',
                cursor: (!saving && items.length > 0) ? 'pointer' : 'not-allowed',
                fontFamily: FNT, fontWeight: 700, letterSpacing: 0.4,
              }}
            >
              {saving
                ? 'Creating…'
                : `Create ${items.length} item${items.length !== 1 ? 's' : ''} as Proposed →`
              }
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Done ── */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--md1-primary)', fontFamily: FNT, marginBottom: 8 }}>
            {savedCount} item{savedCount !== 1 ? 's' : ''} added to Knowledge Bank
          </div>
          <div style={{ fontSize: 12, color: 'var(--md1-muted)', fontFamily: FNT, marginBottom: 24, lineHeight: 1.7 }}>
            All items created with status <strong>Proposed</strong>. They'll appear in the Rules and Assertions views where your team can verify and promote them.
            {form.source && <><br />Evidence linked: <em>{form.source}</em></>}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{ padding: '10px 20px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid var(--md1-border)', color: '#5a5550', cursor: 'pointer', fontFamily: FNT, fontWeight: 700 }}
            >
              Add Another Narrative
            </button>
            <button
              onClick={handleClose}
              style={{ padding: '10px 20px', borderRadius: 3, fontSize: 12, background: 'var(--md1-primary)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: FNT, fontWeight: 700 }}
            >
              Done
            </button>
          </div>
        </div>
      )}

    </Modal>
  )
}

// ── Extracted item card ────────────────────────────────────────────────────────

function ExtractedItem({ item, onChange, onRemove, processAreas = [], categories = [] }) {
  const isRule = item._type === 'rule'

  return (
    <div style={{
      padding: '14px 16px', background: '#fff',
      border: `1px solid ${isRule ? 'var(--md1-primary)' : 'var(--md1-accent)'}20`,
      borderLeft: `3px solid ${isRule ? 'var(--md1-primary)' : 'var(--md1-accent)'}`,
      borderRadius: 3,
    }}>
      {/* Type badge + remove */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{
          fontSize: 9, padding: '2px 8px', borderRadius: 2, fontWeight: 700, fontFamily: FNT,
          background: isRule ? '#e8edf4' : '#e6f5f1',
          color: isRule ? 'var(--md1-primary)' : 'var(--md1-accent)',
          textTransform: 'uppercase', letterSpacing: 0.8,
        }}>
          {isRule ? '◆ Rule' : '◇ Assertion'}
        </span>
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', color: 'var(--md1-border)', cursor: 'pointer', fontSize: 14, padding: '0 4px', lineHeight: 1 }}
          title="Remove this item"
        >✕</button>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>Title</label>
        <input
          value={item.title || ''}
          onChange={e => onChange({ title: e.target.value })}
          style={{ ...iS, fontSize: 13, fontWeight: 600 }}
        />
      </div>

      {/* Category · Process Area */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: isRule ? 10 : 0 }}>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>Category</label>
          <TypeaheadInput
            value={item.category || ''}
            onChange={v => onChange({ category: v })}
            options={categories}
            placeholder="Category..."
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>Process Area</label>
          <TypeaheadInput
            value={item.process_area || ''}
            onChange={v => onChange({ process_area: v })}
            options={processAreas}
            placeholder="Area..."
          />
        </div>
      </div>

      {/* Detail */}
      {item.scope !== undefined && (
        <div style={{ marginBottom: isRule ? 10 : 0 }}>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>Detail</label>
          <input
            value={item.scope || ''}
            onChange={e => onChange({ scope: e.target.value })}
            style={{ ...iS, fontSize: 12 }}
            placeholder="Step-by-step instructions, conditions, context..."
          />
        </div>
      )}

      {/* Rationale (rules only) */}
      {isRule && (
        <div>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--md1-muted)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>Rationale</label>
          <textarea
            value={item.rationale || ''}
            onChange={e => onChange({ rationale: e.target.value })}
            style={{ ...iS, fontSize: 12, height: 56, resize: 'none', lineHeight: 1.5 }}
            placeholder="Why this rule exists — consequence of not following it..."
          />
        </div>
      )}
    </div>
  )
}
