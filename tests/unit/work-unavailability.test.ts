import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyUnavailableWork, markWorkFault } from '../../desktop/service/work-unavailability'
import { ContentError } from '../../src/lib/content-errors'
import { fetchNovelList } from '../../src/lib/novel-list'

test("WN-01': only structured markers and ContentError codes classify faults", () => {
  const errno = (code: string) => Object.assign(Error(code), { code })
  const cases: [unknown, string][] = [
    [new ContentError('WORK_LEASE_STALE', 'x'), 'stale-lease'],
    [markWorkFault(Error('作品已在其他进程打开'), 'in-use'), 'in-use'],
    [markWorkFault(errno('ENOENT'), 'missing'), 'missing'],
    [markWorkFault(Error('作品目录发生变化，请重新关联'), 'changed'), 'changed'],
    [markWorkFault(Error('作品数据库缺失或路径无效，原作品已保留'), 'damaged'), 'damaged'],
    [errno('ENOENT'), 'unavailable'],
    [errno('EPERM'), 'unavailable'],
    [Object.assign(Error('x'), { code: 'WORK_IN_USE' }), 'unavailable'],
    [new ContentError('OTHER', 'x'), 'unavailable'],
    [Error('作品已在其他进程打开'), 'unavailable'],
    [Error('private-key WORK_LEASE_STALE'), 'unavailable'],
    ['WORK_LEASE_STALE', 'unavailable'],
    [null, 'unavailable'],
  ]
  for (const [error, reason] of cases) assert.equal(classifyUnavailableWork(error), reason, String(error))
})

test("WN-01': the marker keeps the original error type, message and code and is not enumerable", () => {
  const original = Object.assign(Error('ENOENT: no such file'), { code: 'ENOENT' })
  const marked = markWorkFault(original, 'missing')
  assert.equal(marked, original)
  assert.equal(marked.message, 'ENOENT: no such file')
  assert.equal((marked as NodeJS.ErrnoException).code, 'ENOENT')
  assert.ok(!(marked instanceof ContentError))
  assert.deepEqual(Object.keys(marked), ['code'])
  assert.doesNotMatch(JSON.stringify(marked), /missing/)
  assert.equal(markWorkFault('not-an-error', 'missing'), 'not-an-error')
})

test("WN-02': list parsing normalizes unknown or absent reasons", async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () => Response.json({ novels: [], unavailableWorks: [
      { workId: 'a', novelId: 'na', title: '甲', reason: 'future-kind' },
      { workId: 'b', novelId: 'nb', title: '乙' },
      { workId: 'c', novelId: 'nc', title: '丙', reason: 'in-use' },
      { workId: 'd', novelId: 'nd', title: '丁', reason: 'stale-lease' },
    ] })
    const list = await fetchNovelList()
    assert.deepEqual(list.unavailableWorks.map(work => work.reason), ['unavailable', 'unavailable', 'in-use', 'stale-lease'])
  } finally { globalThis.fetch = original }
})
