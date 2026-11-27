// docs/611 §7 / §9.3 real-target check: built app in Electron on a seeded synthetic root
// (zero models, offline renderer, no HTTP server). Screenshots stay outside the repo; the
// repo report only records results, computed styles, hashes and file names.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { _electron } from 'playwright-core'

const shots = join(homedir(), 'shakeink-test-roots', 'chapter-reader-611-evidence', new Date().toISOString().replace(/[:.]/g, '-'))
const reportPath = resolve('docs/611-chapter-reader-evidence/real-target-report.json')
await mkdir(shots, { recursive: true }); await mkdir(resolve('docs/611-chapter-reader-evidence'), { recursive: true })
const base = await mkdtemp(join(tmpdir(), 'shakeink-chapter-reader-'))
const seeded = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/seed-chapter-reader.ts'), base], { encoding: 'utf8' })
assert.equal(seeded.status, 0, seeded.stderr)
const fixture = JSON.parse(await readFile(join(base, 'fixture.json'), 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex')
const report = { status: 'running', checks: [], errors: [], screenshots: [], isolation: { syntheticWorks: 1, zeroModels: true, offlineRenderer: true, httpServerStarted: false, userDataAccessed: false }, limitations: [] }
const env = { ...process.env, SHAKEINK_TEST_ROOT: fixture.root }; delete env.ELECTRON_RUN_AS_NODE
let app, page
const check = (id, detail = {}) => { report.checks.push({ id, result: 'pass', ...detail }); console.log('pass', id) }
async function launch() {
  app = await _electron.launch({ args: [resolve('.')], env, timeout: 90000 })
  page = await app.firstWindow({ timeout: 90000 }); page.setDefaultTimeout(30000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.context().setOffline(true)
  // Zero models: the app offers model setup once per launch. Decline it (local writing stays available).
  const later = page.getByRole('button', { name: '暂不配置', exact: true })
  await Promise.race([later.waitFor({ timeout: 90000 }), page.getByText('今天，想写点什么？').waitFor({ timeout: 90000 })])
  if (await later.isVisible().catch(() => false)) { await later.click(); await later.waitFor({ state: 'hidden' }) }
  await page.getByRole('button', { name: /^账号菜单：/ }).waitFor({ timeout: 30000 })
  const bootstrap = await page.evaluate(() => window.desktop.bootstrap())
  assert.equal(bootstrap.dataRoot, fixture.root); assert.equal(bootstrap.models.length, 0)
  report.runtime ??= await app.evaluate(() => ({ platform: process.platform, arch: process.arch, electron: process.versions.electron }))
}
async function quit() {
  const closed = app.waitForEvent('close', { timeout: 45000 })
  await page.evaluate(() => { void window.desktop.command('app.quit') }); await closed; app = undefined
}
async function shot(name) {
  const path = join(shots, name + '.png'); await page.screenshot({ path })
  report.screenshots.push({ name: name + '.png', sha256: hash(await readFile(path)) })
}
const style = (selector, props, pseudo) => page.locator(selector).first().evaluate((el, [p, ps]) => { const s = getComputedStyle(el, ps ?? undefined); return Object.fromEntries(p.map(k => [k, s.getPropertyValue(k)])) }, [props, pseudo])
const chapterRead = () => page.evaluate(async ({ novelId, chapterId }) => (await (await fetch(`/api/novels/${novelId}/chapters/${chapterId}`)).json()).chapter, { novelId: fixture.work.novelId, chapterId: fixture.work.chapterId })
async function openChapter() {
  // The real sidebar: work → 正文 → 第一卷 青石巷 → 第一章 灯下来客 (rows expand by default).
  const row = text => page.getByText(text, { exact: true }).first()
  if (!(await row(fixture.work.chapterTitle).isVisible().catch(() => false))) {
    await row(fixture.work.title).click()
    if (!(await row(fixture.work.volumeTitle).isVisible().catch(() => false))) await row('正文').click().catch(() => {})
    if (!(await row(fixture.work.chapterTitle).isVisible().catch(() => false))) await row(fixture.work.volumeTitle).click()
  }
  await row(fixture.work.chapterTitle).click()
  await page.getByRole('group', { name: '章节信息', exact: true }).waitFor()
}
const settingsButton = () => page.getByRole('button', { name: '阅读设置', exact: true })
const popup = () => page.getByRole('dialog', { name: '阅读设置' })
async function openSettings() { if (!(await popup().isVisible())) await settingsButton().click(); await popup().waitFor() }
// Real keyboard path through the browser window (memory text-shortcut-598).
const key = keyCode => app.evaluate(({ BrowserWindow }, keyCode) => { const w = BrowserWindow.getAllWindows()[0].webContents; w.sendInputEvent({ type: 'keyDown', keyCode }); w.sendInputEvent({ type: 'keyUp', keyCode }) }, keyCode)

try {
  await launch()
  const before = await chapterRead().catch(() => null)
  await openChapter()
  const start = await chapterRead(); report.chapter = { id: start.id, version: start.version, contentSha256: hash(start.content) }
  // CRR-01 paper, wide
  await page.evaluate(() => document.documentElement.classList.contains('paper')) || report.limitations.push('root theme was not paper at start')
  const pageStyle = await style('.chapter-reader-page', ['background-color', 'box-shadow', 'width'])
  const body = await style('[data-block] p', ['font-size', 'line-height', 'text-indent', 'font-family'])
  assert.ok(await page.locator('h2.chapter-crumb').isVisible()); assert.ok(await page.locator('.chapter-reader-end').isVisible())
  await shot('crr-01-paper'); check('CR611-R01', { pageStyle, body, crumb: (await page.locator('h2.chapter-crumb').innerText()).replace(/\s+/g, ' ') })
  // CR611-R01b: real full-screen content (chat panel hidden) gives the wide book-page layout
  await page.getByRole('button', { name: '进入全屏', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.chapter-reader')?.clientWidth >= 820)
  await page.waitForTimeout(400)
  const wide = await style('.chapter-reader-page', ['width', 'box-shadow', 'background-color'])
  const desk = await style('.chapter-reader', ['background-color'])
  assert.equal(wide.width, '900px'); assert.notEqual(wide['box-shadow'], 'none')
  await shot('crr-01b-paper-wide'); check('CR611-R01b', { wide, desk })
  // CR611-R08 (2026-11-28 user): Ctrl + wheel resizes the page smoothly, up to the whole panel; text and window zoom stay
  {
    const para = page.locator('[data-block] p').first(), box = await para.boundingBox()
    // Electron sendInputEvent deltaY is a scroll offset: positive = DOM deltaY < 0 = wheel up = wider.
    const wheel = (deltaY, ctrl = true) => app.evaluate(({ BrowserWindow }, [x, y, deltaY, ctrl]) => {
      BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY, wheelTicksY: deltaY > 0 ? 1 : -1, modifiers: ctrl ? ['control'] : [] })
    }, [Math.round(box.x + 60), Math.round(box.y + 10), deltaY, ctrl])
    // Wait until an animation has started (the wheel IPC is async) and then finished.
    const settled = async () => {
      await page.waitForFunction(() => document.querySelector('.chapter-reader')?.dataset.readerZooming === 'true', null, { timeout: 2000 }).catch(() => {})
      await page.waitForFunction(() => !document.querySelector('.chapter-reader')?.dataset.readerZooming)
    }
    const width = () => page.locator('.chapter-reader-page').evaluate(el => Math.round(el.getBoundingClientRect().width))
    const zoom = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())
    const font = async () => (await style('[data-block] p', ['font-size']))['font-size']
    const before = { width: await width(), zoom: await zoom(), font: await font() }
    assert.equal(before.width, 900)
    // A ResizeObserver records every width the page actually takes while it eases (frame-rate independent).
    await page.evaluate(`(() => { window.__w = []; new ResizeObserver(es => { for (const e of es) window.__w.push(Math.round(e.contentRect.width)) }).observe(document.querySelector('.chapter-reader-page')) })()`)
    await page.evaluate(() => { window.__d = []; addEventListener('wheel', e => { if (e.ctrlKey) window.__d.push([e.deltaY, e.deltaMode]) }, { capture: true }) })
    await wheel(120); await settled()
    const wider = { width: await width(), zoom: await zoom(), font: await font(), deltas: await page.evaluate(() => window.__d) }
    const frames = await page.evaluate(() => window.__w)
    // ResizeObserver reports the content box; compare its steps, not absolute values.
    const intermediate = new Set(frames).size - 1
    assert.ok(wider.width > before.width && intermediate >= 3, JSON.stringify({ before, wider, frames }))
    for (let i = 0; i < 14; i++) await wheel(120)
    await settled()
    const room = await page.locator('.chapter-reader').evaluate(el => el.clientWidth)
    const filled = { width: await width(), room, fill: await page.locator('.chapter-reader').getAttribute('data-reader-fill'), shadow: (await style('.chapter-reader-page', ['box-shadow']))['box-shadow'], zoom: await zoom(), font: await font() }
    assert.deepEqual([filled.width, filled.fill, filled.shadow], [room, 'true', 'none'], JSON.stringify(filled))
    await shot('crr-08a-ctrl-wheel-fill')
    for (let i = 0; i < 4; i++) await wheel(-120)
    await settled()
    const narrower = { width: await width(), zoom: await zoom(), font: await font() }
    assert.ok(narrower.width < room, JSON.stringify(narrower))
    await shot('crr-08b-ctrl-wheel-narrower')
    for (const v of [wider, filled, narrower]) { assert.equal(v.zoom, before.zoom); assert.equal(v.font, before.font) }
    // Later steps use the narrow layout, which always fills; the saved width does not affect them.
    check('CR611-R08', { before, wider, intermediateFrames: intermediate, filled, narrower })
  }
  // CR611-R09 (2026-11-28 user): 阅读设置 › 正文字体 and 页面缩放 slider (default 100%)
  {
    await openSettings()
    const slider = popup().getByRole('slider', { name: '页面缩放', exact: true })
    const box = popup().getByRole('textbox', { name: '页面缩放百分比', exact: true })
    const pct = async () => { const v = await box.inputValue(); return v === '铺满' ? v : v + '%' }
    const width = () => page.locator('.chapter-reader-page').evaluate(el => Math.round(el.getBoundingClientRect().width))
    const room = await page.locator('.chapter-reader').evaluate(el => el.clientWidth)
    // Start from 100%: the wheel check above left a different width.
    // Start from 100% (the wheel check above left a different width): type it.
    await box.click(); await box.fill('100'); await box.press('Enter')
    const sb0 = await slider.boundingBox(), thumb = await slider.evaluate(el => { const r = el.getBoundingClientRect(); return r.left + r.width * Number(el.value) / Number(el.max) })
    const start = { value: await slider.inputValue(), text: await pct(), width: await width(), thumbAtMiddle: Math.abs(thumb - (sb0.x + sb0.width / 2)) <= 1 }
    assert.deepEqual(start, { value: '500', text: '100%', width: 900, thumbAtMiddle: true })
    // Real keyboard on the slider: 10 × ArrowLeft = 90%
    await slider.focus(); for (let i = 0; i < 10; i++) await key('Left')
    const ninety = { text: await pct(), width: await width() }
    assert.deepEqual(ninety, { text: '90%', width: 810 })
    // Real mouse drag of the thumb to the right end = 铺满
    const sb = await slider.boundingBox()
    const trace = []
    await page.evaluate(() => { window.__in = []; document.querySelector('.chapter-reader-zoom input').addEventListener('input', e => window.__in.push(e.target.value)) })
    // Press on the thumb (90% = track position 375 of 1000), then drag past the right end.
    const max = Number(await slider.getAttribute('max')), at = 375 / max
    await page.mouse.move(sb.x + 8 + (sb.width - 16) * at, sb.y + sb.height / 2); await page.mouse.down()
    for (let i = 1; i <= 8; i++) { await page.mouse.move(sb.x + 8 + (sb.width - 16) * (at + (1.1 - at) * i / 8), sb.y + sb.height / 2); trace.push(await pct()) }
    await page.mouse.up()
    const full = { text: await pct(), width: await width(), room, max, trace, inputs: await page.evaluate(() => window.__in), box: sb }
    assert.deepEqual([full.text, full.width], ['铺满', room], JSON.stringify(full))
    await shot('crr-09a-zoom-full')
    // CR611-R11: type a percentage with the real keyboard
    await box.click(); await box.fill('85'); await box.press('Enter')
    const typed = { text: await pct(), width: await width() }
    await box.click(); await box.fill('100'); await box.press('Enter')
    assert.deepEqual(typed, { text: '85%', width: 765 })
    check('CR611-R11', { typed, back: { text: await pct(), width: await width() } })
    // Fonts
    const fontOf = () => page.locator('[data-block] p').first().evaluate(el => getComputedStyle(el).fontFamily)
    const fonts = {}, select = popup().getByRole('combobox', { name: '正文字体', exact: true })
    assert.equal(await select.evaluate(el => el.tagName), 'SELECT')
    // Only fonts installed on this machine are selectable; uninstalled ones are disabled 「（未安装）」.
    for (const [name, value] of [['楷体', 'kai'], ['黑体', 'hei'], ['仿宋', 'fangsong'], ['宋体', 'song'], ['苹方', 'pingfang'], ['兰亭黑', 'lantinghei'], ['手札体', 'hannotate'], ['跟随设置', 'inherit']]) {
      if (value !== 'inherit' && await select.locator(`option[value="${value}"]`).isDisabled()) { fonts[name] = 'not installed'; continue }
      await select.selectOption(value); fonts[name] = (await fontOf()).split(',')[0]
    }
    fonts.disabledSample = await select.evaluate(el => [...el.querySelectorAll('option:disabled')].map(o => o.textContent).slice(0, 8))
    // The real installed-font list from this machine (Local Font Access granted to the app page).
    const list = await select.evaluate(el => ({
      groups: [...el.querySelectorAll('optgroup')].map(g => g.label),
      builtIn: [...el.querySelectorAll('optgroup:not([label="本机字体"]) option')].length,
      missing: [...el.querySelectorAll('option')].filter(o => o.textContent.includes('未安装')).length,
      local: el.querySelector('optgroup[label="本机字体"]')?.children.length ?? 0,
    }))
    assert.ok(list.builtIn >= 28 && list.local > 0, JSON.stringify(list))
    fonts.list = list
    await select.selectOption('kai'); await shot('crr-09b-font-kai')
    assert.match(fonts['楷体'], /Kaiti SC/); assert.match(fonts['黑体'], /PingFang SC/); assert.match(fonts['仿宋'], /STFangsong/); assert.match(fonts['宋体'], /Noto Serif SC/)
    assert.match(fonts['苹方'], /PingFang SC/); assert.match(fonts['兰亭黑'], /Lantinghei SC/); assert.match(fonts['手札体'], /Hannotate SC/)
    await select.selectOption('inherit')
    // The popover covers the top right; click the body at its left edge to close it.
    const pb = await page.locator('[data-block] p').nth(2).boundingBox()
    await page.mouse.click(pb.x + 30, pb.y + 10); await popup().waitFor({ state: 'hidden' })
    delete full.box
    check('CR611-R09', { start, ninety, full, fonts })
  }
  await page.getByRole('button', { name: '退出全屏', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.chapter-reader')?.clientWidth < 820)
  // CR611-R12 (2026-11-28 user: the three 宣纸 swatches looked identical)
  {
    await openSettings()
    const colours = () => popup().locator('.chapter-reader-swatch').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor))
    const paper = await colours()
    assert.deepEqual(paper, ['rgb(251, 246, 233)', 'rgb(227, 238, 219)', 'rgb(255, 255, 255)'])
    const sw = await popup().locator('.chapter-reader-swatches').boundingBox()
    await page.screenshot({ path: join(shots, 'crr-12-paper-swatches.png'), clip: { x: sw.x - 12, y: sw.y - 30, width: sw.width + 24, height: sw.height + 42 } })
    report.screenshots.push({ name: 'crr-12-paper-swatches.png', sha256: hash(await readFile(join(shots, 'crr-12-paper-swatches.png'))) })
    const pb = await page.locator('[data-block] p').nth(2).boundingBox()
    await page.mouse.click(pb.x + 30, pb.y + 10); await popup().waitFor({ state: 'hidden' })
    check('CR611-R12', { paper })
  }
  // CR611-R10 (2026-11-28 user: 页面缩放 could not be adjusted): with a second chapter tab open, the
  // first tab's reader stays mounted but hidden; the slider must still drive the visible page.
  {
    await page.getByText('第二章 夜雨', { exact: true }).first().click()
    await page.waitForFunction(() => [...document.querySelectorAll('.chapter-reader')].filter(el => el.clientWidth > 0).length === 1 && document.querySelectorAll('.chapter-reader').length >= 2)
    await page.getByRole('button', { name: '进入全屏', exact: true }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('.chapter-reader')].some(el => el.clientWidth >= 820))
    await openSettings()
    const slider = popup().getByRole('slider', { name: '页面缩放', exact: true })
    const visibleWidth = () => page.evaluate(() => Math.round([...document.querySelectorAll('.chapter-reader')].find(el => el.clientWidth > 0).querySelector('.chapter-reader-page').getBoundingClientRect().width))
    const readers = await page.evaluate(() => document.querySelectorAll('.chapter-reader').length)
    const enabled = !(await slider.isDisabled())
    const box2 = popup().getByRole('textbox', { name: '页面缩放百分比', exact: true })
    await box2.click(); await box2.fill('100'); await box2.press('Enter')
    await slider.focus(); for (let i = 0; i < 20; i++) await key('Left')
    const v = await box2.inputValue()
    const result = { readers, enabled, text: v === '铺满' ? v : v + '%', width: await visibleWidth() }
    assert.deepEqual([result.enabled, result.text, result.width], [true, '80%', 720], JSON.stringify(result))
    await shot('crr-10-second-tab-zoom')
    const pb = await page.locator('.chapter-reader:visible [data-block] p').nth(2).boundingBox()
    await page.mouse.click(pb.x + 30, pb.y + 10); await popup().waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: '退出全屏', exact: true }).click()
    await page.getByRole('tab', { name: /第一章 灯下来客/ }).first().click()
    await page.waitForFunction(() => document.querySelector('.chapter-reader:not([hidden])') && [...document.querySelectorAll('.chapter-reader')].some(el => el.clientWidth > 0))
    check('CR611-R10', result)
  }
  // CRR-03 settings
  await openSettings(); await shot('crr-03a-settings-open')
  await popup().getByRole('button', { name: '左对齐', exact: true }).click()
  await popup().getByRole('switch', { name: '显示字数', exact: true }).click()
  await popup().getByRole('button', { name: '20', exact: true }).click()
  // CRR-04 outside click + real Esc
  await page.locator('[data-block] p').first().click(); await popup().waitFor({ state: 'hidden' })
  await openSettings(); await key('Escape'); await popup().waitFor({ state: 'hidden', timeout: 5000 })
  check('CR611-R04', { outsideClickCloses: true, escapeClosesViaSendInputEvent: true })
  // CRR-02 ink through the real settings page
  await page.getByRole('button', { name: /^账号菜单：/ }).click(); await page.getByRole('menuitem', { name: /设置/ }).first().click()
  await page.getByRole('button', { name: /外观/ }).first().click().catch(() => {})
  await page.getByRole('button', { name: /玄墨/ }).first().click()
  await page.waitForFunction(() => document.documentElement.classList.contains('ink'))
  await page.keyboard.press('Escape'); await page.getByRole('dialog').first().waitFor({ state: 'hidden' }).catch(() => {})
  await openSettings(); await popup().getByRole('button', { name: '夜蓝', exact: true }).click(); await page.locator('[data-block] p').first().click()
  const ink = await style('.chapter-reader-page', ['background-color', 'color'])
  assert.equal(ink['background-color'], 'rgb(22, 27, 37)')
  await shot('crr-02-ink-blue')
  await page.getByRole('button', { name: '进入全屏', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.chapter-reader')?.clientWidth >= 820); await page.waitForTimeout(400)
  await shot('crr-02b-ink-blue-wide')
  await page.getByRole('button', { name: '退出全屏', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.chapter-reader')?.clientWidth < 820)
  check('CR611-R02', { ink })
  const applied = { align: (await style('[role="group"][aria-label="章节信息"]', ['text-align']))['text-align'], fontSize: (await style('[data-block] p', ['font-size']))['font-size'], words: await page.getByRole('group', { name: '章节信息', exact: true }).getByText(/字$/).count() }
  assert.deepEqual(applied, { align: 'left', fontSize: '20px', words: 0 }); await shot('crr-03-settings'); check('CR611-R03', { applied })
  // CRR-06a narrow, CRR-06b split
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 940)); await page.waitForTimeout(500)
  const narrow = await style('.chapter-reader-page', ['box-shadow', 'padding-left']); await shot('crr-06a-narrow-window')
  await page.getByRole('button', { name: '分屏', exact: true }).click(); await page.locator('.monaco-editor').first().waitFor()
  const split = await style('.chapter-reader-page', ['box-shadow']); await shot('crr-06b-split')
  assert.equal(split['box-shadow'], 'none'); check('CR611-R06', { narrow, split })
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 940))
  // CRR-05 restart keeps settings
  await quit(); await launch(); await openChapter()
  const restarted = { align: (await style('[role="group"][aria-label="章节信息"]', ['text-align']))['text-align'], fontSize: (await style('[data-block] p', ['font-size']))['font-size'], bg: (await style('.chapter-reader-page', ['background-color']))['background-color'] }
  assert.deepEqual(restarted, { align: 'left', fontSize: '20px', bg: 'rgb(22, 27, 37)' }); await shot('crr-05-restart'); check('CR611-R05', { restarted })
  // CRR-07 body untouched
  const end = await chapterRead()
  assert.equal(end.version, start.version); assert.equal(hash(end.content), hash(start.content))
  if (before) assert.equal(before.version, start.version)
  check('CR611-R07', { version: end.version, contentSha256: hash(end.content) })
  assert.deepEqual(report.errors, [])
  await quit(); report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.failure = String(error?.stack ?? error).slice(0, 2000)
  if (page) await shot('failure').catch(() => {})
  if (app) await app.close().catch(() => {})
} finally {
  report.screenshotDirectory = shots.replace(homedir(), '~')
  report.limitations.push('Mouse/keyboard are Playwright/sendInputEvent synthetic input, not physical OS input.', 'Clicks on the window drag region or native menus do not close the popover (no pointer event reaches the page); not automated.', 'Reader settings after a data-root relocation were not verified.')
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log('report', report.status, reportPath)
  if (report.status !== 'passed') process.exitCode = 1
}
