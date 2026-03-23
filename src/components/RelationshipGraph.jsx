import { useState, useEffect, useRef } from 'react'
import { FNT, FNTM, statusColor, paColor } from '../lib/constants.js'
import { Badge, PillFilter, Modal } from './shared.jsx'
import { useIsMobile } from '../lib/hooks.js'
import { fetchRules, fetchAssertions, fetchAllLinksForGraph, fetchItemById } from '../lib/db.js'
import Comments from './Comments.jsx'
import Verifications from './Verifications.jsx'
import LinkEditor from './LinkEditor.jsx'

// ─── Force-directed graph canvas ───────────────────────────────────────────────

function edgeCol(relType) {
  return ({
    supports:     '#4FA89A',
    contradicts:  '#c0392b',
    relates_to:   '#B0A898',
    derived_from: '#4466AA',
    supersedes:   '#F2652F',
    caused_by:    '#c0392b',
    mitigates:    '#16a085',
  })[relType] || '#B0A898'
}

// Draw a rounded rectangle path (reusable)
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// Soft pastel background colours per process area (distinct enough to be useful)
const CLUSTER_FILLS = [
  '#D6EAF8', '#D5F5E3', '#FEF9E7', '#FDEDEC', '#F4ECF7',
  '#E8F8F5', '#FDF2E9', '#EBF5FB', '#F9EBEA', '#E9F7EF',
]
const clusterFillCache = {}
let clusterFillIdx = 0
function clusterFill(pa) {
  if (!clusterFillCache[pa]) {
    clusterFillCache[pa] = CLUSTER_FILLS[clusterFillIdx % CLUSTER_FILLS.length]
    clusterFillIdx++
  }
  return clusterFillCache[pa]
}

// Wrap text into lines fitting within maxWidth (canvas units). Returns array of strings.
function wrapText(ctx, text, maxW, maxLines) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (ctx.measureText(test).width <= maxW) {
      line = test
    } else {
      if (line) lines.push(line)
      line = w
    }
    if (lines.length >= maxLines) break
  }
  if (line && lines.length < maxLines) lines.push(line)
  // Truncate last line if needed
  const last = lines[lines.length - 1]
  if (last && ctx.measureText(last).width > maxW) {
    lines[lines.length - 1] = last.slice(0, Math.floor(last.length * 0.7)) + '…'
  }
  return lines
}

function GraphCanvas({ rules, assertions, links, gpf, gcf, onSelect, highlightId, processAreas = [] }) {
  const canvasRef = useRef(null)
  const nodesRef = useRef([])
  const edgesRef = useRef([])
  const animRef = useRef(null)
  const dragRef = useRef(null)
  const hovRef = useRef(null)
  const hovEdgeRef = useRef(null)
  const edgeMidsRef = useRef([])
  const didDragRef = useRef(false)
  const mouseDownPosRef = useRef(null)
  const szRef = useRef({ w: 800, h: 600 })
  const clusterIdealRef = useRef({})

  // Zoom / pan
  const zoomRef = useRef(1)
  const targetZoomRef = useRef(1)
  const camRef = useRef({ x: 400, y: 300 })   // world coords shown at screen centre
  const isPanningRef = useRef(false)
  const panStartRef = useRef(null)             // { sx, sy, camX, camY }

  const [tip, setTip] = useState(null)
  const highlightRef = useRef(highlightId)
  const onSelectRef = useRef(onSelect)

  // Convert screen (CSS pixel) coords to world coords
  const toWorld = (sx, sy) => {
    const { w: W, h: H } = szRef.current
    const z = zoomRef.current
    const c = camRef.current
    return { x: (sx - W / 2) / z + c.x, y: (sy - H / 2) / z + c.y }
  }

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    highlightRef.current = highlightId
    if (highlightId) {
      const n = nodesRef.current.find(x => x.id === highlightId)
      if (n) {
        camRef.current = { x: n.x, y: n.y }
        targetZoomRef.current = 1.6
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

    const groups = {}
    fit.forEach(i => {
      const pa = i.processArea || 'Other'
      if (!groups[pa]) groups[pa] = []
      groups[pa].push(i)
    })

    const W = szRef.current.w, H = szRef.current.h
    const cx = W / 2, cy = H / 2

    const allPAs = processAreas.length > 0 ? [...processAreas] : Object.keys(groups)
    Object.keys(groups).forEach(pa => { if (!allPAs.includes(pa)) allPAs.push(pa) })

    const ideal = {}
    allPAs.forEach((pa, i) => {
      const ang = (i / Math.max(allPAs.length, 1)) * Math.PI * 2 - Math.PI / 2
      const cr = Math.min(W, H) * 0.29
      ideal[pa] = { x: cx + Math.cos(ang) * cr, y: cy + Math.sin(ang) * cr }
    })
    clusterIdealRef.current = ideal

    const nodes = []
    Object.keys(groups).forEach(pa => {
      const { x: gx, y: gy } = ideal[pa] || { x: cx, y: cy }
      groups[pa].forEach((item, i) => {
        const sa = (i / Math.max(groups[pa].length, 1)) * Math.PI * 2
        const sr = 28 + groups[pa].length * 13
        nodes.push({
          id: item.id, label: item.id, title: item.title || '',
          type: item.type, processArea: item.processArea || 'Other',
          category: item.category, confidence: item.confidence, status: item.status,
          x: gx + Math.cos(sa) * sr + (Math.random() - 0.5) * 12,
          y: gy + Math.sin(sa) * sr + (Math.random() - 0.5) * 12,
          vx: 0, vy: 0,
          r: item.type === 'rule' ? 24 : 17,
        })
      })
    })

    const edges = []
    links.forEach(l => {
      const s = l.source_id, t = l.target_id
      if (ids.has(s) && ids.has(t) && !edges.find(e =>
        (e.s === s && e.t === t) || (e.s === t && e.t === s)
      )) {
        edges.push({ s, t, relType: l.relationship_type || 'relates_to', comment: l.comment || '' })
      }
    })

    nodesRef.current = nodes
    edgesRef.current = edges

    // Reset view to show all nodes
    if (nodes.length) {
      camRef.current = { x: cx, y: cy }
      targetZoomRef.current = 1
      zoomRef.current = 1
    }
  }, [rules, assertions, links, gpf, gcf, processAreas])

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

  // Fit-all helper (also used by button)
  const fitAll = () => {
    const ns = nodesRef.current
    if (!ns.length) return
    const { w: W, h: H } = szRef.current
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    ns.forEach(n => {
      minX = Math.min(minX, n.x - n.r)
      maxX = Math.max(maxX, n.x + n.r)
      minY = Math.min(minY, n.y - n.r)
      maxY = Math.max(maxY, n.y + n.r)
    })
    const gw = maxX - minX, gh = maxY - minY
    if (!gw || !gh) return
    const newZoom = Math.min((W - 80) / gw, (H - 80) / gh, 2.5) * 0.9
    targetZoomRef.current = newZoom
    camRef.current = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  }

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
      const { w: W, h: H } = szRef.current
      const ideal = clusterIdealRef.current

      // Smooth zoom interpolation (for button-driven zoom only; wheel sets directly)
      const tz = targetZoomRef.current
      const cz = zoomRef.current
      if (Math.abs(tz - cz) > 0.001) zoomRef.current = cz + (tz - cz) * 0.15
      const zoom = zoomRef.current

      // ── Force simulation ────────────────────────────────────────────────────
      // Node-node repulsion
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

      // Edge spring attraction
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

      // Cluster attraction toward ideal positions
      ns.forEach(n => {
        const ip = ideal[n.processArea]
        if (ip) {
          n.vx += (ip.x - n.x) * 0.016
          n.vy += (ip.y - n.y) * 0.016
        } else {
          n.vx += (W / 2 - n.x) * 0.008
          n.vy += (H / 2 - n.y) * 0.008
        }
      })

      // Damping + integration (no viewport clamping — pan/zoom handles visibility)
      ns.forEach(n => {
        if (dragRef.current && dragRef.current.id === n.id) return
        n.vx *= 0.86; n.vy *= 0.86
        n.x += n.vx; n.y += n.vy
      })

      // ── RENDER ────────────────────────────────────────────────────────────────
      const cam = camRef.current

      ctx.save()
      ctx.scale(2, 2)  // retina DPR
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H)

      // Apply camera transform — everything below is in world coordinates
      ctx.save()
      ctx.translate(W / 2, H / 2)
      ctx.scale(zoom, zoom)
      ctx.translate(-cam.x, -cam.y)

      // Dot grid (world-space, only within visible region)
      const wx0 = cam.x - W / 2 / zoom, wx1 = cam.x + W / 2 / zoom
      const wy0 = cam.y - H / 2 / zoom, wy1 = cam.y + H / 2 / zoom
      const gs = 30
      ctx.fillStyle = '#e8e4e0'
      for (let x = Math.floor(wx0 / gs) * gs; x < wx1; x += gs)
        for (let y = Math.floor(wy0 / gs) * gs; y < wy1; y += gs)
          ctx.fillRect(x, y, 1 / zoom, 1 / zoom)

      // ── Cluster backgrounds ────────────────────────────────────────────────
      const bounds = {}
      ns.forEach(n => {
        if (!bounds[n.processArea]) bounds[n.processArea] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
        const b = bounds[n.processArea]
        b.minX = Math.min(b.minX, n.x - n.r)
        b.minY = Math.min(b.minY, n.y - n.r)
        b.maxX = Math.max(b.maxX, n.x + n.r)
        b.maxY = Math.max(b.maxY, n.y + n.r)
      })

      const PAD = 26, LH = 18
      Object.entries(bounds).forEach(([pa, b]) => {
        const fill = clusterFill(pa)
        const col = paColor(pa)
        const x = b.minX - PAD, y = b.minY - PAD - LH
        const w = (b.maxX - b.minX) + PAD * 2
        const h = (b.maxY - b.minY) + PAD * 2 + LH
        roundRect(ctx, x, y, w, h, 14)
        ctx.fillStyle = fill + 'cc'; ctx.fill()
        ctx.strokeStyle = col + '40'; ctx.lineWidth = 1; ctx.stroke()
        ctx.font = 'bold 9px "IBM Plex Sans", sans-serif'
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = col + 'dd'
        ctx.fillText(pa.toUpperCase(), x + 10, y + 12)
      })

      // ── Empty process area ghost regions ──────────────────────────────────
      if (gpf.length === 0) {
        const activePAs = new Set(Object.keys(bounds))
        processAreas.filter(pa => !activePAs.has(pa)).forEach(pa => {
          const ip = ideal[pa]; if (!ip) return
          const gw = 100, gh = 52, gr = 12
          const gx = ip.x - gw / 2, gy = ip.y - gh / 2
          const col = paColor(pa)
          roundRect(ctx, gx, gy, gw, gh, gr)
          ctx.fillStyle = col + '08'; ctx.fill()
          ctx.setLineDash([4, 5])
          ctx.strokeStyle = col + '45'; ctx.lineWidth = 1; ctx.stroke()
          ctx.setLineDash([])
          ctx.font = 'bold 8px "IBM Plex Sans", sans-serif'
          ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
          ctx.fillStyle = col + '70'
          ctx.fillText(pa.toUpperCase(), ip.x, ip.y - 6)
          ctx.font = '8px "IBM Plex Sans", sans-serif'
          ctx.fillStyle = col + '55'
          ctx.fillText('no knowledge yet', ip.x, ip.y + 8)
        })
      }

      const hov = hovRef.current
      const hovEdge = hovEdgeRef.current

      // ── Edges ────────────────────────────────────────────────────────────────
      const mids = []
      es.forEach(e => {
        const a = nm[e.s], b = nm[e.t]; if (!a || !b) return
        const crossCluster = a.processArea !== b.processArea
        const hl = hov && (hov.id === e.s || hov.id === e.t)
        const isHovEdge = hovEdge && hovEdge.s === e.s && hovEdge.t === e.t
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        const dx = b.x - a.x, dy = b.y - a.y
        const nx = -dy * 0.08, ny = dx * 0.08
        const col = edgeCol(e.relType)
        mids.push({ cx: mx + nx * 0.5, cy: my + ny * 0.5, e, crossCluster })
        const baseAlpha = crossCluster ? '99' : '55'
        const hlAlpha   = crossCluster ? 'ff' : 'cc'
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.quadraticCurveTo(mx + nx, my + ny, b.x, b.y)
        if (crossCluster && !hl && !isHovEdge) ctx.setLineDash([6, 3])
        ctx.strokeStyle = (hl || isHovEdge) ? col + hlAlpha : col + baseAlpha
        ctx.lineWidth = (crossCluster ? (hl || isHovEdge ? 3 : 1.5) : (hl || isHovEdge ? 2.5 : 1)) / zoom
        ctx.stroke(); ctx.setLineDash([])
        // Arrowhead
        const at = 0.5, dt = 0.01
        const px = (1-at)*(1-at)*a.x + 2*(1-at)*at*(mx+nx) + at*at*b.x
        const py = (1-at)*(1-at)*a.y + 2*(1-at)*at*(my+ny) + at*at*b.y
        const px2 = (1-at-dt)*(1-at-dt)*a.x + 2*(1-at-dt)*(at+dt)*(mx+nx) + (at+dt)*(at+dt)*b.x
        const py2 = (1-at-dt)*(1-at-dt)*a.y + 2*(1-at-dt)*(at+dt)*(my+ny) + (at+dt)*(at+dt)*b.y
        const ang = Math.atan2(py2-py, px2-px)
        ctx.save(); ctx.translate(px, py); ctx.rotate(ang)
        ctx.beginPath(); ctx.moveTo(6/zoom, 0); ctx.lineTo(-4/zoom, -4/zoom); ctx.lineTo(-4/zoom, 4/zoom); ctx.closePath()
        ctx.fillStyle = (hl || isHovEdge) ? col + 'cc' : col + (crossCluster ? '88' : '44'); ctx.fill()
        ctx.restore()
      })
      edgeMidsRef.current = mids

      // ── Nodes ────────────────────────────────────────────────────────────────
      // Label alpha: fades in from zoom 0.4→0.8
      const labelAlpha = Math.max(0, Math.min(1, (zoom - 0.4) / 0.4))

      ns.forEach(n => {
        const isH = hov && hov.id === n.id
        const isC = hov && es.some(e =>
          (e.s === hov.id && e.t === n.id) || (e.t === hov.id && e.s === n.id)
        )
        const dim = hov && !isH && !isC
        const col = paColor(n.processArea)
        const isHL = highlightRef.current === n.id

        // Highlight ring
        if (isHL) {
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 14, 0, Math.PI * 2)
          const g = ctx.createRadialGradient(n.x, n.y, n.r, n.x, n.y, n.r + 14)
          g.addColorStop(0, '#F2652F60'); g.addColorStop(1, 'transparent')
          ctx.fillStyle = g; ctx.fill()
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 8, 0, Math.PI * 2)
          ctx.strokeStyle = '#F2652F'; ctx.lineWidth = 2.5 / zoom; ctx.setLineDash([4, 3])
          ctx.stroke(); ctx.setLineDash([])
        }

        // Glow on hover
        if (isH) {
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 10, 0, Math.PI * 2)
          const g = ctx.createRadialGradient(n.x, n.y, n.r, n.x, n.y, n.r + 10)
          g.addColorStop(0, col + '35'); g.addColorStop(1, 'transparent')
          ctx.fillStyle = g; ctx.fill()
        }

        // Node shape
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
        ctx.lineWidth = (isH ? 2.5 : 1.5) / zoom; ctx.stroke()

        // Title label — world-space font size stays fixed so it scales up on
        // screen as the user zooms in. Capped at 16px on screen to avoid overflow.
        if (labelAlpha > 0 && n.title) {
          const BASE_WORLD_PX = 7.5          // font size in world coords (appears as 7.5*zoom px on screen)
          const MAX_SCREEN_PX = 16           // cap so text never overflows node at high zoom
          const fontSize = Math.min(BASE_WORLD_PX, MAX_SCREEN_PX / zoom)
          // maxW widens as zoom increases so more text wraps at higher zoom
          const maxW = n.r * (zoom < 1 ? 1.55 : Math.min(2.2, 1.55 + (zoom - 1) * 0.5))
          ctx.font = `${fontSize}px "IBM Plex Sans", sans-serif`
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          // More lines as zoom increases — zooming in reveals more of the title
          const maxLines = n.type === 'rule'
            ? (zoom < 0.9 ? 1 : zoom < 1.8 ? 2 : 3)
            : (zoom < 1.4 ? 1 : 2)
          const lines = wrapText(ctx, n.title, maxW, maxLines)
          const lineH = fontSize * 1.3
          const totalH = lines.length * lineH
          const startY = n.y - totalH / 2 + lineH / 2
          ctx.globalAlpha = labelAlpha * (dim ? 0.2 : 0.8)
          ctx.fillStyle = '#1F1F1F'
          lines.forEach((line, i) => ctx.fillText(line, n.x, startY + i * lineH))
          ctx.globalAlpha = 1
        }

        // Status dot
        const cc = statusColor(n.status || 'Active')
        ctx.beginPath(); ctx.arc(n.x + n.r - 5, n.y - n.r + 5, 4, 0, Math.PI * 2)
        ctx.fillStyle = dim ? cc.text + '18' : cc.text; ctx.fill()
      })

      ctx.restore() // camera transform
      ctx.restore() // retina scale

      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    return () => { on = false; cancelAnimationFrame(animRef.current) }
  }, [rules, assertions, links, gpf, gcf])

  // Touch event handlers (passive: false so we can call preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let lastPinch = null

    function getTouchPos(touch) {
      const rect = canvas.getBoundingClientRect()
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }

    function getNodeAt(sx, sy) {
      const { w: W, h: H } = szRef.current
      const z = zoomRef.current
      const c = camRef.current
      const wx = (sx - W / 2) / z + c.x
      const wy = (sy - H / 2) / z + c.y
      return nodesRef.current.find(n => Math.sqrt((n.x - wx) ** 2 + (n.y - wy) ** 2) < n.r + 4 / z)
    }

    function onTouchStart(e) {
      e.preventDefault()
      setTip(null)
      if (e.touches.length === 1) {
        const pos = getTouchPos(e.touches[0])
        const node = getNodeAt(pos.x, pos.y)
        didDragRef.current = false
        mouseDownPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        if (node) {
          dragRef.current = node; node.vx = 0; node.vy = 0
        } else {
          isPanningRef.current = true
          panStartRef.current = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, camX: camRef.current.x, camY: camRef.current.y }
        }
        lastPinch = null
      } else if (e.touches.length === 2) {
        dragRef.current = null
        isPanningRef.current = false
        const t0 = getTouchPos(e.touches[0])
        const t1 = getTouchPos(e.touches[1])
        lastPinch = {
          dist: Math.hypot(t1.x - t0.x, t1.y - t0.y),
          midX: (t0.x + t1.x) / 2,
          midY: (t0.y + t1.y) / 2,
          zoom: zoomRef.current,
          camX: camRef.current.x,
          camY: camRef.current.y,
        }
      }
    }

    function onTouchMove(e) {
      e.preventDefault()
      if (e.touches.length === 1 && !lastPinch) {
        const pos = getTouchPos(e.touches[0])
        if (dragRef.current) {
          didDragRef.current = true
          const { w: W, h: H } = szRef.current
          const z = zoomRef.current
          const c = camRef.current
          dragRef.current.x = (pos.x - W / 2) / z + c.x
          dragRef.current.y = (pos.y - H / 2) / z + c.y
          return
        }
        if (isPanningRef.current && panStartRef.current) {
          didDragRef.current = true
          const dx = e.touches[0].clientX - panStartRef.current.sx
          const dy = e.touches[0].clientY - panStartRef.current.sy
          camRef.current = {
            x: panStartRef.current.camX - dx / zoomRef.current,
            y: panStartRef.current.camY - dy / zoomRef.current,
          }
        }
      } else if (e.touches.length === 2 && lastPinch) {
        const t0 = getTouchPos(e.touches[0])
        const t1 = getTouchPos(e.touches[1])
        const dist = Math.hypot(t1.x - t0.x, t1.y - t0.y)
        const midX = (t0.x + t1.x) / 2
        const midY = (t0.y + t1.y) / 2
        const { w: W, h: H } = szRef.current
        const newZoom = Math.max(0.15, Math.min(5, lastPinch.zoom * (dist / lastPinch.dist)))
        const wx0 = (lastPinch.midX - W / 2) / lastPinch.zoom + lastPinch.camX
        const wy0 = (lastPinch.midY - H / 2) / lastPinch.zoom + lastPinch.camY
        zoomRef.current = newZoom
        targetZoomRef.current = newZoom
        camRef.current = {
          x: wx0 - (midX - W / 2) / newZoom,
          y: wy0 - (midY - H / 2) / newZoom,
        }
      }
    }

    function onTouchEnd(e) {
      e.preventDefault()
      if (e.touches.length === 0) {
        if (!didDragRef.current && dragRef.current) {
          onSelectRef.current(dragRef.current.id, dragRef.current.type)
        }
        dragRef.current = null
        isPanningRef.current = false
        panStartRef.current = null
        lastPinch = null
      } else if (e.touches.length === 1) {
        lastPinch = null
        isPanningRef.current = true
        panStartRef.current = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, camX: camRef.current.x, camY: camRef.current.y }
      }
    }

    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd, { passive: false })
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // Get node under screen coords
  const getNode = (sx, sy) => {
    const w = toWorld(sx, sy)
    return nodesRef.current.find(n => Math.sqrt((n.x - w.x) ** 2 + (n.y - w.y) ** 2) < n.r + 4 / zoomRef.current)
  }

  const btnStyle = {
    width: 28, height: 28, borderRadius: 3,
    background: '#FFFFFFee', border: '1px solid #D8CEC3',
    color: '#062044', fontSize: 16, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, fontFamily: FNT,
    boxShadow: '0 1px 4px rgba(6,32,68,0.08)',
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        onWheel={e => {
          e.preventDefault()
          const rect = canvasRef.current.getBoundingClientRect()
          const sx = e.clientX - rect.left, sy = e.clientY - rect.top
          const { w: W, h: H } = szRef.current
          const z = zoomRef.current
          const cam = camRef.current
          // World point under cursor before zoom change
          const wx0 = (sx - W / 2) / z + cam.x
          const wy0 = (sy - H / 2) / z + cam.y
          // Zoom factor — support trackpad (deltaMode 0, small values) and mouse wheel
          const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY
          const factor = Math.pow(0.999, delta)
          const newZoom = Math.max(0.15, Math.min(5, z * factor))
          zoomRef.current = newZoom
          targetZoomRef.current = newZoom
          // Shift cam so cursor stays on same world point
          camRef.current = {
            x: wx0 - (sx - W / 2) / newZoom,
            y: wy0 - (sy - H / 2) / newZoom,
          }
        }}
        onMouseDown={e => {
          const rect = canvasRef.current.getBoundingClientRect()
          const sx = e.clientX - rect.left, sy = e.clientY - rect.top
          const n = getNode(sx, sy)
          didDragRef.current = false
          mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
          if (n) {
            dragRef.current = n; n.vx = 0; n.vy = 0
          } else {
            isPanningRef.current = true
            panStartRef.current = { sx: e.clientX, sy: e.clientY, camX: camRef.current.x, camY: camRef.current.y }
            canvasRef.current.style.cursor = 'grabbing'
          }
        }}
        onMouseMove={e => {
          const rect = canvasRef.current.getBoundingClientRect()
          const sx = e.clientX - rect.left, sy = e.clientY - rect.top

          if (dragRef.current) {
            const dp = mouseDownPosRef.current
            if (dp && (Math.abs(e.clientX - dp.x) > 4 || Math.abs(e.clientY - dp.y) > 4)) {
              didDragRef.current = true
            }
            const w = toWorld(sx, sy)
            dragRef.current.x = w.x; dragRef.current.y = w.y
            return
          }

          if (isPanningRef.current && panStartRef.current) {
            didDragRef.current = true
            const dx = e.clientX - panStartRef.current.sx
            const dy = e.clientY - panStartRef.current.sy
            camRef.current = {
              x: panStartRef.current.camX - dx / zoomRef.current,
              y: panStartRef.current.camY - dy / zoomRef.current,
            }
            return
          }

          const n = getNode(sx, sy)
          hovRef.current = n || null
          if (n) {
            hovEdgeRef.current = null
            canvasRef.current.style.cursor = 'pointer'
            setTip({ x: sx, y: sy, node: n })
          } else {
            // Edge hover — check in world coords
            const w = toWorld(sx, sy)
            const hoverRadiusSq = (12 / zoomRef.current) ** 2
            const em = edgeMidsRef.current.find(m => {
              return (m.cx - w.x) ** 2 + (m.cy - w.y) ** 2 < hoverRadiusSq
            })
            hovEdgeRef.current = em?.e || null
            canvasRef.current.style.cursor = 'grab'
            setTip(em ? { x: sx, y: sy, edge: em.e, crossCluster: em.crossCluster } : null)
          }
        }}
        onMouseUp={() => {
          dragRef.current = null
          isPanningRef.current = false
          panStartRef.current = null
          if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
        }}
        onMouseLeave={() => {
          dragRef.current = null
          isPanningRef.current = false
          panStartRef.current = null
          hovRef.current = null
          hovEdgeRef.current = null
          setTip(null)
        }}
        onClick={e => {
          if (didDragRef.current) return
          const rect = canvasRef.current.getBoundingClientRect()
          const sx = e.clientX - rect.left, sy = e.clientY - rect.top
          const n = getNode(sx, sy)
          if (n) onSelect(n.id, n.type)
        }}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab' }}
      />

      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button style={btnStyle} onClick={() => { targetZoomRef.current = Math.min(5, zoomRef.current * 1.35) }} title="Zoom in">+</button>
        <button style={btnStyle} onClick={() => { targetZoomRef.current = Math.max(0.15, zoomRef.current / 1.35) }} title="Zoom out">−</button>
        <button style={{ ...btnStyle, fontSize: 11, fontWeight: 700, letterSpacing: 0.3, marginTop: 4 }} onClick={fitAll} title="Fit all">fit</button>
      </div>

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, background: '#FFFFFFee', border: '1px solid #D8CEC3', borderRadius: 3, padding: '10px 14px', fontSize: 10, fontFamily: FNT, color: '#8a8278' }}>
        <div style={{ marginBottom: 6, fontWeight: 700, color: '#062044', letterSpacing: 0.8 }}>LEGEND</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 2, border: '1.5px solid #062044' }} /> Rule
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '1.5px solid #062044' }} /> Assertion
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #D8CEC3', paddingTop: 6, marginBottom: 2 }}>
          {['Proposed', 'Active', 'Verified', 'Established'].map(s => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: statusColor(s).text }} /> {s}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid #D8CEC3' }}>
          {[['supports', 'supports'], ['contradicts', 'contradicts'], ['relates_to', 'relates to']].map(([rt, label]) => (
            <span key={rt} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <span style={{ display: 'inline-block', width: 16, height: 2, background: edgeCol(rt), borderRadius: 1 }} /> {label}
            </span>
          ))}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <span style={{ display: 'inline-block', width: 16, height: 0, borderTop: '2px dashed #B0A898', borderRadius: 1 }} />
            <span style={{ color: '#8a6800' }}>cross-process link</span>
          </span>
        </div>
        <div style={{ marginTop: 4, color: '#b0a898', fontStyle: 'italic' }}>Pinch to zoom · Drag to pan · Tap to inspect</div>
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
          {tip.node ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: paColor(tip.node.processArea), fontFamily: FNT, marginBottom: 4 }}>
                {tip.node.label} · {tip.node.type.toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: '#1F1F1F', lineHeight: 1.4, marginBottom: 6 }}>{tip.node.title}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {tip.node.status && <Badge label={tip.node.status} colorFn={statusColor} />}
              </div>
            </>
          ) : tip.edge ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: FNT, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: edgeCol(tip.edge.relType) }}>{tip.edge.relType.replace(/_/g, ' ')}</span>
                {tip.crossCluster && (
                  <span style={{ fontSize: 9, background: '#FEF3CD', color: '#8a6800', padding: '1px 5px', borderRadius: 2, fontFamily: FNT, fontWeight: 700, letterSpacing: 0.4 }}>
                    CROSS-PROCESS
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: '#5a5550', fontFamily: FNT, marginBottom: tip.edge.comment ? 4 : 0 }}>
                {tip.edge.s} → {tip.edge.t}
              </div>
              {tip.edge.comment && (
                <div style={{ fontSize: 10, color: '#8a8278', fontFamily: FNT, fontStyle: 'italic' }}>
                  "{tip.edge.comment}"
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─── Full detail modal for selected item ───────────────────────────────────────

function ItemDetailModal({ item, loading, onClose, onNavigate }) {
  return (
    <Modal open={!!(item || loading)} title={item ? `${item.id}${item.versions?.length ? ' · v' + item.versions.length : ''}` : 'Loading…'} onClose={onClose} width={640}>
      {loading && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#b0a898', fontFamily: FNT, fontSize: 13 }}>Loading…</div>
      )}
      {item && !loading && (
        <div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {item.status && <Badge label={item.status} colorFn={statusColor} />}
            {item.category && <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, background: '#f0eeec', color: '#8a8278', fontFamily: FNT }}>{item.category}</span>}
            {item.processArea && <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 10, background: paColor(item.processArea) + '22', color: paColor(item.processArea), fontFamily: FNT, fontWeight: 700 }}>{item.processArea}</span>}
          </div>

          <div style={{ fontSize: 15, fontWeight: 700, color: '#062044', lineHeight: 1.4, marginBottom: 14, fontFamily: FNT }}>{item.title}</div>

          {item.scope && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: FNT }}>Scope</div>
              <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.5 }}>{item.scope}</div>
            </div>
          )}
          {item.rationale && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, fontFamily: FNT }}>Rationale</div>
              <div style={{ fontSize: 12, color: '#5a5550', lineHeight: 1.5 }}>{item.rationale}</div>
            </div>
          )}
          {(item.evidence || []).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#b0a898', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontFamily: FNT }}>Evidence</div>
              {item.evidence.map((ev, i) => (
                <div key={i} style={{ padding: '6px 10px', background: '#f8f6f4', borderRadius: 3, marginBottom: 4, fontSize: 11, color: '#5a5550', lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 9, color: '#b0a898', letterSpacing: 0.6 }}>{ev.type} · </span>{ev.text}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <Verifications targetType={item.type} targetId={item.id} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <LinkEditor
              sourceType={item.type}
              sourceId={item.id}
              onOpenItem={() => {}}
              sourceMeta={{ processArea: item.processArea, category: item.category }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <Comments targetType={item.type} targetId={item.id} />
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
        </div>
      )}
    </Modal>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function RelationshipGraph({ onNavigate, highlightId, onClearHighlight, processAreas = [], categories = [] }) {
  const isMobile = useIsMobile()
  const [rules, setRules] = useState([])
  const [assertions, setAssertions] = useState([])
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [gpf, setGpf] = useState([])  // graph process filter
  const [gcf, setGcf] = useState([])  // graph category filter
  const [sel, setSel] = useState(null)
  const [selLoading, setSelLoading] = useState(false)

  useEffect(() => {
    Promise.all([fetchRules(), fetchAssertions()]).then(([r, a]) => {
      setRules(r)
      setAssertions(a)
      const allIds = [...r.map(x => x.id), ...a.map(x => x.id)]
      fetchAllLinksForGraph(allIds).then(setLinks)
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
  const linkedIds = new Set(links.flatMap(l => [l.source_id, l.target_id]))
  const linkedCount = [...rules, ...assertions].filter(i => linkedIds.has(i.id)).length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }}>

      {isMobile ? (
        /* Mobile: compact horizontal filter strip */
        <div style={{ flexShrink: 0, borderBottom: '1px solid #e8e4e0', background: '#FAFAF9', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 12px', minWidth: 'max-content' }}>
            <span style={{ fontSize: 10, color: '#4FA89A', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, fontFamily: FNT, flexShrink: 0, marginRight: 4 }}>Filter:</span>
            {processAreas.map(p => (
              <button
                key={p}
                onClick={() => tog(gpf, setGpf, p)}
                style={{
                  padding: '4px 10px', borderRadius: 12, fontSize: 11, fontFamily: FNT, cursor: 'pointer',
                  background: gpf.includes(p) ? paColor(p) + '33' : '#f0eeec',
                  color: gpf.includes(p) ? paColor(p) : '#5a5550',
                  border: gpf.includes(p) ? `1px solid ${paColor(p)}55` : '1px solid #D8CEC3',
                  fontWeight: gpf.includes(p) ? 700 : 400,
                  whiteSpace: 'nowrap',
                }}
              >{p}</button>
            ))}
            {categories.map(c => (
              <button
                key={c}
                onClick={() => tog(gcf, setGcf, c)}
                style={{
                  padding: '4px 10px', borderRadius: 12, fontSize: 11, fontFamily: FNT, cursor: 'pointer',
                  background: gcf.includes(c) ? '#062044' : '#f0eeec',
                  color: gcf.includes(c) ? '#fff' : '#5a5550',
                  border: gcf.includes(c) ? '1px solid #062044' : '1px solid #D8CEC3',
                  fontWeight: gcf.includes(c) ? 700 : 400,
                  whiteSpace: 'nowrap',
                }}
              >{c}</button>
            ))}
            {(gpf.length > 0 || gcf.length > 0) && (
              <button
                onClick={() => { setGpf([]); setGcf([]) }}
                style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontFamily: FNT, cursor: 'pointer', background: 'none', border: '1px solid #4FA89A', color: '#4FA89A', whiteSpace: 'nowrap' }}
              >✕ Clear</button>
            )}
            <span style={{ fontSize: 10, color: '#b0a898', fontFamily: FNT, flexShrink: 0, marginLeft: 8 }}>
              <b style={{ color: '#062044' }}>{totalNodes}</b> nodes · <b style={{ color: '#4FA89A' }}>{linkedCount}</b> linked
            </span>
          </div>
        </div>
      ) : (
        /* Desktop: vertical filter sidebar */
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
            Nodes cluster by process area. Dashed lines = cross-process links — the most valuable connections. Filter to isolate a knowledge chain.
          </div>
        </div>
      )}

      {/* Canvas area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <GraphCanvas
          rules={rules}
          assertions={assertions}
          links={links}
          gpf={gpf}
          gcf={gcf}
          onSelect={(id, type) => {
            onClearHighlight?.()
            setSel(null)
            setSelLoading(true)
            fetchItemById(type, id).then(item => {
              setSel(item)
              setSelLoading(false)
            })
          }}
          highlightId={highlightId}
          processAreas={processAreas}
        />
      </div>

      <ItemDetailModal
        item={sel}
        loading={selLoading}
        onClose={() => { setSel(null); setSelLoading(false) }}
        onNavigate={onNavigate}
      />
    </div>
  )
}
