import { mkdir, stat, realpath } from "node:fs/promises"
import { join, resolve } from "node:path"
import { Workspaces } from "../desktop/service/workspaces"
import { prisma } from "../src/lib/db"
import { VersionedStore } from "../desktop/core/versioned-store"
import { defaultState, stateSchema } from "../desktop/core/settings"

// docs/609 real-target precondition only: one isolated work with a chapter whose body and outline
// carry distinct end markers, so whole-book exports can be told apart. Not shipped UI data.
async function seed() {
  const directory = await realpath(resolve(process.argv[2]))
  const root = join(directory, "data"), path = join(directory, "作品", "菜单验收作品")
  await mkdir(path, { recursive: true })
  const info = await stat(path, { bigint: true })
  const works = new Workspaces(root, resolve("prisma/migrations"))
  try {
    await works.initialize()
    const state = new VersionedStore(join(root, "state.json"), defaultState, stateSchema.parse)
    const snapshot = await state.read()
    snapshot.value.onboarding = { version: 1, completed: true, step: "welcome", textModelId: null, imageModelId: null, receipt: null }
    await state.update(snapshot.revision, snapshot.value)
    const work = await works.create({ path, device: String(info.dev), inode: String(info.ino) }, { title: "菜单验收作品", requestId: "work-menu-609-fixture" })
    await works.run(work.id, async () => {
      const volume = await prisma.volume.create({ data: { novelId: work.novelId, title: "第一卷", index: 1, summary: "" } })
      await prisma.chapter.create({ data: { volumeId: volume.id, index: 1, title: "第一章", outline: "大纲开头。WMR 第一章大纲终点", content: "正文开头。WMR 第一章终点", status: "WRITTEN" } })
      console.log(JSON.stringify({ novelId: work.novelId }))
    })
  } finally { await works.close() }
}
void seed().catch(error => { console.error(error); process.exitCode = 1 })
