import { _electron } from 'playwright-core'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { defaultState } from '../desktop/core/settings.ts'
import { Workspaces } from '../desktop/service/workspaces.ts'
import { getDatabaseContext } from '../desktop/service/context.ts'
import { configureConversationTransfers, conversationTransfersFor } from '../desktop/service/conversation-runtime.ts'
import { directoryIdentity } from '../desktop/core/root-ownership.ts'

// WN real-target acceptance (macOS, built app, isolated root). Synthetic works
// only; no model, no key, no network. Evidence: docs/faulted-work-node/evidence/.
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'shakeink-faulted-work-')))
const root = join(temporary, 'data')
const evidence = resolve('docs/faulted-work-node/evidence')
await mkdir(evidence, { recursive: true })
const report = { scope: `macOS ${process.arch} built Electron (npm run build), isolated SHAKEINK_TEST_ROOT`, startedAt: new Date().toISOString(), checks: [], errors: [] }
const check = (name, ok, detail = '') => { report.checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) }
const step = name => console.log(`[step ${new Date().toISOString()}] ${name}`)
const scrub = text => String(text).replaceAll(temporary, '<isolated>')
async function digest(path) {
  const out = {}
  const walk = async dir => { for (const entry of await readdir(dir, { withFileTypes: true })) { const full = join(dir, entry.name); if (entry.isDirectory()) await walk(full); else out[relative(path, full)] = createHash('sha256').update(await readFile(full)).digest('hex') } }
  await walk(path); return out
}
const exists = path => stat(path).then(() => true, () => false)
const environment = { ...process.env, SHAKEINK_TEST_ROOT: root }
delete environment.ELECTRON_RUN_AS_NODE

async function launch() {
  const app = await _electron.launch({ args: [resolve('.')], env: environment, timeout: 60000 })
  const page = await app.firstWindow({ timeout: 60000 })
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.errors.push(scrub(error.message)))
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setBounds({ x: 120, y: 60, width: 1280, height: 820 }); win.focus() })
  await page.waitForFunction(() => typeof window.desktop?.bootstrap === 'function', null, { timeout: 45000 })
  await page.getByText('创建作品', { exact: true }).first().waitFor({ timeout: 45000 })
  await new Promise(r => setTimeout(r, 2000))
  const skip = page.getByRole('button', { name: '暂不配置', exact: true })
  if (await skip.count()) await skip.click()
  // Native text menus must never open for navigation rows.
  await app.evaluate(({ Menu }) => { globalThis.nativeMenus = 0; const popup = Menu.prototype.popup; Menu.prototype.popup = function (options) { globalThis.nativeMenus++; return popup.call(this, options) } })
  return { app, page }
}
const setTheme = (page, theme) => page.evaluate(theme => { document.documentElement.classList.remove('paper', 'ink'); document.documentElement.classList.add(theme) }, theme)
const sidebarShot = async (page, name) => { await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running')); await page.locator('.sidebar-navigation').screenshot({ path: join(evidence, name) }); return name }

let works, dispose = () => {}
const before = {}
try {
  step('seed isolated root with synthetic works')
  const state = structuredClone(defaultState)
  state.onboarding = { version: 1, completed: true, step: 'welcome', textModelId: null, imageModelId: null, receipt: null }
  await mkdir(root, { recursive: true })
  works = new Workspaces(root, resolve('prisma/migrations'))
  await works.initialize()
  dispose = configureConversationTransfers(works, async () => { throw Error('no main') })
  const make = async title => { const path = join(temporary, `w-${randomUUID().slice(0, 6)}`); await mkdir(path); return works.create(await directoryIdentity(path), { title, requestId: randomUUID() }) }
  const healthy = await make('雨灯纪事'), missing = await make('诡秘之主'), stale = await make('风渡行记'), damaged = await make('青石城旧事')
  await works.runWithGlobal(missing.id, async () => { await getDatabaseContext().database.conversation.create({ data: { id: 'wn-real-chat', userId: 'local-author', novelId: missing.novelId, title: '讨论诡秘之主的开篇' } }); await conversationTransfersFor(works).current('wn-real-chat') })
  dispose(); await works.close(); works = undefined
  await writeFile(join(root, 'state.json'), JSON.stringify({ schemaVersion: 1, revision: 0, value: state }))
  await rename(missing.path, missing.path + '-moved')
  await mkdir(join(stale.path, '.shakeink-lock')); await writeFile(join(stale.path, '.shakeink-lock', 'owner.json'), JSON.stringify({ token: randomUUID(), host: hostname(), pid: 2147483647 }))
  await rm(join(damaged.path, 'database', 'PG_VERSION'))
  for (const [key, path] of [['missing', missing.path + '-moved'], ['stale', stale.path], ['damaged', damaged.path]]) before[key] = await digest(path)

  step('launch built app (offline: no network routes are used by the app)')
  let { app, page } = await launch()
  const row = title => page.locator('.sidebar-navigation .tree-row', { hasText: title })
  const openMenu = () => page.locator('[role=menu][data-open]')
  const items = async () => (await openMenu().getByRole('menuitem').allInnerTexts()).map(t => t.trim())
  const settle = () => page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running')).then(() => new Promise(r => setTimeout(r, 150)))
  const closeMenu = async () => { await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('[role=menu]')); await settle() }

  await row('诡秘之主').waitFor({ timeout: 20000 })
  check('sidebar never shows native paths or raw errors', !/\/private\/|\/var\/folders|ENOENT|desktop:request/.test(await page.locator('.sidebar-navigation').innerText()))
  check('three faulted works are tree rows', (await Promise.all(['诡秘之主', '风渡行记', '青石城旧事'].map(t => row(t).count()))).every(n => n === 1))
  check('no legacy card container or global reload button', (await page.getByLabel('暂不可用的作品').count()) === 0 && (await page.locator('.sidebar-navigation').getByRole('button', { name: '重新加载作品', exact: true }).count()) === 0)
  const tones = await Promise.all(['诡秘之主', '风渡行记', '青石城旧事'].map(t => row(t).getAttribute('data-fault')))
  check('fault tones missing=error, stale=warning, damaged=error', JSON.stringify(tones) === JSON.stringify(['error', 'warning', 'error']), tones.join(','))
  for (const theme of ['ink', 'paper']) {
    await setTheme(page, theme); await new Promise(r => setTimeout(r, 300))
    const colors = await Promise.all(['诡秘之主', '风渡行记'].map(t => row(t).locator('.nav-label').evaluate(e => getComputedStyle(e).color)))
    const expected = theme === 'ink' ? ['rgb(224, 138, 128)', 'rgb(217, 180, 95)'] : ['rgb(163, 70, 60)', 'rgb(126, 98, 28)']
    check(`${theme} title colors`, JSON.stringify(colors) === JSON.stringify(expected), colors.join(' / '))
    await sidebarShot(page, `real-${theme}-works-view.png`)
  }
  await setTheme(page, 'ink')

  await row('诡秘之主').click(); await openMenu().waitFor()
  check('click opens missing menu', JSON.stringify(await items()) === JSON.stringify(['重新加载作品', '删除']), (await items()).join(','))
  await settle(); await page.screenshot({ path: join(evidence, 'real-ink-click-menu.png') }); await closeMenu()
  await row('风渡行记').click({ button: 'right' }); await openMenu().waitFor()
  check('right-click opens stale-lease menu', JSON.stringify(await items()) === JSON.stringify(['修复作品锁', '重新加载作品', '删除']), (await items()).join(','))
  await settle(); await page.screenshot({ path: join(evidence, 'real-ink-context-menu.png') }); await closeMenu()
  await row('雨灯纪事').click({ button: 'right' }); await openMenu().waitFor()
  check('healthy right-click menu unchanged', JSON.stringify(await items()) === JSON.stringify(['重命名', '删除']), (await items()).join(','))
  await settle(); await page.screenshot({ path: join(evidence, 'real-ink-healthy-context-menu.png') }); await closeMenu()
  check('no native menu for navigation rows', (await app.evaluate(() => globalThis.nativeMenus)) === 0)

  await page.getByRole('tab', { name: '设定', exact: true }).click()
  await page.locator('.nav-work-group', { hasText: '诡秘之主' }).waitFor()
  check('settings view shows faulted group with icon', (await page.locator('.nav-work-group', { hasText: '诡秘之主' }).locator('[data-fault-icon="error"]').count()) === 1)
  await sidebarShot(page, 'real-ink-settings-view.png')
  await page.getByRole('tab', { name: '作品', exact: true }).click()

  for (const [title, key] of [['诡秘之主', 'missing'], ['风渡行记', 'stale'], ['青石城旧事', 'damaged']]) {
    await row(title).click(); await openMenu().waitFor(); await openMenu().getByRole('menuitem', { name: '删除', exact: true }).click()
    const dialog = page.getByRole('dialog'); await dialog.waitFor()
    if (key === 'stale') { await settle(); await page.screenshot({ path: join(evidence, 'real-ink-delete-stale-dialog.png') }) }
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
    await dialog.waitFor({ state: 'detached', timeout: 20000 })
    await row(title).waitFor({ state: 'detached', timeout: 20000 })
    check(`deleted ${key} work from the list`, true)
  }
  await page.getByRole('tab', { name: '对话', exact: true }).click(); await new Promise(r => setTimeout(r, 800))
  const convText = await page.locator('.sidebar-navigation').innerText()
  check('conversation view loads and hides the removed work conversation', !convText.includes('讨论诡秘之主的开篇') && !/加载失败/.test(convText))
  await sidebarShot(page, 'real-ink-after-delete.png')
  await app.close()

  for (const [key, path] of [['missing', missing.path + '-moved'], ['stale', stale.path], ['damaged', damaged.path]]) check(`${key} directory bytes unchanged`, JSON.stringify(await digest(path)) === JSON.stringify(before[key]))
  check('stale lock folder still present', await exists(join(stale.path, '.shakeink-lock', 'owner.json')))

  step('restart')
  ;({ app, page } = await launch())
  await row('雨灯纪事').waitFor({ timeout: 20000 })
  check('restart succeeds with only the healthy work listed', (await page.locator('.sidebar-navigation .tree-row[data-fault]').count()) === 0)
  await app.close()
} catch (error) {
  report.errors.push(scrub(error?.stack ?? error))
  console.error(scrub(error?.stack ?? error))
} finally {
  dispose(); await works?.close().catch(() => {})
  report.finishedAt = new Date().toISOString()
  report.passed = report.errors.length === 0 && report.checks.every(c => c.ok)
  await writeFile(join(evidence, 'real-target-report.json'), JSON.stringify(report, null, 2) + '\n')
  await rm(temporary, { recursive: true, force: true })
  console.log(report.passed ? 'ALL PASS' : 'FAILED')
  process.exit(report.passed ? 0 : 1)
}
