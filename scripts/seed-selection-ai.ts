// docs/612 real-target fixture. Synthetic data only; never accepts an existing application root.
import assert from 'node:assert/strict'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Workspaces } from '../desktop/service/workspaces'
import { directoryIdentity } from '../desktop/core/root-ownership'
import { prisma } from '../src/lib/db'
import { defaultState } from '../desktop/core/settings'

const paragraph = (lead: string, fill: string, n = 40) => `${lead}${fill.repeat(n)}。`
const BODY = [
  paragraph('隔离测试第一段', '甲'),
  paragraph('第二段写雨中的书铺', '乙', 60),
  paragraph('第三段写到转折', '丙'),
  paragraph('第四段收束本章', '丁'),
  paragraph('第五段留下悬念', '戊'),
].join('\n\n')

async function main() {
  const base = await realpath(resolve(process.argv[2]))
  assert(basename(base).startsWith('shakeink-selection-ai-'))
  const works = new Workspaces(join(base, 'data'), resolve('prisma/migrations'))
  try {
    await works.initialize()
    const path = join(base, 'work-0'); await mkdir(path)
    const work = await works.create(await directoryIdentity(path), { title: '选区修改专项作品', requestId: randomUUID() })
    const chapter = await works.run(work.id, async () => {
      const volume = await prisma.volume.create({ data: { novelId: work.novelId, title: '第一卷 雨镇', index: 1, summary: '林简来到雨镇' } })
      return prisma.chapter.create({ data: { volumeId: volume.id, index: 1, title: '第一章 书铺', outline: '林简走进旧书铺', content: BODY, status: 'WRITTEN' } })
    })
    const state = structuredClone(defaultState); state.settings.appearance.theme = 'paper'
    state.onboarding = { version: 1, completed: true, step: 'welcome', textModelId: null, imageModelId: null, receipt: null }
    await writeFile(join(works.root, 'state.json'), JSON.stringify({ schemaVersion: 1, revision: 0, value: state }))
    await writeFile(join(base, 'fixture.json'), JSON.stringify({ root: works.root, work: { ...work, chapterId: chapter.id, chapterTitle: '第一章 书铺', volumeTitle: '第一卷 雨镇' } }))
  } finally { await works.close() }
  console.log('Isolated selection-ai fixture prepared: 1 synthetic work, 1 chapter, zero models.')
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
