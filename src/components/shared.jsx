import { useState, useEffect, useRef } from 'react'
import { FNTM, FNT, iS } from '../lib/constants.js'

export const Badge = ({ label, colorFn }) => {
  const c = colorFn(label)
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 2, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, background: c.bg, color: c.text, textTransform: "uppercase", fontFamily: FNT }}>
      {label}
    </span>
  )
}

export const Tag = ({ label }) => (
  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 2, fontSize: 10, fontWeight: 600, background: "#062044", color: "#FFFFFF", marginRight: 4, marginBottom: 3, fontFamily: FNT, letterSpacing: 0.3 }}>
    {label}
  </span>
)

export const PillFilter = ({ options, selected, onToggle, colorFn, label }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 10, color: "#8a8278", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6, fontFamily: FNT }}>{label}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {options.map(o => {
        const a = selected.includes(o)
        const c = colorFn ? colorFn(o) : { bg: "#f0eeec", text: "#1F1F1F" }
        return (
          <button key={o} onClick={() => onToggle(o)} style={{ padding: "3px 10px", borderRadius: 3, fontSize: 11, fontWeight: a ? 700 : 400, background: a ? c.bg : "transparent", color: a ? c.text : "#8a8278", border: a ? `1px solid ${c.text}44` : "1px solid #D8CEC3", cursor: "pointer", fontFamily: FNT }}>
            {o}
          </button>
        )
      })}
    </div>
  </div>
)

export const Modal = ({ open, onClose, title, children, width = 640 }) => {
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(6,32,68,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#FFFFFF", border: "1px solid #D8CEC3", borderRadius: 4, width: "90%", maxWidth: width, maxHeight: "85vh", overflow: "auto", padding: 28, boxShadow: "0 20px 60px rgba(6,32,68,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#062044", fontFamily: FNT, fontWeight: 800 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#8a8278", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const Field = ({ label, children, hint }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: "block", fontSize: 11, color: "#8a8278", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1, fontFamily: FNT }}>{label}</label>
    {children}
    {hint && <div style={{ fontSize: 10, color: "#b0a898", marginTop: 3, fontStyle: "italic" }}>{hint}</div>}
  </div>
)

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
      <input value={value || ""} onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} placeholder={placeholder || "Type or select..."} style={iS} />
      {show && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #D8CEC3", borderRadius: 3, boxShadow: "0 4px 12px rgba(6,32,68,0.1)", zIndex: 10, maxHeight: 150, overflow: "auto", marginTop: 2 }}>
          {((value || "").length === 0 ? options : filtered).map(a => (
            <div key={a} onClick={() => { onChange(a); setFocused(false) }}
              style={{ padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: FNT, color: "#1F1F1F" }}
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
