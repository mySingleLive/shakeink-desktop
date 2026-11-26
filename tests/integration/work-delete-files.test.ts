import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { chmod, link, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, symlink, writeFile, cp } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { Workspaces, type WorkRecord } from '../../desktop/service/workspaces'
import { LocalDispatcher } from '../../desktop/service/dispatcher'
import { configureConversationTransfers, conversationTransfersFor } from '../../desktop/service/conversation-runtime'
import { getDatabaseContext } from '../../desktop/service/context'
import { directoryIdentity } from '../../desktop/core/root-ownership'
import { prisma } from '../../src/lib/db'

const MIGRATIONS = resolve('prisma/migrations')
const LOCK = '.shakeink-lock', MANIFEST = 'shakeink-work.json'

async function digest(path: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else out[relative(path, full)] = createHash('sha256').update(await readFile(full)).digest('hex')
    }
  }
  await walk(path); return out
}
const exists = (path: string) => stat(path).then(() => true, () => false)
const userFiles = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('database/') && !k.startsWith(LOCK)))

interface Harness { base: string; data: string; works: Workspaces; dispatcher: LocalDispatcher; dispose(): void }
async function harness(): Promise<Harness> {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'shakeink-delete-files-')))
  const data = join(base, 'data'), works = new Workspaces(data, MIGRATIONS)
  await works.initialize()
  const dispose = configureConversationTransfers(works, async () => { throw Error('fixture never calls main') })
  return { base, data, works, dispatcher: new LocalDispatcher(works), dispose }
}
async function finish(h: Harness) {
  h.dispose()
  for (let attempt = 0; ; attempt++) { try { await h.works.close(); break } catch { if (attempt > 20) break; await new Promise(r => setTimeout(r, 50)) } }
  await chmodTree(h.base)
  await rm(h.base, { recursive: true, force: true })
}
async function chmodTree(path: string) {
  await chmod(path, 0o755).catch(() => {})
  for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) if (entry.isDirectory() && !entry.isSymbolicLink()) await chmodTree(join(path, entry.name))
}
async function create(h: Harness, title: string, parent = h.base): Promise<WorkRecord> {
  const path = join(parent, `work-${randomUUID().slice(0, 8)}`); await mkdir(path)
  return h.works.create(await directoryIdentity(path), { title, requestId: randomUUID() })
}
async function call(h: Harness, path: string, method: 'GET' | 'DELETE' | 'POST' = 'GET', body?: unknown, raw?: string) {
  const bytes = raw !== undefined ? new TextEncoder().encode(raw) : body === undefined ? undefined : new TextEncoder().encode(JSON.stringify(body))
  const response = await h.dispatcher.handle({ version: 1, id: randomUUID(), path, method, headers: bytes ? { 'content-type': 'application/json' } : {}, ...(bytes ? { body: [...bytes] } : {}) }, new AbortController().signal)
  const text = await response.text()
  return { status: response.status, text, body: text ? JSON.parse(text) : null }
}
const removeWork = (h: Harness, id: string, body?: unknown, raw?: string) => call(h, `/api/works/${id}`, 'DELETE', body, raw)
const yes = (w: WorkRecord) => ({ deleteFiles: true, path: w.path })
const catalog = (h: Harness) => readFile(join(h.data, 'catalog.json'), 'utf8')
const listed = async (h: Harness) => (JSON.parse(await catalog(h)) as { value: WorkRecord[] }).value.map(r => r.id)
async function addConversation(h: Harness, work: WorkRecord, id: string) {
  await h.works.runWithGlobal(work.id, async () => {
    await getDatabaseContext().database.conversation.create({ data: { id, userId: 'local-author', novelId: work.novelId, title: id } })
    await conversationTransfersFor(h.works)!.current(id)
  })
}
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function assertNoPath(text: string, path: string) { for (const part of [path, ...path.split('/').filter(p => p.startsWith('work-') || p.startsWith('shakeink-'))]) assert.doesNotMatch(text, new RegExp(escape(part)), part) }
async function assertRefused(h: Harness, work: WorkRecord, result: { status: number; text: string; body: any }, conversation?: string) {
  assert.equal(result.status, 409, result.text); assert.equal(result.body.code, 'WORK_FILES_UNSAFE'); assertNoPath(result.text, work.path)
  assert.ok((await listed(h)).includes(work.id))
  if (conversation) assert.equal((await conversationTransfersFor(h.works)!.ledger.location(conversation))?.deleted, false)
}
async function authorFiles(path: string) { await writeFile(join(path, '大纲.md'), '# 作者笔记'); await mkdir(join(path, '素材', '图'), { recursive: true }); await writeFile(join(path, '素材', '图', 'a.txt'), 'x') }

test('WD-01/02: “否” removes the work from the list only; files stay and the work can be reopened', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    for (const body of [undefined, { deleteFiles: false }]) {
      const work = await create(h, '保留'); await authorFiles(work.path)
      await h.works.run(work.id, () => prisma.novel.count())
      const before = userFiles(await digest(work.path))
      const result = await removeWork(h, work.id, body)
      assert.equal(result.status, 200, result.text); assert.equal(result.body.files, 'kept-by-choice')
      assert.ok(!(await listed(h)).includes(work.id))
      assert.equal(await exists(join(work.path, LOCK)), false)
      assert.deepEqual(userFiles(await digest(work.path)), before)
      assert.equal((await h.works.open(await directoryIdentity(work.path))).id, work.id)
    }
  } finally { await finish(h) }
})

test('WD-03: “是” deletes the whole directory, the catalog row and linked conversations', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const work = await create(h, '删除'), other = await create(h, '其他')
    await authorFiles(work.path); await addConversation(h, work, 'wd03-chat')
    const outside = join(h.base, 'outside'); await mkdir(join(outside, 'sub'), { recursive: true }); await writeFile(join(outside, 'sub', 'keep.txt'), 'keep'); await writeFile(join(outside, 'file.txt'), 'file')
    await symlink(outside, join(work.path, 'to-dir')); await symlink(join(outside, 'file.txt'), join(work.path, 'to-file')); await link(join(outside, 'file.txt'), join(work.path, 'hard'))
    const outsideBefore = await digest(outside)
    const result = await removeWork(h, work.id, yes(work))
    assert.deepEqual(await digest(outside), outsideBefore)
    assertNoPath(result.text, work.path)
    assert.equal(result.status, 200, result.text); assert.equal(result.body.files, 'removed'); assert.equal(result.body.novelId, work.novelId)
    assert.equal(await exists(work.path), false)
    assert.deepEqual(await listed(h), [other.id])
    assert.equal((await conversationTransfersFor(h.works)!.ledger.location('wd03-chat'))?.deleted, true)
    const novels = await call(h, '/api/novels')
    assert.deepEqual(novels.body.novels.map((n: { id: string }) => n.id), [other.novelId])
    assert.equal(await h.works.run(other.id, () => prisma.novel.count()), 1)
  } finally { await finish(h) }
})

test('WD-04/05: invalid bodies are 400 and a mismatched path is 409; nothing changes', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const work = await create(h, '请求')
    const snapshot = await catalog(h), files = await digest(work.path)
    for (const raw of ['not-json', '[]', 'null', '{}', '{"deleteFiles":"yes"}', '{"deleteFiles":true}', '{"deleteFiles":false,"x":1}', `{"deleteFiles":false,"path":"/x"}`, `{"deleteFiles":true,"path":1}`]) {
      const result = await removeWork(h, work.id, undefined, raw)
      assert.equal(result.status, 400, raw); assert.equal(result.body.code, 'INVALID_REQUEST', raw)
    }
    const changed = await removeWork(h, work.id, { deleteFiles: true, path: work.path + '-other' })
    assert.equal(changed.status, 409); assert.equal(changed.body.code, 'WORK_PATH_CHANGED')
    assert.equal(await catalog(h), snapshot)
    assert.deepEqual(Object.keys(await digest(work.path)).sort(), Object.keys(files).sort())
  } finally { await finish(h) }
})

test('WD-06: a missing directory is only removed from the list', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const work = await create(h, '缺失'); await h.works.close(); await rename(work.path, work.path + '-moved')
    const before = await digest(work.path + '-moved')
    const result = await removeWork(h, work.id, yes(work))
    assert.equal(result.status, 200, result.text); assert.equal(result.body.files, 'missing')
    assert.ok(!(await listed(h)).includes(work.id))
    assert.deepEqual(await digest(work.path + '-moved'), before)
  } finally { await finish(h) }
})

test('WD-07/08/09/21: symlinks, replaced folders, mismatched manifests and app-root overlap are refused', { timeout: 240_000 }, async () => {
  const h = await harness()
  try {
    // WD-07 symlink to another folder holding a copy
    const linked = await create(h, '链接'); await h.works.close()
    await rename(linked.path, linked.path + '-real'); await symlink(linked.path + '-real', linked.path)
    // WD-08 replaced by a copy (different inode)
    const replaced = await create(h, '替换'); await h.works.close()
    await rename(replaced.path, replaced.path + '-old'); await cp(replaced.path + '-old', replaced.path, { recursive: true })
    // WD-09 manifest belongs to another work
    const mismatched = await create(h, '清单'); await h.works.close()
    const manifest = JSON.parse(await readFile(join(mismatched.path, MANIFEST), 'utf8')); await writeFile(join(mismatched.path, MANIFEST), JSON.stringify({ ...manifest, novelId: 'other-novel' }))
    const snapshot = await catalog(h)
    const guarded = [[linked, linked.path + '-real'], [replaced, replaced.path], [replaced, replaced.path + '-old'], [mismatched, mismatched.path]] as const
    const before = await Promise.all(guarded.map(([, path]) => digest(path)))
    for (const work of [linked, replaced, mismatched]) await assertRefused(h, work, await removeWork(h, work.id, yes(work)))
    assert.equal(await catalog(h), snapshot)
    assert.deepEqual(await Promise.all(guarded.map(([, path]) => digest(path))), before)
    // WD-09b: a mismatched id
    const otherId = await create(h, '编号'); await h.works.close()
    const m2 = JSON.parse(await readFile(join(otherId.path, MANIFEST), 'utf8')); await writeFile(join(otherId.path, MANIFEST), JSON.stringify({ ...m2, id: randomUUID() }))
    await assertRefused(h, otherId, await removeWork(h, otherId.id, yes(otherId)))
    await rm(otherId.path, { recursive: true }); assert.equal((await removeWork(h, otherId.id)).status, 200)
  } finally { await finish(h) }
})

test('WD-10/11/12: a directory holding another work, a manifest or a reservation is refused', { timeout: 240_000 }, async () => {
  const h = await harness()
  try {
    const outer = await create(h, '外层'), inner = await create(h, '内层', outer.path)
    const before = await digest(outer.path)
    const nested = await removeWork(h, outer.id, yes(outer))
    assert.equal(nested.status, 409, nested.text); assert.equal(nested.body.code, 'WORK_FILES_UNSAFE')
    assert.deepEqual(Object.keys(await digest(outer.path)).sort(), Object.keys(before).sort())
    assert.ok((await listed(h)).includes(outer.id))
    assert.equal((await removeWork(h, inner.id, yes(inner))).body.files, 'removed')
    // WD-11 unregistered manifest / app marker deeper inside
    for (const name of [MANIFEST, 'xuanxiang-work.json', 'shakeink-app.json']) {
      await mkdir(join(outer.path, 'deep', 'x'), { recursive: true }); await writeFile(join(outer.path, 'deep', 'x', name), '{}')
      const result = await removeWork(h, outer.id, yes(outer))
      assert.equal(result.status, 409, name); assert.equal(await exists(outer.path), true)
      await rm(join(outer.path, 'deep'), { recursive: true })
    }
    // WD-12 a pending creation reservation inside the folder
    await mkdir(join(outer.path, 'reserved'))
    const reserved = await directoryIdentity(join(outer.path, 'reserved'))
    await h.works.runWithGlobal('inbox', () => getDatabaseContext().database.systemConfig.create({ data: { key: `desktop:work-creation-reservation:${randomUUID()}`, value: { version: 1, phase: 'pending', requestId: randomUUID(), requestHash: 'a'.repeat(64), selection: { ...reserved } } as never } }))
    const withReservation = await removeWork(h, outer.id, yes(outer))
    assert.equal(withReservation.status, 409, withReservation.text)
    assert.ok((await listed(h)).includes(outer.id))
  } finally { await finish(h) }
})

test('WD-13/14/15: foreign or live locks are refused; a stale lock of an ended process is deleted', { timeout: 240_000 }, async () => {
  const h = await harness()
  const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'])
  try {
    const cases = [{ host: 'other-host', pid: 12345 }, { host: hostname(), pid: child.pid! }, { host: hostname(), pid: process.pid }]
    for (const owner of cases) {
      const work = await create(h, '锁'); await h.works.close()
      await mkdir(join(work.path, LOCK)); await writeFile(join(work.path, LOCK, 'owner.json'), JSON.stringify({ token: randomUUID(), ...owner }))
      const before = await digest(work.path)
      const result = await removeWork(h, work.id, yes(work))
      assert.equal(result.status, 409, JSON.stringify(owner) + result.text); assert.equal(result.body.code, 'WORK_FILES_UNSAFE')
      assert.deepEqual(await digest(work.path), before); assert.ok((await listed(h)).includes(work.id))
    }
    const stale = await create(h, '遗留锁'); await h.works.close()
    await mkdir(join(stale.path, LOCK)); await writeFile(join(stale.path, LOCK, 'owner.json'), JSON.stringify({ token: randomUUID(), host: hostname(), pid: 2147483647 }))
    const result = await removeWork(h, stale.id, yes(stale))
    assert.equal(result.status, 200, result.text); assert.equal(result.body.files, 'removed'); assert.equal(await exists(stale.path), false)
  } finally { child.kill(); await finish(h) }
})

test('WD-16: a connection that cannot close refuses file deletion; “否” still works', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const work = await create(h, '锁残留')
    await h.works.run(work.id, () => prisma.novel.count())
    await addConversation(h, work, 'wd16-chat')
    await writeFile(join(work.path, LOCK, 'extra.txt'), 'x')
    const snapshot = await catalog(h)
    const result = await removeWork(h, work.id, yes(work))
    assert.equal((await conversationTransfersFor(h.works)!.ledger.location('wd16-chat'))?.deleted, false)
    assert.equal(result.status, 409, result.text); assert.equal(result.body.code, 'WORK_FILES_UNSAFE'); assert.match(result.body.error, /未能关闭/)
    assert.equal(await catalog(h), snapshot); assert.equal(await exists(join(work.path, MANIFEST)), true)
    const kept = await removeWork(h, work.id, { deleteFiles: false })
    assert.equal(kept.status, 200, kept.text); assert.equal(kept.body.files, 'kept-by-choice')
  } finally { await finish(h) }
})

test('WD-17: a partial deletion failure keeps the manifest, reports kept and keeps the folder protected', { timeout: 180_000 }, async () => {
  assert.notEqual(process.getuid?.(), 0)
  const h = await harness()
  try {
    const work = await create(h, '部分'); await authorFiles(work.path); await h.works.close()
    await chmod(join(work.path, '素材', '图'), 0o555)
    let result
    try { result = await removeWork(h, work.id, yes(work)) } finally { await chmod(join(work.path, '素材', '图'), 0o755).catch(() => {}) }
    assert.equal(result.status, 200, result.text); assert.deepEqual(result.body, { ok: true, workId: work.id, novelId: work.novelId, files: 'kept' })
    assertNoPath(result.text, work.path)
    await assert.rejects(h.works.run(work.id, async () => 0), /作品不在本地目录索引中/)
    assert.equal(await exists(join(work.path, 'database')), false)
    assert.ok(!(await listed(h)).includes(work.id))
    assert.equal(await exists(join(work.path, MANIFEST)), true)
    assert.ok((await h.works.protectedDirectories()).includes(work.path))
    assert.equal((await removeWork(h, work.id, yes(work))).status, 404)
  } finally { await finish(h) }
})

test('WD-18: a running task refuses deletion', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const work = await create(h, '运行'), hold = Promise.withResolvers<void>()
    const running = h.works.run(work.id, () => hold.promise); await new Promise(r => setTimeout(r, 50))
    const busy = await removeWork(h, work.id, yes(work))
    assert.equal(busy.status, 409); assert.equal(busy.body.code, 'WORK_BUSY'); assert.equal(await exists(work.path), true)
    hold.resolve(); await running
    assert.equal((await removeWork(h, work.id, yes(work))).body.files, 'removed')
  } finally { await finish(h) }
})

test('WD-19/20: the location route returns the folder for one work and leaves other routes unchanged', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const work = await create(h, '位置')
    for (const query of [`novelId=${work.novelId}`, `workId=${work.id}`]) {
      const result = await call(h, `/api/works/location?${query}`)
      assert.equal(result.status, 200, query); assert.deepEqual(result.body, { workId: work.id, novelId: work.novelId, path: work.path })
    }
    for (const query of [`novelId=missing`, `workId=${randomUUID()}`]) assert.equal((await call(h, `/api/works/location?${query}`)).status, 404, query)
    for (const query of ['', `novelId=${work.novelId}&workId=${work.id}`, 'workId=abc', `workId=${work.id.toUpperCase()}`, `novelId=${work.novelId}&novelId=x`]) {
      const result = await call(h, `/api/works/location?${query}`)
      assert.equal(result.status, 400, query); assert.equal(result.body.code, 'INVALID_REQUEST')
    }
    assert.equal((await call(h, `/api/works/location?workId=${work.id}`, 'POST')).status, 404)
    const del = await call(h, `/api/works/location?workId=${work.id}`, 'DELETE')
    assert.equal(del.status, 400); assert.equal(del.body.code, 'INVALID_WORK_ID')
    const get = await call(h, `/api/works/${work.id}`)
    assert.equal(get.status, 404); assert.equal(get.body.error, '本地命令不存在')
    const novels = await call(h, '/api/novels')
    assert.doesNotMatch(novels.text, new RegExp(h.base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  } finally { await finish(h) }
})

test('WD-21: a work folder that contains the app data root is refused by the boundary check alone', { timeout: 180_000 }, async () => {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'shakeink-delete-boundary-')))
  const outer = join(base, 'outer'), data = join(outer, 'data'); await mkdir(outer)
  const works = new Workspaces(data, MIGRATIONS); await works.initialize()
  const dispose = configureConversationTransfers(works, async () => { throw Error('fixture never calls main') })
  const h: Harness = { base, data, works, dispatcher: new LocalDispatcher(works), dispose }
  try {
    // A real work elsewhere supplies a valid manifest; outer gets the same manifest and a matching row.
    const donor = await create(h, '边界', base); await h.works.close()
    await cp(join(donor.path, MANIFEST), join(outer, MANIFEST))
    const identity = await directoryIdentity(outer)
    const raw = JSON.parse(await catalog(h)); raw.value = raw.value.map((r: WorkRecord) => r.id === donor.id ? { ...r, path: outer, identity: { device: identity.device, inode: identity.inode } } : r); raw.revision++
    await writeFile(join(data, 'catalog.json'), JSON.stringify(raw) + '\n')
    await rm(donor.path, { recursive: true })
    const forged = { ...donor, path: outer }
    const result = await removeWork(h, donor.id, yes(forged))
    assert.equal(result.status, 409, result.text); assert.equal(result.body.code, 'WORK_FILES_UNSAFE'); assert.match(result.body.error, /应用数据目录/)
    assert.equal(await exists(join(data, 'catalog.json')), true); assert.ok((await listed(h)).includes(donor.id))
  } finally { await finish(h) }
})

test('WD-14b: a lock owned by this process but not by this instance is in use', { timeout: 240_000 }, async () => {
  const h = await harness(), otherData = join(h.base, 'other-data'), other = new Workspaces(otherData, MIGRATIONS)
  try {
    await other.initialize()
    const work = await create(h, '同进程'); await addConversation(h, work, 'wd14b-chat'); await h.works.close()
    await other.open(await directoryIdentity(work.path)); await other.run(work.id, () => prisma.novel.count())
    const before = await digest(work.path)
    await assertRefused(h, work, await removeWork(h, work.id, yes(work)), 'wd14b-chat')
    assert.deepEqual(await digest(work.path), before)
    await other.close()
    for (const broken of ['link', 'garbage'] as const) {
      if (broken === 'link') { await mkdir(join(h.base, 'elsewhere-lock')); await writeFile(join(h.base, 'elsewhere-lock', 'owner.json'), JSON.stringify({ host: hostname(), pid: 2147483647 })); await symlink(join(h.base, 'elsewhere-lock'), join(work.path, LOCK)) }
      else { await mkdir(join(work.path, LOCK)); await writeFile(join(work.path, LOCK, 'owner.json'), '{not json') }
      await assertRefused(h, work, await removeWork(h, work.id, yes(work)))
      await rm(join(work.path, LOCK), { recursive: true, force: true })
    }
  } finally { await other.close().catch(() => {}); await finish(h) }
})

test('WD-06b/06c: an unreadable parent is refused; a parent replaced by a file counts as missing', { timeout: 180_000 }, async () => {
  assert.notEqual(process.getuid?.(), 0)
  const h = await harness()
  try {
    const parent = join(h.base, 'parent'); await mkdir(parent)
    const locked = await create(h, '无权限', parent); await h.works.close()
    await chmod(parent, 0o000)
    let result
    try { result = await removeWork(h, locked.id, yes(locked)) } finally { await chmod(parent, 0o755) }
    await assertRefused(h, locked, result)
    const parent2 = join(h.base, 'parent2'); await mkdir(parent2)
    const gone = await create(h, '父目录变文件', parent2); await h.works.close()
    await rm(parent2, { recursive: true }); await writeFile(parent2, 'file')
    const missing = await removeWork(h, gone.id, yes(gone))
    assert.equal(missing.status, 200, missing.text); assert.equal(missing.body.files, 'missing')
  } finally { await finish(h) }
})

test('WD-22/23: concurrent deletes and opens are serialized; a listed work never loses its folder', { timeout: 240_000 }, async () => {
  const h = await harness()
  try {
    const work = await create(h, '并发')
    const both = await Promise.all([removeWork(h, work.id, yes(work)), removeWork(h, work.id, yes(work))])
    assert.deepEqual(both.map(r => [r.status, r.body.files ?? r.body.code]).sort(), [[200, 'removed'], [404, 'WORK_NOT_FOUND']])
    const second = await create(h, '并发二'); await h.works.close()
    const selection = await directoryIdentity(second.path)
    const [deleted, reopened] = await Promise.allSettled([removeWork(h, second.id, yes(second)), h.works.open(selection)])
    assert.equal(deleted.status, 'fulfilled')
    const outcome = deleted.status === 'fulfilled' ? deleted.value : null
    if (outcome?.body.files === 'removed') {
      // Delete ran first: the open saw no folder and failed; nothing is listed.
      assert.equal(reopened.status, 'rejected'); assert.equal(await exists(second.path), false); assert.ok(!(await listed(h)).includes(second.id))
    } else {
      // Open ran first: the work is listed again and its folder stays.
      assert.equal(reopened.status, 'fulfilled'); assert.ok((await listed(h)).includes(second.id)); assert.equal(await exists(second.path), true)
    }
    const rows = JSON.parse(await catalog(h)).value as WorkRecord[]
    for (const row of rows) assert.equal(await exists(row.path), true, row.title)
  } finally { await finish(h) }
})

test('WD-24 (CR 高1): a task started during the inspection makes the deletion busy; nothing is deleted', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const work = await create(h, '检查期间'); await addConversation(h, work, 'wd24-chat')
    const reservations = (h.works as any).creationReservations, original = reservations.records.bind(reservations)
    const hold = Promise.withResolvers<void>(); let running: Promise<unknown> | undefined
    reservations.records = async () => { const value = await original(); running = h.works.run(work.id, () => hold.promise); await new Promise(r => setTimeout(r, 50)); return value }
    const before = await digest(work.path), snapshot = await catalog(h)
    const result = await removeWork(h, work.id, yes(work))
    reservations.records = original
    assert.equal(result.status, 409, result.text); assert.equal(result.body.code, 'WORK_BUSY')
    assert.equal(await catalog(h), snapshot); assert.equal(await exists(work.path), true)
    assert.deepEqual(Object.keys(await digest(work.path)).sort(), Object.keys(before).sort())
    assert.equal((await conversationTransfersFor(h.works)!.ledger.location('wd24-chat'))?.deleted, false)
    hold.resolve(); await running
    assert.equal((await removeWork(h, work.id, yes(work))).body.files, 'removed')
  } finally { await finish(h) }
})

test('WD-17b (CR 中2): a partly deleted folder of an opened work without a reservation stays protected', { timeout: 180_000 }, async () => {
  assert.notEqual(process.getuid?.(), 0)
  const h = await harness(), other = await harness()
  try {
    // Create in another app root, then open here: this root has no creation reservation for it.
    const made = await create(other, '外来', h.base); await other.works.close()
    const work = await h.works.open(await directoryIdentity(made.path)); await authorFiles(work.path); await h.works.close()
    assert.ok(!(await h.works.runWithGlobal('inbox', () => getDatabaseContext().database.systemConfig.findMany({ where: { key: { startsWith: 'desktop:work-creation-reservation:' } } }))).some((r: any) => r.value.selection.path === work.path))
    await chmod(join(work.path, '素材', '图'), 0o555)
    let result
    try { result = await removeWork(h, work.id, yes(work)) } finally { await chmod(join(work.path, '素材', '图'), 0o755).catch(() => {}) }
    assert.equal(result.body.files, 'kept', result.text)
    assert.ok((await h.works.protectedDirectories()).includes(work.path))
  } finally { await finish(other); await finish(h) }
})
