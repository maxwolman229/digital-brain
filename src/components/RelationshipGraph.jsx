import { useState, useEffect, useRef } from 'react'
import { FNT, FNTM, statusColor, paColor } from '../lib/constants.js'
import { Badge, PillFilter, Modal } from './shared.jsx'
import { fetchRules, fetchAssertions } from '../lib/db.js'

// ─── Force-directed graph canvas ───────────────────────────────────────────────

function GraphCanvas({ rules, assertions, gpf, gcf, onSelect, highlightId }) {
  const canvasRef = useRef(null)
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const animRef = useRef(null)
  const dragRef = useRef(null)
  const hovRef = useRef(null)
  const szRef = useRef({ w: 800, h: 600 })
  const [tip, setTip] = useState(null)
  const highlightRef = useRef(highlightId)

  useEffect(() => {
    highlightRef.current = highlightId
    // When a highlight is set, nudge that node towards center
    if (highlightId) {
      const n = nodesRef.current.find(x => x.id === highlightId)
      if (n) {
        const W = szRef.current.w, H = szRef.current.h
        n.x = W / 2 + (Math.random() - 0.5) * 60
        n.y = H / 2 + (Math.random() - 0.5) * 60
        n.vx = 0; n.vy = 0
      }
    }
  }, [highlightId])

  // Build nodes + edges whenever data or filters change
  useEffect(() => {
    const all = [...rules, ...assertions]
    const fit = all.filter(i => {
      const mp = gpf.length === 0 || gpf.includes(i.processArea) ||
        gpf.some(p => (i.scope || '').includes(p))
      const mc = gcf.length === 0 || gcf.some(c => (i.category || '').includes(c))
      return mp && mc
    })
    const ids = new Set(fit.map(i => i.id))

    // Group by process area for clustered initial placement
    const groups = {}
    fit.forEach(i => {
      const pa = i.processArea || 'Other'
      if (!groups[pa]) groups[pa] = []
      groups[pa].push(i)
    })

    const W = szRef.current.w, H = szRef.current.h
    const cx = W / 2, cy = H / 2
    const keys = Object.keys(groups)
    const nodes = []

    keys.forEach((pa, gi) => {
      const ang = (gi / Math.max(keys.length, 1)) * Math.PI * 2 - Math.PI / 2
      const cr = Math.min(W, H) * 0.25
      const gx = cx + Math.cos(ang) * cr
      const gy = cy + Math.sin(ang) * cr
      groups[pa].forEach((item, i) => {
        const sa = (i / Math.max(groups[pa].length, 1)) * Math.PI * 2
        const sr = 25 + groups[pa].length * 14
        nodes.push({
          id: item.id,
          label: item.id,
          title: item.title,
          type: item.type,
          processArea: item.processArea || 'Other',
          category: item.category,
          confidence: item.confidence,
          status: item.status,
          x: gx + Math.cos(sa) * sr + (Math.random() - 0.5) * 15,
          y: gy + Math.sin(sa) * sr + (Math.random() - 0.5) * 15,
          vx: 0, vy: 0,
          r: item.type === 'rule' ? 24 : 17,
        })
      })
    })

    const edges = []
    fit.forEach(item => {
      const linked = item.type === 'rule'
        ? (item.linkedAssertions || [])
        : (item.linkedRules || [])
      linked.forEach(tid => {
        if (ids.has(tid) && !edges.find(e =>
          (e.s === item.id && e.t === tid) || (e.s === tid && e.t === item.id)
        )) {
          edges.push({ s: item.id, t: tid })
        }
      })
    })

    nodesRef.current = nodes
    edgesRef.current = edges
  }, [rules, assertions, gpf, gcf])

  // Resize observer
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const p = c.parentElement
    const resize = () => {
      const r = p.getBoundingClientRect()
      szRef.current = { w: r.width, h: r.height }
      c.width = r.width * 2
      c.height = r.height * 2
      c.style.width = r.width + 'px'
      c.style.height = r.height + 'px'
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(p)
    return () => ro.disconnect()
  }, [])

  // Animation loop (force simulation + render)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    let on = true

    const tick = () => {
      if (!on) return
      const ns = nodesRef.current
      const es = edgesRef.current
      const W = szRef.current.w, H = szRef.current.h

      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x, dy = ns[j].y - ns[i].y
          const d = Math.sqrt(dx * dx + dy * dy) || 1
          const f = 3200 / (d * d)
          const fx = dx / d * f, fy = dy / d * f
          ns[i].vx -= fx; ns[i].vy -= fy
          ns[j].vx += fx; ns[j].vy += fy
        }
      }

      // Attraction along edges
      const nm = {}; ns.forEach(n => (nm[n.id] = n))
      es.forEach(e => {
        const a = nm[e.s], b = nm[e.t]
        if (!a || !b) return
        const dx = b.x - a.x, dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = (d - 110) * 0.009
        a.vx += dx / d * f; a.vy += dy / d * f
        b.vx -= dx / d * f; b.vy -= dy / d * f
      })

      // Gravity + damping + integration
      ns.forEach(n => {
        n.vx += (W / 2 - n.x) * 0.012
        n.vy += (H / 2 - n.y) * 0.012
        if (dragRef.current && dragRef.current.id === n.id) return
        n.vx *= 0.86; n.vy *= 0.86
        n.x += n.vx; n.y += n.vy
        n.x = Math.max(n.r + 10, Math.min(W - n.r - 10, n.x))
        n.y = Math.max(n.r + 10, Math.min(H - n.r - 10, n.y))
      })

      // Render
      ctx.save()
      ctx.scale(2, 2)
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H)

      // Dot grid
      ctx.fillStyle = '#e8e4e0'
      for (let x = 0; x < W; x += 30)
        for (let y = 0; y < H; y += 30)
          ctx.fillRect(x, y, 1, 1)

      // Cluster boundary circles + labels
      const cl = {}
      ns.forEach(n => {
        if (!cl[n.processArea]) cl[n.processArea] = { x: 0, y: 0, c: 0 }
        cl[n.processArea].x += n.x; cl[n.processArea].y += n.y; cl[n.processArea].c++
      })
      Object.entries(cl).forEach(([pa, v]) => {
        const ccx = v.x / v.c, ccy = v.y / v.c
        ctx.font = 'bold 10px IBM Plex Sans, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = paColor(pa) + '50'
        ctx.fillText(pa.toUpperCase(), ccx, ccy - 55)
        ctx.beginPath()
        ctx.arc(ccx, ccy, 65 + v.c * 16, 0, Math.PI * 2)
        ctx.strokeStyle = paColor(pa) + '10'; ctx.lineWidth = 1.5
        ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([])
      })

      const hov = hovRef.current

      // Edges
      es.forEach(e => {
        const a = nm[e.s], b = nm[e.t]; if (!a || !b) return
        const hl = hov && (hov.id === e.s || hov.id === e.t)
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        const dx = b.x - a.x, dy = b.y - a.y
        const nx = -dy * 0.08, ny = dx * 0.08
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.quadraticCurveTo(mx + nx, my + ny, b.x, b.y)
        ctx.strokeStyle = hl ? '#4FA89A88' : '#D8CEC380'
        ctx.lineWidth = hl ? 2.5 : 1
        ctx.stroke()
        // Arrowhead at midpoint
        const at = 0.5, dt = 0.01
        const px = (1 - at) * (1 - at) * a.x + 2 * (1 - at) * at * (mx + nx) + at * at * b.x
        const py = (1 - at) * (1 - at) * a.y + 2 * (1 - at) * at * (my + ny) + at * at * b.y
        const px2 = (1 - at - dt) * (1 - at - dt) * a.x + 2 * (1 - at - dt) * (at + dt) * (mx + nx) + (at + dt) * (at + dt) * b.x
        const py2 = (1 - at - dt) * (1 - at - dt) * a.y + 2 * (1 - at - dt) * (at + dt) * (my + ny) + (at + dt) * (at + dt) * b.y
        const ang = Math.atan2(py2 - py, px2 - px)
        ctx.save()
        ctx.translate(px, py); ctx.rotate(ang)
        ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath()
        ctx.fillStyle = hl ? '#4FA89A70' : '#D8CEC360'; ctx.fill()
        ctx.restore()
      })

      // Nodes
      ns.forEach(n => {
        const isH = hov && hov.id === n.id
        const isC = hov && es.some(e =>
          (e.s === hov.id && e.t === n.id) || (e.t === hov.id && e.s === n.id)
        )
        const dim = hov && !isH && !isC
        const col = paColor(n.processArea)
        const isHL = highlightRef.current === n.id

        // Highlight ring for "View in Graph" target
        if (isHL) {
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 14, 0, Math.PI * 2)
          const g = ctx.createRadialGradient(n.x, n.y, n.r, n.x, n.y, n.r + 14)
          g.addColorStop(0, '#F2652F60'); g.addColorStop(1, 'transparent')
          ctx.fillStyle = g; ctx.fill()
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 8, 0, Math.PI * 2)
          ctx.strokeStyle = '#F2652F'; ctx.lineWidth = 2.5; ctx.setLineDash([4, 3])
          ctx.stroke(); ctx.setLineDash([])
        }

        // Glow on hover
        if (isH) {
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 10, 0, Math.PI * 2)
          const g = ctx.createRadialGradient(n.x, n.y, n.r, n.x, n.y, n.r + 10)
          g.addColorStop(0, col + '35'); g.addColorStop(1, 'transparent')
          ctx.fillStyle = g; ctx.fill()
        }

        // Node shape: rounded rect for rules, circle for assertions
        ctx.beginPath()
        if (n.type === 'rule') {
          const s = n.r, x = n.x - s, y = n.y - s, w = s * 2, h = s * 2, cr = 7
          ctx.moveTo(x + cr, y); ctx.lineTo(x + w - cr, y)
          ctx.quadraticCurveTo(x + w, y, x + w, y + cr)
          ctx.lineTo(x + w, y + h - cr)
          ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h)
          ctx.lineTo(x + cr, y + h)
          ctx.quadraticCurveTo(x, y + h, x, y + h - cr)
          ctx.lineTo(x, y + cr)
          ctx.quadraticCurveTo(x, y, x + cr, y)
        } else {
          ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        }

        ctx.fillStyle = dim ? '#FFFFFF0d' : '#FFFFFFf0'; ctx.fill()
        ctx.strokeStyle = dim ? col + '28' : isH ? col : col + '80'
        ctx.lineWidth = isH ? 2.5 : 1.5; ctx.stroke()

        // Label
        ctx.font = `bold ${n.type === 'rule' ? 10 : 9}px 'IBM Plex Mono', monospace`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillStyle = dim ? col + '28' : col
        ctx.fillText(n.label, n.x, n.y)

        // Status dot
        const cc = statusColor(n.status || 'Active')
        ctx.beginPath(); ctx.arc(n.x + n.r - 5, n.y - n.r + 5, 4, 0, Math.PI * 2)
        ctx.fillStyle = dim ? cc.text + '18' : cc.text; ctx.fill()
      })

      ctx.restore()
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => { on = false; cancelAnimationFrame(animRef.current) }
  }, [rules, assertions, gpf, gcf])

  const getNode = e => {
    const r = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    return nodesRef.current.find(n => Math.sqrt((n.x - mx) ** 2 + (n.y - my) ** 2) < n.r + 4)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={e => {
          const n = getNode(e)
          if (n) { dragRef.current = n; n.vx = 0; n.vy = 0 }
        }}
        onMouseMove={e => {
          const r = canvasRef.current.getBoundingClientRect()
          const mx = e.clientX - r.left, my = e.clientY - r.top
          if (dragRef.current) { dragRef.current.x = mx; dragRef.current.y = my; return }
          const n = getNode(e)
          hovRef.current = n || null
          canvasRef.current.style.cursor = n ? 'grab' : 'default'
          setTip(n ? { x: mx, y: my, node: n } : null)
        }}
        onMouseUp={() => { dragRef.current = null }}
        onMouseLeave={() => { dragRef.current = null; hovRef.current = null; setTip(null) }}
        onDoubleClick={e => {
          const n = getNode(e)
          if (n) {
            const it = [...rules, ...assertions].find(i => i.id === n.id)
            if (it) onSelect(it)
          }
        }}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, background: '#FFFFFFee', border: '1px solid #D8CEC3', borderRadius: 3, padding: '10px 14px', fontSize: 10, fontFamily: FNT, color: '#8a8278' }}>
        <div style={{ marginBottom: 6, fontWeight: 700, color: '#062044', letterSpacing: 0.8 }}>LEGEND</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 5 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 2, border: '1.5px solid #F2652F' }} /> Rule
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #4FA89A' }} /> Assertion
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {['EAF', 'Casting', 'Ladle Furnace'].map(pa => (
            <span key={pa} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: paColor(pa) }} /> {pa}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 5, borderTop: '1px solid #D8CEC3', paddingTop: 5 }}>
          {['Proposed', 'Active', 'Verified', 'Established'].map(s => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: statusColor(s).text }} /> {s}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 6, color: '#b0a898', fontStyle: 'italic' }}>Double-click to inspect · Drag to reposition</div>
      </div>

      {/* Hover tooltip */}
      {tip && (
        <div style={{
          position: 'absolute',
          left: Math.min(tip.x + 14, szRef.current.w - 270),
          top: Math.max(tip.y - 12, 10),
          background: '#FFFFFFf0', border: '1px solid #D8CEC3', borderRadius: 3,
          padding: '10px 14px', maxWidth: 260, pointerEvents: 'none',
          boxShadow: '0 8px 24px rgba(6,32,68,0.15)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: paColor(tip.node.processArea), fontFamily: FNT, marginBottom: 4 }}>
            {tip.node.label} · {tip.node.type.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: '#1F1F1F', lineHeight: 1.4, marginBottom: 6 }}>{tip.node.title}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {tip.node.status && <Badge label={tip.node.status} colorFn={statusColor} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Simple detail modal for selected item ─────────────────────────────────────

function ItemDetailModal({ item, onClose, onNavigate }) {
  if (!item) return null
  return (
    <Modal open title={item.id} onClose={onClose} width={500}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#062044', lineHeight: 1.4, marginBottom: 10 }}>
          {item.title}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <Badge label={item.status} colorFn={statusColor} />
          {item.processArea && (
            <span style={{ fontSize: 10, fontWeight: 700, color: paColor(item.processArea), fontFamily: FNT, textTransform: 'uppercase', letterSpacing: 0.6 }}>{item.processArea}</span>
          )}
          {item.category && (
            <span style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT }}>{item.category}</span>
          )}
        </div>
        {item.rationale && (
          <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.6, marginBottom: 12 }}>{item.rationale}</div>
        )}
        {item.scope && (
          <div style={{ fontSize: 11, color: '#8a8278', fontFamily: FNT, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Scope:</span> {item.scope}
          </div>
        )}
        {(item.linkedAssertions?.length > 0 || item.linkedRules?.length > 0) && (
          <div style={{ fontSize: 11, color: '#4FA89A', fontFamily: FNT, marginTop: 8 }}>
            {item.type === 'rule'
              ? `Links to ${item.linkedAssertions.length} assertion${item.linkedAssertions.length !== 1 ? 's' : ''}`
              : `Links to ${item.linkedRules.length} rule${item.linkedRules.length !== 1 ? 's' : ''}`}
          </div>
        )}
      </div>
      <div style={{ borderTop: '1px solid #e8e4e0', paddingTop: 14, display: 'flex', gap: 8 }}>
        <button
          onClick={() => { onClose(); onNavigate?.(item.type === 'rule' ? 'rules' : 'assertions') }}
          style={{ padding: '7px 14px', borderRadius: 3, fontSize: 12, background: '#062044', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: FNT, fontWeight: 700 }}
        >View Full Record</button>
        <button
          onClick={onClose}
          style={{ padding: '7px 14px', borderRadius: 3, fontSize: 12, background: 'transparent', border: '1px solid #D8CEC3', color: '#5a5550', cursor: 'pointer', fontFamily: FNT }}
        >Close</button>
      </div>
    </Modal>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function RelationshipGraph({ onNavigate, highlightId, onClearHighlight, processAreas = [], categories = [] }) {
  const [rules, setRules] = useState([])
  const [assertions, setAssertions] = useState([])
  const [loading, setLoading] = useState(true)
  const [gpf, setGpf] = useState([])  // graph process filter
  const [gcf, setGcf] = useState([])  // graph category filter
  const [sel, setSel] = useState(null)

  useEffect(() => {
    Promise.all([fetchRules(), fetchAssertions()]).then(([r, a]) => {
      setRules(r)
      setAssertions(a)
      setLoading(false)
    })
  }, [])

  const tog = (arr, setArr, v) =>
    setArr(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b0a898', fontFamily: FNT, fontSize: 13 }}>
      Loading graph…
    </div>
  )

  const totalNodes = rules.length + assertions.length
  const linkedCount = [...rules, ...assertions].filter(i =>
    (i.linkedAssertions?.length > 0) || (i.linkedRules?.length > 0)
  ).length

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* Filter panel */}
      <div style={{ width: 200, borderRight: '1px solid #e8e4e0', padding: '20px 14px', flexShrink: 0, background: '#FAFAF9', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, color: '#4FA89A', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12, fontFamily: FNT, fontWeight: 700 }}>Graph Filters</div>

        <PillFilter
          label="Process Area"
          options={processAreas}
          selected={gpf}
          onToggle={v => tog(gpf, setGpf, v)}
          colorFn={p => ({ bg: paColor(p) + '22', text: paColor(p) })}
        />
        <PillFilter
          label="Category"
          options={categories}
          selected={gcf}
          onToggle={v => tog(gcf, setGcf, v)}
        />

        {(gpf.length > 0 || gcf.length > 0) && (
          <button
            onClick={() => { setGpf([]); setGcf([]) }}
            style={{ marginTop: 4, background: 'none', border: 'none', color: '#4FA89A', fontSize: 11, cursor: 'pointer', fontFamily: FNT }}
          >✕ Clear filters</button>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #D8CEC3', fontSize: 10, color: '#b0a898', fontFamily: FNT, lineHeight: 1.7 }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#062044', fontWeight: 700 }}>{totalNodes}</span> nodes
            {' · '}
            <span style={{ color: '#4FA89A', fontWeight: 700 }}>{linkedCount}</span> linked
          </div>
          Nodes clustered by process area. Edges show rule↔assertion links. Filter to isolate knowledge chains.
        </div>
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <GraphCanvas
          rules={rules}
          assertions={assertions}
          gpf={gpf}
          gcf={gcf}
          onSelect={(it) => { setSel(it); onClearHighlight?.() }}
          highlightId={highlightId}
        />
      </div>

      <ItemDetailModal
        item={sel}
        onClose={() => setSel(null)}
        onNavigate={onNavigate}
      />
    </div>
  )
}
