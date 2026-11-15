// docs/577 v2 prototype: style A, events colored by type. Cards flow in tree order; the rail is drawn from measured card positions.
const { events, periods, fmt, short, span, M, Y, categories } = window.WL
const $ = (s) => document.querySelector(s)
const byId = new Map(events.map((e) => [e.id, e]))
const kids = (id) => events.filter((e) => e.parent === id).sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))
const open = new Set(), folded = new Set(), hiddenTypes = new Set()
let selected = null, hot = null, view = 'table', query = ''
const hue = (e) => `var(--c${e.category})`
const dimmed = (e) => hiddenTypes.has(e.category) || (query && !e.title.includes(query))
const yearOf = (t) => Math.floor(t / Y)
const yearName = (t) => fmt(t, 'year')
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function renderLegend() {
  const counts = categories.map((_, i) => events.filter((e) => e.category === i).length)
  $('#legend').innerHTML = '<span>类型</span>' + categories.map((c, i) =>
    `<button data-k="${i}" class="${hiddenTypes.has(i) ? 'off' : ''}" style="--ec:var(--c${i})" title="点击隐藏/显示；双击只看这一类"><i></i>${c} ${counts[i]}</button>`).join('')
  $('#legend').querySelectorAll('button').forEach((b) => {
    const k = +b.dataset.k
    b.addEventListener('click', () => { hiddenTypes.has(k) ? hiddenTypes.delete(k) : hiddenTypes.add(k); render() })
    b.addEventListener('dblclick', () => { hiddenTypes.clear(); categories.forEach((_, i) => i !== k && hiddenTypes.add(i)); render() })
  })
}

// ---------- shared card ----------
function card(e, depth = 0) {
  const el = document.createElement('article'), isOpen = open.has(e.id)
  el.className = 'ev' + (isOpen ? ' open' : '') + (selected === e.id ? ' sel' : '') + (dimmed(e) ? ' dim' : '')
  el.dataset.id = e.id
  el.style.marginLeft = depth * 18 + 'px'
  el.style.setProperty('--ec', hue(e))
  el.setAttribute('aria-expanded', isOpen)
  const n = kids(e.id).length
  el.innerHTML = `<div class="ev-head" title="${esc(e.title)}">
      <span class="ev-dot ${e.kind}"></span><span class="ev-title">${esc(e.title)}</span>
      ${n ? `<span class="ev-kids" title="${n} 个子事件">${isOpen ? n + ' 个子事件' : '▸ ' + n}</span>` : ''}<button class="ev-more" aria-label="${esc(e.title)}更多操作">⋯</button></div>`
  if (isOpen) {
    const kind = e.start === null ? '' : e.kind === 'window' ? `时间不确定 · 最晚 ${fmt(e.windowEnd)}` : e.dur ? `持续 ${e.dur} 天` : '时点'
    el.insertAdjacentHTML('beforeend', `<div class="ev-body">
      <div class="ev-meta"><span class="ev-tag">${categories[e.category]}</span><span class="ev-when">${fmt(e.start, e.precision)}</span>
        ${kind ? `<span class="ev-kind">${kind}</span>` : ''}${e.label ? `<span class="ev-kind">${esc(e.label)}</span>` : ''}</div>
      ${e.fact.split('\n\n').map((p) => `<p>${esc(p)}</p>`).join('')}
      ${e.people.length ? `<div class="ev-people">${e.people.map((p) => `<span class="who"><i>${p[0]}</i>${p}</span>`).join('')}</div>` : ''}
      ${e.changes.map((c) => `<div class="change"><b>${c.who}</b>${c.dim}<span>${c.before}</span><em>→</em><span>${c.after}</span></div>`).join('')}</div>`)
  }
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('button')) return
    isOpen ? open.delete(e.id) : open.add(e.id)
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
  const walk = (list, depth) => list.forEach((e) => { out.push({ e, depth }); if (!folded.has(e.id)) walk(kids(e.id), depth + 1) })
  walk(kids(null).filter((e) => e.start !== null), 0)
  return { placed: out, pending: kids(null).filter((e) => e.start === null) }
}
function segmentOf(list) {
  // Break where the gap exceeds both 30 days and 20 x the median gap (docs/577 §3.2).
  const times = [...new Set(list.map((x) => x.e.start))].sort((a, b) => a - b)
  const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)
  const limit = Math.max(M, (gaps[Math.floor(gaps.length / 2)] ?? 0) * 20)
  const seg = new Map(); let k = 0
  times.forEach((t, i) => { if (i && t - times[i - 1] > limit) k++; seg.set(t, k) })
  return (e) => seg.get(e.start)
}
function renderTree({ placed, pending }) {
  const tree = $('#treeRows'); tree.innerHTML = ''
  let year = null
  const row = (e, depth) => {
    const n = kids(e.id).length, r = document.createElement('div')
    r.className = 'tree-row' + (selected === e.id ? ' sel' : '') + (dimmed(e) ? ' dim' : '')
    r.dataset.id = e.id; r.setAttribute('role', 'treeitem'); r.tabIndex = -1
    if (n) r.setAttribute('aria-expanded', !folded.has(e.id))
    r.style.paddingLeft = 4 + depth * 14 + 'px'
    r.style.setProperty('--ec', hue(e))
    r.innerHTML = `<span class="tw${folded.has(e.id) ? ' fold' : ''}">${n ? '▾' : ''}</span><span class="td"></span>
      <span class="tt" title="${esc(e.title)}">${esc(e.title)}</span><span class="ts">${short(e.start, e.precision)}</span>`
    r.querySelector('.tw').addEventListener('click', (ev) => { ev.stopPropagation(); folded.has(e.id) ? folded.delete(e.id) : folded.add(e.id); render() })
    r.addEventListener('click', () => locate(e.id))
    tree.append(r)
  }
  placed.forEach(({ e, depth }) => {
    // Year separators are only visual; the hierarchy still follows parent events (docs/576 #3).
    if (depth === 0 && yearOf(e.start) !== year) { year = yearOf(e.start); tree.insertAdjacentHTML('beforeend', `<div class="tree-group">${yearName(e.start)}</div>`) }
    row(e, depth)
  })
  if (pending.length) { tree.insertAdjacentHTML('beforeend', `<div class="tree-group">待定位 · ${pending.length}</div>`); pending.forEach((e) => row(e, 0)) }
}
function renderTable() {
  const list = visibleList(), seg = segmentOf(list.placed)
  renderTree(list)
  const cards = $('#cards'); cards.innerHTML = ''
  let prev = null; const breaks = []
  list.placed.forEach(({ e, depth }) => {
    const s = seg(e)
    if (prev !== null && s !== prev) {
      const gap = document.createElement('div'); gap.style.height = '46px'; gap.dataset.break = prev + '>' + s; cards.append(gap); breaks.push(gap)
    }
    prev = s; cards.append(card(e, depth))
  })
  if (list.pending.length) {
    const gap = document.createElement('div'); gap.style.height = '46px'; gap.dataset.pending = ''; cards.append(gap)
    list.pending.forEach((e) => cards.append(card(e)))
  }
  requestAnimationFrame(() => drawRail(list, seg, breaks))
}
function drawRail(list, seg, breaks) {
  const rail = $('#rail'), cardsEl = $('#cards'), h = cardsEl.scrollHeight
  rail.innerHTML = ''; rail.style.height = h + 'px'
  const pos = new Map()
  for (const el of cardsEl.querySelectorAll('.ev')) pos.set(el.dataset.id, { head: cardsEl.offsetTop + el.offsetTop + 16, left: el.offsetLeft })
  const segs = new Map()
  list.placed.forEach(({ e }) => {
    const k = seg(e), p = pos.get(e.id), s = segs.get(k) ?? { t0: Infinity, t1: -Infinity, y0: Infinity, y1: -Infinity }
    s.t0 = Math.min(s.t0, e.start); s.t1 = Math.max(s.t1, e.start); s.y0 = Math.min(s.y0, p.head); s.y1 = Math.max(s.y1, p.head); segs.set(k, s)
  })
  const yOf = (t, s) => (s.t1 === s.t0 ? (s.y0 + s.y1) / 2 : s.y0 + ((t - s.t0) / (s.t1 - s.t0)) * (s.y1 - s.y0))
  const html = []
  for (const s of segs.values()) html.push(`<div class="rail-line" style="top:${s.y0 - 22}px;height:${s.y1 - s.y0 + 44}px"></div>`)
  // Year badges and month ticks, strictly on the scale; month labels drop when closer than 44px.
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
  breaks.forEach((gap) => {
    const [a, b] = gap.dataset.break.split('>').map(Number)
    html.push(`<div class="break" style="top:${cardsEl.offsetTop + gap.offsetTop}px;height:46px">相隔 ${span(segs.get(b).t0 - segs.get(a).t1)}</div>`)
  })
  const pend = cardsEl.querySelector('[data-pending]')
  if (pend) html.push(`<div class="break" style="top:${cardsEl.offsetTop + pend.offsetTop}px;height:46px">时间待定位</div>`)
  // Dots: strict scale; dots within 4px merge into a cluster whose ring shows each event's type color.
  const dots = list.placed.map(({ e }) => ({ e, s: segs.get(seg(e)), y: yOf(e.start, segs.get(seg(e))) })).sort((a, b) => a.y - b.y)
  const clusters = []
  dots.forEach((d) => { const c = clusters.at(-1); c && d.y - c.y < 4 ? c.items.push(d) : clusters.push({ y: d.y, items: [d] }) })
  const leads = []; let lastLabel = -Infinity
  clusters.forEach((c) => {
    c.items.forEach((d) => {
      const p = pos.get(d.e.id), x1 = 210 + 12 + p.left
      leads.push(`<path class="lead${dimmed(d.e) ? ' dim' : ''}" data-id="${d.e.id}" style="--ec:${hue(d.e)}" d="M165 ${c.y} C 190 ${c.y}, ${x1 - 30} ${p.head}, ${x1} ${p.head}"/>`)
      if (d.e.dur && d.e.kind !== 'window') {
        const end = yOf(Math.min(d.e.start + d.e.dur, d.s.t1), d.s)
        if (end - c.y > 3) html.push(`<i class="dur${dimmed(d.e) ? ' dim' : ''}" style="top:${c.y}px;height:${end - c.y}px;--ec:${hue(d.e)}"></i>`)
      }
      if (d.e.kind === 'window') html.push(`<i class="dur window" style="top:${c.y}px;height:${Math.max(10, yOf(Math.min(d.e.windowEnd, d.s.t1), d.s) - c.y)}px;--ec:${hue(d.e)}"></i>`)
    })
    const lead = c.items[0], ids = c.items.map((d) => d.e.id).join(' '), allDim = c.items.every((d) => dimmed(d.e))
    if (c.items.length > 1) {
      const step = 100 / c.items.length
      const cl = c.items.map((d, i) => `${hue(d.e)} ${i * step}% ${(i + 1) * step}%`).join(',')
      html.push(`<b class="dot cluster${allDim ? ' dim' : ''}" data-ids="${ids}" style="top:${c.y}px;--cl:${cl}" title="${esc(c.items.map((d) => d.e.title).join('\n'))}">${c.items.length}</b>`)
    } else html.push(`<b class="dot ${lead.e.kind}${allDim ? ' dim' : ''}" data-ids="${ids}" style="top:${c.y}px;--ec:${hue(lead.e)}" aria-label="${esc(lead.e.title)} ${fmt(lead.e.start, lead.e.precision)}"></b>`)
    const show = c.y - lastLabel >= 18 && !allDim && lead.e.precision !== 'year'
    if (show) lastLabel = c.y
    const d0 = lead.e.start, md = short(d0, 'day').split('-')
    const text = lead.e.precision === 'day' ? `<b>${+md[0]}月${+md[1]}日</b>` : `<b>${fmt(d0, lead.e.precision).replace(/^新历/, '')}</b>`
    html.push(`<span class="dlabel${allDim ? ' dim' : ''}" data-ids="${ids}" style="top:${c.y}px;--ec:${hue(lead.e)};${show ? '' : 'visibility:hidden'}">${text}</span>`)
  })
  rail.innerHTML = html.join('') + `<svg class="rail-svg" width="240" height="${h}">${leads.join('')}</svg>`
  rail.querySelectorAll('.dot').forEach((d) => {
    const id = d.dataset.ids.split(' ')[0]
    d.addEventListener('mouseenter', () => setHot(id)); d.addEventListener('mouseleave', () => setHot(null)); d.addEventListener('click', () => locate(id))
  })
  rail.dataset.years = JSON.stringify(years)
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
function locate(id) {
  selected = id
  for (let e = byId.get(id); e?.parent; e = byId.get(e.parent)) folded.delete(e.parent)
  if (view !== 'table') view = 'table'
  render()
  requestAnimationFrame(() => {
    const el = document.querySelector(`#cards .ev[data-id="${id}"]`), sc = $('#scroller')
    if (!el) return
    sc.scrollTo({ top: el.offsetTop - sc.clientHeight / 3, behavior: 'smooth' })
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1300)
  })
}
function syncScroll() {
  const sc = $('#scroller'), top = sc.scrollTop + 10
  const first = [...document.querySelectorAll('#cards .ev')].find((el) => el.offsetTop + el.offsetHeight > top)
  document.querySelectorAll('.tree-row').forEach((r) => r.classList.toggle('cur', r.dataset.id === first?.dataset.id))
  const cur = document.querySelector('.tree-row.cur'), tree = $('#tree')
  if (cur && (cur.offsetTop < tree.scrollTop + 40 || cur.offsetTop > tree.scrollTop + tree.clientHeight - 40)) tree.scrollTop = cur.offsetTop - tree.clientHeight / 3
  const years = JSON.parse($('#rail').dataset.years || '[]').filter((y) => y.y <= sc.scrollTop + 4)
  $('#stickyYear').innerHTML = years.length && sc.scrollTop > 20 ? `<span>${yearName(years.at(-1).t)}</span>` : ''
}
$('#scroller').addEventListener('scroll', syncScroll)
$('#search').addEventListener('input', (ev) => {
  query = ev.target.value.trim(); render()
  const hit = query && events.find((e) => e.title.includes(query))
  if (hit) document.querySelector(`.tree-row[data-id="${hit.id}"]`)?.scrollIntoView({ block: 'center' })
})

// ---------- timeline view ----------
let win = null
function renderTimeline() {
  const roots = kids(null).filter((e) => e.start !== null)
  const lane = $('#lane'), width = $('#timelineView').clientWidth
  if (!win) { const dense = roots.filter((e) => e.start > 1348 * Y); win = { start: dense[0].start - 4, span: 70 } }
  const x = (t) => 16 + ((t - win.start) / win.span) * (width - 32)
  const step = win.span > 120 ? 30 : win.span > 40 ? 10 : 5
  const ruler = [], grid = []
  for (let t = Math.ceil(win.start / step) * step; t <= win.start + win.span; t += step) {
    const major = t % M === 0
    ruler.push(`<span class="${major ? 'major' : ''}" style="left:${x(t)}px">${major ? fmt(t, 'month').replace(/^新历/, '') : short(t, 'day')}</span>`)
    grid.push(`<i style="left:${x(t)}px;opacity:${major ? 1 : .5}"></i>`)
  }
  $('#ruler').innerHTML = ruler.join(''); $('#grid').innerHTML = grid.join('')
  $('#periods').innerHTML = periods.map((p, i) => {
    const l = Math.max(8, x(p.start)), r = Math.min(width - 8, p.end === null ? width - 8 : x(p.end))
    return r <= l ? '' : `<div class="period" style="left:${l}px;width:${r - l}px;--pc:var(--chart-${i + 1})">${p.title}</div>`
  }).join('')
  lane.innerHTML = ''
  const items = roots.filter((e) => e.start + (e.dur || 0) >= win.start - 10 && e.start <= win.start + win.span).map((e) => {
    const wrap = document.createElement('div'), w = open.has(e.id) ? 340 : 200, left = x(e.start)
    wrap.className = 'tcard'; wrap.style.width = w + 'px'; wrap.style.setProperty('--ec', hue(e))
    if (dimmed(e)) wrap.style.opacity = .3
    wrap.append(card(e))
    wrap.insertAdjacentHTML('afterbegin', (e.dur ? `<i class="bar-x" style="width:${Math.max(6, x(e.start + e.dur) - left)}px"></i>` : '') +
      `<i class="pin"></i><i class="stem"></i><span class="tstamp">${short(e.start, e.precision)}</span>`)
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
  let top = 28; const tops = rows.map((row) => { const t = top; top += row.h + 34; return t })
  items.forEach((it) => { it.wrap.style.left = it.left + 'px'; it.wrap.style.top = tops[it.row] + 'px' })
  // Minimap over the dense stretch: one tick per event, frame = current window.
  const all = roots.filter((e) => e.start > 1348 * Y), t0 = all[0].start - 5, t1 = all.at(-1).start + 5, mx = (t) => ((t - t0) / (t1 - t0)) * 260
  $('#minimap').innerHTML = all.map((e) => `<i style="left:${mx(e.start)}px;--ec:${hue(e)}"></i>`).join('') +
    `<b style="left:${Math.max(0, mx(win.start))}px;width:${Math.max(6, mx(win.start + win.span) - mx(win.start))}px"></b>`
  $('#range').textContent = `${fmt(win.start)} — ${fmt(win.start + win.span)}`
}
let drag = null
$('#lane').addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.ev')) drag = { x: ev.clientX, start: win.start } })
window.addEventListener('pointermove', (ev) => { if (drag) { win.start = drag.start - ((ev.clientX - drag.x) / $('#timelineView').clientWidth) * win.span; renderTimeline() } })
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
  renderLegend()
  $('#count').textContent = `${events.length} 件事件`
  if (view === 'table') {
    const placed = events.filter((e) => e.start !== null).map((e) => e.start).sort((a, b) => a - b)
    $('#range').textContent = `${fmt(placed[0], 'year')} — ${fmt(placed.at(-1))}`
    renderTable()
  } else renderTimeline()
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view; render() }))
$('[data-light-toggle]').addEventListener('click', (ev) => { ev.target.setAttribute('aria-pressed', document.body.toggleAttribute('data-light')); render() })
$('#moreBtn').addEventListener('click', () => ($('#menu').hidden = !$('#menu').hidden))
$('#collapseAll').addEventListener('click', () => { open.clear(); $('#menu').hidden = true; render() })
$('#pending').addEventListener('click', () => locate(kids(null).find((e) => e.start === null).id))
new ResizeObserver(() => render()).observe($('.panel'))
render()
