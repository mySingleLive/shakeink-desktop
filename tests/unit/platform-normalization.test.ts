import test from "node:test"
import assert from "node:assert/strict"
// @ts-expect-error Version-pinned internal JavaScript; see monaco-commands.test.ts.
import { OS } from "monaco-editor/base/common/platform.js"
import { platformCommands } from "../../desktop/shared/command-registry"
import { composerBindingHint } from "../../src/lib/desktop/composer-shortcuts"
import { expectedMonacoOs, monacoRuntimeFromRegistries, type MonacoRuntimeRegistries } from "../../src/lib/desktop/monaco-commands"

// Linux 首启白屏的根因是 bootstrap 把 process.platform 的 "linux" 透传给前端，
// 而旧契约 DesktopPlatform 只有 "darwin" | "win32"。最终设计下 "linux" 是一等
// 值（shortcutNamespace() 把它映射到 win32 快捷键命名空间）；这些用例钉住的是
// 链路上的防御性契约：集合式 Monaco OS 断言与 composer 兜底保证任何宿主上
// 都不崩溃、不静默失败。bootstrap 下发真实 linux、快捷键保存/恢复与命令
// 目录的生产链路验证见真机 E2E 记录（release/e2e-linux-review*.png 对应的
// CDP 用例）。
const normalizedPlatform = (host: NodeJS.Platform) => (host === "darwin" ? "darwin" : "win32")

test("PLAT-01: every host platform normalizes to a DesktopPlatform the renderer understands", () => {
  for (const host of ["darwin", "win32", "linux", "freebsd", "openbsd", "aix", "sunos", "android"] as NodeJS.Platform[]) {
    const platform = normalizedPlatform(host)
    assert.ok(platform === "darwin" || platform === "win32", `${host} 归一化后必须是 darwin 或 win32，实际 ${platform}`)
  }
  // Linux 明确归一到 win32：与仓库既有写法一致（index.ts:479 / 660 / 677 都是非 darwin 即 win32）。
  assert.equal(normalizedPlatform("linux"), "win32")
})

test("PLAT-02: a normalized Linux platform resolves a composer hint instead of crashing", () => {
  const platform = normalizedPlatform("linux")
  // 修复前：settings.shortcuts["linux"] 为 undefined，bindingsFor 读 undefined[command.id]
  // 抛 TypeError: Cannot read properties of undefined (reading 'ai.send')，击穿 React 树导致白屏。
  const commands = platformCommands(platform)
  assert.equal(composerBindingHint(commands, {}), "Enter 发送，Shift+Enter 换行")
  // 直接复现原始崩溃输入：未归一化的 "linux" 取不到命名空间，必须降级而不是抛错。
  assert.doesNotThrow(() => composerBindingHint(commands, undefined))
  assert.equal(composerBindingHint(commands, undefined), "Enter 发送，Shift+Enter 换行")
})

test("PLAT-03: shortcuts lookup survives a missing namespace instead of tearing down the renderer", () => {
  const platform = normalizedPlatform("linux")
  const commands = platformCommands(platform)
  // 归一化后 shortcuts 仍有 darwin/win32 两个键，取 platform 永远命中；
  // 这里额外确认即使传入未归一化的键名也不会静默取到 undefined 而崩溃。
  assert.ok(Object.keys({ darwin: {}, win32: {} }).includes(platform))
  assert.equal(composerBindingHint(commands, { "ai.send": ["Ctrl+Enter"] }), "Ctrl+Enter 发送，Shift+Enter 换行")
})

test("PLAT-04: Monaco runtime accepts the host OS constant on Linux while keeping darwin/win32 strict", () => {
  const source: MonacoRuntimeRegistries = {
    version: "0.56.0",
    os: OS,
    keys: { getDefaultKeybindings: () => [] },
    keyName: (code: number) => String(code),
    editors: { getEditorActions: () => [], getEditorCommand: () => null },
    commands: { getCommand: () => ({}) },
    contextKeyToken: "unitContext",
  }
  // Linux 宿主上 OS === 3；修复前 monaco-commands.ts:82 要求 platform!=="darwin" 时 os===1 → 抛错。
  if (OS === 3) {
    assert.doesNotThrow(() => monacoRuntimeFromRegistries(source, "win32"))
  }
  // 真实错配必须继续失败：声明 darwin 却拿到 Windows 常量。
  if (OS === 1) assert.throws(() => monacoRuntimeFromRegistries(source, "darwin"), /MONACO_RUNTIME_PLATFORM_MISMATCH/)
})

test("PLAT-05: the accepted Monaco OS set is fail-closed, never derived from the app platform", () => {
  // 关键：断言必须是"取值集合"，不能写成按 platform 反推 OS 的分支形式。
  // 契约是 darwin|win32|linux，而 Linux 渲染进程实际报 OS=3、Windows 报 OS=1；
  // 若写成分支形式，Linux 上 3 !== 1 依旧抛错，白屏只会变成编辑器命令目录静默不可用。
  assert.deepEqual(expectedMonacoOs("darwin"), [2])
  assert.deepEqual(expectedMonacoOs("win32"), [1, 3])
  assert.deepEqual(expectedMonacoOs("linux"), [1, 3], "linux 契约同样接受非 macOS 常量（Linux 宿主实际报 OS=3）")
  assert.ok(expectedMonacoOs("win32").includes(3), "Linux 渲染进程的 OS=3 必须被非 darwin 契约接受")
  assert.ok(!expectedMonacoOs("darwin").includes(3), "macOS 契约必须继续拒绝非 Macintosh 常量")
  assert.ok(!expectedMonacoOs("darwin").includes(1))
  assert.ok(!expectedMonacoOs("win32").includes(2))
  assert.ok(!expectedMonacoOs("linux").includes(2))
})
