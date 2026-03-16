import { useState } from 'react'
import { FNT, FNTM, iS, CONFIDENCES } from '../lib/constants.js'
import { Modal, Field, TypeaheadInput } from './shared.jsx'
import { createRule, createAssertion } from '../lib/db.js'

const EMPTY_FORM = { text: '', processArea: '', source: '', submittedBy: '' }

export default function NarrativeInput({ open, onClose, onCreated, processAreas = [], categories = [], onItemSaved }) {
  const [step, setStep] = useState('input') // 'input' | 'review' | 'done'
  const [form, setForm] = useState(EMPTY_FORM)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState(null)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [saveError, setSaveError] = useState(null)

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
    const createdBy = form.submittedBy?.trim() || 'Max Wolman'

    for (const item of items) {
      try {
        if (item._type === 'rule') {
          const created = await createRule({
            title: item.title,
            category: item.category || '',
            processArea: item.process_area || form.processArea,
            scope: item.scope || '',
            rationale: item.rationale || '',
            confidence: item.confidence || 'Medium',
            status: 'Proposed',
            tags: ['narrative-input'],
            evidenceText,
            createdBy,
          })
          if (created) { count++; onCreated?.(created) }
        } else {
          const created = await createAssertion({
            title: item.title,
            category: item.category || '',
            processArea: item.process_area || form.processArea,
            scope: item.scope || '',
            confidence: item.confidence || 'Medium',
            status: 'Proposed',
            tags: ['narrative-input'],
            evidenceText,
            createdBy,
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
          <div style={{ fontSize: 12, color: '#5a5550', fontFamily: FNT, lineHeight: 1.7, marginBottom: 20, padding: '10px 14px', background: '#f8f6f4', borderRadius: 3, borderLeft: '3px solid #4FA89A' }}>
            Paste or type operator knowledge in plain language. Claude will extract structured rules and assertions that you can review before they're added to the knowledge bank.
          </div>

          <Field label="Narrative" hint="Speak naturally — include context, conditions, and consequences">
            <textarea
              style={{ ...iS, height: 160, resize: 'vertical', lineHeight: 1.6, fontSize: 13 }}
              value={form.text}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              placeholder={'e.g. "When we get high copper scrap above 0.25% we need to cap the EAF power at 85% during refining otherwise the electrodes wear out fast and the arc gets unstable. We\'ve seen this cause tap-to-tap time increases of 8-10 minutes when ignored..."'}
              autoFocus
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Primary Process Area">
              <TypeaheadInput
                value={form.processArea}
                onChange={v => setForm(f => ({ ...f, processArea: v }))}
                options={processAreas}
                placeholder="Select process area..."
              />
            </Field>
            <Field label="Submitted By">
              <input
                style={iS}
                value={form.submittedBy}
                onChange={e => setForm(f => ({ ...f, submittedBy: e.target.value }))}
                placeholder="e.g. Max Wolman"
              />
            </Field>
          </div>

          <Field label="Source" hint="Added as evidence on each created item">
            <input
              style={iS}
              value={form.source}
              onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
              placeholder="e.g. Interview with Marco Rossi, EAF Foreman · 12 Mar 2026"
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
              background: (!extracting && form.text.trim()) ? '#062044' : '#f0eeec',
              border: 'none',
              color: (!extracting && form.text.trim()) ? '#FFFFFF' : '#8a8278',
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
            <div style={{ fontSize: 11, color: '#8a8278', fontFamily: FNT, marginBottom: 16, display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: '#b0a898' }}>Source:</span>
              <span style={{ color: '#5a5550', fontWeight: 600 }}>{form.source}</span>
            </div>
          )}

          <div style={{ fontSize: 11, color: '#8a8278', fontFamily: FNT, marginBottom: 16 }}>
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
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#D8CEC3', fontFamily: FNT, fontSize: 12, marginBottom: 20 }}>
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
              style={{ padding: '10px 18px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid #D8CEC3', color: '#5a5550', cursor: 'pointer', fontFamily: FNT, fontWeight: 600 }}
            >
              ← Back
            </button>
            <button
              onClick={handleCreateAll}
              disabled={saving || items.length === 0}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 3, fontSize: 13,
                background: (!saving && items.length > 0) ? '#062044' : '#f0eeec',
                border: 'none',
                color: (!saving && items.length > 0) ? '#FFFFFF' : '#8a8278',
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
          <div style={{ fontSize: 18, fontWeight: 700, color: '#062044', fontFamily: FNT, marginBottom: 8 }}>
            {savedCount} item{savedCount !== 1 ? 's' : ''} added to Knowledge Bank
          </div>
          <div style={{ fontSize: 12, color: '#8a8278', fontFamily: FNT, marginBottom: 24, lineHeight: 1.7 }}>
            All items created with status <strong>Proposed</strong>. They'll appear in the Rules and Assertions views where your team can verify and promote them.
            {form.source && <><br />Evidence linked: <em>{form.source}</em></>}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{ padding: '10px 20px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid #D8CEC3', color: '#5a5550', cursor: 'pointer', fontFamily: FNT, fontWeight: 700 }}
            >
              Add Another Narrative
            </button>
            <button
              onClick={handleClose}
              style={{ padding: '10px 20px', borderRadius: 3, fontSize: 12, background: '#062044', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: FNT, fontWeight: 700 }}
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
      border: `1px solid ${isRule ? '#062044' : '#4FA89A'}20`,
      borderLeft: `3px solid ${isRule ? '#062044' : '#4FA89A'}`,
      borderRadius: 3,
    }}>
      {/* Type badge + remove */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{
          fontSize: 9, padding: '2px 8px', borderRadius: 2, fontWeight: 700, fontFamily: FNT,
          background: isRule ? '#e8edf4' : '#e6f5f1',
          color: isRule ? '#062044' : '#4FA89A',
          textTransform: 'uppercase', letterSpacing: 0.8,
        }}>
          {isRule ? '◆ Rule' : '◇ Assertion'}
        </span>
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', color: '#D8CEC3', cursor: 'pointer', fontSize: 14, padding: '0 4px', lineHeight: 1 }}
          title="Remove this item"
        >✕</button>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'block', fontSize: 10, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>Title</label>
        <input
          value={item.title || ''}
          onChange={e => onChange({ title: e.target.value })}
          style={{ ...iS, fontSize: 13, fontWeight: 600 }}
        />
      </div>

      {/* Category · Process Area · Confidence */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: isRule ? 10 : 0 }}>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>Category</label>
          <TypeaheadInput
            value={item.category || ''}
            onChange={v => onChange({ category: v })}
            options={categories}
            placeholder="Category..."
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>Process Area</label>
          <TypeaheadInput
            value={item.process_area || ''}
            onChange={v => onChange({ process_area: v })}
            options={processAreas}
            placeholder="Area..."
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>Confidence</label>
          <TypeaheadInput
            value={item.confidence || ''}
            onChange={v => onChange({ confidence: v })}
            options={CONFIDENCES}
            placeholder="Confidence..."
          />
        </div>
      </div>

      {/* Scope */}
      {item.scope !== undefined && (
        <div style={{ marginBottom: isRule ? 10 : 0 }}>
          <label style={{ display: 'block', fontSize: 10, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>Scope</label>
          <input
            value={item.scope || ''}
            onChange={e => onChange({ scope: e.target.value })}
            style={{ ...iS, fontSize: 12 }}
            placeholder="Specific conditions where this applies..."
          />
        </div>
      )}

      {/* Rationale (rules only) */}
      {isRule && (
        <div>
          <label style={{ display: 'block', fontSize: 10, color: '#8a8278', textTransform: 'uppercase', letterSpacing: 1, fontFamily: FNT, marginBottom: 4 }}>Rationale</label>
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
