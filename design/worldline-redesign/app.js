// docs/577 v3 prototype: style A; color = type, dot size = importance; hierarchy groups; period picker; table zoom.
const { events, periods, fmt, short, span, M, Y, categories } = window.WL
const $ = (s) => document.querySelector(s)
const byId = new Map(events.map((e) => [e.id, e]))
const kids = (id) => events.filter((e) => e.parent === id).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))
const descendants = (id) => kids(id).flatMap((c) => [c, ...descendants(c.id)])
const open = new Set(), folded = new Set(), hiddenTypes = new Set()
let selected = null, hot = null, view = 'table', query = '', zoom = 1, activePeriod = null
const hue = (e) => `var(--c${e.category})`
const terms = () => query.toLowerCase().split(/\s+/).filter(Boolean)
// Every term must appear somewhere in the event (title, fact, people or type name).
const matches = (e) => { const hay = [e.title, e.fact, e.people.join(' '), categories[e.category], e.label ?? ''].join(' ').toLowerCase(); return terms().every((t) => hay.includes(t)) }
const dimmed = (e) => hiddenTypes.has(e.category) || (!!query && !matches(e))
const mark = (text) => {
  let out = esc(text)
  for (const t of terms()) out = out.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\const dimmed = (e) => hiddenTypes.has(e.category) || (query && !e.title.includes(query))'), 'gi'), (m) => `<mark>${m}</mark>`)
  return out
}
let hits = [], hitIndex = -1
const yearOf = (t) => Math.floor(t / Y)
const yearName = (t) => fmt(t, 'year')
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const AV = ['#b5654f', '#5f8f7a', '#7a6bb0', '#b08a45', '#4f86a3', '#a3587f']
const avColor = (name) => AV[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AV.length]
const avatarsFor = (e, max) => e.people.length
  ? `<span class="avs" title="${esc(e.people.join('、'))}">${e.people.slice(0, max).map((p) => `<i style="background:${avColor(p)}">${p[0]}</i>`).join('')}${e.people.length > max ? `<i class="more">+${e.people.length - max}</i>` : ''}</span>`
  : ''
const familyEnd = (e) => Math.max(e.start + (e.dur || 0), ...descendants(e.id).filter((d) => d.start !== null).map((d) => d.start + (d.dur || 0)))
const IMP = ['', '一般', '重要', '关键']
const PC = (i) => `var(--chart-${(i % 4) + 1})`

function renderLegend() {
  const counts = categories.map((_, i) => events.filter((e) => e.category === i).length)
  $('#legend').innerHTML = '<span>类型</span>' + categories.map((c, i) =>
    `<button data-k="${i}" class="${hiddenTypes.has(i) ? 'off' : ''}" style="--ec:var(--c${i})" title="点击隐藏/显示；双击只看这一类"><i></i>${c} ${counts[i]}</button>`).join('') +
    `<span class="sizes" title="圆点大小表示重要程度">重要度 <i style="width:6px;height:6px"></i>一般 <i style="width:9px;height:9px"></i>重要 <i style="width:13px;height:13px"></i>关键</span>`
  $('#legend').querySelectorAll('button').forEach((b) => {
    const k = +b.dataset.k
    b.addEventListener('click', () => { hiddenTypes.has(k) ? hiddenTypes.delete(k) : hiddenTypes.add(k); render() })
    b.addEventListener('dblclick', () => { hiddenTypes.clear(); categories.forEach((_, i) => i !== k && hiddenTypes.add(i)); render() })
  })
}

// ---------- shared card ----------
function card(e, opts = {}) {
  const el = document.createElement('article'), isOpen = open.has(e.id), n = kids(e.id).length
  el.className = 'ev' + (hits[hitIndex]?.id === e.id ? ' hit' : '') + (isOpen ? ' open' : '') + (selected === e.id ? ' sel' : '') + (dimmed(e) ? ' dim' : '')
  el.dataset.id = e.id
  el.style.setProperty('--ec', hue(e))
  el.setAttribute('aria-expanded', isOpen)
  const all = descendants(e.id).length
  const fold = n && opts.foldable ? `<button class="fold-btn${folded.has(e.id) ? ' closed' : ''}" data-fold aria-label="${folded.has(e.id) ? '展开' : '折叠'}子事件">▾</button>` : ''
  const meta = n ? `<span class="group-head-meta"><span class="compact">▸ ${all}</span><span class="full">${e.dur ? `<span class="span-bar" title="持续 ${e.dur} 天"><i style="width:100%"></i></span>${e.dur} 天 · ` : ''}${n} 个子事件${all > n ? `（共 ${all}）` : ''}</span></span>` : ''
  el.innerHTML = `<div class="ev-head" title="${esc(e.title)}">${fold}
      <span class="ev-dot ${e.kind} i${e.importance}"></span><span class="ev-title">${mark(e.title)}</span>
      ${isOpen ? '' : avatarsFor(e, opts.compact ? 3 : 4)}${meta}<button class="ev-more" aria-label="${esc(e.title)}更多操作">⋯</button></div>`
  if (isOpen) {
    const kind = e.start === null ? '' : e.kind === 'window' ? `时间不确定 · 最晚 ${fmt(e.windowEnd)}` : e.dur ? `持续 ${e.dur} 天` : '时点'
    const parent = e.parent && byId.get(e.parent)
    el.insertAdjacentHTML('beforeend', `<div class="ev-body">
      <div class="ev-meta"><span class="ev-tag">${categories[e.category]}</span><span class="ev-when">${fmt(e.start, e.precision)}</span>
        ${kind ? `<span class="ev-kind">${kind}</span>` : ''}<span class="ev-kind">${IMP[e.importance]}</span>
        ${e.label ? `<span class="ev-kind">${esc(e.label)}</span>` : ''}${parent ? `<span class="ev-kind">属于「${esc(parent.title)}」</span>` : ''}</div>
      ${e.fact.split('\n\n').map((p) => `<p>${mark(p)}</p>`).join('')}
      ${e.people.length ? `<div class="ev-people">${e.people.map((p) => `<span class="who"><i>${p[0]}</i>${p}</span>`).join('')}</div>` : ''}
      ${e.changes.map((c) => `<div class="change"><b>${c.who}</b>${c.dim}<span>${c.before}</span><em>→</em><span>${c.after}</span></div>`).join('')}</div>`)
  }
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-fold]')) { folded.has(e.id) ? folded.delete(e.id) : folded.add(e.id); render(); return }
    if (ev.target.closest('button')) return
    isOpen ? open.delete(e.id) : open.add(e.id)
    selected = e.id; render()
  })
  el.addEventListener('mouseenter', () => setHot(e.id))
  el.addEventListener('mouseleave', () => setHot(null))
  return el
}

// ---------- table view ----------
function visibleList() {
  const out = []
  const walk = (list, depth) => list.forEach((e) => { out.push({ e, depth }); if (!folded.has(e.id)) walk(kids(e.id), depth + 1) })
  walk(kids(null).filter((e) => e.start !== null), 0)
  return { placed: out, pending: kids(null).filter((e) => e.start === null) }
}
function segmentOf(list) {
  // Break where the gap exceeds both 30 days and 20 x the median gap (docs/577 §3.2). Children share their root's segment.
  const rootOf = (e) => { while (e.parent) e = byId.get(e.parent); return e }
  const times = [...new Set(list.filter((x) => x.depth === 0).map((x) => x.e.start))].sort((a, b) => a - b)
  const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)
  const limit = Math.max(M, (gaps[Math.floor(gaps.length / 2)] ?? 0) * 20)
  const seg = new Map(); let k = 0
  times.forEach((t, i) => { if (i && t - times[i - 1] > limit) k++; seg.set(t, k) })
  return (e) => seg.get(rootOf(e).start)
}
function renderTree({ placed, pending }) {
  const tree = $('#treeRows'); tree.innerHTML = ''
  let year = null
  const row = (e, depth) => {
    const n = kids(e.id).length, r = document.createElement('div')
    r.className = 'tree-row' + (selected === e.id ? ' sel' : '') + (dimmed(e) ? ' dim' : '')
    r.dataset.id = e.id; r.setAttribute('role', 'treeitem'); r.tabIndex = -1
    if (n) r.setAttribute('aria-expanded', !folded.has(e.id))
    r.style.paddingLeft = 4 + depth * 16 + 'px'
    r.style.setProperty('--ec', hue(e))
    r.innerHTML = `<span class="tw${folded.has(e.id) ? ' fold' : ''}">${n ? '▾' : ''}</span><span class="td" style="width:${3 + e.importance * 2}px;height:${3 + e.importance * 2}px"></span>
      <span class="tt" title="${esc(e.title)}">${mark(e.title)}</span><span class="ts">${n ? `<span style="margin-right:6px">${descendants(e.id).length}</span>` : ''}${short(e.start, e.precision)}</span>`
    r.querySelector('.tw').addEventListener('click', (ev) => { ev.stopPropagation(); folded.has(e.id) ? folded.delete(e.id) : folded.add(e.id); render() })
    r.addEventListener('click', () => locate(e.id))
    tree.append(r)
  }
  placed.forEach(({ e, depth }) => {
    if (depth === 0 && yearOf(e.start) !== year) { year = yearOf(e.start); tree.insertAdjacentHTML('beforeend', `<div class="tree-group">${yearName(e.start)}</div>`) }
    row(e, depth)
  })
  if (pending.length) { tree.insertAdjacentHTML('beforeend', `<div class="tree-group">待定位 · ${pending.length}</div>`); pending.forEach((e) => row(e, 0)) }
}
// A parent and its visible children render inside one group box; nested parents nest groups.
function block(e) {
  const n = kids(e.id).length
  if (!n) { const el = card(e); el.style.marginTop = 6 * zoom + 'px'; return el }
  const g = document.createElement('section')
  g.className = 'group'; g.style.setProperty('--ec', hue(e)); g.style.marginTop = 10 * zoom + 'px'
  g.append(card(e, { foldable: true }))
  if (!folded.has(e.id)) {
    const c = document.createElement('div'); c.className = 'children'; c.style.setProperty('--ec', hue(e))
    kids(e.id).forEach((k) => { const b = block(k); b.style.setProperty('--pe', hue(e)); c.append(b) })
    g.append(c)
  }
  return g
}
function renderTable() {
  const list = visibleList(), seg = segmentOf(list.placed)
  const cards = $('#cards'); cards.innerHTML = ''
  // Zoom stretches the rail: each root block gets extra space proportional to the time gap to the next root.
  const roots = list.placed.filter((x) => x.depth === 0).map((x) => x.e)
  let prev = null; const breaks = []
  roots.forEach((e, i) => {
    const s = seg(e)
    if (prev !== null && s !== prev) {
      const gap = document.createElement('div'); gap.style.height = '46px'; gap.dataset.break = prev + '>' + s; cards.append(gap); breaks.push(gap)
    }
    prev = s
    const b = block(e)
    const next = roots[i + 1]
    if (zoom > 1 && next && seg(next) === s) b.style.marginBottom = Math.min(240, (next.start - e.start) * 6 * (zoom - 1)) + 'px'
    cards.append(b)
  })
  if (list.pending.length) {
    const gap = document.createElement('div'); gap.style.height = '46px'; gap.dataset.pending = ''; cards.append(gap)
    list.pending.forEach((e) => cards.append(block(e)))
  }
  requestAnimationFrame(() => drawRail(list, seg, breaks))
}
function drawRail(list, seg, breaks) {
  const rail = $('#rail'), cardsEl = $('#cards'), h = cardsEl.scrollHeight
  rail.innerHTML = ''; rail.style.height = h + 'px'
  const base = cardsEl.getBoundingClientRect().top - cardsEl.offsetTop
  const pos = new Map()
  for (const el of cardsEl.querySelectorAll('.ev')) {
    const r = el.getBoundingClientRect()
    pos.set(el.dataset.id, { head: r.top - base + 16, left: r.left - cardsEl.getBoundingClientRect().left })
  }
  // Segment pixel ranges come from root cards only, so children keep strict time positions inside their root's segment.
  const segs = new Map()
  list.placed.forEach(({ e }) => {
    const k = seg(e), p = pos.get(e.id), s = segs.get(k) ?? { t0: Infinity, t1: -Infinity, y0: Infinity, y1: -Infinity }
    s.t0 = Math.min(s.t0, e.start); s.t1 = Math.max(s.t1, e.start); s.y0 = Math.min(s.y0, p.head); s.y1 = Math.max(s.y1, p.head); segs.set(k, s)
  })
  const segFor = (t) => [...segs.values()].find((s) => t >= s.t0 && t <= s.t1)
  const yOf = (t, s) => (s.t1 === s.t0 ? (s.y0 + s.y1) / 2 : s.y0 + ((t - s.t0) / (s.t1 - s.t0)) * (s.y1 - s.y0))
  const html = []
  for (const s of segs.values()) html.push(`<div class="rail-line" style="top:${s.y0 - 22}px;height:${s.y1 - s.y0 + 44}px"></div>`)
  const years = []
  for (const s of segs.values()) {
    html.push(`<div class="year" style="top:${s.y0 - 22}px"><span>${yearName(s.t0)}</span></div>`); years.push({ y: s.y0 - 22, t: s.t0 })
    let last = s.y0 - 22
    for (let t = Math.ceil(s.t0 / M) * M; t <= s.t1; t += M) {
      const y = yOf(t, s)
      if (t % Y === 0 && y - (s.y0 - 22) > 30) { html.push(`<div class="year" style="top:${y}px"><span>${yearName(t)}</span></div>`); years.push({ y, t }); last = y; continue }
      html.push(`<i class="tick" style="top:${y}px"></i>`)
      if (y - last >= 44) { html.push(`<span class="tick-label" style="top:${y}px">${Math.floor((t % Y) / M) + 1}月</span>`); last = y }
    }
  }
  // Period bands beside the rail (only inside a segment, so the 20万-year 旧纪 does not paint everything).
  const bands = []
  periods.forEach((p, i) => {
    for (const s of segs.values()) {
      const a = Math.max(p.start, s.t0), b = Math.min(p.end ?? Infinity, s.t1)
      if (b <= a || (p.start <= s.t0 && (p.end ?? Infinity) >= s.t1 && s.t1 - s.t0 > 0 && p.end === null)) continue
      const y0 = yOf(a, s), y1 = yOf(b, s)
      if (y1 - y0 < 16) continue
      bands.push({ id: p.id, y0 })
      html.push(`<div class="period-band" data-period="${p.id}" style="top:${y0}px;height:${y1 - y0}px;--pc:${PC(i)};left:${172 + 6 * (i % 2)}px"><span>${p.title}</span></div>`)
    }
  })
  rail.dataset.bands = JSON.stringify(bands)
  breaks.forEach((gap) => {
    const [a, b] = gap.dataset.break.split('>').map(Number)
    html.push(`<div class="break" style="top:${cardsEl.offsetTop + gap.offsetTop}px;height:46px">相隔 ${span(segs.get(b).t0 - segs.get(a).t1)}</div>`)
  })
  const pend = cardsEl.querySelector('[data-pending]')
  if (pend) html.push(`<div class="break" style="top:${cardsEl.offsetTop + pend.offsetTop}px;height:46px">时间待定位</div>`)
  const dots = list.placed.map(({ e }) => ({ e, s: segs.get(seg(e)), y: yOf(e.start, segs.get(seg(e))) })).sort((a, b) => a.y - b.y)
  const clusters = []
  dots.forEach((d) => { const c = clusters.at(-1); c && d.y - c.y < 4 ? c.items.push(d) : clusters.push({ y: d.y, items: [d] }) })
  const leads = []; let lastLabel = -Infinity
  clusters.forEach((c) => {
    c.items.forEach((d) => {
      const p = pos.get(d.e.id), x1 = 210 + 12 + p.left
      leads.push(`<path class="lead${d.e.parent ? ' child' : ''}${dimmed(d.e) ? ' dim' : ''}" data-id="${d.e.id}" style="--ec:${hue(d.e)}" d="M165 ${c.y} C 190 ${c.y}, ${x1 - 30} ${p.head}, ${x1} ${p.head}"/>`)
      // A parent's real span is a wide capsule; children's dots sit inside it.
      if (d.e.dur && d.e.kind !== 'window') {
        const end = yOf(Math.min(d.e.start + d.e.dur, d.s.t1), d.s)
        if (end - c.y > 3) html.push(`<i class="dur${kids(d.e.id).length ? ' parent' : ''}${dimmed(d.e) ? ' dim' : ''}" style="top:${c.y}px;height:${end - c.y}px;--ec:${hue(d.e)}"></i>`)
      }
      if (d.e.kind === 'window') html.push(`<i class="dur window" style="top:${c.y}px;height:${Math.max(10, yOf(Math.min(d.e.windowEnd, d.s.t1), d.s) - c.y)}px;--ec:${hue(d.e)}"></i>`)
    })
    const lead = c.items.reduce((a, b) => (b.e.importance > a.e.importance ? b : a)), ids = c.items.map((d) => d.e.id).join(' '), allDim = c.items.every((d) => dimmed(d.e))
    if (c.items.length > 1) {
      const step = 100 / c.items.length
      const cl = c.items.map((d, i) => `${hue(d.e)} ${i * step}% ${(i + 1) * step}%`).join(',')
      html.push(`<b class="dot cluster${allDim ? ' dim' : ''}" data-ids="${ids}" style="top:${c.y}px;--cl:${cl}" title="${esc(c.items.map((d) => d.e.title).join('\n'))}">${c.items.length}</b>`)
    } else html.push(`<b class="dot ${lead.e.kind} i${lead.e.importance}${allDim ? ' dim' : ''}" data-ids="${ids}" style="top:${c.y}px;--ec:${hue(lead.e)}" aria-label="${esc(lead.e.title)} ${fmt(lead.e.start, lead.e.precision)} ${IMP[lead.e.importance]}"></b>`)
    const show = c.y - lastLabel >= 18 && !allDim && lead.e.precision !== 'year'
    if (show) lastLabel = c.y
    const md = short(lead.e.start, 'day').split('-')
    const text = lead.e.precision === 'day' ? `<b>${+md[0]}月${+md[1]}日</b>` : `<b>${fmt(lead.e.start, lead.e.precision).replace(/^新历/, '')}</b>`
    html.push(`<span class="dlabel${allDim ? ' dim' : ''}" data-ids="${ids}" style="top:${c.y}px;--ec:${hue(lead.e)};${show ? '' : 'visibility:hidden'}">${text}</span>`)
  })
  rail.innerHTML = html.join('') + `<svg class="rail-svg" width="240" height="${h}">${leads.join('')}</svg>`
  rail.querySelectorAll('.dot').forEach((d) => {
    const id = d.dataset.ids.split(' ')[0]
    d.addEventListener('mouseenter', () => setHot(id)); d.addEventListener('mouseleave', () => setHot(null)); d.addEventListener('click', () => locate(id))
  })
  rail.dataset.years = JSON.stringify(years)
  rail.segFor = segFor; rail.yOf = yOf
  setHot(hot); syncScroll()
}
function setHot(id) {
  hot = id
  const target = id ?? selected
  document.querySelectorAll('.lead').forEach((p) => p.classList.toggle('hot', p.dataset.id === target))
  document.querySelectorAll('.dot,.dlabel').forEach((d) => {
    const on = !!target && d.dataset.ids.split(' ').includes(target)
    d.classList.toggle('hot', on)
    if (d.classList.contains('dlabel') && on) d.style.visibility = ''
  })
}
// Locates an event in the current view. Event table: scroll the list. Timeline: move the window so the event's start is
// at 30% of the width (keeping the zoom, unless its family is wider than the window), then scroll its row into view.
// Unplaced events exist only in the event table, so locating one switches views.
function locate(id) {
  const e = byId.get(id)
  selected = id
  for (let p = e; p?.parent; p = byId.get(p.parent)) folded.delete(p.parent)
  if (view === 'timeline' && e.start === null) { view = 'table'; toast('待定位事件只在事件表中显示，已切换到事件表') }
  if (view === 'timeline') {
    const famSpan = familyEnd(e) - e.start
    if (famSpan > win.span * 0.6) win.span = Math.min(100000, famSpan / 0.6)
    win.start = e.start - win.span * 0.3
  }
  render()
  requestAnimationFrame(() => {
    const sel = view === 'timeline' ? `#lane .ev[data-id="${id}"]` : `#cards .ev[data-id="${id}"]`
    const el = document.querySelector(sel), sc = view === 'timeline' ? $('#lane') : $('#scroller')
    if (!el) return
    const offset = view === 'timeline' ? 80 : sc.clientHeight / 3
    sc.scrollTo({ top: el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - offset, behavior: 'smooth' })
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1300)
  })
}
// Keeps the selected row and the "in view" rows of the tree in sync with what the active view shows.
function syncTree() {
  const tree = $('#tree')
  let inView = new Set(), first = null
  if (view === 'table') {
    const top = $('#scroller').getBoundingClientRect().top + 10
    first = [...document.querySelectorAll('#cards .ev')].find((el) => el.getBoundingClientRect().bottom > top)?.dataset.id
    if (first) inView.add(first)
  } else {
    // Every event whose time overlaps the window counts as visible; the earliest one is "current".
    const a = win.start, b = win.start + win.span
    const vis = events.filter((e) => e.start !== null && e.start <= b && e.start + (e.dur || 0) >= a).sort((p, q) => p.start - q.start)
    inView = new Set(vis.map((e) => e.id)); first = vis.find((e) => e.start >= a)?.id ?? vis[0]?.id
  }
  document.querySelectorAll('.tree-row').forEach((r) => {
    r.classList.toggle('cur', r.dataset.id === first)
    r.classList.toggle('inview', view === 'timeline' && inView.has(r.dataset.id))
  })
  // Only follow the view automatically while the user is not interacting with the tree itself.
  const cur = document.querySelector('.tree-row.cur')
  if (cur && !tree.matches(':hover') && (cur.offsetTop < tree.scrollTop + 40 || cur.offsetTop > tree.scrollTop + tree.clientHeight - 40)) tree.scrollTop = cur.offsetTop - tree.clientHeight / 3
  const n = inView.size
  $('#treeInfo').textContent = view === 'timeline' ? `视窗内 ${n} 件` : ''
}
function syncScroll() {
  const sc = $('#scroller'), top = sc.getBoundingClientRect().top + 10
  void top; syncTree()
  const years = JSON.parse($('#rail').dataset.years || '[]').filter((y) => y.y <= sc.scrollTop + 4)
  $('#stickyYear').innerHTML = years.length && sc.scrollTop > 20 ? `<span>${yearName(years.at(-1).t)}</span>` : ''
}
$('#scroller').addEventListener('scroll', syncScroll)
// Ctrl + wheel in the event table changes the spacing scale; the time at the pointer stays under the pointer.
$('#scroller').addEventListener('wheel', (ev) => {
  if (!ev.ctrlKey) return
  ev.preventDefault()
  const sc = $('#scroller'), py = ev.clientY - sc.getBoundingClientRect().top
  // Anchor: the card under the pointer keeps its screen position after the re-layout.
  const anchor = [...document.querySelectorAll('#cards .ev')].find((el) => el.getBoundingClientRect().bottom > ev.clientY)
  const offset = anchor ? anchor.getBoundingClientRect().top - sc.getBoundingClientRect().top : py
  setZoom(zoom * (ev.deltaY > 0 ? 1 / 1.15 : 1.15))
  const again = anchor && document.querySelector(`#cards .ev[data-id="${anchor.dataset.id}"]`)
  if (again) sc.scrollTop += again.getBoundingClientRect().top - sc.getBoundingClientRect().top - offset
}, { passive: false })
function setZoom(z) { zoom = Math.min(4, Math.max(1, Math.round(z * 100) / 100)); $('#zoomVal').textContent = Math.round(zoom * 100) + '%'; render() }
// Hits are kept in time order; stepping jumps to the hit in the current view (table: scroll; timeline: move the window).
function updateSearch() {
  hits = query ? events.filter(matches).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity)) : []
  hitIndex = hits.length ? 0 : -1
  renderSearchState()
}
function renderSearchState() {
  $('#searchBox').classList.toggle('active', !!query)
  $('#searchBox').classList.toggle('none', !!query && !hits.length)
  $('#searchCount').textContent = !query ? '' : hits.length ? `${hitIndex + 1} / ${hits.length}` : '无结果'
  $('#searchPrev').disabled = $('#searchNext').disabled = hits.length < 2
}
function gotoHit(step) {
  if (!hits.length) return
  hitIndex = (hitIndex + step + hits.length) % hits.length
  const e = hits[hitIndex]
  renderSearchState()
  locate(e.id)
}
let searchTimer
$('#search').addEventListener('input', (ev) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { query = ev.target.value.trim(); updateSearch(); render(); if (hits.length) gotoHit(0) }, 120)
})
$('#search').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); gotoHit(ev.shiftKey ? -1 : 1) }
  if (ev.key === 'Escape') { ev.target.value = ''; query = ''; updateSearch(); render() }
})
$('#searchPrev').addEventListener('click', () => gotoHit(-1))
$('#searchNext').addEventListener('click', () => gotoHit(1))
$('#searchClear').addEventListener('click', () => { $('#search').value = ''; query = ''; updateSearch(); render(); $('#search').focus() })
// Ctrl/Cmd + F focuses the panel search instead of the browser's.
document.addEventListener('keydown', (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key === 'f') { ev.preventDefault(); $('#search').focus(); $('#search').select() } })

// ---------- timeline view ----------
let win = null
function renderTimeline() {
  const lane = $('#lane'), width = $('#timelineView').clientWidth
  if (!win) { const dense = events.filter((e) => e.start > 1348 * Y); win = { start: dense[0].start - 4, span: 70 } }
  const x = (t) => 16 + ((t - win.start) / win.span) * (width - 32)
  const step = win.span > 4000 ? 3600 : win.span > 600 ? 360 : win.span > 120 ? 30 : win.span > 40 ? 10 : 5
  const ruler = [], grid = []
  for (let t = Math.ceil(win.start / step) * step; t <= win.start + win.span; t += step) {
    const major = step >= 360 ? true : t % M === 0
    ruler.push(`<span class="${major ? 'major' : ''}" style="left:${x(t)}px">${step >= 360 ? yearName(t) : major ? fmt(t, 'month').replace(/^新历/, '') : short(t, 'day')}</span>`)
    grid.push(`<i style="left:${x(t)}px;opacity:${major ? 1 : .5}"></i>`)
  }
  $('#ruler').innerHTML = ruler.join(''); $('#grid').innerHTML = grid.join('')
  $('#periods').innerHTML = periods.map((p, i) => {
    const l = Math.max(8, x(p.start)), r = Math.min(width - 8, p.end === null ? width - 8 : x(p.end))
    return r <= l ? '' : `<div class="period${activePeriod === p.id ? ' period-flash' : ''}" data-period="${p.id}" style="left:${l}px;width:${r - l}px;--pc:${PC(i)}">${p.title}</div>`
  }).join('')
  lane.innerHTML = ''
  // docs/577 §11: a parent event is a header bar across the top of its family. The bar is at least as long as the
  // parent's time range and is widened to cover every child card, so children always sit inside the frame under it.
  // A bright track inside the bar marks the parent's real time range.
  const roots = kids(null).filter((e) => e.start !== null && familyEnd(e) >= win.start - 10 && e.start <= win.start + win.span)
  const MIN_BAR = 260
  const leafW = (e, depth) => (open.has(e.id) ? 420 : depth ? 230 : 260)
  // Right edge in px of e's family, computed before placing anything so the header width is known up front.
  const extent = (e, depth) => {
    if (!kids(e.id).length) return x(e.start) + leafW(e, depth)
    const own = Math.max(x(e.start) + MIN_BAR, x(familyEnd(e)))
    return folded.has(e.id) ? own : Math.max(own, ...kids(e.id).map((k) => extent(k, depth + 1) + 10))
  }
  let host = lane
  const placeCard = (e, left, top, width, depth) => {
    const wrap = document.createElement('div'), isParent = kids(e.id).length > 0
    wrap.className = 'tcard' + (depth ? ' child' : '') + (isParent ? ' header' : '')
    wrap.style.width = width + 'px'; wrap.style.setProperty('--ec', hue(e))
    if (dimmed(e)) wrap.style.opacity = .3
    const c = card(e, { foldable: true, compact: !isParent }); wrap.append(c)
    if (!isParent) wrap.insertAdjacentHTML('afterbegin', (e.dur ? `<i class="bar-x" style="width:${Math.max(6, x(e.start + e.dur) - left)}px"></i>` : '') +
      `<i class="pin i${e.importance}"></i><i class="stem"></i><span class="tstamp">${short(e.start, e.precision)}</span>`)
    else {
      const tw = Math.max(4, x(familyEnd(e)) - left)
      wrap.insertAdjacentHTML('afterbegin', `<span class="tstamp range">${short(e.start, e.precision)} → ${short(familyEnd(e), e.precision)}</span>`)
      c.insertAdjacentHTML('beforeend', `<i class="track" style="width:${Math.min(tw, width)}px"></i>`)
    }
    wrap.style.left = left + 'px'; wrap.style.top = top + 'px'
    host.append(wrap)
    return c.offsetHeight
  }
  const layout = (e, top, depth) => {
    if (!kids(e.id).length) {
      const left = x(e.start), width = leafW(e, depth)
      return { right: left + width, bottom: top + placeCard(e, left, top, width, depth) }
    }
    const l = x(e.start), width = extent(e, depth) - l
    const headH = placeCard(e, l, top, width, depth)
    let bottom = top + headH
    if (!folded.has(e.id)) {
      const rows = []
      kids(e.id).forEach((k) => {
        const kl = x(k.start)
        let r = rows.findIndex((row) => row.right + 10 <= kl)
        if (r < 0) { r = rows.length; rows.push({ right: -Infinity, items: [] }) }
        rows[r].right = extent(k, depth + 1); rows[r].items.push(k)
      })
      let y = top + headH + 22
      rows.forEach((row) => {
        const placed = row.items.map((k) => layout(k, y, depth + 1))
        y = Math.max(...placed.map((p) => p.bottom)) + 26
      })
      bottom = y - 12
      host.insertAdjacentHTML('afterbegin', `<div class="frame" style="left:${l}px;width:${width}px;top:${top}px;height:${bottom - top}px;--ec:${hue(e)}"></div>`)
    }
    return { right: l + width, bottom }
  }
  // 2D packing (docs/577 §13): lay each family out at y = 0 in its own host, measure it, then move it to the highest y
  // where its box [left, right] x [y, y + h] does not intersect any family placed before it. Families are placed in
  // start order, so the earlier event always wins the higher slot.
  const placed = [], H_GAP = 14, V_GAP = 30, TOP = 28
  let laneBottom = 0
  roots.sort((p, q) => p.start - q.start).forEach((e) => {
    host = document.createElement('div'); host.className = 'family'; lane.append(host)
    const box = layout(e, 0, 0), left = x(e.start) - 6, right = box.right + H_GAP, h = box.bottom
    const blockers = placed.filter((r) => r.left < right && r.right > left).sort((p, q) => p.top - q.top)
    let y = TOP
    for (const r of blockers) if (y + h + V_GAP > r.top && y < r.bottom + V_GAP) y = r.bottom + V_GAP
    host.style.top = y + 'px'
    placed.push({ left, right, top: y, bottom: y + h })
    laneBottom = Math.max(laneBottom, y + h)
  })
  host = lane
  lane.insertAdjacentHTML('beforeend', `<div style="position:absolute;left:0;width:1px;height:1px;top:${laneBottom + 96}px"></div>`)
  drawMinimap()
  syncTree()
  $('#zoomVal').textContent = `${Math.round(win.span)} 天`
  requestAnimationFrame(markFades)
  $('#range').textContent = `${fmt(win.start)} — ${fmt(win.start + win.span)}`
}
// ---------- minimap (docs/577 §10) ----------
// Segments use the same gap rule as the event-table rail. Each segment's width follows its event count, with a 10px
// break between segments, so a 20万-year gap does not squeeze the dense years into one pixel.
const MW = 420, GAP = 14
function miniModel() {
  const roots = kids(null).filter((e) => e.start !== null).sort((a, b) => a.start - b.start)
  const seg = segmentOf(roots.map((e) => ({ e, depth: 0 })))
  const groups = []
  roots.forEach((e) => {
    const k = seg(e)
    groups[k] ??= { t0: e.start, t1: e.start, n: 0 }
    groups[k].t1 = Math.max(groups[k].t1, e.start + (e.dur || 0)); groups[k].n++
  })
  groups.forEach((g) => { const pad = Math.max(2, (g.t1 - g.t0) * 0.04); g.t0 -= pad; g.t1 += pad })
  const total = groups.reduce((a, g) => a + g.n, 0), usable = MW - GAP * (groups.length - 1)
  let x = 0
  groups.forEach((g) => { g.x0 = x; g.w = Math.max(14, (g.n / total) * usable); x += g.w + GAP })
  const k = MW / (x - GAP); groups.forEach((g) => { g.x0 *= k; g.w *= k })
  const toX = (t) => {
    const g = groups.find((g) => t <= g.t1) ?? groups.at(-1)
    return t < g.t0 ? g.x0 : g.x0 + Math.min(1, (t - g.t0) / Math.max(1e-9, g.t1 - g.t0)) * g.w
  }
  const toT = (px) => {
    const g = groups.find((g) => px <= g.x0 + g.w + GAP / 2) ?? groups.at(-1)
    return g.t0 + Math.min(1, Math.max(0, (px - g.x0) / g.w)) * (g.t1 - g.t0)
  }
  return { roots, groups, toX, toT }
}
function drawMinimap() {
  const m = miniModel(), a = m.toX(win.start), b = m.toX(win.start + win.span)
  $('#minimap').innerHTML =
    m.groups.map((g, i) => `<u style="left:${g.x0}px;width:${g.w}px" title="${fmt(g.t0, 'year')}"></u>` + (g.w > 34 ? `<em style="left:${g.x0 + 4}px;max-width:${g.w - 6}px">${short(g.t0, 'year')}</em>` : '') + (i ? `<s style="left:${g.x0 - GAP / 2}px"></s>` : '')).join('') +
    m.roots.map((e) => `<i style="left:${m.toX(e.start)}px;--ec:${hue(e)};height:${10 + e.importance * 6}px;top:${26 - (5 + e.importance * 3)}px${dimmed(e) ? ';opacity:.2' : ''}"></i>`).join('') +
    `<b id="miniFrame" style="left:${a}px;width:${Math.max(8, b - a)}px"></b>`
}
let mini = null
$('#minimap').addEventListener('pointerdown', (ev) => {
  ev.preventDefault(); ev.stopPropagation()
  const el = $('#minimap'), px = ev.clientX - el.getBoundingClientRect().left, frame = $('#miniFrame')
  const fl = frame.offsetLeft, fw = frame.offsetWidth
  el.setPointerCapture(ev.pointerId)
  // Grabbing the frame keeps the grab offset; clicking elsewhere centres the clicked time, then dragging continues.
  mini = { offset: px >= fl && px <= fl + fw ? px - fl : fw / 2 }
  moveMini(px)
})
$('#minimap').addEventListener('pointermove', (ev) => { if (mini) moveMini(ev.clientX - $('#minimap').getBoundingClientRect().left) })
$('#minimap').addEventListener('pointerup', () => { mini = null; $('#minimap').classList.remove('dragging') })
$('#minimap').addEventListener('keydown', (ev) => {
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
  ev.preventDefault(); win.start += (ev.key === 'ArrowRight' ? 1 : -1) * win.span * 0.25; render()
})
function moveMini(px) {
  // The frame keeps the current zoom; only the window start moves.
  win.start = miniModel().toT(Math.max(0, Math.min(MW, px - mini.offset)))
  $('#minimap').classList.add('dragging'); render()
}

let drag = null
$('#lane').addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.ev')) drag = { x: ev.clientX, start: win.start } })
window.addEventListener('pointermove', (ev) => { if (drag) { win.start = drag.start - ((ev.clientX - drag.x) / $('#timelineView').clientWidth) * win.span; renderTimeline() } })
window.addEventListener('pointerup', () => (drag = null))
$('#timelineView').addEventListener('wheel', (ev) => {
  if (!ev.ctrlKey) return
  ev.preventDefault(); const f = ev.deltaY > 0 ? 1.2 : 1 / 1.2, mid = win.start + win.span / 2
  win.span = Math.min(100000, Math.max(8, win.span * f)); win.start = mid - win.span / 2; renderTimeline()
}, { passive: false })

// ---------- toolbar: period picker, expand/collapse all, zoom ----------
function renderPeriodPicker() {
  const p = periods.find((v) => v.id === activePeriod), i = periods.indexOf(p)
  $('#periodBtn').innerHTML = `<i style="background:${p ? PC(i) : 'var(--muted-foreground)'}"></i><span class="lbl">${p ? p.title : '全部时期'}</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>`
  const count = (q) => events.filter((e) => e.start !== null && e.start >= q.start && (q.end === null || e.start <= q.end)).length
  const nested = (q) => periods.some((o) => o !== q && o.start <= q.start && (o.end === null || (q.end !== null && q.end <= o.end)) && (o.end ?? Infinity) - o.start > (q.end ?? Infinity) - q.start)
  $('#periodPop').innerHTML = `<button data-p=""><i style="--pc:var(--line)"></i>全部时期（全貌）<small>${events.length}</small></button>` +
    periods.map((q, k) => `<button data-p="${q.id}" class="${q.id === activePeriod ? 'cur' : ''} ${nested(q) ? 'depth1' : ''}"><i style="--pc:${PC(k)}"></i>
      <span>${q.title}<br><small>${fmt(q.start, q.end !== null && q.end - q.start > Y * 10 ? 'year' : 'day')} — ${q.end === null ? (q.ongoing ? '持续中' : '结束未定') : fmt(q.end, q.end - q.start > Y * 10 ? 'year' : 'day')}</small></span><small>${count(q)} 件</small></button>`).join('')
  $('#periodPop').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { $('#periodPop').hidden = true; goPeriod(b.dataset.p || null) }))
}
function goPeriod(id) {
  activePeriod = id
  const p = periods.find((v) => v.id === id)
  if (!p) { win = null; render(); toast('已显示全貌'); return }
  const inside = events.filter((e) => e.start !== null && e.start >= p.start && (p.end === null || e.start <= p.end)).sort((a, b) => a.start - b.start)
  if (view === 'timeline') {
    const end = p.end ?? (inside.at(-1)?.start ?? p.start) + 5
    win = { start: p.start - (end - p.start) * 0.05, span: Math.max(8, (end - p.start) * 1.1) }
    render()
  } else {
    // Event table: scroll to the first event of the period and flash the period band.
    const first = inside[0]
    if (first) {
      for (let e = first; e?.parent; e = byId.get(e.parent)) folded.delete(e.parent)
      render()
      requestAnimationFrame(() => {
        const el = document.querySelector(`#cards .ev[data-id="${first.id}"]`), sc = $('#scroller')
        sc.scrollTo({ top: el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 80, behavior: 'smooth' })
        document.querySelectorAll(`[data-period="${p.id}"]`).forEach((b) => { b.classList.add('period-flash'); setTimeout(() => b.classList.remove('period-flash'), 1500) })
      })
    } else render()
  }
  toast(`已定位到时期「${p.title}」· ${inside.length} 件事件`)
}
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.hidden = false; t.style.opacity = 1
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.style.opacity = 0; setTimeout(() => (t.hidden = true), 300) }, 1600)
}
function renderToggleAll() {
  const visible = events.filter((e) => e.start !== null || view === 'table')
  const allOpen = visible.length && visible.every((e) => open.has(e.id))
  $('#toggleAll').innerHTML = allOpen
    ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6l4-3 4 3M4 13l4-3 4 3"/></svg><span class="lbl">全部收起</span>'
    : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 3l4 3 4-3M4 10l4 3 4-3"/></svg><span class="lbl">全部展开</span>'
  $('#toggleAll').dataset.all = allOpen ? '1' : ''
}
$('#toggleAll').addEventListener('click', () => {
  if ($('#toggleAll').dataset.all) open.clear(); else events.forEach((e) => open.add(e.id))
  render()
})
$('#periodBtn').addEventListener('click', (ev) => { ev.stopPropagation(); $('#periodPop').hidden = !$('#periodPop').hidden })
document.addEventListener('click', (ev) => { if (!ev.target.closest('.picker')) $('#periodPop').hidden = true; if (!ev.target.closest('#moreBtn,#menu')) $('#menu').hidden = true })
$('#zoomIn').addEventListener('click', () => (view === 'table' ? setZoom(zoom * 1.25) : ((win.span /= 1.5), render())))
$('#zoomOut').addEventListener('click', () => (view === 'table' ? setZoom(zoom / 1.25) : ((win.span *= 1.5), render())))
$('#zoomFit').addEventListener('click', () => { if (view === 'table') setZoom(1); else { win = null; render() } })

// ---------- chrome ----------
function markFades() {
  document.querySelectorAll('.ev-title, .tree-row .tt').forEach((t) => t.classList.toggle('fade', t.scrollWidth > t.clientWidth + 1))
}
function render() {
  renderTree(visibleList())
  $('#tableView').hidden = view !== 'table'; $('#timelineView').hidden = view !== 'timeline'
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === view))
  renderLegend(); renderPeriodPicker(); renderToggleAll()
  $('#zoomVal').textContent = view === 'table' ? Math.round(zoom * 100) + '%' : `${Math.round(win?.span ?? 70)} 天`
  $('#count').textContent = `${events.length} 件事件`
  if (view === 'table') {
    const placed = events.filter((e) => e.start !== null).map((e) => e.start).sort((a, b) => a - b)
    $('#range').textContent = `${fmt(placed[0], 'year')} — ${fmt(placed.at(-1))}`
    renderTable()
  } else { renderTimeline(); $('#zoomVal').textContent = `${Math.round(win.span)} 天` }
  requestAnimationFrame(markFades)
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view; render() }))
$('[data-light-toggle]').addEventListener('click', (ev) => { ev.target.setAttribute('aria-pressed', document.body.toggleAttribute('data-light')); render() })
$('#moreBtn').addEventListener('click', () => ($('#menu').hidden = !$('#menu').hidden))
$('#pending').addEventListener('click', () => locate(kids(null).find((e) => e.start === null).id))
new ResizeObserver(() => render()).observe($('.panel'))
render()

$('#treeToggle').addEventListener('click', () => {
  const on = $('#workspace').classList.toggle('tree-off')
  $('#treeToggle').setAttribute('aria-pressed', !on); render()
})
