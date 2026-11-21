import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, readdir, readFile, readlink, realpath, rename, rm, symlink, writeFile, lstat } from "node:fs/promises"
import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DataRootManager } from "../../desktop/core/data-root"
import { directoryIdentity } from "../../desktop/core/root-ownership"
import { readApplicationBrandImmediately, brandRootIdentity } from "../../desktop/core/brand-names"
import {
  classifyStartupRecovery, executeStartupRepair, executeStartupReset, StartupRecoveryError,
  type StartupRecoveryGuards, type StartupRecoveryRepair,
} from "../../desktop/main/startup-recovery"

type Family = "legacy" | "current"
const markerName = (family: Family) => family === "legacy" ? "xuanxiang-app.json" : "shakeink-app.json"
const markerText = (family: Family, id: string, phase: "initializing" | "ready" = "ready", inboxReady = true) =>
  JSON.stringify({ schemaVersion: 1, app: family === "legacy" ? "Xuanxiangxiezuo-Desktop" : "ShakeInk", id, phase, inboxReady })
// 用例要求“替换后的目录与旧目录 inode 不同”。部分文件系统（如 ext4）
// 删除目录后会立即复用其 inode，直接 rm+mkdir 无法构造该场景；
// 这里先创建同层备用目录（与旧目录同时存在，inode 必然不同），
// 删除旧目录后把备用目录 rename 到位——rename 不分配新 inode。
async function replaceDirectoryWithNewInode(path: string, base: string): Promise<void> {
  const spare = join(base, `.inode-spare-${randomUUID().slice(0, 8)}`)
  await mkdir(spare)
  try {
    await rm(path, { recursive: true, force: true })
    await rename(spare, path)
  } catch (error) {
    await rm(spare, { recursive: true, force: true })
    throw error
  }
}
async function fixture(run: (f: { base: string; bootstrap: string; root: string; paths: { bootstrap: string; recoveryRoot: string } }) => Promise<void>) {
  const base = await realpath(await mkdtemp(join(tmpdir(), "shakeink-startup-recovery-"))), bootstrap = join(base, "bootstrap"), root = join(base, "root")
  await mkdir(bootstrap)
  try { await run({ base, bootstrap, root, paths: { bootstrap, recoveryRoot: root } }) } finally { await rm(base, { recursive: true, force: true }) }
}
async function healthyRoot(root: string, family: Family, id = randomUUID()) {
  await mkdir(join(root, "inbox", "database"), { recursive: true })
  await writeFile(join(root, markerName(family)), markerText(family, id))
  await writeFile(join(root, "catalog.json"), JSON.stringify({ schemaVersion: 1, revision: 0, value: [] }))
  await writeFile(join(root, "inbox", "database", "PG_VERSION"), "17\n")
  return id
}
async function contentWithoutMarker(root: string) {
  await mkdir(join(root, "inbox", "database"), { recursive: true })
  await writeFile(join(root, "catalog.json"), JSON.stringify({ schemaVersion: 1, revision: 0, value: [] }))
  await writeFile(join(root, "inbox", "database", "PG_VERSION"), "17\n")
}
async function pointerFor(root: string, rootId = randomUUID()) {
  return { schemaVersion: 1 as const, revision: 1, rootId, migrationId: null, root: await directoryIdentity(root) }
}
const writePointer = (bootstrap: string, pointer: unknown) => writeFile(join(bootstrap, "data-root.json"), JSON.stringify(pointer))
const noopGuards: StartupRecoveryGuards = { assertLock() {} }
async function snapshot(dir: string, prefix = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name, full = join(dir, entry.name)
    if (entry.isDirectory()) Object.assign(out, await snapshot(full, relative))
    else if (entry.isSymbolicLink()) out[relative] = `symlink:${await readlink(full)}`
    else out[relative] = `file:${await readFile(full, "base64")}`
  }
  return out
}
const repair = (paths: { bootstrap: string; recoveryRoot: string }, kind: StartupRecoveryRepair, family: Family = "current", guards: StartupRecoveryGuards = noopGuards) => executeStartupRepair(paths, kind, family, guards)
const reset = (paths: { bootstrap: string; recoveryRoot: string }, isolatedRoot: string | null, guards: StartupRecoveryGuards = noopGuards, family: Family = "current") =>
  executeStartupReset(paths, { home: join(paths.bootstrap, "unused-home"), isolatedRoot, family }, guards)

test("SR-U-01/02/02b missing, empty or symlink bootstrap is left to the existing error path", async () => {
  await fixture(async f => {
    assert.deepEqual(classifyStartupRecovery({ bootstrap: join(f.base, "missing"), recoveryRoot: f.root }, "current"), { kind: "none" })
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "none" })
    const real = join(f.base, "real-boot"); await mkdir(real); await symlink(real, join(f.base, "boot-link"), "dir")
    assert.deepEqual(classifyStartupRecovery({ bootstrap: join(f.base, "boot-link"), recoveryRoot: f.root }, "current"), { kind: "none" })
  })
})

test("SR-U-03 an intact pointer with a fully valid default root is healthy", async () => {
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current"); await writePointer(f.bootstrap, await pointerFor(f.root, id))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "none" })
  })
})

test("SR-U-04/05/05b any in-flight migration/relocation/restore history wins over pointer triage", async () => {
  for (const history of ["root-migration.json", `root-relocation-${randomUUID()}.json`, "root-migration-request.json", `application-restore-${randomUUID()}.json`]) {
    await fixture(async f => {
      await writeFile(join(f.bootstrap, "data-root.json"), JSON.stringify({ schemaVersion: 1, revision: 1, rootId: randomUUID(), migrationId: null, root: { path: f.root, device: "1", inode: "1" } }))
      await writeFile(join(f.bootstrap, history), "{}")
      assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "none" })
    })
  }
})

test("SR-U-06 a pointer to a custom target is never adopted or repaired here", async () => {
  await fixture(async f => {
    const custom = join(f.base, "作者自定义"), id = await healthyRoot(custom, "current")
    await writePointer(f.bootstrap, await pointerFor(custom, id))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "none" })
  })
})

test("SR-U-07/08/09 a dangling pointer to a missing or empty default root auto-initializes regardless of inode", async () => {
  await fixture(async f => {
    await writePointer(f.bootstrap, await pointerFor(f.root).catch(() => ({ schemaVersion: 1 as const, revision: 1, rootId: randomUUID(), migrationId: null, root: { path: f.root, device: "1", inode: "1" } })))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "auto-init" })
  })
  await fixture(async f => {
    await mkdir(f.root); await writePointer(f.bootstrap, await pointerFor(f.root))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "auto-init" })
  })
  await fixture(async f => {
    await mkdir(f.root); const pointer = await pointerFor(f.root)
    await replaceDirectoryWithNewInode(f.root, f.base)
    await writePointer(f.bootstrap, pointer)
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "auto-init" })
  })
})

test("SR-U-10/11 a replaced non-empty root or a symlink root is a mismatch dialog and never written", async () => {
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current"), pointer = await pointerFor(f.root, id)
    await replaceDirectoryWithNewInode(f.root, f.base); await writeFile(join(f.root, "foreign.txt"), "外来副本")
    await writePointer(f.bootstrap, pointer)
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "root-mismatch", sourcePath: f.root })
    assert.equal(await readFile(join(f.root, "foreign.txt"), "utf8"), "外来副本")
  })
  await fixture(async f => {
    const real = join(f.base, "real-root"), id = await healthyRoot(real, "current")
    await symlink(real, f.root, "dir")
    await writePointer(f.bootstrap, { schemaVersion: 1, revision: 1, rootId: id, migrationId: null, root: { ...(await directoryIdentity(real)), path: f.root } })
    const before = await snapshot(f.base)
    const result = classifyStartupRecovery(f.paths, "current")
    assert.deepEqual(result, { kind: "dialog", reason: "root-mismatch", sourcePath: f.root })
    assert.deepEqual(await snapshot(f.base), before)
  })
})

test("SR-U-12/13/13b a missing or unparseable marker with complete content is rebuilt from the pointer id", async () => {
  await fixture(async f => {
    await contentWithoutMarker(f.root); const pointer = await pointerFor(f.root); await writePointer(f.bootstrap, pointer)
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "marker" })
  })
  await fixture(async f => {
    await contentWithoutMarker(f.root); await writeFile(join(f.root, "shakeink-app.json"), "{损坏")
    await writePointer(f.bootstrap, await pointerFor(f.root))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "marker" })
  })
  for (const broken of [
    JSON.stringify({ schemaVersion: 1, app: "ShakeInk", id: randomUUID(), phase: "ready" }),
    JSON.stringify({ schemaVersion: 1, app: "ShakeInk", id: randomUUID(), phase: "ready", inboxReady: true, extra: 1 }),
    JSON.stringify({ schemaVersion: 1, app: "Other-App", id: randomUUID(), phase: "ready", inboxReady: true }),
  ]) {
    await fixture(async f => {
      await contentWithoutMarker(f.root); await writeFile(join(f.root, "shakeink-app.json"), broken)
      await writePointer(f.bootstrap, await pointerFor(f.root))
      assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "marker" })
    })
  }
})

test("SR-U-14/14b/15/15b marker loss with damaged catalog or inbox self-heals as content repair", async () => {
  await fixture(async f => {
    await mkdir(join(f.root, "inbox", "database"), { recursive: true }); await writePointer(f.bootstrap, await pointerFor(f.root))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
  await fixture(async f => {
    await mkdir(join(f.root, "inbox", "database"), { recursive: true }); await mkdir(join(f.root, "catalog.json"))
    await writePointer(f.bootstrap, await pointerFor(f.root))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
  await fixture(async f => {
    await mkdir(join(f.root, "inbox", "database"), { recursive: true }); await writeFile(join(f.base, "catalog-real"), "{}"); await symlink(join(f.base, "catalog-real"), join(f.root, "catalog.json"))
    await writePointer(f.bootstrap, await pointerFor(f.root))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
  await fixture(async f => {
    await mkdir(join(f.root, "inbox"), { recursive: true }); await writeFile(join(f.root, "catalog.json"), "{}")
    await writePointer(f.bootstrap, await pointerFor(f.root))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
  await fixture(async f => {
    await mkdir(f.root); await mkdir(join(f.base, "inbox-real", "database"), { recursive: true }); await symlink(join(f.base, "inbox-real"), join(f.root, "inbox"), "dir"); await writeFile(join(f.root, "catalog.json"), "{}")
    await writePointer(f.bootstrap, await pointerFor(f.root))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
})

test("SR-U-16/17/18 a schema-valid marker is matched semantically against the pointer", async () => {
  await fixture(async f => {
    await contentWithoutMarker(f.root); const pointer = await pointerFor(f.root)
    await writeFile(join(f.root, "shakeink-app.json"), markerText("current", randomUUID()))
    await writePointer(f.bootstrap, pointer)
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "root-mismatch", sourcePath: f.root })
  })
  await fixture(async f => {
    await contentWithoutMarker(f.root); const pointer = await pointerFor(f.root)
    await writeFile(join(f.root, "shakeink-app.json"), markerText("current", pointer.rootId, "initializing"))
    await writePointer(f.bootstrap, pointer)
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "root-mismatch", sourcePath: f.root })
  })
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current"), pointer = await pointerFor(f.root, id)
    await writeFile(join(f.root, "shakeink-app.json"), markerText("current", id, "ready", false))
    await writePointer(f.bootstrap, pointer)
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "pointer" })
  })
})

test("SR-U-19/20 a damaged pointer is quarantined only when the root is fully valid", async () => {
  await fixture(async f => {
    await healthyRoot(f.root, "current"); await writeFile(join(f.bootstrap, "data-root.json"), "{损坏")
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "pointer" })
  })
  await fixture(async f => {
    await mkdir(f.root); await writeFile(join(f.root, "leftover.txt"), "残留"); await writeFile(join(f.bootstrap, "data-root.json"), "{损坏")
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "pointer-invalid", sourcePath: null })
  })
})

test("SR-U-21/22/22b without a pointer a missing or empty root is fine, a regular file is not", async () => {
  await fixture(async f => {
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "none" })
    await mkdir(f.root)
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "none" })
    await rm(f.root, { recursive: true }); await writeFile(f.root, "普通文件占位")
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "root-mismatch", sourcePath: null })
  })
})

test("SR-U-23/24/25 pointerless marker triage: adoptable, foreign family or interrupted initialization", async () => {
  await fixture(async f => {
    await healthyRoot(f.root, "current")
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "none" })
  })
  await fixture(async f => {
    await healthyRoot(f.root, "legacy")
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "root-mismatch", sourcePath: null })
  })
  await fixture(async f => {
    await mkdir(f.root); await writeFile(join(f.root, "shakeink-app.json"), markerText("current", randomUUID(), "initializing", false))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "resume-init" })
    // The resolve() tolerance that makes resume-init reachable (§2.7-2): the
    // pointerless branch accepts an initializing marker, the pointer branch stays strict.
    const manager = new DataRootManager(f.bootstrap, f.root)
    assert.deepEqual(await manager.resolve(), { state: "needs-initialize", path: f.root })
    const pointer = await pointerFor(f.root); await writePointer(f.bootstrap, pointer)
    await assert.rejects(new DataRootManager(f.bootstrap, f.root).resolve(), (error: unknown) => (error as { code?: string }).code === "ROOT_UNAVAILABLE")
  })
})

test("SR-U-26/27/27b/28 pointerless marker loss is rebuilt with a fresh id only without application backups", async () => {
  await fixture(async f => {
    await contentWithoutMarker(f.root)
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "marker-new-id" })
  })
  await fixture(async f => {
    await contentWithoutMarker(f.root); await mkdir(join(f.root, "backups", "application"), { recursive: true })
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "default-invalid", sourcePath: null })
  })
  await fixture(async f => {
    await contentWithoutMarker(f.root); await mkdir(join(f.root, "backups")); await writeFile(join(f.root, "backups", "application"), "文件形态")
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "default-invalid", sourcePath: null })
  })
  await fixture(async f => {
    await mkdir(join(f.root, "inbox", "database"), { recursive: true })
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "default-invalid", sourcePath: null })
  })
})

test("SR-U-29 a symlinked pointerless root is a mismatch dialog without any write", async () => {
  await fixture(async f => {
    const real = join(f.base, "real-root"); await healthyRoot(real, "current"); await symlink(real, f.root, "dir")
    const before = await snapshot(f.base)
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "root-mismatch", sourcePath: null })
    assert.deepEqual(await snapshot(f.base), before)
  })
})

test("SR-U-30 the legacy family keeps its own marker/root vocabulary for the same dangling-pointer classification", async () => {
  await fixture(async f => {
    const root = join(f.base, ".xuanxiang")
    await writeFile(join(f.bootstrap, "data-root.json"), JSON.stringify({ schemaVersion: 1, revision: 1, rootId: randomUUID(), migrationId: null, root: { path: root, device: "1", inode: "1" } }))
    assert.deepEqual(classifyStartupRecovery({ bootstrap: f.bootstrap, recoveryRoot: root }, "legacy"), { kind: "auto-init" })
  })
})

test("SR-U-31 classification is pure: auto-init, dialog and none fixtures stay byte-identical", async () => {
  await fixture(async f => {
    await writePointer(f.bootstrap, await pointerFor(f.root).catch(() => ({ schemaVersion: 1 as const, revision: 1, rootId: randomUUID(), migrationId: null, root: { path: f.root, device: "1", inode: "1" } })))
    const before = await snapshot(f.base)
    assert.equal(classifyStartupRecovery(f.paths, "current").kind, "auto-init")
    assert.deepEqual(await snapshot(f.base), before)
  })
  await fixture(async f => {
    await healthyRoot(f.root, "legacy")
    const before = await snapshot(f.base)
    assert.equal(classifyStartupRecovery(f.paths, "current").kind, "dialog")
    assert.deepEqual(await snapshot(f.base), before)
  })
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current"); await writePointer(f.bootstrap, await pointerFor(f.root, id))
    const before = await snapshot(f.base)
    assert.equal(classifyStartupRecovery(f.paths, "current").kind, "none")
    assert.deepEqual(await snapshot(f.base), before)
  })
})

test("SR-U-33 path comparison tolerates win32 case variants and stays strict on POSIX", async () => {
  await fixture(async f => {
    const variant = f.root.toUpperCase() === f.root ? f.root.toLowerCase() : f.root.toUpperCase()
    await writePointer(f.bootstrap, { schemaVersion: 1, revision: 1, rootId: randomUUID(), migrationId: null, root: { path: variant, device: "1", inode: "1" } })
    const result = classifyStartupRecovery(f.paths, "current")
    // win32: the case variant names the same default root, so triage continues to
    // the missing-root auto-init; POSIX paths are case-sensitive, so a differing
    // spelling is a custom target left to the existing relocation flow.
    if (process.platform === "win32") assert.deepEqual(result, { kind: "auto-init" })
    else assert.deepEqual(result, { kind: "none" })
  })
})

test("SR-U-40 pointer repair quarantines the corrupt pointer byte-for-byte and reclassifies clean", async () => {
  await fixture(async f => {
    await healthyRoot(f.root, "current"); await writeFile(join(f.bootstrap, "data-root.json"), "{损坏指针")
    await repair(f.paths, "pointer")
    const entries = await readdir(f.bootstrap)
    assert.equal(entries.includes("data-root.json"), false)
    const quarantined = entries.filter(name => /^data-root\.corrupt-.+\.json$/.test(name))
    assert.equal(quarantined.length, 1)
    assert.equal(await readFile(join(f.bootstrap, quarantined[0]), "utf8"), "{损坏指针")
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "none" })
  })
})

test("SR-U-41 marker repair rewrites the family marker from the pointer id and reclassifies clean", async () => {
  await fixture(async f => {
    await contentWithoutMarker(f.root); const pointer = await pointerFor(f.root); await writePointer(f.bootstrap, pointer)
    await repair(f.paths, "marker")
    const brand = readApplicationBrandImmediately(brandRootIdentity(f.root))
    assert.deepEqual(brand.value, { schemaVersion: 1, app: "ShakeInk", id: pointer.rootId, phase: "ready", inboxReady: true })
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "none" })
  })
})

test("SR-U-42 a corrupt same-name marker is isolated before the rebuilt marker is written", async () => {
  await fixture(async f => {
    await contentWithoutMarker(f.root); await writeFile(join(f.root, "shakeink-app.json"), "{坏标记")
    const pointer = await pointerFor(f.root); await writePointer(f.bootstrap, pointer)
    await repair(f.paths, "marker")
    const entries = await readdir(f.root), quarantined = entries.filter(name => /^shakeink-app\.json\.corrupt-.+\.json$/.test(name))
    assert.equal(quarantined.length, 1)
    assert.equal(await readFile(join(f.root, quarantined[0]), "utf8"), "{坏标记")
    assert.equal(readApplicationBrandImmediately(brandRootIdentity(f.root)).value.id, pointer.rootId)
  })
})

test("SR-U-43/43b marker-new-id mints a fresh valid marker and independently refuses application backups", async () => {
  await fixture(async f => {
    await contentWithoutMarker(f.root)
    await repair(f.paths, "marker-new-id")
    const brand = readApplicationBrandImmediately(brandRootIdentity(f.root))
    assert.equal(brand.value.phase, "ready"); assert.equal(brand.value.inboxReady, true)
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "none" })
  })
  await fixture(async f => {
    await contentWithoutMarker(f.root); await mkdir(join(f.root, "backups", "application"), { recursive: true })
    const before = await snapshot(f.base)
    await assert.rejects(repair(f.paths, "marker-new-id"))
    assert.deepEqual(await snapshot(f.base), before)
  })
})

test("SR-U-44/45 a pointer or root replaced mid-repair aborts the atomic marker write", async () => {
  await fixture(async f => {
    await contentWithoutMarker(f.root); const pointer = await pointerFor(f.root); await writePointer(f.bootstrap, pointer)
    await assert.rejects(repair(f.paths, "marker", "current", { assertLock() {}, hooks: { beforeRename() { writeFileSync(join(f.bootstrap, "data-root.json"), "{替换指针") } } }))
    assert.deepEqual((await readdir(f.root)).sort(), ["catalog.json", "inbox"], "no marker and no orphaned temporary file")
    assert.equal(await readFile(join(f.bootstrap, "data-root.json"), "utf8"), "{替换指针")
  })
  await fixture(async f => {
    await contentWithoutMarker(f.root); const pointer = await pointerFor(f.root); await writePointer(f.bootstrap, pointer)
    await assert.rejects(repair(f.paths, "marker", "current", { assertLock() {}, hooks: { beforeRename() { renameSync(f.root, f.root + "-old"); mkdirSync(f.root) } } }))
    assert.deepEqual(await readdir(f.root), [])
    assert.equal((await readdir(f.root + "-old")).includes("shakeink-app.json"), false)
    assert.equal(JSON.parse(await readFile(join(f.root + "-old", "catalog.json"), "utf8")).schemaVersion, 1)
  })
})

test("SR-U-46 resume-init never writes any file", async () => {
  await fixture(async f => {
    await mkdir(f.root); await writeFile(join(f.root, "shakeink-app.json"), markerText("current", randomUUID(), "initializing", false))
    const before = await snapshot(f.base)
    await repair(f.paths, "resume-init")
    assert.deepEqual(await snapshot(f.base), before)
  })
})

test("SR-U-47 legacy marker repair writes the legacy marker file and app identity", async () => {
  await fixture(async f => {
    await mkdir(join(f.root, "inbox", "database"), { recursive: true }); await writeFile(join(f.root, "catalog.json"), "{}")
    const pointer = await pointerFor(f.root); await writePointer(f.bootstrap, pointer)
    await repair(f.paths, "marker", "legacy")
    const brand = readApplicationBrandImmediately(brandRootIdentity(f.root))
    assert.equal(brand.filename, "xuanxiang-app.json")
    assert.equal(brand.value.app, "Xuanxiangxiezuo-Desktop")
    assert.equal(brand.value.id, pointer.rootId)
  })
})

test("SR-U-48 a failing lock guard rejects before any write", async () => {
  await fixture(async f => {
    await contentWithoutMarker(f.root); const pointer = await pointerFor(f.root); await writePointer(f.bootstrap, pointer)
    const before = await snapshot(f.base)
    await assert.rejects(repair(f.paths, "marker", "current", { assertLock() { throw Error("LOCK_REQUIRED") } }))
    await assert.rejects(repair(f.paths, "pointer", "current", { assertLock() { throw Error("LOCK_REQUIRED") } }))
    assert.deepEqual(await snapshot(f.base), before)
  })
})

async function resetFixture(run: (f: { base: string; bootstrap: string; root: string; paths: { bootstrap: string; recoveryRoot: string }; guards: StartupRecoveryGuards }) => Promise<void>) {
  await fixture(async f => {
    await mkdir(f.root, { recursive: true })
    await run({ ...f, guards: noopGuards })
  })
}
test("SR-U-60 a full reset empties the default root and clears only bootstrap control/history files", async () => {
  await resetFixture(async f => {
    const id = await healthyRoot(f.root, "current")
    await writeFile(join(f.root, "state.json"), "{}"); await mkdir(join(f.root, "assets", "global"), { recursive: true }); await writeFile(join(f.root, "assets", "global", "a.png"), "png")
    await writePointer(f.bootstrap, await pointerFor(f.root, id))
    for (const name of ["root-migration.json", "root-migration-request.json", `root-relocation-${randomUUID()}.json`, `application-restore-${randomUUID()}.json`]) await writeFile(join(f.bootstrap, name), "{}")
    await mkdir(join(f.bootstrap, "session")); await writeFile(join(f.bootstrap, "session", "keep.txt"), "会话"); await writeFile(join(f.bootstrap, "other.txt"), "保留")
    await reset(f.paths, f.root)
    assert.deepEqual(await readdir(f.root), [])
    assert.deepEqual((await readdir(f.bootstrap)).sort(), ["other.txt", "session"])
    assert.equal(await readFile(join(f.bootstrap, "session", "keep.txt"), "utf8"), "会话")
  })
})

test("SR-U-61 a missing root is recreated as an empty directory while bootstrap is cleaned", async () => {
  await fixture(async f => {
    await writePointer(f.bootstrap, { schemaVersion: 1, revision: 1, rootId: randomUUID(), migrationId: null, root: { path: f.root, device: "1", inode: "1" } })
    await writeFile(join(f.bootstrap, "root-migration.json"), "{}")
    await reset(f.paths, f.root)
    assert.deepEqual(await readdir(f.root), [])
    assert.deepEqual(await readdir(f.bootstrap), [])
  })
})

test("SR-U-62 a repeated reset is byte-identical idempotent", async () => {
  await resetFixture(async f => {
    await healthyRoot(f.root, "current"); await writePointer(f.bootstrap, await pointerFor(f.root))
    await reset(f.paths, f.root)
    const once = await snapshot(f.base)
    await reset(f.paths, f.root)
    assert.deepEqual(await snapshot(f.base), once)
    assert.deepEqual(await readdir(f.root), [])
  })
})

test("SR-U-63 a relative, symlinked or unexpected recovery root is refused before any deletion", async () => {
  await resetFixture(async f => {
    await writeFile(join(f.root, "keep.txt"), "不得删除"); await writeFile(join(f.bootstrap, "data-root.json"), "{}")
    const before = await snapshot(f.base)
    await assert.rejects(executeStartupReset({ bootstrap: f.bootstrap, recoveryRoot: "relative/root" }, { home: f.base, isolatedRoot: null, family: "current" }, noopGuards))
    await assert.rejects(reset({ bootstrap: f.bootstrap, recoveryRoot: join(f.base, "other-root") }, f.root))
    const link = join(f.base, "root-link"); await symlink(f.root, link, "dir")
    await assert.rejects(reset({ bootstrap: f.bootstrap, recoveryRoot: link }, f.root))
    assert.deepEqual(await snapshot(f.base), { ...before, "root-link": `symlink:${await readlink(link)}` })
  })
})

test("SR-U-64 a crash after the validity flags self-heals to a consistent empty structure and a retry still converges", async () => {
  await resetFixture(async f => {
    const id = await healthyRoot(f.root, "current"); await writeFile(join(f.root, "state.json"), "{}")
    const pointer = await pointerFor(f.root, id); await writePointer(f.bootstrap, pointer)
    let calls = 0
    await assert.rejects(reset(f.paths, f.root, { assertLock() {}, hooks: { beforeRemove() { if (++calls === 4) throw Error("模拟崩溃") } } }))
    assert.equal(calls, 4)
    assert.equal((await readdir(f.root)).includes("shakeink-app.json"), false)
    assert.equal((await readdir(f.root)).includes("catalog.json"), false)
    // 195 R1（197 审核 P0-2 决策）：半清空根按「能修则修」自愈为一致空结构，取代旧的 dialog 归类。
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
    await reset(f.paths, f.root)
    assert.deepEqual(await readdir(f.root), [])
    assert.deepEqual(await readdir(f.bootstrap), [])
  })
})

test("SR-U-65 a directory-shaped control name is pollution and is recursively removed without touching neighbours", async () => {
  await resetFixture(async f => {
    await mkdir(join(f.bootstrap, "root-relocation-foreign"), { recursive: true }); await writeFile(join(f.bootstrap, "root-relocation-foreign", "nested.txt"), "污染")
    await writeFile(join(f.bootstrap, "neighbour.txt"), "相邻文件")
    await reset(f.paths, f.root)
    assert.deepEqual(await readdir(f.bootstrap), ["neighbour.txt"])
  })
})

test("SR-U-66 legacy recovery control names are removed as well", async () => {
  await resetFixture(async f => {
    for (const name of [`application-recovery-${randomUUID()}.json`, `.application-restore-${randomUUID()}.json`, `.desktop-recovery-layout-${randomUUID()}.json`]) await writeFile(join(f.bootstrap, name), "{}")
    await writeFile(join(f.bootstrap, "session-note.txt"), "保留")
    await reset(f.paths, f.root)
    assert.deepEqual(await readdir(f.bootstrap), ["session-note.txt"])
  })
})

test("SR-U-67 a symlink child of the root loses only the link, never the target bytes", async () => {
  await resetFixture(async f => {
    const external = join(f.base, "external"); await mkdir(external); await writeFile(join(external, "author.txt"), "外部目录字节")
    await symlink(external, join(f.root, "linked"), "dir"); await writeFile(join(f.root, "local.txt"), "本地")
    await reset(f.paths, f.root)
    assert.deepEqual(await readdir(f.root), [])
    assert.equal(await readFile(join(external, "author.txt"), "utf8"), "外部目录字节")
  })
})

test("SR-U-68 an injected deletion failure rejects RESET_FAILED without rollback or fake success", async () => {
  await resetFixture(async f => {
    await healthyRoot(f.root, "current"); await writeFile(join(f.root, "state.json"), "占用")
    let calls = 0
    await assert.rejects(
      reset(f.paths, f.root, { assertLock() {}, hooks: { beforeRemove(name) { if (name === "inbox") { calls++; const error = new Error("EPERM 占用") as NodeJS.ErrnoException; error.code = "EPERM"; throw error } } } }),
      (error: unknown) => error instanceof StartupRecoveryError && error.code === "RESET_FAILED",
    )
    assert.equal(calls, 1)
    const remaining = await readdir(f.root)
    assert.equal(remaining.includes("shakeink-app.json"), false, "already-deleted flags stay deleted")
    assert.equal(remaining.includes("inbox"), true, "the failed entry is retained")
    assert.equal(await readFile(join(f.root, "state.json"), "utf8"), "占用", "later entries are untouched")
  })
})

test("SR-U-69 every step rechecks the lock guard and its failure rejects without partial writes", async () => {
  await resetFixture(async f => {
    await healthyRoot(f.root, "current")
    const before = await snapshot(f.base)
    await assert.rejects(reset(f.paths, f.root, { assertLock() { throw Error("LOCK_REQUIRED") } }))
    assert.deepEqual(await snapshot(f.base), before)
  })
})

test("SR-U-70 a live custom pointer target is never touched while the default root and controls are cleared", async () => {
  await resetFixture(async f => {
    const custom = join(f.base, "自定义目录"), id = await healthyRoot(custom, "current")
    await writeFile(join(custom, "author.txt"), "自定义目录原字节")
    await writePointer(f.bootstrap, await pointerFor(custom, id))
    await writeFile(join(f.root, "junk.txt"), "默认根残留")
    await reset(f.paths, f.root)
    assert.deepEqual(await readdir(f.root), [])
    assert.deepEqual(await readdir(f.bootstrap), [])
    assert.equal(await readFile(join(custom, "author.txt"), "utf8"), "自定义目录原字节")
    assert.equal(readApplicationBrandImmediately(brandRootIdentity(custom)).value.id, id)
  })
})

test("SR-U-71 a valid marker/pointer with damaged content structure classifies as content repair", async () => {
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current"); await rm(join(f.root, "inbox"), { recursive: true, force: true })
    await writePointer(f.bootstrap, await pointerFor(f.root, id))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current"); await rm(join(f.root, "inbox", "database"), { recursive: true, force: true })
    await writePointer(f.bootstrap, await pointerFor(f.root, id))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current"); await rm(join(f.root, "catalog.json"), { force: true })
    await writePointer(f.bootstrap, await pointerFor(f.root, id))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current"); await rm(join(f.root, "inbox"), { recursive: true, force: true }); await rm(join(f.root, "catalog.json"), { force: true })
    await writePointer(f.bootstrap, await pointerFor(f.root, id))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current"); await writeFile(join(f.root, "catalog.json"), "{损坏目录")
    await writePointer(f.bootstrap, await pointerFor(f.root, id))
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
  // An unparseable pointer with a still-valid marker and damaged content is one content repair.
  await fixture(async f => {
    await healthyRoot(f.root, "current"); await rm(join(f.root, "inbox"), { recursive: true, force: true })
    await writeFile(join(f.bootstrap, "data-root.json"), "{损坏指针")
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
  // A valid marker without any pointer still owns its id: damaged content self-heals too.
  await fixture(async f => {
    await healthyRoot(f.root, "current"); await rm(join(f.root, "catalog.json"), { force: true })
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "repair", repair: "content" })
  })
})

test("SR-U-71b content repair never fires for ambiguous ownership", async () => {
  // No pointer and no marker: no id source, never mint one over unknown content.
  await fixture(async f => {
    await mkdir(join(f.root, "inbox", "database"), { recursive: true })
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "default-invalid", sourcePath: null })
  })
  // An unparseable pointer plus a missing/rebuildable marker has no identity proof.
  await fixture(async f => {
    await mkdir(join(f.root, "inbox", "database"), { recursive: true }); await writeFile(join(f.bootstrap, "data-root.json"), "{损坏指针")
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "dialog", reason: "pointer-invalid", sourcePath: null })
  })
  // Brand conflict stays a dialog.
  await fixture(async f => {
    await healthyRoot(f.root, "current"); await writeFile(join(f.root, "xuanxiang-app.json"), markerText("legacy", randomUUID()))
    await writePointer(f.bootstrap, await pointerFor(f.root))
    const result = classifyStartupRecovery(f.paths, "current")
    assert.equal(result.kind, "dialog")
  })
})

test("SR-U-72 content repair rebuilds structure, preserves bytes and flips inboxReady only when the database is gone", async () => {
  // Case A: catalog-only damage leaves the marker byte-identical and flips nothing.
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current"), markerBytes = markerText("current", id)
    await rm(join(f.root, "catalog.json"), { force: true })
    const pointer = await pointerFor(f.root, id); await writePointer(f.bootstrap, pointer)
    await repair(f.paths, "content")
    assert.equal(await readFile(join(f.root, "shakeink-app.json"), "utf8"), markerBytes)
    assert.deepEqual(JSON.parse(await readFile(join(f.root, "catalog.json"), "utf8")), { schemaVersion: 1, revision: 0, value: [] })
    assert.deepEqual((await readdir(f.root)).filter(name => name.includes("corrupt")), [])
    assert.deepEqual(classifyStartupRecovery(f.paths, "current"), { kind: "none" })
  })
  // Case B: missing inbox flips inboxReady with the same id and quarantines the original marker byte-for-byte.
  await fixture(async f => {
    const id = randomUUID()
    await mkdir(join(f.root, "inbox", "database"), { recursive: true })
    await writeFile(join(f.root, "shakeink-app.json"), markerText("current", id, "ready", true))
    await writeFile(join(f.root, "catalog.json"), JSON.stringify({ schemaVersion: 1, revision: 0, value: [] }))
    const pointer = await pointerFor(f.root, id); await writePointer(f.bootstrap, pointer)
    await rm(join(f.root, "inbox"), { recursive: true, force: true })
    await repair(f.paths, "content")
    const inbox = await lstat(join(f.root, "inbox")), database = await lstat(join(f.root, "inbox", "database"))
    assert.equal(inbox.isDirectory() && !inbox.isSymbolicLink(), true); assert.equal(database.isDirectory() && !database.isSymbolicLink(), true)
    assert.deepEqual(await readdir(join(f.root, "inbox", "database")), [])
    const brand = readApplicationBrandImmediately(brandRootIdentity(f.root))
    assert.deepEqual(brand.value, { schemaVersion: 1, app: "ShakeInk", id, phase: "ready", inboxReady: false })
    const entries = await readdir(f.root), quarantined = entries.filter(name => /^shakeink-app\.json\.corrupt-.+\.json$/.test(name))
    assert.equal(quarantined.length, 1)
    assert.equal(await readFile(join(f.root, quarantined[0]), "utf8"), markerText("current", id, "ready", true))
    // inboxReady flipped false: the still-valid pointer is quarantined too
    // (repair:pointer semantics) so the relocation preflight cannot block.
    const bootEntries = await readdir(f.bootstrap), pointerQuarantine = bootEntries.filter(name => /^data-root\.corrupt-.+\.json$/.test(name))
    assert.equal(pointerQuarantine.length, 1)
    assert.equal(JSON.parse(await readFile(join(f.bootstrap, pointerQuarantine[0]), "utf8")).rootId, id)
    assert.equal(bootEntries.includes("data-root.json"), false)
    // Idempotent: a second run changes nothing and does not throw.
    await repair(f.paths, "content")
    assert.deepEqual((await readdir(f.root)).filter(name => /^shakeink-app\.json\.corrupt-.+\.json$/.test(name)).length, 1)
  })
  // Case C: unparseable pointer + corrupt catalog + missing inbox/database is one idempotent repair pass.
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current")
    await rm(join(f.root, "inbox", "database"), { recursive: true, force: true })
    await writeFile(join(f.root, "catalog.json"), "{损坏目录"); await writeFile(join(f.bootstrap, "data-root.json"), "{损坏指针")
    await repair(f.paths, "content")
    const bootEntries = await readdir(f.bootstrap), pointerQuarantine = bootEntries.filter(name => /^data-root\.corrupt-.+\.json$/.test(name))
    assert.equal(pointerQuarantine.length, 1); assert.equal(await readFile(join(f.bootstrap, pointerQuarantine[0]), "utf8"), "{损坏指针")
    const rootEntries = await readdir(f.root), catalogQuarantine = rootEntries.filter(name => /^catalog\.corrupt-.+\.json$/.test(name))
    assert.equal(catalogQuarantine.length, 1); assert.equal(await readFile(join(f.root, catalogQuarantine[0]), "utf8"), "{损坏目录")
    assert.deepEqual(JSON.parse(await readFile(join(f.root, "catalog.json"), "utf8")), { schemaVersion: 1, revision: 0, value: [] })
    assert.equal(readApplicationBrandImmediately(brandRootIdentity(f.root)).value.inboxReady, false)
    const database = await lstat(join(f.root, "inbox", "database")); assert.equal(database.isDirectory(), true)
  })
  // Guards: a failing lock assertion rejects before any write.
  await fixture(async f => {
    const id = await healthyRoot(f.root, "current"); await rm(join(f.root, "inbox"), { recursive: true, force: true })
    await writePointer(f.bootstrap, await pointerFor(f.root, id))
    const before = await snapshot(f.base)
    await assert.rejects(repair(f.paths, "content", "current", { assertLock() { throw Error("LOCK_REQUIRED") } }))
    assert.deepEqual(await snapshot(f.base), before)
  })
})
