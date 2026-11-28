// docs/612 §9 real-target check: built app in Electron on a seeded synthetic root, offline renderer.
// The text model is a scripted OpenAI-compatible endpoint served by THIS SCRIPT on 127.0.0.1 (a test fixture outside
// the app). The app itself must not listen on any port (SAR-07). Real provider models are NOT verified here; the
// user verifies them (2026-11-29). Screenshots stay outside the repo; the repo report records results and hashes only.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawnSync, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { _electron } from 'playwright-core'

const shots = join(homedir(), 'shakeink-test-roots', 'selection-ai-612-evidence', new Date().toISOString().replace(/[:.]/g, '-'))
const reportPath = resolve('docs/612-selection-ai-toolbar-evidence/real-target-report.json')
await mkdir(shots, { recursive: true }); await mkdir(resolve('docs/612-selection-ai-toolbar-evidence'), { recursive: true })
const base = await mkdtemp(join(tmpdir(), 'shakeink-selection-ai-'))
const seeded = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/seed-selection-ai.ts'), base], { encoding: 'utf8' })
assert.equal(seeded.status, 0, seeded.stderr)
const fixture = JSON.parse(await readFile(join(base, 'fixture.json'), 'utf8'))
const hash = value => createHash('sha256').update(value).digest('hex')
const report = { status: 'running', checks: [], errors: [], screenshots: [], isolation: { syntheticWorks: 1, model: 'scripted local endpoint (not a real provider)', offlineRenderer: true, userDataAccessed: false }, limitations: ['真实供应商模型未在此脚本中验证，由用户验收'] }

/* ---- scripted model endpoint ---- */
const requests = []
let replies = []
const server = createServer((req, res) => {
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    if (req.url.endsWith('/models')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'scripted-text' }] })); return }
    const parsed = JSON.parse(body || '{}'); requests.push({ promptChars: JSON.stringify(parsed.messages ?? []).length, stream: !!parsed.stream })
    const text = replies.shift() ?? '测试回复。'
    if (!parsed.stream) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 1, model: 'scripted-text', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })); return }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const chunk = (delta, finish = null, usage) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 1, model: 'scripted-text', choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`
    const parts = [...Array.from(text).map(c => chunk({ content: c })), chunk({}, 'stop', { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 })]
    let i = 0
    const timer = setInterval(() => { if (i < parts.length) res.write(parts[i++]); else { clearInterval(timer); res.end('data: [DONE]\n\n') } }, 20)
    req.on('close', () => clearInterval(timer))
  })
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const endpoint = `http://127.0.0.1:${server.address().port}/v1`

const env = { ...process.env, SHAKEINK_TEST_ROOT: fixture.root }; delete env.ELECTRON_RUN_AS_NODE
let app, page
const check = (id, detail = {}) => { report.checks.push({ id, result: 'pass', ...detail }); console.log('pass', id) }
async function launch() {
  app = await _electron.launch({ args: [resolve('.')], env, timeout: 90000 })
  page = await app.firstWindow({ timeout: 90000 }); page.setDefaultTimeout(30000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.context().setOffline(true) // renderer offline; model calls go through the main process gateway
  const later = page.getByRole('button', { name: '暂不配置', exact: true })
  await Promise.race([later.waitFor({ timeout: 90000 }).catch(() => {}), page.getByRole('button', { name: /^账号菜单：/ }).waitFor({ timeout: 90000 })])
  if (await later.isVisible().catch(() => false)) { await later.click(); await later.waitFor({ state: 'hidden' }) }
  await page.getByRole('button', { name: /^账号菜单：/ }).waitFor({ timeout: 30000 })
  const bootstrap = await page.evaluate(() => window.desktop.bootstrap())
  assert.equal(bootstrap.dataRoot, fixture.root)
  report.runtime ??= await app.evaluate(() => ({ platform: process.platform, arch: process.arch, electron: process.versions.electron }))
  return bootstrap
}
async function quit() { const closed = app.waitForEvent('close', { timeout: 45000 }); await page.evaluate(() => { void window.desktop.command('app.quit') }); await closed; app = undefined }
async function shot(name) { const path = join(shots, name + '.png'); await page.screenshot({ path }); report.screenshots.push({ name: name + '.png', sha256: hash(await readFile(path)) }) }
const chapterRead = () => page.evaluate(async ({ novelId, chapterId }) => (await (await fetch(`/api/novels/${novelId}/chapters/${chapterId}`)).json()).chapter, { novelId: fixture.work.novelId, chapterId: fixture.work.chapterId })
const versionsRead = () => page.evaluate(async ({ novelId, chapterId }) => (await (await fetch(`/api/novels/${novelId}/chapters/${chapterId}/versions`)).json()).versions, { novelId: fixture.work.novelId, chapterId: fixture.work.chapterId })
/* real keyboard through the window (memory text-shortcut-598) */
const key = (keyCode, modifiers = []) => app.evaluate(({ BrowserWindow }, [keyCode, modifiers]) => { const w = BrowserWindow.getAllWindows()[0].webContents; w.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); w.sendInputEvent({ type: 'keyUp', keyCode, modifiers }) }, [keyCode, modifiers])
const typeText = text => app.evaluate(({ BrowserWindow }, text) => { const w = BrowserWindow.getAllWindows()[0].webContents; return w.insertText(text) }, text)
async function openChapter() {
  const row = text => page.getByText(text, { exact: true }).first()
  if (!(await row(fixture.work.chapterTitle).isVisible().catch(() => false))) {
    await row(fixture.work.title).click()
    if (!(await row(fixture.work.volumeTitle).isVisible().catch(() => false))) await row('正文').click().catch(() => {})
    if (!(await row(fixture.work.chapterTitle).isVisible().catch(() => false))) await row(fixture.work.volumeTitle).click()
  }
  await row(fixture.work.chapterTitle).click()
  await page.locator('.markdown-body [data-block]').first().waitFor()
}
async function dragPreview(index, from, to) {
  const pts = await page.locator('.markdown-body [data-block]').nth(index).evaluate((block, [a, z]) => {
    const at = k => { const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode())) { if (k < t.length) return [t, k]; k -= t.length } return null }
    block.scrollIntoView({ block: 'center' })
    const r = document.createRange(), [t1, o1] = at(a), [t2, o2] = at(z - 1)
    r.setStart(t1, o1); r.setEnd(t1, o1 + 1); const s = r.getBoundingClientRect(); r.setStart(t2, o2); r.setEnd(t2, o2 + 1); const e = r.getBoundingClientRect()
    return { sx: s.left + 1, sy: s.top + s.height / 2, ex: e.right - 1, ey: e.top + e.height / 2 }
  }, [from, to])
  await page.mouse.move(pts.sx, pts.sy); await page.mouse.down(); await page.mouse.move(pts.ex, pts.ey, { steps: 8 }); await page.mouse.up()
  return page.evaluate(() => getSelection().toString())
}
const toolbar = () => page.getByRole('toolbar', { name: 'AI 助手' })
const panel = () => page.locator('.selection-ai-panel')

try {
  await launch()
  // SAR-08 no-model state first: toolbar shows, functions disabled
  await openChapter()
  await dragPreview(1, 4, 30); await toolbar().waitFor()
  assert.equal(await toolbar().getByRole('button', { name: '润色', exact: true }).isDisabled(), true)
  await shot('sar-08-no-model'); check('SA612-R08', { note: '无模型时功能按钮禁用' })
  await page.mouse.click(5, 300)

  // add the scripted model through the real settings dialog
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('desktop:settings', { detail: 'models' })))
  await page.getByRole('button', { name: '添加模型', exact: true }).click()
  await page.locator('button.desktop-choice-trigger[aria-label="供应商"]').click()
  await page.getByLabel('搜索供应商').fill('自定义')
  await page.getByRole('option', { name: /自定义供应商/ }).first().click()
  await page.getByLabel('供应商名称').fill('本地脚本')
  await page.getByLabel('协议').selectOption('openai')
  await page.getByLabel('展示名称').fill('脚本模型')
  await page.getByLabel('Base URL').fill(endpoint)
  await page.getByLabel('模型 ID').fill('scripted-text')
  await page.getByLabel('API Key').fill('scripted-key-not-secret')
  await page.getByRole('button', { name: '保存模型', exact: true }).click()
  await page.getByRole('button', { name: '保存模型', exact: true }).waitFor({ state: 'hidden', timeout: 30000 })
  await page.keyboard.press('Escape').catch(() => {})
  await page.getByRole('button', { name: /关闭设置|关闭/ }).first().click().catch(() => {})
  const bootstrap = await page.evaluate(() => window.desktop.bootstrap())
  assert.ok(bootstrap.models.some(m => m.name === '脚本模型')); check('SA612-R00', { note: '经设置对话框添加本地脚本模型' })

  await openChapter()
  const start = await chapterRead(); report.chapter = { id: start.id, version: start.version, contentSha256: hash(start.content) }

  // SAR-02: polish from the toolbar, replace, history entries
  replies = ['雨幕里的书铺亮着一盏旧灯，柜台后坐着陌生的老人。']
  const quote = await dragPreview(1, 4, 30); await toolbar().waitFor()
  await shot('sar-02a-toolbar')
  await toolbar().getByRole('button', { name: '润色', exact: true }).click()
  await panel().waitFor(); await panel().getByRole('button', { name: '替换' }).waitFor({ timeout: 30000 })
  await shot('sar-02b-done')
  const beforeText = (await chapterRead()).content
  await panel().getByRole('button', { name: '替换' }).click(); await page.locator('.selection-ai-undo').waitFor()
  const after = await chapterRead()
  assert.ok(after.content.includes('雨幕里的书铺亮着一盏旧灯')); assert.equal(after.content.includes(quote), false)
  let versions = await versionsRead()
  const reasons = versions.slice(0, 2).map(v => v.reason)
  assert.deepEqual(reasons, ['AI 润色', 'AI 润色前'])
  await shot('sar-02c-replaced')
  check('SA612-R02', { reasons, beforeSha256: hash(beforeText), afterSha256: hash(after.content), version: after.version, promptChars: requests.at(-1)?.promptChars })

  // SAR-04: Escape layers in the real app (request box → toolbar → closed)
  await page.locator('.selection-ai-undo').getByRole('button', { name: '关闭' }).click()
  await dragPreview(3, 2, 14); await toolbar().waitFor()
  await toolbar().getByRole('button', { name: '输入修改要求' }).click(); await page.locator('.selection-ai-request').waitFor()
  await typeText('语气更冷')
  await key('Down', ['meta']); await key('Down', ['meta'])
  const picked = await page.locator('.selection-ai-request [aria-pressed="true"]').getAttribute('data-fn')
  assert.equal(picked, 'shrink')
  await shot('sar-04a-request')
  await key('Escape'); await page.locator('.selection-ai-request').waitFor({ state: 'hidden' }); await toolbar().waitFor()
  await key('Escape'); await toolbar().waitFor({ state: 'hidden' })
  check('SA612-R04', { pickedWithCmdDown: picked, escapeLayers: ['request', 'toolbar'] })

  // SAR-03: continue via the request box (preview selection), replace, then Cmd+Z in the edit view → server undo
  replies = ['她收起伞，铜铃又响了一声。']
  await dragPreview(2, 0, 10); await toolbar().waitFor()
  await toolbar().getByRole('button', { name: '输入修改要求' }).click(); await page.locator('.selection-ai-request').waitFor()
  await typeText('接着写'); await key('Down', ['meta']); await key('Down', ['meta']); await key('Down', ['meta'])
  assert.equal(await page.locator('.selection-ai-request [aria-pressed="true"]').getAttribute('data-fn'), 'continue')
  await key('Return')
  await panel().getByRole('button', { name: '替换' }).waitFor({ timeout: 30000 })
  await panel().getByRole('button', { name: '替换' }).click(); await page.locator('.selection-ai-undo').waitFor()
  const continued = await chapterRead()
  assert.ok(continued.content.includes('她收起伞，铜铃又响了一声。'))
  await page.getByRole('button', { name: '编辑', exact: true }).click(); await page.locator('.monaco-editor .view-lines').first().waitFor()
  await page.locator('.monaco-editor .view-lines').first().click()
  await key('Z', ['meta'])
  await page.waitForFunction(async ({ novelId, chapterId }) => { const c = (await (await fetch(`/api/novels/${novelId}/chapters/${chapterId}`)).json()).chapter; return !c.content.includes('她收起伞，铜铃又响了一声。') }, { novelId: fixture.work.novelId, chapterId: fixture.work.chapterId }, { timeout: 15000 })
  versions = await versionsRead()
  assert.equal(versions[0].reason, '撤销 AI 续写')
  await shot('sar-03-undone')
  check('SA612-R03', { reasons: versions.slice(0, 3).map(v => v.reason) })

  // SAR-05: comment from the toolbar persists
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await dragPreview(4, 2, 10); await toolbar().waitFor()
  await toolbar().getByRole('button', { name: '添加评论' }).click()
  await page.locator('[data-comment-composer] textarea').fill('专项验证评论')
  await page.getByRole('button', { name: '发表评论' }).click()
  await page.locator('mark.text-comment-anchor').first().waitFor()
  check('SA612-R05a', { note: '评论已发表' })

  // SAR-07: the app's own processes listen on no TCP port
  const pids = await app.evaluate(({ app }) => app.getAppMetrics().map(m => m.pid))
  const listening = []
  for (const pid of pids) { try { const out = execFileSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', String(pid)], { encoding: 'utf8' }); if (out.trim()) listening.push(pid) } catch { /* lsof exits 1 when nothing matches */ } }
  assert.deepEqual(listening, []); check('SA612-R07', { processes: pids.length, listening: 0 })

  // SAR-06: restart keeps history and the comment
  const finalVersion = (await chapterRead()).version
  await quit(); await launch(); await openChapter()
  const reread = await chapterRead(); versions = await versionsRead()
  assert.equal(reread.version, finalVersion)
  for (const r of ['撤销 AI 续写', 'AI 续写', 'AI 续写前', 'AI 润色', 'AI 润色前']) assert.ok(versions.some(v => v.reason === r), r)
  await page.locator('mark.text-comment-anchor').first().waitFor()
  await page.getByRole('button', { name: '正文功能菜单' }).click(); await page.getByRole('menuitem', { name: '版本历史' }).click()
  await page.getByRole('list', { name: '正文版本列表' }).locator('.history-reason.ai').first().waitFor()
  await shot('sar-06-history-after-restart')
  check('SA612-R06', { version: reread.version, reasons: versions.slice(0, 6).map(v => v.reason) })
  report.status = report.errors.length ? 'failed' : 'passed'
} catch (error) {
  report.status = 'failed'; report.failure = String(error?.message ?? error).slice(0, 600)
  if (page) await shot('failure').catch(() => {})
  console.error(error)
} finally {
  if (app) await quit().catch(() => app?.close().catch(() => {}))
  server.close()
  report.modelRequests = requests.length
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log('report', report.status, reportPath, 'screenshots', shots)
  process.exitCode = report.status === 'passed' ? 0 : 1
}
