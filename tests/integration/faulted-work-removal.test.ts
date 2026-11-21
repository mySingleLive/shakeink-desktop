import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { Workspaces, type WorkRecord } from '../../desktop/service/workspaces'
import { LocalDispatcher } from '../../desktop/service/dispatcher'
import { configureConversationTransfers, conversationTransfersFor, recoverConversationTransfers, removeConversation } from '../../desktop/service/conversation-runtime'
import { closedWorkLeaseTarget } from '../../desktop/service/closed-work-lease-target'
import { getDatabaseContext } from '../../desktop/service/context'
import { directoryIdentity } from '../../desktop/core/root-ownership'
import { RevisionConflict } from '../../desktop/core/versioned-store'
import { prisma } from '../../src/lib/db'

type Listed = { novels: { id: string }[]; unavailableWorks: { workId: string; reason: string }[] }
const MIGRATIONS = resolve('prisma/migrations')
const LOCK = '.shakeink-lock'

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

interface Harness { base: string; works: Workspaces; dispatcher: LocalDispatcher; dispose(): void; data: string }
async function harness(configure = true): Promise<Harness> {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'shakeink-faulted-remove-')))
  const data = join(base, 'data'), works = new Workspaces(data, MIGRATIONS)
  await works.initialize()
  const dispose = configure ? configureConversationTransfers(works, async () => { throw Error('fixture never calls main') }) : () => {}
  return { base, data, works, dispatcher: new LocalDispatcher(works), dispose }
}
async function finish(h: Harness) {
  h.dispose()
  await chmod(h.data, 0o755).catch(() => {})
  for (let attempt = 0; ; attempt++) {
    try { await h.works.close(); break } catch (error) { if (attempt > 20) break; await new Promise(r => setTimeout(r, 50)); void error }
  }
  await rm(h.base, { recursive: true, force: true })
}
async function create(h: Harness, title: string): Promise<WorkRecord> {
  const path = join(h.base, `work-${randomUUID().slice(0, 8)}`); await mkdir(path)
  return h.works.create(await directoryIdentity(path), { title, requestId: randomUUID() })
}
async function call(h: Harness, path: string, method: 'GET' | 'DELETE' | 'POST' = 'GET') {
  const response = await h.dispatcher.handle({ version: 1, id: randomUUID(), path, method, headers: {} }, new AbortController().signal)
  const text = await response.text()
  return { status: response.status, text, body: text ? JSON.parse(text) : null }
}
const remove = (h: Harness, id: string) => call(h, `/api/works/${id}`, 'DELETE')
const list = async (h: Harness) => (await call(h, '/api/novels')).body as Listed
const reasons = async (h: Harness) => Object.fromEntries((await list(h)).unavailableWorks.map(w => [w.workId, w.reason]))
const catalog = (h: Harness) => readFile(join(h.data, 'catalog.json'))
const catalogRows = async (h: Harness) => (JSON.parse(String(await catalog(h))) as { revision: number; value: WorkRecord[] })
async function staleLock(path: string, pid = 2147483647, host = hostname()) {
  await mkdir(join(path, LOCK)); await writeFile(join(path, LOCK, 'owner.json'), JSON.stringify({ token: randomUUID(), host, pid }))
}
async function addConversation(h: Harness, work: WorkRecord, id: string) {
  await h.works.runWithGlobal(work.id, async () => {
    await getDatabaseContext().database.conversation.create({ data: { id, userId: 'local-author', novelId: work.novelId, title: id } })
    await conversationTransfersFor(h.works)!.current(id)
  })
}

test('WN-03/04/05: real faults classify by structured markers and keep original error types', { timeout: 180_000 }, async () => {
  assert.notEqual(process.ppid, 1); assert.doesNotThrow(() => process.kill(process.ppid, 0))
  const h = await harness()
  try {
    const healthy = await create(h, '健康'), missing = await create(h, '缺失'), stale = await create(h, '遗留锁'), inUse = await create(h, '占用')
    const foreign = await create(h, '外设备'), damaged = await create(h, '损坏'), emptyLock = await create(h, '空锁'), noManifest = await create(h, '无清单'), copied = await create(h, '复制')
    await h.works.close()
    await rename(missing.path, missing.path + '-moved')
    await staleLock(stale.path); await staleLock(inUse.path, process.ppid); await staleLock(foreign.path, 4242, 'other-host.invalid')
    await rm(join(damaged.path, 'database', 'PG_VERSION'))
    await mkdir(join(emptyLock.path, LOCK))
    await unlink(join(noManifest.path, 'shakeink-work.json'))
    await rename(copied.path, copied.path + '-orig'); await cp(copied.path + '-orig', copied.path, { recursive: true })
    const listed = await list(h)
    assert.deepEqual(listed.novels.map(n => n.id), [healthy.novelId])
    assert.deepEqual(await reasons(h), {
      [missing.id]: 'missing', [stale.id]: 'stale-lease', [inUse.id]: 'in-use', [foreign.id]: 'in-use', [damaged.id]: 'damaged',
      [emptyLock.id]: 'unavailable', [noManifest.id]: 'changed', [copied.id]: 'changed',
    })
    assert.doesNotMatch(JSON.stringify(listed), new RegExp(h.base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    const busy = await h.works.run(inUse.id, async () => 0).catch(error => error)
    assert.equal(busy.constructor, Error); assert.equal(busy.message, '作品已在其他进程打开')
    const gone = await h.works.run(missing.id, async () => 0).catch(error => error)
    assert.equal(gone.code, 'ENOENT')
  } finally { await finish(h) }
})

test('WN-10..13/11b: every fault kind is removable; directories and locks stay byte-identical', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const keep = await create(h, '保留'), missing = await create(h, '缺失'), stale = await create(h, '遗留锁'), inUse = await create(h, '占用'), damaged = await create(h, '损坏'), changed = await create(h, '变化')
    await h.works.close()
    await rename(missing.path, missing.path + '-moved'); await staleLock(stale.path); await staleLock(inUse.path, process.ppid)
    await rm(join(damaged.path, 'database', 'PG_VERSION')); await unlink(join(changed.path, 'shakeink-work.json'))
    const before: Record<string, Record<string, string>> = {}
    for (const [id, path] of [[missing.id, missing.path + '-moved'], [stale.id, stale.path], [inUse.id, inUse.path], [damaged.id, damaged.path], [changed.id, changed.path]]) before[id] = await digest(path)
    const keepRow = (await catalogRows(h)).value.find(r => r.id === keep.id)
    for (const work of [missing, stale, inUse, damaged, changed]) {
      const { revision } = await catalogRows(h)
      const result = await remove(h, work.id)
      assert.equal(result.status, 200, result.text)
      assert.deepEqual(result.body, { ok: true, workId: work.id, novelId: work.novelId })
      const after = await catalogRows(h)
      assert.equal(after.revision, revision + 1)
      assert.ok(!after.value.some(r => r.id === work.id))
      assert.deepEqual(after.value.find(r => r.id === keep.id), keepRow)
      assert.ok(!(await list(h)).unavailableWorks.some(w => w.workId === work.id))
    }
    assert.equal(await exists(missing.path), false)
    for (const [id, path] of [[missing.id, missing.path + '-moved'], [stale.id, stale.path], [inUse.id, inUse.path], [damaged.id, damaged.path], [changed.id, changed.path]]) assert.deepEqual(await digest(path), before[id], id)
    await assert.rejects(closedWorkLeaseTarget(h.works, stale.id, () => {}), /WORK_LEASE_NOT_REGISTERED/)
    await assert.rejects(h.works.open(await directoryIdentity(stale.path)), { code: 'WORK_LEASE_STALE' })
    assert.ok(!(await catalogRows(h)).value.some(r => r.id === stale.id))
    assert.deepEqual((await list(h)).novels.map(n => n.id), [keep.novelId])
  } finally { await finish(h) }
})

test('WN-14/14b/15: a healthy work is removable, its connection retires, and it can be reopened', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const work = await create(h, '健康')
    assert.equal(await h.works.run(work.id, () => prisma.novel.count()), 1)
    assert.equal(await exists(join(work.path, LOCK)), true)
    const before = await digest(work.path)
    let blocked: unknown
    await h.works.forget(work.id, async () => { blocked = await h.works.run(work.id, async () => 0).catch(error => error) })
    assert.match(String(blocked), /作品不在本地目录索引中/)
    assert.equal(await exists(join(work.path, LOCK)), false)
    await assert.rejects(h.works.run(work.id, async () => 0), /作品不在本地目录索引中/)
    const after = await digest(work.path)
    for (const name of Object.keys(before)) if (!name.startsWith('database/') && !name.startsWith(LOCK)) assert.equal(after[name], before[name], name)
    const reopened = await h.works.open(await directoryIdentity(work.path))
    assert.equal(reopened.id, work.id)
    assert.equal(await h.works.run(work.id, () => prisma.novel.count()), 1)
    assert.deepEqual((await list(h)).novels.map(n => n.id), [work.novelId])
    const viaRoute = await remove(h, work.id)
    assert.equal(viaRoute.status, 200)
    assert.deepEqual((await list(h)).novels, [])
  } finally { await finish(h) }
})

test('WN-16/14c: active or retained work is refused with WORK_BUSY, then removable after release', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const work = await create(h, '活动')
    const hold = Promise.withResolvers<void>()
    const running = h.works.run(work.id, () => hold.promise)
    await new Promise(r => setTimeout(r, 50))
    const snapshot = await catalog(h)
    const busy = await remove(h, work.id)
    assert.equal(busy.status, 409); assert.equal(busy.body.code, 'WORK_BUSY')
    assert.deepEqual(await catalog(h), snapshot)
    hold.resolve(); await running
    let release!: () => void
    await h.works.run(work.id, async () => { release = getDatabaseContext().retainTask!() })
    const retained = await remove(h, work.id)
    assert.equal(retained.status, 409); assert.equal(retained.body.code, 'WORK_BUSY')
    release()
    assert.equal((await remove(h, work.id)).status, 200)
    assert.equal(await exists(join(work.path, LOCK)), false)
    await h.works.open(await directoryIdentity(work.path))
    assert.equal(await h.works.run(work.id, () => prisma.novel.count()), 1)
  } finally { await finish(h) }
})

test('WN-14d: a lock that cannot be released never blocks removal; close reports the retained engine', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const work = await create(h, '锁残留')
    await h.works.run(work.id, () => prisma.novel.count())
    await writeFile(join(work.path, LOCK, 'extra.txt'), 'x')
    const result = await remove(h, work.id)
    assert.equal(result.status, 200, result.text)
    assert.ok(!(await catalogRows(h)).value.some(r => r.id === work.id))
    await assert.rejects(h.works.close(), /作品目录锁包含未知文件/)
    await unlink(join(work.path, LOCK, 'extra.txt'))
    await h.works.close()
    assert.equal(await exists(join(work.path, LOCK)), false)
  } finally { await finish(h) }
})

test('WN-17..20/23: not found, invalid ids, other routes, repeats, concurrency and production nesting', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const a = await create(h, '甲'), b = await create(h, '乙')
    await h.works.close(); await rename(a.path, a.path + '-x'); await rename(b.path, b.path + '-x')
    const snapshot = await catalog(h)
    const missing = await remove(h, randomUUID())
    assert.equal(missing.status, 404); assert.equal(missing.body.code, 'WORK_NOT_FOUND'); assert.deepEqual(await catalog(h), snapshot)
    // Traversal never reaches routing: the existing request schema rejects it.
    await assert.rejects(remove(h, '..%2F'), /本地路径不能越界/)
    for (const segment of ['abc', a.id.toUpperCase()]) {
      const invalid = await remove(h, segment)
      assert.equal(invalid.status, 400, segment); assert.deepEqual(Object.keys(invalid.body).sort(), ['code', 'error']); assert.equal(invalid.body.code, 'INVALID_WORK_ID')
    }
    for (const [path, method] of [[`/api/works/${a.id}`, 'GET'], [`/api/works/${a.id}`, 'POST'], [`/api/works/${a.id}/x`, 'DELETE']] as const) {
      const other = await call(h, path, method)
      assert.equal(other.status, 404); assert.equal(other.body.error, '本地命令不存在')
    }
    assert.deepEqual(await catalog(h), snapshot)
    const nested = await h.works.runWithGlobal('inbox', () => h.dispatcher.handle({ version: 1, id: randomUUID(), path: `/api/works/${a.id}`, method: 'DELETE', headers: {} }, new AbortController().signal))
    assert.equal(nested.status, 200)
    assert.equal((await remove(h, a.id)).status, 404)
    const both = await Promise.all([remove(h, b.id), remove(h, b.id)])
    assert.deepEqual(both.map(r => r.status).sort(), [200, 404])
  } finally { await finish(h) }
})

test('WN-21: without the conversation ledger the request is refused and the index is unchanged', { timeout: 120_000 }, async () => {
  const h = await harness(false)
  try {
    assert.equal(conversationTransfersFor(h.works), undefined)
    const work = await create(h, '甲'); await h.works.close(); await rename(work.path, work.path + '-x')
    const snapshot = await catalog(h)
    const result = await remove(h, work.id)
    assert.equal(result.status, 503); assert.equal(result.body.code, 'CONVERSATION_LEDGER_UNAVAILABLE')
    assert.deepEqual(await catalog(h), snapshot)
    assert.deepEqual(Object.keys(await reasons(h)), [work.id])
  } finally { await finish(h) }
})

test('WN-22: an index write failure rolls back the removal guard and is safe to retry', { timeout: 180_000 }, async () => {
  assert.notEqual(process.getuid?.(), 0)
  const h = await harness()
  try {
    const work = await create(h, '健康乙')
    await addConversation(h, work, 'wn22-chat')
    const snapshot = await catalog(h)
    await chmod(h.data, 0o555)
    const failed = await remove(h, work.id)
    await chmod(h.data, 0o755)
    assert.equal(failed.status, 500); assert.equal(failed.body.code, 'WORK_REMOVE_FAILED')
    assert.doesNotMatch(failed.text, new RegExp(h.base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.deepEqual(await catalog(h), snapshot)
    const location = await conversationTransfersFor(h.works)!.ledger.location('wn22-chat')
    assert.equal(location?.deleted, true)
    assert.equal(await h.works.run(work.id, () => prisma.novel.count()), 1)
    assert.equal((await remove(h, work.id)).status, 200)
  } finally { await finish(h) }
})

test('WN-30..34: linked conversations are forgotten, other locations are untouched, restart stays healthy', { timeout: 300_000 }, async () => {
  const h = await harness()
  let works = h.works
  try {
    const a = await create(h, '甲'), b = await create(h, '乙')
    const transfers = conversationTransfersFor(works)!
    await addConversation(h, a, 'wn-a-chat'); await addConversation(h, a, 'wn-a-moved'); await addConversation(h, a, 'wn-a-removed')
    await works.runWithGlobal('inbox', async () => { await getDatabaseContext().database.conversation.create({ data: { id: 'wn-inbox-chat', userId: 'local-author', title: '收件箱' } }); await transfers.current('wn-inbox-chat') })
    const moved = await works.runWithGlobal(a.id, () => transfers.current('wn-a-moved'))
    await works.runWithGlobal(a.id, () => transfers.associate('wn-a-moved', { operationId: randomUUID(), novelId: b.novelId, expectedLocationRevision: moved.revision }))
    await works.runWithGlobal(a.id, () => removeConversation('wn-a-removed'))
    const movedBefore = await transfers.ledger.location('wn-a-moved'), removedBefore = await transfers.ledger.location('wn-a-removed'), removedDeletion = await transfers.ledger.deletion('wn-a-removed')
    await works.close(); await rename(a.path, a.path + '-x')
    await assert.rejects(call(h, '/api/chat/conversations'))
    const result = await remove(h, a.id)
    assert.equal(result.status, 200, result.text)
    const conversations = await call(h, '/api/chat/conversations')
    assert.equal(conversations.status, 200)
    assert.deepEqual(conversations.body.conversations.map((c: { id: string }) => c.id).sort(), ['wn-a-moved', 'wn-inbox-chat'])
    assert.deepEqual(await transfers.ledger.location('wn-a-moved'), movedBefore)
    assert.deepEqual(await transfers.ledger.location('wn-a-removed'), removedBefore)
    assert.deepEqual(await transfers.ledger.deletion('wn-a-removed'), removedDeletion)
    assert.equal((await transfers.ledger.location('wn-a-chat'))?.deleted, true)
    assert.equal((await transfers.ledger.deletion('wn-a-chat'))?.phase, 'committed')
    // WN-33 restart
    h.dispose(); await works.close()
    works = h.works = new Workspaces(h.data, MIGRATIONS); await works.initialize()
    h.dispose = configureConversationTransfers(works, async () => { throw Error('fixture never calls main') }); h.dispatcher = new LocalDispatcher(works)
    const recovered = await recoverConversationTransfers(works)
    assert.ok(recovered.some(r => r.phase === 'pending' && r.code === 'CONVERSATION_DELETION_PENDING'))
    assert.equal((await conversationTransfersFor(works)!.ledger.deletion('wn-a-chat'))?.phase, 'committed')
    assert.equal((await call(h, '/api/chat/conversations')).status, 200)
    // WN-34 rejoin
    await rename(a.path + '-x', a.path)
    await works.open(await directoryIdentity(a.path))
    const rejoined = await call(h, '/api/chat/conversations')
    assert.ok(!rejoined.body.conversations.some((c: { id: string }) => c.id === 'wn-a-chat'))
    assert.equal(await works.run(a.id, () => prisma.conversation.count({ where: { id: 'wn-a-chat' } })), 1)
    h.dispose(); await works.close()
    works = h.works = new Workspaces(h.data, MIGRATIONS); await works.initialize()
    h.dispose = configureConversationTransfers(works, async () => { throw Error('fixture never calls main') }); h.dispatcher = new LocalDispatcher(works)
    const again = await recoverConversationTransfers(works)
    assert.ok(again.some(r => r.phase === 'complete'))
    assert.equal(await works.run(a.id, () => prisma.conversation.count({ where: { id: 'wn-a-chat' } })), 0)
  } finally { await finish(h) }
})

test('WN-32a/32b: a catalog revision conflict after conversation cleanup fails safely and retry is idempotent', { timeout: 180_000 }, async () => {
  const h = await harness()
  try {
    const transfers = conversationTransfersFor(h.works)!
    const a = await create(h, '甲'), healthy = await create(h, '健康')
    await addConversation(h, a, 'wn32-chat')
    await h.works.close(); await rename(a.path, a.path + '-x')
    const bump = async () => { const raw = await catalogRows(h); await writeFile(join(h.data, 'catalog.json'), JSON.stringify({ schemaVersion: 1, revision: raw.revision + 1, value: raw.value }) + '\n') }
    await assert.rejects(h.works.forget(a.id, async () => { await transfers.forgetWorkspace(a.id); await bump() }), RevisionConflict)
    assert.equal((await transfers.ledger.location('wn32-chat'))?.deleted, true)
    assert.equal((await transfers.ledger.deletion('wn32-chat'))?.phase, 'committed')
    assert.ok((await catalogRows(h)).value.some(r => r.id === a.id))
    assert.equal((await call(h, '/api/chat/conversations')).status, 200)
    const locations = await transfers.ledger.locations()
    assert.equal((await remove(h, a.id)).status, 200)
    assert.deepEqual(await transfers.ledger.locations(), locations)
    await assert.rejects(h.works.forget(healthy.id, async () => { await bump() }), RevisionConflict)
    assert.equal(await h.works.run(healthy.id, () => prisma.novel.count()), 1)
  } finally { await finish(h) }
})
