// docs/577 design prototype. Cards flow in tree order; the rail is drawn afterwards from measured card positions.
const { events, periods, fmt, short, span, M } = window.WL
const $ = (s) => document.querySelector(s)
const byId = new Map(events.map((e) => [e.id, e]))
const kids = (id) => events.filter((e) => e.parent === id).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))
const open = new Set(), folded = new Set()
let selected = null, hot = null, view = 'table'

// ---------- shared card ----------
function card(e, depth = 0) {
  const el = document.createElement('article')
  el.className = 'ev' + (open.has(e.id) ? ' open' : '') + (selected === e.id ? ' sel' : '')
  el.dataset.id = e.id
  el.style.marginLeft = depth * 16 + 'px'
  el.setAttribute('aria-expanded', open.has(e.id))
  const n = kids(e.id).length
  el.innerHTML = `<div class="ev-head" title="${e.title}">
      <span class="ev-dot ${e.kind}"></span><span class="ev-title">${e.title}</span>
      ${n ? `<span class="ev-kids">▸ ${n}</span>` : ''}<button class="ev-more" aria-label="${e.title}更多操作">⋯</button></div>`
  if (open.has(e.id)) {
    const time = e.start === null ? '待定位' : fmt(e.start, e.precision) +
      (e.kind === 'window' ? ` ～ ${fmt(e.windowEnd)} · ${e.label}` : e.dur ? ` · 持续 ${e.dur} 天` : ' · 时点')
    el.insertAdjacentHTML('beforeend', `<div class="ev-body"><div class="ev-time">${time}</div>
      ${e.fact.split('\n\n').map((p) => `<p>${p}</p>`).join('')}
      ${e.people.length ? `<div class="pills">${e.people.map((p) => `<span class="pill">${p}</span>`).join('')}</div>` : ''}
      ${e.changes.map((c) => `<div class="change">${c.who} · ${c.dim}：${c.before} → ${c.after}</div>`).join('')}</div>`)
  }
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('button')) return
    open.has(e.id) ? open.delete(e.id) : open.add(e.id)
    selected = e.id
    render()
  })
  el.addEventListener('mouseenter', () => setHot(e.id))
  el.addEventListener('mouseleave', () => setHot(null))
  return el
}

// ---------- table view ----------
function visibleList() {
  const out = []
  const walk = (list, depth) => list.forEach((e) => {
    out.push({ e, depth })
    if (!folded.has(e.id)) walk(kids(e.id), depth + 1)
  })
  walk(kids(null).filter((e) => e.start !== null), 0)
  return { placed: out, pending: kids(null).filter((e) => e.start === null) }
}
function segmentOf(list) {
  // Break where the gap exceeds both 30 days and 20 x the median gap (docs/577 §3.2).
  const times = [...new Set(list.map((x) => x.e.start))].sort((a, b) => a - b)
  const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0
  const limit = Math.max(M, median * 20)
  const seg = new Map(); let k = 0
  times.forEach((t, i) => { if (i && t - times[i - 1] > limit) k++; seg.set(t, k) })
  return (e) => seg.get(e.start)
}
function renderTree({ placed, pending }) {
  const tree = $('#tree'); tree.innerHTML = ''
  const row = (e, depth) => {
    const n = kids(e.id).length
    const r = document.createElement('div')
    r.className = 'tree-row' + (selected === e.id ? ' sel' : '')
    r.dataset.id = e.id; r.setAttribute('role', 'treeitem'); r.tabIndex = -1
    if (n) r.setAttribute('aria-expanded', !folded.has(e.id))
    r.style.paddingLeft = 4 + depth * 14 + 'px'
    r.innerHTML = `<span class="tw">${n ? (folded.has(e.id) ? '▸' : '▾') : ''}</span><span class="td"></span>
      <span class="tt" title="${e.title}">${e.title}</span><span class="ts">${n ? n + ' · ' : ''}${short(e.start, e.precision)}</span>`
    r.querySelector('.tw').addEventListener('click', (ev) => {
      ev.stopPropagation(); folded.has(e.id) ? folded.delete(e.id) : folded.add(e.id); render()
    })
    r.addEventListener('click', () => locate(e.id))
    tree.append(r)
  }
  placed.forEach(({ e, depth }) => row(e, depth))
  if (pending.length) {
    tree.insertAdjacentHTML('beforeend', `<div class="tree-group">待定位 · ${pending.length}</div>`)
    pending.forEach((e) => row(e, 0))
  }
}
function renderTable() {
  const list = visibleList(), seg = segmentOf(list.placed)
  renderTree(list)
  const cards = $('#cards'); cards.innerHTML = ''
  let prev = null
  const breaks = []
  list.placed.forEach(({ e, depth }) => {
    const s = seg(e)
    if (prev !== null && s !== prev) {
      const gap = document.createElement('div'); gap.style.height = '44px'; gap.dataset.break = prev + '>' + s
      cards.append(gap); breaks.push(gap)
    }
    prev = s
    const el = card(e, depth); el.style.marginTop = '6px'; cards.append(el)
  })
  if (list.pending.length) {
    const gap = document.createElement('div'); gap.style.height = '44px'; gap.dataset.pending = ''; cards.append(gap)
    list.pending.forEach((e) => { const el = card(e); el.style.marginTop = '6px'; cards.append(el) })
  }
  requestAnimationFrame(() => drawRail(list, seg, breaks))
}
function drawRail(list, seg, breaks) {
  const rail = $('#rail'), cardsEl = $('#cards')
  const h = cardsEl.scrollHeight
  rail.innerHTML = ''; rail.style.height = h + 'px'
  const pos = new Map()
  for (const el of cardsEl.querySelectorAll('.ev')) pos.set(el.dataset.id, { top: el.offsetTop, head: el.offsetTop + 16, left: el.offsetLeft })
  // Segment pixel ranges: from the first to the last card head of that segment, in list order.
  const segs = new Map()
  list.placed.forEach(({ e }) => {
    const k = seg(e), p = pos.get(e.id), s = segs.get(k) ?? { t0: Infinity, t1: -Infinity, y0: Infinity, y1: -Infinity }
    s.t0 = Math.min(s.t0, e.start); s.t1 = Math.max(s.t1, e.start); s.y0 = Math.min(s.y0, p.head); s.y1 = Math.max(s.y1, p.head)
    segs.set(k, s)
  })
  const yOf = (t, s) => (s.t1 === s.t0 ? (s.y0 + s.y1) / 2 : s.y0 + ((t - s.t0) / (s.t1 - s.t0)) * (s.y1 - s.y0))
  // Rail pieces, one per segment, stopping at the break marks.
  for (const s of segs.values()) {
    const line = document.createElement('div'); line.className = 'rail-line'
    line.style.top = s.y0 - 14 + 'px'; line.style.height = s.y1 - s.y0 + 28 + 'px'; rail.append(line)
  }
  // Ticks at month and year boundaries; drop ticks closer than 48px.
  for (const s of segs.values()) {
    if (s.t1 - s.t0 < M) continue
    let last = -Infinity
    for (let t = Math.ceil(s.t0 / M) * M; t <= s.t1; t += M) {
      const y = yOf(t, s), major = t % (M * 12) === 0
      if (y - last < 48 && !major) continue
      last = y
      rail.insertAdjacentHTML('beforeend', `<i class="tick${major ? ' major' : ''}" style="top:${y}px"></i>
        <span class="tick-label${major ? ' major' : ''}" style="top:${y}px;right:${major ? 76 : 70}px">${major ? fmt(t, 'year') : short(t, 'month').replace(/^\d+年/, '')}</span>`)
    }
  }
  // Break marks with the skipped span.
  const segList = [...segs.entries()]
  breaks.forEach((gap) => {
    const [a, b] = gap.dataset.break.split('>').map(Number)
    const sa = segs.get(a), sb = segs.get(b)
    rail.insertAdjacentHTML('beforeend', `<div class="break" style="top:${gap.offsetTop}px;height:44px">≈ ${span(sb.t0 - sa.t1)}</div>`)
  })
  const pend = cardsEl.querySelector('[data-pending]')
  if (pend) rail.insertAdjacentHTML('beforeend', `<div class="break" style="top:${pend.offsetTop}px;height:44px">待定位</div>`)
  // Dots, spans, labels, leader lines. Strict scale: dots may sit close together; labels avoid each other.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.classList.add('rail-svg'); svg.setAttribute('width', 240); svg.setAttribute('height', h)
  rail.append(svg)
  const dots = list.placed.map(({ e }) => ({ e, y: yOf(e.start, segs.get(seg(e))), s: segs.get(seg(e)) })).sort((a, b) => a.y - b.y)
  let lastLabel = -Infinity, cluster = null
  const clusters = []
  dots.forEach((d) => {
    if (cluster && d.y - cluster.y < 4) cluster.items.push(d)
    else clusters.push((cluster = { y: d.y, items: [d] }))
  })
  clusters.forEach((c) => {
    const lead = c.items[0]
    c.items.forEach((d) => {
      const p = pos.get(d.e.id), x1 = 200 + 18 + p.left
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', `M156 ${c.y} C 186 ${c.y}, ${x1 - 34} ${p.head}, ${x1} ${p.head}`)
      path.classList.add('lead'); path.dataset.id = d.e.id
      svg.append(path)
      if (d.e.dur && d.e.kind !== 'window') {
        const end = yOf(Math.min(d.e.start + d.e.dur, d.s.t1), d.s)
        if (end - c.y > 3) rail.insertAdjacentHTML('beforeend', `<i class="dur" style="top:${c.y}px;height:${end - c.y}px"></i>`)
      }
      if (d.e.kind === 'window') rail.insertAdjacentHTML('beforeend', `<i class="dur window" style="top:${c.y}px;height:${Math.max(8, yOf(Math.min(d.e.windowEnd, d.s.t1), d.s) - c.y)}px"></i>`)
    })
    const ids = c.items.map((d) => d.e.id).join(' ')
    const dot = c.items.length > 1
      ? `<b class="dot cluster" data-ids="${ids}" style="top:${c.y}px" title="${c.items.map((d) => d.e.title).join('\n')}">${c.items.length}</b>`
      : `<b class="dot ${lead.e.kind}" data-ids="${ids}" style="top:${c.y}px" aria-label="${lead.e.title} ${fmt(lead.e.start, lead.e.precision)}"></b>`
    rail.insertAdjacentHTML('beforeend', dot)
    const show = c.y - lastLabel >= 18
    if (show) lastLabel = c.y
    rail.insertAdjacentHTML('beforeend', `<span class="dlabel" data-ids="${ids}" style="top:${c.y}px;${show ? '' : 'display:none'}">${fmt(lead.e.start, lead.e.precision).replace(/^新历/, '')}</span>`)
  })
  rail.querySelectorAll('.dot').forEach((d) => {
    const id = d.dataset.ids.split(' ')[0]
    d.addEventListener('mouseenter', () => setHot(id)); d.addEventListener('mouseleave', () => setHot(null))
    d.addEventListener('click', () => locate(id))
  })
  setHot(hot)
}
function setHot(id) {
  hot = id
  const target = id ?? selected
  document.querySelectorAll('.lead').forEach((p) => p.classList.toggle('hot', p.dataset.id === target))
  document.querySelectorAll('.dot,.dlabel').forEach((d) => {
    const on = !!target && d.dataset.ids.split(' ').includes(target)
    d.classList.toggle('hot', on)
    if (d.classList.contains('dlabel') && on) d.style.display = ''
  })
}
function locate(id) {
  selected = id
  // Unfold ancestors so the card exists.
  for (let e = byId.get(id); e?.parent; e = byId.get(e.parent)) folded.delete(e.parent)
  render()
  requestAnimationFrame(() => {
    const el = document.querySelector(`#cards .ev[data-id="${id}"]`), sc = $('#scroller')
    if (!el) return
    sc.scrollTo({ top: el.offsetTop - sc.clientHeight / 3, behavior: 'smooth' })
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1300)
  })
}
$('#scroller').addEventListener('scroll', () => {
  const sc = $('#scroller'), top = sc.scrollTop + 8
  const first = [...document.querySelectorAll('#cards .ev')].find((el) => el.offsetTop + el.offsetHeight > top)
  document.querySelectorAll('.tree-row').forEach((r) => r.classList.toggle('cur', r.dataset.id === first?.dataset.id))
  document.querySelector('.tree-row.cur')?.scrollIntoView({ block: 'nearest' })
})

// ---------- timeline view ----------
let win = null
function renderTimeline() {
  const roots = kids(null).filter((e) => e.start !== null)
  const lane = $('#lane'), width = $('#timelineView').clientWidth
  if (!win) { const dense = roots.filter((e) => e.start > 1348 * 360); win = { start: dense[0].start - 4, span: 70 } }
  const x = (t) => 16 + ((t - win.start) / win.span) * (width - 32)
  // Ruler: every 5 or 10 days depending on scale.
  const step = win.span > 120 ? 30 : win.span > 40 ? 10 : 5
  $('#ruler').innerHTML = ''; $('#grid').innerHTML = ''
  for (let t = Math.ceil(win.start / step) * step; t <= win.start + win.span; t += step) {
    $('#ruler').insertAdjacentHTML('beforeend', `<span style="left:${x(t)}px">${fmt(t).replace(/^新历/, '')}</span>`)
    $('#grid').insertAdjacentHTML('beforeend', `<i style="left:${x(t)}px"></i>`)
  }
  $('#periods').innerHTML = periods.map((p, i) => {
    const l = Math.max(8, x(p.start)), r = Math.min(width - 8, p.end === null ? width - 8 : x(p.end))
    return r <= l ? '' : `<div class="period" style="left:${l}px;width:${r - l}px;--pc:var(--chart-${i + 1})">${p.title}</div>`
  }).join('')
  // Measure: render once, then pack rows by measured height (expanded cards push neighbours).
  lane.innerHTML = ''
  const items = roots.filter((e) => e.start + (e.dur || 0) >= win.start - 10 && e.start <= win.start + win.span).map((e) => {
    const wrap = document.createElement('div'); wrap.className = 'tcard'
    const w = open.has(e.id) ? 320 : 210
    wrap.style.width = w + 'px'
    wrap.append(card(e))
    const left = x(e.start)
    if (e.dur) wrap.insertAdjacentHTML('afterbegin', `<i class="bar-x" style="width:${Math.max(6, x(e.start + e.dur) - left)}px"></i>`)
    wrap.insertAdjacentHTML('afterbegin', `<i class="pin"></i><span class="tstamp">${short(e.start, e.precision)}</span>`)
    lane.append(wrap)
    return { e, wrap, left, w }
  })
  const rows = []
  items.sort((a, b) => a.left - b.left).forEach((it) => {
    const h = it.wrap.querySelector('.ev').offsetHeight
    let r = rows.findIndex((row) => row.right + 14 <= it.left)
    if (r < 0) { r = rows.length; rows.push({ right: -Infinity, h: 0 }) }
    rows[r].right = it.left + it.w; rows[r].h = Math.max(rows[r].h, h); it.row = r
  })
  let top = 26; const tops = rows.map((row) => { const t = top; top += row.h + 34; return t })
  items.forEach((it) => { it.wrap.style.left = it.left + 'px'; it.wrap.style.top = tops[it.row] + 'px' })
  lane.style.setProperty('--h', top + 'px')
  $('#range').textContent = `${fmt(win.start)} — ${fmt(win.start + win.span)}`
}
let drag = null
$('#lane').addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.ev')) drag = { x: ev.clientX, start: win.start } })
window.addEventListener('pointermove', (ev) => {
  if (!drag) return
  win.start = drag.start - ((ev.clientX - drag.x) / $('#timelineView').clientWidth) * win.span; renderTimeline()
})
window.addEventListener('pointerup', () => (drag = null))
$('#timelineView').addEventListener('wheel', (ev) => {
  if (!ev.ctrlKey) return
  ev.preventDefault(); const f = ev.deltaY > 0 ? 1.2 : 1 / 1.2, mid = win.start + win.span / 2
  win.span = Math.min(2000, Math.max(8, win.span * f)); win.start = mid - win.span / 2; renderTimeline()
}, { passive: false })

// ---------- chrome ----------
function render() {
  $('#tableView').hidden = view !== 'table'; $('#timelineView').hidden = view !== 'timeline'
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === view))
  const placed = events.filter((e) => e.start !== null)
  $('#count').textContent = `${events.length} 件事件 · 已展开 ${open.size}`
  if (view === 'table') {
    const dense = placed.map((e) => e.start).sort((a, b) => a - b)
    $('#range').textContent = `${fmt(dense[0], 'year')} — ${fmt(dense.at(-1))}`
    renderTable()
  } else renderTimeline()
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view; render() }))
document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
  document.body.dataset.style = b.dataset.pick
  document.querySelectorAll('[data-pick]').forEach((x) => x.setAttribute('aria-pressed', x === b)); render()
}))
$('[data-light-toggle]').addEventListener('click', (ev) => {
  const on = document.body.toggleAttribute('data-light'); ev.target.setAttribute('aria-pressed', on); render()
})
$('#moreBtn').addEventListener('click', () => ($('#menu').hidden = !$('#menu').hidden))
$('#collapseAll').addEventListener('click', () => { open.clear(); $('#menu').hidden = true; render() })
$('#pending').addEventListener('click', () => { view = 'table'; locate(kids(null).find((e) => e.start === null).id) })
new ResizeObserver(() => render()).observe($('.panel'))
render()
