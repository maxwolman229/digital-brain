import { useRef, useEffect, useState } from 'react'
import { paColor, statusColor, FNTM } from '../lib/constants.js'
import { Badge } from './shared.jsx'

export default function GraphView({ rules, assertions, gpf, gcf, onSelect, focusNodeId }) {
  const canvasRef = useRef(null)
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const animRef = useRef(null)
  const dragRef = useRef(null)
  const hovRef = useRef(null)
  const focusRef = useRef(focusNodeId)
  const [tip, setTip] = useState(null)
  const szRef = useRef({ w: 800, h: 600 })

  useEffect(() => { focusRef.current = focusNodeId }, [focusNodeId])

  useEffect(() => {
    const all = [...rules, ...assertions]
    const fit = all.filter(i => {
      const mp = gpf.length === 0 || gpf.includes(i.processArea) || gpf.some(p => (i.scope || "").includes(p))
      const mc = gcf.length === 0 || gcf.some(c => (i.category || "").includes(c))
      return mp && mc
    })
    const ids = new Set(fit.map(i => i.id))
    const groups = {}
    fit.forEach(i => { const pa = i.processArea || "Other"; if (!groups[pa]) groups[pa] = []; groups[pa].push(i) })
    const cx = szRef.current.w / 2, cy = szRef.current.h / 2
    const keys = Object.keys(groups)
    const nodes = []
    keys.forEach((pa, gi) => {
      const ang = (gi / Math.max(keys.length, 1)) * Math.PI * 2 - Math.PI / 2
      const cr = Math.min(szRef.current.w, szRef.current.h) * 0.25
      const gx = cx + Math.cos(ang) * cr, gy = cy + Math.sin(ang) * cr
      groups[pa].forEach((item, i) => {
        const sa = (i / Math.max(groups[pa].length, 1)) * Math.PI * 2
        const sr = 25 + groups[pa].length * 14
        nodes.push({ id: item.id, label: item.id, title: item.title, type: item.type, processArea: item.processArea || "Other", category: item.category, confidence: item.confidence, status: item.status, x: gx + Math.cos(sa) * sr + (Math.random() - 0.5) * 15, y: gy + Math.sin(sa) * sr + (Math.random() - 0.5) * 15, vx: 0, vy: 0, r: item.type === "rule" ? 24 : 17 })
      })
    })
    const edges = []
    fit.forEach(item => {
      (item.type === "rule" ? (item.linkedAssertions || []) : (item.linkedRules || [])).forEach(tid => {
        if (ids.has(tid) && !edges.find(e => (e.s === item.id && e.t === tid) || (e.s === tid && e.t === item.id)))
          edges.push({ s: item.id, t: tid })
      })
    })
    nodesRef.current = nodes
    edgesRef.current = edges
  }, [rules, assertions, gpf, gcf])

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const p = c.parentElement
    const resize = () => {
      const r = p.getBoundingClientRect()
      szRef.current = { w: r.width, h: r.height }
      c.width = r.width * 2; c.height = r.height * 2
      c.style.width = r.width + "px"; c.style.height = r.height + "px"
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(p)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext("2d")
    let on = true
    const tick = () => {
      if (!on) return
      const ns = nodesRef.current, es = edgesRef.current
      const W = szRef.current.w, H = szRef.current.h
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
        const dx = ns[j].x - ns[i].x, dy = ns[j].y - ns[i].y, d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = 3200 / (d * d), fx = dx / d * f, fy = dy / d * f
        ns[i].vx -= fx; ns[i].vy -= fy; ns[j].vx += fx; ns[j].vy += fy
      }
      const nm = {}; ns.forEach(n => nm[n.id] = n)
      es.forEach(e => {
        const a = nm[e.s], b = nm[e.t]; if (!a || !b) return
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - 110) * 0.009
        a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f
      })
      ns.forEach(n => {
        n.vx += (W / 2 - n.x) * 0.012; n.vy += (H / 2 - n.y) * 0.012
        if (dragRef.current && dragRef.current.id === n.id) return
        n.vx *= 0.86; n.vy *= 0.86; n.x += n.vx; n.y += n.vy
        n.x = Math.max(n.r + 10, Math.min(W - n.r - 10, n.x))
        n.y = Math.max(n.r + 10, Math.min(H - n.r - 10, n.y))
      })
      ctx.save(); ctx.scale(2, 2)
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H)
      ctx.fillStyle = "#e8e4e0"
      for (let x = 0; x < W; x += 30) for (let y = 0; y < H; y += 30) ctx.fillRect(x, y, 1, 1)
      const cl = {}
      ns.forEach(n => { if (!cl[n.processArea]) cl[n.processArea] = { x: 0, y: 0, c: 0 }; cl[n.processArea].x += n.x; cl[n.processArea].y += n.y; cl[n.processArea].c++ })
      Object.entries(cl).forEach(([pa, v]) => {
        const cx = v.x / v.c, cy = v.y / v.c
        ctx.font = "bold 10px IBM Plex Sans, sans-serif"; ctx.textAlign = "center"
        ctx.fillStyle = paColor(pa) + "50"; ctx.fillText(pa.toUpperCase(), cx, cy - 55)
        ctx.beginPath(); ctx.arc(cx, cy, 65 + v.c * 16, 0, Math.PI * 2)
        ctx.strokeStyle = paColor(pa) + "10"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([])
      })
      const hov = hovRef.current
      const focId = focusRef.current
      const focConnected = focId ? new Set(es.filter(e => e.s === focId || e.t === focId).flatMap(e => [e.s, e.t])) : null
      es.forEach(e => {
        const a = nm[e.s], b = nm[e.t]; if (!a || !b) return
        const hl = hov && (hov.id === e.s || hov.id === e.t)
        const fl = focId && (e.s === focId || e.t === focId)
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        const dx = b.x - a.x, dy = b.y - a.y, nx = -dy * 0.08, ny = dx * 0.08
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx + nx, my + ny, b.x, b.y)
        ctx.strokeStyle = (hl || fl) ? "#4FA89A88" : focId && !fl ? "#D8CEC318" : "#D8CEC380"; ctx.lineWidth = (hl || fl) ? 2.5 : 1; ctx.stroke()
        const at = 0.5, dt = 0.01
        const px = (1 - at) * (1 - at) * a.x + 2 * (1 - at) * at * (mx + nx) + at * at * b.x
        const py = (1 - at) * (1 - at) * a.y + 2 * (1 - at) * at * (my + ny) + at * at * b.y
        const px2 = (1 - at - dt) * (1 - at - dt) * a.x + 2 * (1 - at - dt) * (at + dt) * (mx + nx) + (at + dt) * (at + dt) * b.x
        const py2 = (1 - at - dt) * (1 - at - dt) * a.y + 2 * (1 - at - dt) * (at + dt) * (my + ny) + (at + dt) * (at + dt) * b.y
        const ang = Math.atan2(py2 - py, px2 - px)
        ctx.save(); ctx.translate(px, py); ctx.rotate(ang)
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath()
        ctx.fillStyle = (hl || fl) ? "#4FA89A70" : "#D8CEC360"; ctx.fill(); ctx.restore()
      })
      ns.forEach(n => {
        const isH = hov && hov.id === n.id
        const isC = hov && es.some(e => (e.s === hov.id && e.t === n.id) || (e.t === hov.id && e.s === n.id))
        const isFoc = focId && n.id === focId
        const isFocC = focConnected && focConnected.has(n.id)
        const dim = (hov && !isH && !isC) || (focId && !isFoc && !isFocC)
        const col = paColor(n.processArea)
        if (isH || isFoc) {
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + (isFoc ? 14 : 10), 0, Math.PI * 2)
          const g = ctx.createRadialGradient(n.x, n.y, n.r, n.x, n.y, n.r + (isFoc ? 14 : 10))
          g.addColorStop(0, (isFoc ? "#F2652F" : col) + "35"); g.addColorStop(1, "transparent")
          ctx.fillStyle = g; ctx.fill()
        }
        ctx.beginPath()
        if (n.type === "rule") {
          const s = n.r, x = n.x - s, y = n.y - s, w = s * 2, h = s * 2, cr = 7
          ctx.moveTo(x + cr, y); ctx.lineTo(x + w - cr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + cr)
          ctx.lineTo(x + w, y + h - cr); ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h)
          ctx.lineTo(x + cr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - cr)
          ctx.lineTo(x, y + cr); ctx.quadraticCurveTo(x, y, x + cr, y)
        } else {
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        }
        ctx.fillStyle = dim ? "#FFFFFF0d" : "#FFFFFFf0"; ctx.fill()
        ctx.strokeStyle = dim ? col + "28" : isH ? col : col + "80"; ctx.lineWidth = isH ? 2.5 : 1.5; ctx.stroke()
        ctx.font = `bold ${n.type === "rule" ? 10 : 9}px IBM Plex Sans, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"
        ctx.fillStyle = dim ? col + "28" : col; ctx.fillText(n.label, n.x, n.y)
        const cc = statusColor(n.status || "Active")
        ctx.beginPath(); ctx.arc(n.x + n.r - 5, n.y - n.r + 5, 4, 0, Math.PI * 2)
        ctx.fillStyle = dim ? cc.text + "18" : cc.text; ctx.fill()
      })
      ctx.restore()
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { on = false; cancelAnimationFrame(animRef.current) }
  }, [rules, assertions, gpf, gcf])

  const getN = e => {
    const r = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    return nodesRef.current.find(n => Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2) < n.r + 4)
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef}
        onMouseDown={e => { const n = getN(e); if (n) { dragRef.current = n; n.vx = 0; n.vy = 0 } }}
        onMouseMove={e => {
          const r = canvasRef.current.getBoundingClientRect()
          const mx = e.clientX - r.left, my = e.clientY - r.top
          if (dragRef.current) { dragRef.current.x = mx; dragRef.current.y = my; return }
          const n = getN(e); hovRef.current = n || null; canvasRef.current.style.cursor = n ? "grab" : "default"
          setTip(n ? { x: mx, y: my, node: n } : null)
        }}
        onMouseUp={() => { dragRef.current = null }}
        onMouseLeave={() => { dragRef.current = null; hovRef.current = null; setTip(null) }}
        onDoubleClick={e => { const n = getN(e); if (n) { const it = [...rules, ...assertions].find(i => i.id === n.id); if (it) onSelect(it) } }}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
      <div style={{ position: "absolute", bottom: 16, left: 16, background: "#FFFFFFee", border: "1px solid #D8CEC3", borderRadius: 3, padding: "10px 14px", fontSize: 10, fontFamily: FNT, color: "#8a8278" }}>
        <div style={{ marginBottom: 6, fontWeight: 700, color: "#062044", letterSpacing: 0.8 }}>LEGEND</div>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 5 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 2, border: "1.5px solid #F2652F" }} /> Rule</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", border: "1.5px solid #4FA89A" }} /> Assertion</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {["EAF", "Casting", "Ladle Furnace"].map(pa => <span key={pa} style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: paColor(pa) }} /> {pa}</span>)}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 5, borderTop: "1px solid #D8CEC3", paddingTop: 5 }}>
          {["Proposed", "Active", "Verified", "Established"].map(s => <span key={s} style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: statusColor(s).bg === "#155724" ? "#155724" : statusColor(s).text }} /> {s}</span>)}
        </div>
        <div style={{ marginTop: 6, color: "#b0a898", fontStyle: "italic" }}>Double-click node to inspect · Drag to reposition</div>
      </div>
      {tip && (
        <div style={{ position: "absolute", left: Math.min(tip.x + 14, szRef.current.w - 270), top: Math.max(tip.y - 12, 10), background: "#FFFFFFf0", border: "1px solid #D8CEC3", borderRadius: 3, padding: "10px 14px", maxWidth: 260, pointerEvents: "none", boxShadow: "0 8px 24px rgba(6,32,68,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: paColor(tip.node.processArea), fontFamily: FNT, marginBottom: 4 }}>{tip.node.label} · {tip.node.type.toUpperCase()}</div>
          <div style={{ fontSize: 11, color: "#1F1F1F", lineHeight: 1.4, marginBottom: 6 }}>{tip.node.title}</div>
          <div style={{ display: "flex", gap: 4 }}>{tip.node.status && <Badge label={tip.node.status} colorFn={statusColor} />}</div>
        </div>
      )}
    </div>
  )
}
