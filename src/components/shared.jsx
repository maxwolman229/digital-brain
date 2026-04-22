import { useState, useEffect, useRef } from 'react'
import { FNTM, FNT, iS } from '../lib/constants.js'
import { useIsMobile } from '../lib/hooks.js'
import { parseMentionText } from '../lib/mentions.js'

export const Badge = ({ label, colorFn }) => {
  const c = colorFn(label)
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 2, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, background: c.bg, color: c.text, textTransform: "uppercase", fontFamily: FNT }}>
      {label}
    </span>
  )
}

export const Tag = ({ label }) => (
  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 2, fontSize: 10, fontWeight: 600, background: "var(--md1-primary)", color: "#FFFFFF", marginRight: 4, marginBottom: 3, fontFamily: FNT, letterSpacing: 0.3 }}>
    {label}
  </span>
)

export const PillFilter = ({ options, selected, onToggle, colorFn, label, scrollable = false }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 10, color: "var(--md1-muted)", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6, fontFamily: FNT }}>{label}</div>
    <div style={{
      display: "flex",
      flexWrap: scrollable ? "nowrap" : "wrap",
      gap: 5,
      overflowX: scrollable ? "auto" : "visible",
      paddingBottom: scrollable ? 4 : 0,
      WebkitOverflowScrolling: "touch",
    }}>
      {options.map(o => {
        const a = selected.includes(o)
        const c = colorFn ? colorFn(o) : { bg: "#f0eeec", text: "var(--md1-text)" }
        return (
          <button
            key={o}
            onClick={() => onToggle(o)}
            style={{
              padding: "3px 10px", borderRadius: 3, fontSize: 11, fontWeight: a ? 700 : 400,
              background: a ? c.bg : "transparent", color: a ? c.text : "var(--md1-muted)",
              border: a ? `1px solid ${c.text}44` : "1px solid var(--md1-border)",
              cursor: "pointer", fontFamily: FNT, flexShrink: 0,
              minHeight: 32,
            }}
          >
            {o}
          </button>
        )
      })}
    </div>
  </div>
)

export const Modal = ({ open, onClose, title, children, width = 640 }) => {
  const isMobile = useIsMobile()
  if (!open) return null

  if (isMobile) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "#FFFFFF",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Mobile modal header with back arrow */}
        <div style={{
          flexShrink: 0,
          padding: "0 16px",
          minHeight: 52,
          display: "flex", alignItems: "center", gap: 12,
          borderBottom: "1px solid var(--md1-border)",
          background: "#FFFFFF",
        }}>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 22, color: "var(--md1-primary)", padding: "0 8px 0 0",
              minWidth: 44, minHeight: 44,
              display: "flex", alignItems: "center", justifyContent: "flex-start",
            }}
          >
            ←
          </button>
          <h2 style={{ margin: 0, fontSize: 16, color: "var(--md1-primary)", fontFamily: FNT, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </h2>
        </div>
        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 16px", WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(var(--md1-primary-rgb),0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FFFFFF", border: "1px solid var(--md1-border)", borderRadius: 4, width: "90%", maxWidth: width, maxHeight: "85vh", overflow: "auto", padding: 28, boxShadow: "0 20px 60px rgba(var(--md1-primary-rgb),0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "var(--md1-primary)", fontFamily: FNT, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--md1-muted)", fontSize: 22, cursor: "pointer", minWidth: 44, minHeight: 44 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const Field = ({ label, children, hint }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: "block", fontSize: 11, color: "var(--md1-muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1, fontFamily: FNT }}>{label}</label>
    {children}
    {hint && <div style={{ fontSize: 10, color: "var(--md1-muted-light)", marginTop: 3, fontStyle: "italic" }}>{hint}</div>}
  </div>
)

// Floating @-mention dropdown.
// Props:
//   query       — filter string (null = hide)
//   members     — [{ userId, displayName, role }] already filtered by useMention
//   activeIndex — keyboard-highlighted row
//   onSelect(member) — called on click or keyboard enter
// Position the wrapping container relative; this dropdown is absolute.
export function MentionDropdown({ query, members, activeIndex = 0, onSelect }) {
  if (query === null) return null
  if (!members?.length) {
    // Show "No matches" only when user has typed something
    if (!query) return null
    return (
      <div style={{
        position: 'absolute', zIndex: 50, background: '#fff',
        border: '1px solid var(--md1-border)', borderRadius: 3,
        boxShadow: '0 4px 12px rgba(var(--md1-primary-rgb),0.1)',
        padding: '8px 12px', fontSize: 11, color: 'var(--md1-muted)',
        fontFamily: FNT, fontStyle: 'italic', minWidth: 180, marginTop: 2,
      }}>
        No matches
      </div>
    )
  }
  return (
    <div style={{
      position: 'absolute', zIndex: 50, background: '#fff',
      border: '1px solid var(--md1-border)', borderRadius: 3,
      boxShadow: '0 4px 12px rgba(var(--md1-primary-rgb),0.1)',
      maxHeight: 220, overflowY: 'auto', minWidth: 220,
      marginTop: 2,
    }}>
      {members.map((m, i) => {
        const isActive = i === activeIndex
        return (
          <button
            key={m.userId}
            onMouseDown={e => { e.preventDefault(); onSelect(m) }}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 6,
              width: '100%', padding: '7px 12px',
              textAlign: 'left', border: 'none',
              background: isActive ? '#f0f4fb' : 'none',
              cursor: 'pointer', fontFamily: FNT,
              borderBottom: '1px solid #f0eeec',
              minHeight: 36,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--md1-text)' }}>
              {m.displayName}
            </span>
            {m.role && (
              <span style={{ fontSize: 10, color: 'var(--md1-muted)', textTransform: 'capitalize' }}>
                · {m.role}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Render text that may contain @[Name](user-uuid) mention tokens.
// Mentions display as blue clickable pills; plain text segments render normally.
// Props:
//   text             — the raw stored text with tokens
//   onMentionClick   — (member: {userId, displayName}) => void
//   style            — inline style applied to the wrapping span
export function MentionText({ text, onMentionClick, style }) {
  const segments = parseMentionText(text || '')
  return (
    <span style={style}>
      {segments.map((seg, i) => {
        if (seg.type === 'mention') {
          const handle = e => {
            e.stopPropagation()
            e.preventDefault()
            onMentionClick?.({ userId: seg.userId, displayName: seg.displayName })
          }
          return (
            <span
              key={`m-${i}`}
              onClick={onMentionClick ? handle : undefined}
              onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline' }}
              onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none' }}
              style={{
                color: '#185FA5',
                fontWeight: 600,
                cursor: onMentionClick ? 'pointer' : 'default',
              }}
            >
              @{seg.displayName}
            </span>
          )
        }
        return <span key={`t-${i}`}>{seg.content}</span>
      })}
    </span>
  )
}

export function TypeaheadInput({ value, onChange, options, placeholder }) {
  const [focused, setFocused] = useState(false)
  const ref = useRef(null)
  const filtered = options.filter(a => a.toLowerCase().includes((value || "").toLowerCase()))
  const show = focused && (value || "").length === 0
    ? true
    : focused && filtered.length > 0 && !(filtered.length === 1 && filtered[0].toLowerCase() === (value || "").toLowerCase())

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setFocused(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input value={value || ""} onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} placeholder={placeholder || "Type or select..."} style={{ ...iS, minHeight: 44 }} />
      {show && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid var(--md1-border)", borderRadius: 3, boxShadow: "0 4px 12px rgba(var(--md1-primary-rgb),0.1)", zIndex: 10, maxHeight: 150, overflow: "auto", marginTop: 2 }}>
          {((value || "").length === 0 ? options : filtered).map(a => (
            <div key={a} onClick={() => { onChange(a); setFocused(false) }}
              style={{ padding: "10px 12px", fontSize: 12, cursor: "pointer", fontFamily: FNT, color: "var(--md1-text)", minHeight: 44, display: "flex", alignItems: "center" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f0eeec"}
              onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
              {a}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
