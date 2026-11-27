import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readdir, realpath, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deleteWorkFolder, deletionRefusal, removeTreeOnDevice, type TreeFs } from '../../desktop/service/workspaces'
import { directoryIdentity } from '../../desktop/core/root-ownership'
import { readWorkBrand } from '../../desktop/core/brand-names'

const exists = (path: string) => stat(path).then(() => true, () => false)
function recording(onRemove?: (path: string) => void) {
  const ops: string[] = []
  const fs: TreeFs = {
    lstat: (path, options) => lstat(path, options), readdir: path => readdir(path),
    unlink: async path => { onRemove?.(path); ops.push(path); await unlink(path) },
    rmdir: async path => { onRemove?.(path); ops.push(path + '/'); await rmdir(path) },
  }
  return { fs, ops }
}
async function workFolder() {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'shakeink-wdu-'))), root = join(base, 'work'); await mkdir(root)
  await writeFile(join(root, 'shakeink-work.json'), JSON.stringify({ schemaVersion: 1, id: randomUUID(), phase: 'ready', novelId: 'n', title: 't', requestId: 'r', requestHash: 'h', createdAt: '2026-01-01' }))
  await mkdir(join(root, '.shakeink-lock')); await writeFile(join(root, '.shakeink-lock', 'owner.json'), '{}')
  await mkdir(join(root, 'database')); await writeFile(join(root, 'database', 'PG_VERSION'), '17')
  await writeFile(join(root, '笔记.md'), 'x')
  const identity = await directoryIdentity(root)
  const lockInfo = await lstat(join(root, '.shakeink-lock'), { bigint: true })
  return { base, root, target: { root: identity, device: BigInt(identity.device), brand: await readWorkBrand(identity), lock: { dev: lockInfo.dev, ino: lockInfo.ino, owner: '{}' } } }
}

test('WDU-01: a directory on another device stops removal and is left in place', async () => {
  const removed: string[] = []
  const entries: Record<string, { dev: bigint; dir: boolean; names?: string[] }> = {
    '/w': { dev: 1n, dir: true, names: ['a', 'mnt'] }, '/w/a': { dev: 1n, dir: false }, '/w/mnt': { dev: 2n, dir: true, names: ['x'] }, '/w/mnt/x': { dev: 2n, dir: false },
  }
  const fs: TreeFs = {
    lstat: async path => { const e = entries[path]; return { dev: e.dev, ino: 1n, isSymbolicLink: () => false, isDirectory: () => e.dir } },
    readdir: async path => entries[path].names!, unlink: async path => { removed.push(path) }, rmdir: async path => { removed.push(path + '/') },
  }
  await assert.rejects(removeTreeOnDevice('/w', 1n, fs), /其他磁盘/)
  assert.deepEqual(removed, ['/w/a'])
})

test('WDU-02: other entries go first, then the lock, the manifest and finally the folder', async () => {
  const { base, root, target } = await workFolder()
  try {
    const { fs, ops } = recording()
    await deleteWorkFolder(target, fs)
    assert.equal(await exists(root), false)
    const index = (path: string) => ops.indexOf(path)
    const lock = index(join(root, '.shakeink-lock') + '/'), manifest = index(join(root, 'shakeink-work.json'))
    assert.ok(index(join(root, '笔记.md')) < lock && index(join(root, 'database') + '/') < lock)
    assert.ok(lock < manifest); assert.equal(ops.at(-1), root + '/')
  } finally { await rm(base, { recursive: true, force: true }) }
})

test('WDU-03: a failed identity check stops before the next entry and keeps the manifest', async () => {
  const { base, root, target } = await workFolder()
  try {
    // The manifest changes after the first removed file; the guard before the next entry must stop.
    let changed = false
    const { fs, ops } = recording()
    const wrapped: TreeFs = { ...fs, unlink: async path => { await fs.unlink(path); if (!changed) { changed = true; await writeFile(join(root, 'shakeink-work.json'), JSON.stringify({ changed: true })) } } }
    await assert.rejects(deleteWorkFolder(target, wrapped), /BRAND_MARKER_CHANGED/)
    assert.ok(ops.length >= 1)
    assert.equal([await exists(join(root, 'database')), await exists(join(root, '笔记.md'))].filter(Boolean).length, 1)
    assert.equal(await exists(join(root, 'shakeink-work.json')), true)
    assert.equal(await exists(join(root, '.shakeink-lock', 'owner.json')), true)
  } finally { await rm(base, { recursive: true, force: true }) }
})

test('WDU-04/05: forbidden folders are refused by the pure path check; nothing real is touched', () => {
  const base = { device: 1n, parentDevice: 1n, home: '/Users/a', protectedRoots: ['/Users/a/Library/ShakeInk/data', '/Users/a/Library/ShakeInk/bootstrap'] }
  const refused = (path: string, extra: Partial<typeof base> = {}) => deletionRefusal({ ...base, ...extra, path })
  assert.equal(refused('/Users/a/作品/甲'), null)
  for (const path of ['/', '/Users/a', '/Users']) assert.match(refused(path)!, /不能删除此目录/, path)
  assert.match(refused('/Volumes/Disk/作品', { parentDevice: 2n })!, /磁盘根目录/)
  for (const name of ['Desktop', 'Documents', 'Downloads']) assert.match(refused('/Users/a/' + name)!, /常用文件夹/, name)
  assert.equal(refused('/Users/a/Documents/作品'), null)
  for (const path of ['/Users/a/Library/ShakeInk', '/Users/a/Library/ShakeInk/data/x', '/Users/a/Library/ShakeInk/bootstrap']) assert.match(refused(path)!, /应用数据目录/, path)
})

test('WDU-06: a lock that appears after the commit stops deletion before the database goes', async () => {
  const { base, root, target } = await workFolder()
  try {
    await rm(join(root, '.shakeink-lock'), { recursive: true })
    const { fs } = recording()
    let created = false
    const wrapped: TreeFs = { ...fs, readdir: async path => { const names = await fs.readdir(path); if (path === root && !created) { created = true; await mkdir(join(root, '.shakeink-lock')); await writeFile(join(root, '.shakeink-lock', 'owner.json'), '{"pid":1}') } return names } }
    await assert.rejects(deleteWorkFolder({ ...target, lock: null }, wrapped), /作品目录锁已变化/)
    assert.equal(await exists(join(root, 'database', 'PG_VERSION')), true)
    assert.equal(await exists(join(root, 'shakeink-work.json')), true)
    // A lock whose owner.json changed is also a different lock.
    const changed = await workFolder()
    try {
      await writeFile(join(changed.root, '.shakeink-lock', 'owner.json'), '{"pid":2}')
      await assert.rejects(deleteWorkFolder(changed.target), /作品目录锁已变化/)
      assert.equal(await exists(join(changed.root, 'database')), true)
    } finally { await rm(changed.base, { recursive: true, force: true }) }
  } finally { await rm(base, { recursive: true, force: true }) }
})

test('WDU-01b: a mount found during deletion stops it and keeps the manifest', async () => {
  const { base, root, target } = await workFolder()
  try {
    const { fs } = recording()
    const other: TreeFs = { ...fs, lstat: async (path, options) => { const info = await fs.lstat(path, options); return path === join(root, 'database') ? { ...info, dev: info.dev + 1n, isSymbolicLink: () => false, isDirectory: () => true } : info } }
    await assert.rejects(deleteWorkFolder(target, other), /其他磁盘/)
    assert.equal(await exists(join(root, 'shakeink-work.json')), true)
    assert.equal(await exists(join(root, 'database', 'PG_VERSION')), true)
  } finally { await rm(base, { recursive: true, force: true }) }
})
